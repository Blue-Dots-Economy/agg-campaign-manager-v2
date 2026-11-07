import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import {
  appendStagingRows,
  deleteSheetTab,
  getCallDetail,
  getSheetRowCount,
  listSheetTabs,
  readAllReviewedIds,
  readReviewedIdsForEmail,
  readSheet,
  readSheetForReview,
  readStagingCallIds,
  updateStagingRows,
  writeStagingHeaders,
} from "../../src/lib/sheets.server";
import {
  DEFAULT_SHEETS_RETRIES,
  DEFAULT_SHEETS_TIMEOUT_MS,
  readSheetsConfig,
} from "../../src/lib/sheets-client.server";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets/";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const realFetch = globalThis.fetch;
const realEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

beforeAll(() => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "sa@example.iam.gserviceaccount.com",
    private_key: pem,
  });
});
afterAll(() => {
  if (realEnv === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  else process.env.GOOGLE_SERVICE_ACCOUNT_JSON = realEnv;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Call {
  url: string;
  method: string;
  body: string | undefined;
}

type Route = (url: string, method: string) => Response | undefined;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** Stubs fetch: the token endpoint always answers; other URLs go to `route`. */
function stubFetch(route: Route): Call[] {
  const calls: Call[] = [];
  const stub = async (input: string | URL | Request, init?: RequestInit) => {
    const url = decodeURIComponent(String(input));
    const method = init?.method ?? "GET";
    if (url === TOKEN_URL) return json({ access_token: "tok", expires_in: 3600 });
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    const res = route(url, method);
    if (!res) throw new Error(`unexpected ${method} ${url}`);
    return res;
  };
  globalThis.fetch = Object.assign(stub, { preconnect: realFetch.preconnect });
  return calls;
}

/** Retry-After of 0, so retried reads do not wait in tests. */
const NO_WAIT = { "retry-after": "0" };

const tabsReply = (titles: string[]) =>
  json({ sheets: titles.map((title, i) => ({ properties: { title, sheetId: i } })) });

describe("listSheetTabs", () => {
  test("returns tab titles in order and drops blanks", async () => {
    stubFetch(() =>
      json({ sheets: [{ properties: { title: "A" } }, {}, { properties: { title: "B" } }] }),
    );
    await expect(await listSheetTabs("s1")).toEqual(["A", "B"]);
  });
  test("throws with the status on failure", async () => {
    stubFetch(() => json({ error: "denied" }, 403));
    await expect(listSheetTabs("s1")).rejects.toThrow("Sheets metadata failed (403)");
  });
});

describe("readSheet", () => {
  test("reads headers and rows and skips heavy columns", async () => {
    const calls = stubFetch((url) => {
      if (url.includes("/values/Data!A1:ZZ1"))
        return json({ values: [["call_id", "Final Summary", "phone", "call_transcript", "x"]] });
      if (url.includes("values:batchGet"))
        return json({
          valueRanges: [
            { values: [["c1"], ["c2"]] },
            { values: [["p1"], ["p2"]] },
            { values: [["x1"]] },
          ],
        });
      return undefined;
    });
    const res = await readSheet("s1", " Data ");
    expect(res).toEqual({
      headers: ["call_id", "phone", "x"],
      rows: [
        ["c1", "p1", "x1"],
        ["c2", "p2", ""],
      ],
      rowCount: 2,
      effectiveTab: "Data",
    });
    const batchGet = calls.find((c) => c.url.includes("batchGet"));
    expect(batchGet?.url).toContain("ranges=Data!A2:A200001");
    expect(batchGet?.url).toContain("ranges=Data!C2:C200001");
    expect(batchGet?.url).toContain("ranges=Data!E2:E200001");
  });

  test("returns an empty result for a sheet with no headers", async () => {
    stubFetch(() => json({}));
    expect(await readSheet("s1", "Data")).toEqual({
      headers: [],
      rows: [],
      rowCount: 0,
      effectiveTab: "Data",
    });
  });

  test("falls back to the first tab when the named tab does not exist", async () => {
    stubFetch((url) => {
      if (url.includes("/values/Missing!")) return json({ error: "Unable to parse range" }, 400);
      if (url.includes("fields=sheets.properties.title")) return tabsReply(["First"]);
      if (url.includes("/values/First!A1:ZZ1")) return json({ values: [["call_id"]] });
      if (url.includes("batchGet")) return json({ valueRanges: [{ values: [["c1"]] }] });
      return undefined;
    });
    const res = await readSheet("s1", "Missing");
    expect(res.effectiveTab).toBe("First");
    expect(res.rows).toEqual([["c1"]]);
  });

  test("uses the first tab when no tab is given", async () => {
    stubFetch((url) => {
      if (url.includes("fields=sheets.properties.title")) return tabsReply(["Only"]);
      if (url.includes("/values/Only!A1:ZZ1")) return json({ values: [] });
      return undefined;
    });
    expect((await readSheet("s1")).effectiveTab).toBe("Only");
  });

  test("throws on other errors", async () => {
    stubFetch(() => json({ error: "PERMISSION_DENIED" }, 403));
    await expect(readSheet("s1", "Data")).rejects.toThrow("Sheets read failed (403)");
  });

  test("throws when the spreadsheet has no tabs", async () => {
    stubFetch(() => json({ sheets: [] }));
    await expect(readSheet("s1")).rejects.toThrow("Spreadsheet has no tabs");
  });
});

describe("readSheetForReview", () => {
  test("keeps call_recording_url", async () => {
    stubFetch((url) => {
      if (url.includes("A1:ZZ1"))
        return json({ values: [["call_id", "call_recording_url", "final_summary"]] });
      if (url.includes("batchGet")) return json({ valueRanges: [{ values: [["c1", "r1"]] }] });
      return undefined;
    });
    const res = await readSheetForReview("s1", "Data");
    expect(res.headers).toEqual(["call_id", "call_recording_url"]);
    expect(res.rows).toEqual([["c1", "r1"]]);
  });
});

describe("getSheetRowCount", () => {
  test("counts data rows", async () => {
    stubFetch(() => json({ values: [["a"], ["b"], ["c"]] }));
    expect(await getSheetRowCount("s1", "Data")).toBe(3);
  });
  test("returns 0 on an error reply", async () => {
    stubFetch(() => json({}, 500, NO_WAIT));
    expect(await getSheetRowCount("s1", "Data")).toBe(0);
  });
});

describe("getCallDetail", () => {
  test("returns the heavy columns of the matching row", async () => {
    stubFetch((url) => {
      if (url.includes("A1:ZZ1"))
        return json({ values: [["Call ID", "final_summary", "call_transcript"]] });
      if (url.includes("A2:A200000")) return json({ values: [["c1"], [], ["c3"]] });
      if (url.includes("A4:ZZ4")) return json({ values: [["c3", "sum", "tx"]] });
      return undefined;
    });
    expect(await getCallDetail("s1", "Data", "c3")).toEqual({
      call_transcript: "tx",
      final_summary: "sum",
      call_recording_url: "",
      effectiveTab: "Data",
    });
  });
  test("returns null when the call is not in the sheet", async () => {
    stubFetch((url) => {
      if (url.includes("A1:ZZ1")) return json({ values: [["call_id"]] });
      if (url.includes("A2:A200000")) return json({ values: [["c1"]] });
      return undefined;
    });
    expect(await getCallDetail("s1", "Data", "zz")).toBeNull();
  });
  test("returns null without a call_id column", async () => {
    stubFetch(() => json({ values: [["phone"]] }));
    expect(await getCallDetail("s1", "Data", "c1")).toBeNull();
  });
  test("falls back to the first tab on a range error", async () => {
    stubFetch((url) => {
      if (url.includes("/values/Gone!")) return json({ error: "Unable to parse range" }, 400);
      if (url.includes("fields=sheets.properties.title")) return tabsReply(["First"]);
      if (url.includes("First!A1:ZZ1")) return json({ values: [["call_id"]] });
      if (url.includes("First!A2:A200000")) return json({ values: [["c1"]] });
      if (url.includes("First!A2:ZZ2")) return json({ values: [["c1"]] });
      return undefined;
    });
    expect((await getCallDetail("s1", "Gone", "c1"))?.effectiveTab).toBe("First");
  });
});

describe("reviewed ids", () => {
  const route: Route = (url) => {
    if (url.includes("A1:ZZ1")) return json({ values: [["Reviewer Email", "call_id", "job_id"]] });
    if (url.includes("A2:C200000"))
      return json({
        values: [
          ["A@x.org ", "c1", ""],
          ["b@x.org", "c2", "j2"],
          ["a@x.org", "", "j3"],
        ],
      });
    return undefined;
  };
  test("readReviewedIdsForEmail returns ids for one reviewer", async () => {
    stubFetch(route);
    expect([...(await readReviewedIdsForEmail("s1", "Feedback", "a@x.org"))]).toEqual(["c1", "j3"]);
  });
  test("readReviewedIdsForEmail returns empty for a blank email", async () => {
    stubFetch(() => undefined);
    expect((await readReviewedIdsForEmail("s1", "Feedback", " ")).size).toBe(0);
  });
  test("readAllReviewedIds returns ids for every reviewer", async () => {
    stubFetch(route);
    expect([...(await readAllReviewedIds("s1", "Feedback"))].sort()).toEqual([
      "c1",
      "c2",
      "j2",
      "j3",
    ]);
  });
  test("both return empty when the sheet fails", async () => {
    stubFetch(() => json({}, 500, NO_WAIT));
    expect((await readAllReviewedIds("s1", "Feedback")).size).toBe(0);
    expect((await readReviewedIdsForEmail("s1", "Feedback", "a@x.org")).size).toBe(0);
  });
});

describe("staging writes", () => {
  test("readStagingCallIds creates a missing tab", async () => {
    const calls = stubFetch((url, method) => {
      if (url.includes("fields=sheets.properties.title")) return tabsReply(["Other"]);
      if (url.endsWith(":batchUpdate") && method === "POST") return json({});
      return undefined;
    });
    expect(await readStagingCallIds("s1", "Sheet1")).toEqual({
      existing: new Set(),
      rowByCallId: new Map(),
      hasHeaders: false,
      headers: [],
    });
    expect(calls.at(-1)?.body).toBe(
      JSON.stringify({ requests: [{ addSheet: { properties: { title: "Sheet1" } } }] }),
    );
  });

  test("readStagingCallIds maps call ids to row numbers", async () => {
    stubFetch((url) => {
      if (url.includes("fields=sheets.properties.title")) return tabsReply(["Sheet1"]);
      if (url.includes("Sheet1!A1:ZZ1")) return json({ values: [["phone", "Call ID"]] });
      if (url.includes("Sheet1!B2:B200000")) return json({ values: [["c1"], [], [" c3 "]] });
      return undefined;
    });
    const res = await readStagingCallIds("s1", "Sheet1");
    expect(res.headers).toEqual(["phone", "Call ID"]);
    expect([...res.rowByCallId]).toEqual([
      ["c1", 2],
      ["c3", 4],
    ]);
    expect(res.hasHeaders).toBe(true);
  });

  test("writeStagingHeaders clears then writes the header row", async () => {
    const calls = stubFetch(() => json({}));
    await writeStagingHeaders("s1", "Sheet1", ["a", "b", "c"]);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${SHEETS}s1/values/Sheet1!A1:ZZ1:clear`,
      `PUT ${SHEETS}s1/values/Sheet1!A1:C1?valueInputOption=RAW`,
    ]);
    expect(calls[1]?.body).toBe(JSON.stringify({ values: [["a", "b", "c"]] }));
  });

  test("appendStagingRows appends and returns the row count", async () => {
    const calls = stubFetch(() => json({}));
    expect(await appendStagingRows("s1", "Sheet1", [["a"], ["b"]])).toBe(2);
    expect(calls[0]?.url).toContain("Sheet1!A1:append?valueInputOption=RAW");
    expect(await appendStagingRows("s1", "Sheet1", [])).toBe(0);
  });

  test("updateStagingRows writes each row by number", async () => {
    const calls = stubFetch(() => json({}));
    expect(await updateStagingRows("s1", "Sheet1", [{ rowNumber: 5, values: ["a", "b"] }])).toBe(1);
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      valueInputOption: "RAW",
      data: [{ range: "Sheet1!A5:B5", majorDimension: "ROWS", values: [["a", "b"]] }],
    });
  });

  test("writes throw with the status on failure", async () => {
    stubFetch(() => json({ error: "nope" }, 400));
    await expect(appendStagingRows("s1", "Sheet1", [["a"]])).rejects.toThrow(
      "Sheets append failed (400)",
    );
  });

  test("deleteSheetTab deletes a tab that exists", async () => {
    const calls = stubFetch((url) => {
      if (url.includes("fields=sheets.properties")) return tabsReply(["Sheet1", "Staging"]);
      if (url.endsWith(":batchUpdate")) return json({});
      return undefined;
    });
    expect(await deleteSheetTab("s1", "Staging")).toBe(true);
    expect(calls.at(-1)?.body).toBe(
      JSON.stringify({ requests: [{ deleteSheet: { sheetId: 1 } }] }),
    );
  });

  test("deleteSheetTab returns false when the tab is missing or the read fails", async () => {
    stubFetch(() => tabsReply(["Sheet1"]));
    expect(await deleteSheetTab("s1", "Staging")).toBe(false);
    stubFetch(() => json({}, 500, NO_WAIT));
    expect(await deleteSheetTab("s1", "Staging")).toBe(false);
  });
});

describe("timeouts and retries", () => {
  test("every request carries a timeout signal", async () => {
    const signals: unknown[] = [];
    const stub = async (input: string | URL | Request, init?: RequestInit) => {
      signals.push(init?.signal);
      if (String(input) === TOKEN_URL) return json({ access_token: "tok", expires_in: 3600 });
      return json({ sheets: [] });
    };
    globalThis.fetch = Object.assign(stub, { preconnect: realFetch.preconnect });
    await listSheetTabs("s1");
    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) expect(s).toBeInstanceOf(AbortSignal);
  });

  test("a read is retried after a 503", async () => {
    let attempts = 0;
    stubFetch(() => {
      attempts += 1;
      return attempts === 1 ? json({}, 503, NO_WAIT) : tabsReply(["A"]);
    });
    expect(await listSheetTabs("s1")).toEqual(["A"]);
    expect(attempts).toBe(2);
  });

  test("a write is sent once", async () => {
    const calls = stubFetch(() => json({}, 503, NO_WAIT));
    await expect(appendStagingRows("s1", "Sheet1", [["a"]])).rejects.toThrow(
      "Sheets append failed (503)",
    );
    expect(calls.length).toBe(1);
  });
});

describe("readSheetsConfig", () => {
  test("uses named defaults", () => {
    expect(readSheetsConfig({})).toEqual({
      timeoutMs: DEFAULT_SHEETS_TIMEOUT_MS,
      retries: DEFAULT_SHEETS_RETRIES,
    });
  });
  test("reads overrides and refuses invalid numbers", () => {
    expect(readSheetsConfig({ SHEETS_TIMEOUT_MS: "1000", SHEETS_RETRIES: "0" })).toEqual({
      timeoutMs: 1000,
      retries: 0,
    });
    expect(() => readSheetsConfig({ SHEETS_RETRIES: "-1" })).toThrow("SHEETS_RETRIES");
  });
});

describe("error messages", () => {
  const PHONE = "9876543210";

  test("quote Google's error message and status, not other reply text", async () => {
    stubFetch(() =>
      json(
        {
          error: {
            code: 403,
            message: "The caller does not have permission",
            status: "PERMISSION_DENIED",
          },
          echo: PHONE,
        },
        403,
      ),
    );
    const err = await readSheet("s1", "Data").catch((e: unknown) => e);
    expect(err instanceof Error && err.message).toBe(
      "Sheets read failed (403): The caller does not have permission (PERMISSION_DENIED)",
    );
  });

  test("leave out raw text replies", async () => {
    stubFetch(() => new Response(`row ${PHONE} broke`, { status: 400 }));
    const err = await appendStagingRows("s1", "Sheet1", [["a"]]).catch((e: unknown) => e);
    expect(err instanceof Error && err.message).toBe("Sheets append failed (400)");
  });
});
