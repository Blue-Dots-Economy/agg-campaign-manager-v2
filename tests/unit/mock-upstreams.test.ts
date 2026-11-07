import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { z } from "zod";
import { REGION_CONFIGS } from "../../src/lib/ecosystem-config";
import { readRayaConfig, rayaFetch } from "../../src/lib/raya-api.server";
import { pickLastCall } from "../../src/lib/raya-export-rows";
import {
  BatchContactsPageSchema,
  BatchListReplySchema,
  batchItems,
  buildLiveDetail,
  pageBatchMeta,
  pageContacts,
  toLiveBatch,
} from "../../src/lib/raya-live-batches";
import { CreateBatchReply } from "../../src/lib/raya.functions";
import { isRangeParseError } from "../../src/lib/sheet-ranges";
import { readSheetsConfig } from "../../src/lib/sheets-client.server";
import {
  appendStagingRows,
  deleteSheetTab,
  getCallDetail,
  listSheetTabs,
  readAllReviewedIds,
  readSheet,
  readStagingCallIds,
  updateStagingRows,
  writeStagingHeaders,
} from "../../src/lib/sheets.server";
import { registry } from "../../src/programs/registry";
import {
  MOCK_ACCESS_TOKEN,
  MOCK_AGENTS,
  MOCK_CALL_LOG_SHEET_ID,
  MOCK_PROVIDER_CALLS_TAB,
  MOCK_SEEKER_CALLS_TAB,
  MOCK_STAGING_SHEET_ID,
  MOCK_STAGING_TAB,
  createMockUpstreams,
  serviceAccountJson,
} from "../../scripts/e2e/mock-upstreams";

const ORIGIN = "http://mock.test";
const KEY = { "X-API-Key": "any" };
const BEARER = { authorization: `Bearer ${MOCK_ACCESS_TOKEN}` };
const SHEETS = `${ORIGIN}/sheets/v4/spreadsheets/`;

const [agentA, agentB] = MOCK_AGENTS;
if (!agentA || !agentB) throw new Error("the mock seeds two agents");

const contacts = [
  { contact_name: "Asha", contact_phone: "9000000001", country_code: "91", seeker_id: "s1" },
  { contact_name: "Ravi", contact_phone: "9000000002", country_code: "91" },
  { contact_name: "Meena", contact_phone: "9000000003", country_code: "91" },
];

type Mock = ReturnType<typeof createMockUpstreams>;

function raya(mock: Mock, path: string, init: { method?: string; json?: unknown } = {}) {
  const headers = new Headers(KEY);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  return mock.handle(
    new Request(`${ORIGIN}/raya${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
    }),
  );
}

function sheets(mock: Mock, path: string, init: { method?: string; json?: unknown } = {}) {
  const headers = new Headers(BEARER);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  return mock.handle(
    new Request(`${SHEETS}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
    }),
  );
}

const body = async (res: Response): Promise<unknown> => res.json();

const CreatedId = z.object({ batchId: z.number() });

async function createBatch(mock: Mock, agentId: string = agentA.id): Promise<number> {
  const res = await raya(mock, "/batch", {
    method: "POST",
    json: { agent_id: agentId, batch_name: "Test batch", contacts },
  });
  expect(res.status).toBe(200);
  return CreatedId.parse(await body(res)).batchId;
}

async function contactsPage(mock: Mock, batchId: number, query = "") {
  const res = await raya(mock, `/batch/${batchId}/contacts${query}`);
  expect(res.status).toBe(200);
  return BatchContactsPageSchema.parse(await body(res));
}

async function listBatches(mock: Mock, query: string) {
  const res = await raya(mock, `/batch${query}`);
  expect(res.status).toBe(200);
  return batchItems(BatchListReplySchema.parse(await body(res)));
}

describe("Raya mock", () => {
  test("answers 401 without an X-API-Key header", async () => {
    const mock = createMockUpstreams();
    const res = await mock.handle(new Request(`${ORIGIN}/raya/agents`));
    expect(res.status).toBe(401);
  });

  test("answers 404 for an unknown path and an unknown batch", async () => {
    const mock = createMockUpstreams();
    expect((await raya(mock, "/nothing-here")).status).toBe(404);
    expect((await raya(mock, "/batch/999999/contacts")).status).toBe(404);
    expect((await mock.handle(new Request(`${ORIGIN}/elsewhere`))).status).toBe(404);
  });

  test("lists the seeded agents and returns one agent by id", async () => {
    const mock = createMockUpstreams();
    const list = z
      .object({ agents: z.array(z.object({ id: z.string(), name: z.string() })) })
      .parse(await body(await raya(mock, "/agents?page=1&page_size=50")));
    expect(list.agents.map((a) => a.id)).toEqual(MOCK_AGENTS.map((a) => a.id));

    const one = z
      .object({ name: z.string() })
      .parse(await body(await raya(mock, `/agent/${agentA.id}`)));
    expect(one.name).toBe(agentA.name);
    expect((await raya(mock, "/agent/unknown-agent")).status).toBe(404);
  });

  test("creates a batch in the shape rayaCreateBatch reads", async () => {
    const mock = createMockUpstreams();
    const res = await raya(mock, "/batch", {
      method: "POST",
      json: { agent_id: agentA.id, batch_name: "Launch", contacts },
    });
    const reply = CreateBatchReply.parse(await body(res));
    expect(typeof reply.batchId).toBe("number");
    expect(reply.totalRows).toBe(contacts.length);
    expect(reply.contactsInserted).toBe(contacts.length);

    const [batch] = (await listBatches(mock, `?agent_id=${agentA.id}&page_size=50`)).filter(
      (b) => b.id === reply.batchId,
    );
    if (!batch) throw new Error("created batch is not listed");
    const live = toLiveBatch(batch, agentA.id, agentA.name);
    expect(live.batchName).toBe("Launch");
    expect(live.status).toBe("pending");
    expect(live.total).toBe(contacts.length);
    expect(live.pending).toBe(contacts.length);
  });

  test("refuses a batch without contacts or for an unknown agent", async () => {
    const mock = createMockUpstreams();
    const empty = await raya(mock, "/batch", {
      method: "POST",
      json: { agent_id: agentA.id, batch_name: "x", contacts: [] },
    });
    expect(empty.status).toBe(400);
    expect(CreateBatchReply.parse(await body(empty)).status).toBe("error");
    const unknown = await raya(mock, "/batch", {
      method: "POST",
      json: { agent_id: "nope", batch_name: "x", contacts },
    });
    expect(unknown.status).toBe(400);
  });

  test("lists batches per agent with paging", async () => {
    const mock = createMockUpstreams();
    await createBatch(mock, agentB.id);
    await createBatch(mock, agentB.id);
    const all = await listBatches(mock, `?agent_id=${agentB.id}`);
    expect(all.every((b) => b.agent_id === agentB.id)).toBe(true);
    expect(all.length).toBe(2);
    expect((await listBatches(mock, `?agent_id=${agentB.id}&page=2&page_size=1`)).length).toBe(1);
    expect((await listBatches(mock, `?agent_id=${agentB.id}&page=3&page_size=1`)).length).toBe(0);
  });

  test("seeds one running batch with finished calls for the first agent", async () => {
    const mock = createMockUpstreams();
    const [seeded] = await listBatches(mock, `?agent_id=${agentA.id}`);
    if (!seeded) throw new Error("no seeded batch");
    expect(toLiveBatch(seeded, agentA.id, agentA.name).status).toBe("running");
    const page = await contactsPage(mock, Number(seeded.id));
    expect(pageContacts(page).some((c) => pickLastCall(c) !== null)).toBe(true);
  });

  test("updates a batch's name and settings", async () => {
    const mock = createMockUpstreams();
    const id = await createBatch(mock);
    const res = await raya(mock, `/batch/${id}`, {
      method: "PATCH",
      json: { name: "Renamed", concurrency: 7, max_retries: 2, retry_after_hrs: 4 },
    });
    expect(res.status).toBe(200);
    const meta = pageBatchMeta(await contactsPage(mock, id));
    expect(meta?.name).toBe("Renamed");
    expect(meta?.concurrency).toBe(7);
    expect(meta?.max_retries).toBe(2);
  });

  test("start dials pending contacts and stop ends the batch", async () => {
    const mock = createMockUpstreams();
    const id = await createBatch(mock);
    const schedule = {
      timezone: "Asia/Kolkata",
      start_time: "09:00",
      end_time: "18:00",
      days: [1],
    };
    const started = await raya(mock, `/batch/${id}/start`, {
      method: "POST",
      json: { schedule, concurrency: 3, selected_statuses: ["Pending"] },
    });
    expect(started.status).toBe(200);

    const page = await contactsPage(mock, id, "?page=1&page_size=200");
    const items = pageContacts(page);
    const meta = pageBatchMeta(page);
    expect(meta?.status).toBe("running");
    expect(meta?.schedule).toEqual(schedule);
    const detail = buildLiveDetail({ batchId: String(id) }, items, meta, 0);
    expect(detail.total).toBe(contacts.length);
    expect(detail.pending).toBe(0);
    expect(detail.completed).toBeGreaterThan(0);
    expect(detail.recent.length).toBe(contacts.length);
    expect(items.filter((c) => pickLastCall(c) !== null).length).toBe(contacts.length);
    expect(items[0]?.seeker_id).toBe("s1");

    expect((await raya(mock, `/batch/${id}/stop`, { method: "POST", json: {} })).status).toBe(200);
    expect(pageBatchMeta(await contactsPage(mock, id))?.status).toBe("stopped");
  });

  test("pages a batch's contacts", async () => {
    const mock = createMockUpstreams();
    const id = await createBatch(mock);
    const second = await contactsPage(mock, id, "?page=2&page_size=2");
    expect(pageContacts(second).length).toBe(1);
    expect(Array.isArray(second) ? 0 : second.total).toBe(contacts.length);
  });

  test("returns a call's detail for batch calls and test calls", async () => {
    const mock = createMockUpstreams();
    const id = await createBatch(mock);
    await raya(mock, `/batch/${id}/start`, { method: "POST", json: {} });
    const [contact] = pageContacts(await contactsPage(mock, id));
    const last = pickLastCall(contact);
    if (!last) throw new Error("no call on the first contact");
    const detail = z
      .object({ uuid: z.string(), call_output: z.object({ final_summary: z.string() }) })
      .parse(await body(await raya(mock, `/call/${String(last.uuid)}`)));
    expect(detail.uuid).toBe(String(last.uuid));
    expect((await raya(mock, "/call/unknown-call")).status).toBe(404);

    const placed = await raya(mock, "/call", {
      method: "POST",
      json: { agent_id: agentA.id, to_number: "9000000009", country_code: "91", agent_args: {} },
    });
    const callId = z.object({ call_id: z.string() }).parse(await body(placed)).call_id;
    expect((await raya(mock, `/call/${callId}`)).status).toBe(200);
  });
});

describe("Google mock", () => {
  test("issues an access token without checking the assertion", async () => {
    const mock = createMockUpstreams();
    const res = await mock.handle(
      new Request(`${ORIGIN}/oauth/token`, {
        method: "POST",
        body: new URLSearchParams({ grant_type: "x", assertion: "not-a-jwt" }),
      }),
    );
    const token = z
      .object({ access_token: z.string(), expires_in: z.number() })
      .parse(await body(res));
    expect(token.access_token).toBe(MOCK_ACCESS_TOKEN);
  });

  test("answers 401 without a bearer token and 404 for an unknown spreadsheet", async () => {
    const mock = createMockUpstreams();
    expect((await mock.handle(new Request(`${SHEETS}${MOCK_CALL_LOG_SHEET_ID}`))).status).toBe(401);
    expect((await sheets(mock, "unknown-spreadsheet-id-000")).status).toBe(404);
  });

  test("lists the seeded tabs, with the ecosystem workbooks", async () => {
    const mock = createMockUpstreams();
    const meta = z
      .object({ sheets: z.array(z.object({ properties: z.object({ title: z.string() }) })) })
      .parse(await body(await sheets(mock, `${MOCK_CALL_LOG_SHEET_ID}?fields=sheets.properties`)));
    expect(meta.sheets.map((s) => s.properties.title)).toEqual([
      MOCK_SEEKER_CALLS_TAB,
      MOCK_PROVIDER_CALLS_TAB,
    ]);
    for (const cfg of Object.values(REGION_CONFIGS)) {
      expect((await sheets(mock, cfg.jobsSheet)).status).toBe(200);
      expect((await sheets(mock, cfg.seekerSheet)).status).toBe(200);
    }
  });

  test("answers a range on an unknown tab with Google's parse error", async () => {
    const mock = createMockUpstreams();
    const res = await sheets(mock, `${MOCK_CALL_LOG_SHEET_ID}/values/Missing!A1:ZZ1`);
    expect(res.status).toBe(400);
    const err = z.object({ error: z.object({ message: z.string() }) }).parse(await body(res)).error;
    expect(isRangeParseError(err.message)).toBe(true);
  });
});

describe("app clients against the mock", () => {
  const realFetch = globalThis.fetch;
  const realEnv = {
    sa: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    key: process.env.RAYA_API_KEY,
  };
  const rayaBase = readRayaConfig(process.env).baseUrl;
  const sheetsBase = readSheetsConfig(process.env).apiBaseUrl;
  let mock = createMockUpstreams();

  /** Sends the app's Raya and Sheets calls to the mock, whatever base URLs the app has. */
  function routeToMock(): void {
    const stub = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      let target = url;
      if (url.startsWith(rayaBase)) target = `${ORIGIN}/raya${url.slice(rayaBase.length)}`;
      else if (url.startsWith(sheetsBase)) target = `${SHEETS}${url.slice(sheetsBase.length)}`;
      return mock.handle(new Request(target, init));
    };
    globalThis.fetch = Object.assign(stub, { preconnect: realFetch.preconnect });
  }

  beforeAll(() => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = serviceAccountJson(`${ORIGIN}/oauth/token`);
    process.env.RAYA_API_KEY = "any";
  });
  afterAll(() => {
    if (realEnv.sa === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    else process.env.GOOGLE_SERVICE_ACCOUNT_JSON = realEnv.sa;
    if (realEnv.key === undefined) delete process.env.RAYA_API_KEY;
    else process.env.RAYA_API_KEY = realEnv.key;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("rayaFetch parses the mock's batch list", async () => {
    mock = createMockUpstreams();
    routeToMock();
    const reply = await rayaFetch(
      `/batch?agent_id=${agentA.id}&page_size=50`,
      { method: "GET" },
      BatchListReplySchema,
    );
    expect(batchItems(reply).length).toBeGreaterThan(0);
  });

  test("dashboard sync reads the seeded call-log tabs", async () => {
    mock = createMockUpstreams();
    routeToMock();
    expect(await listSheetTabs(MOCK_CALL_LOG_SHEET_ID)).toEqual([
      MOCK_SEEKER_CALLS_TAB,
      MOCK_PROVIDER_CALLS_TAB,
    ]);
    const seekers = await readSheet(MOCK_CALL_LOG_SHEET_ID, MOCK_SEEKER_CALLS_TAB);
    expect(seekers.rowCount).toBeGreaterThan(0);
    expect(seekers.headers).toContain("call_id");
    expect(seekers.headers).not.toContain("call_transcript");
    const providers = await readSheet(MOCK_CALL_LOG_SHEET_ID, MOCK_PROVIDER_CALLS_TAB);
    expect(providers.headers).toContain("job_id");
    const fallback = await readSheet(MOCK_CALL_LOG_SHEET_ID, "No Such Tab");
    expect(fallback.effectiveTab).toBe(MOCK_SEEKER_CALLS_TAB);

    const callIdCol = seekers.headers.indexOf("call_id");
    const callId = seekers.rows[0]?.[callIdCol];
    if (!callId) throw new Error("no call id in the first row");
    const detail = await getCallDetail(MOCK_CALL_LOG_SHEET_ID, MOCK_SEEKER_CALLS_TAB, callId);
    expect(detail?.final_summary).not.toBe("");
  });

  test("export and review writes land in the staging and feedback tabs", async () => {
    mock = createMockUpstreams();
    routeToMock();
    const columns = registry.seekers.columns;
    const first = await readStagingCallIds(MOCK_STAGING_SHEET_ID, MOCK_STAGING_TAB);
    expect(first.hasHeaders).toBe(false);
    await writeStagingHeaders(MOCK_STAGING_SHEET_ID, MOCK_STAGING_TAB, columns);
    const row = (id: string) => columns.map((c) => (c === "call_id" ? id : "x"));
    expect(await appendStagingRows(MOCK_STAGING_SHEET_ID, MOCK_STAGING_TAB, [row("c1")])).toBe(1);
    await appendStagingRows(MOCK_STAGING_SHEET_ID, MOCK_STAGING_TAB, [row("c2")]);
    const after = await readStagingCallIds(MOCK_STAGING_SHEET_ID, MOCK_STAGING_TAB);
    expect([...after.existing]).toEqual(["c1", "c2"]);
    expect(after.rowByCallId.get("c2")).toBe(3);
    await updateStagingRows(MOCK_STAGING_SHEET_ID, MOCK_STAGING_TAB, [
      { rowNumber: 3, values: row("c3") },
    ]);
    const updated = await readStagingCallIds(MOCK_STAGING_SHEET_ID, MOCK_STAGING_TAB);
    expect([...updated.existing]).toEqual(["c1", "c3"]);

    const feedback = "Feedback Responses";
    const created = await readStagingCallIds(MOCK_CALL_LOG_SHEET_ID, feedback);
    expect(created.hasHeaders).toBe(false);
    expect(await listSheetTabs(MOCK_CALL_LOG_SHEET_ID)).toContain(feedback);
    await writeStagingHeaders(MOCK_CALL_LOG_SHEET_ID, feedback, ["call_id", "reviewer_email"]);
    await appendStagingRows(MOCK_CALL_LOG_SHEET_ID, feedback, [["c9", "r@e2e.local"]]);
    expect([...(await readAllReviewedIds(MOCK_CALL_LOG_SHEET_ID, feedback))]).toEqual(["c9"]);

    expect(await deleteSheetTab(MOCK_CALL_LOG_SHEET_ID, feedback)).toBe(true);
    expect(await listSheetTabs(MOCK_CALL_LOG_SHEET_ID)).not.toContain(feedback);
  });
});
