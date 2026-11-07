import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { RayaApiError, rayaFetch } from "../../src/lib/raya-api.server";

const PHONE = "9876543210";
const realFetch = globalThis.fetch;
const realKey = process.env.RAYA_API_KEY;

beforeAll(() => {
  process.env.RAYA_API_KEY = "test-key";
});
afterAll(() => {
  if (realKey === undefined) delete process.env.RAYA_API_KEY;
  else process.env.RAYA_API_KEY = realKey;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** Replaces fetch with a queue of replies and records each request. */
function stubFetch(replies: Response[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const stub = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = replies.shift();
    if (!next) throw new Error("no reply queued");
    return next;
  };
  globalThis.fetch = Object.assign(stub, { preconnect: realFetch.preconnect });
  return calls;
}

/** Captures every console line written while `fn` runs. */
async function captureLogs(fn: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  const spies = (["log", "info", "warn", "error"] as const).map((m) =>
    spyOn(console, m).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    }),
  );
  try {
    await fn().catch(() => undefined);
  } finally {
    for (const s of spies) s.mockRestore();
  }
  return lines;
}

describe("rayaFetch logging", () => {
  test("logs a failed call without the response body", async () => {
    stubFetch([
      json(
        {
          status: "error",
          message: "Validation failed",
          errors: [{ row: 2, field: "contact_phone", value: PHONE }],
        },
        400,
      ),
    ]);
    const lines = await captureLogs(() =>
      rayaFetch("/batch", { method: "POST", json: { contacts: [] } }),
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).not.toContain(PHONE);
    const entry: unknown = JSON.parse(lines.at(-1) ?? "{}");
    expect(entry).toMatchObject({ operation: "raya.request", status: "failure", path: "/batch" });
    expect(entry).toHaveProperty("http_status", 400);
  });
});

describe("rayaFetch errors", () => {
  test("throws RayaApiError with status and body", async () => {
    stubFetch([json({ message: "no such batch" }, 404)]);
    const err = await rayaFetch("/batch/1", { method: "GET" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RayaApiError);
    if (err instanceof RayaApiError) {
      expect(err.status).toBe(404);
      expect(err.body).toEqual({ message: "no such batch" });
      expect(err.message).toBe("Raya API 404: no such batch");
    }
  });

  test("explains a rejected API key", async () => {
    stubFetch([json({}, 401)]);
    await expect(rayaFetch("/agents", { method: "GET" })).rejects.toThrow(
      "Raya rejected the API key (401). Check RAYA_API_KEY.",
    );
  });

  test("refuses to call Raya without an API key", async () => {
    delete process.env.RAYA_API_KEY;
    try {
      await expect(rayaFetch("/agents")).rejects.toThrow("RAYA_API_KEY is not set");
    } finally {
      process.env.RAYA_API_KEY = "test-key";
    }
  });
});

describe("rayaFetch requests", () => {
  test("sends the key and a JSON body", async () => {
    const calls = stubFetch([json({ batchId: 7 })]);
    expect(await rayaFetch("/batch", { method: "POST", json: { a: 1 } })).toEqual({ batchId: 7 });
    const headers = new Headers(calls[0]?.init?.headers);
    expect(calls[0]?.url).toBe("https://v1.getraya.app/api/batch");
    expect(headers.get("x-api-key")).toBe("test-key");
    expect(headers.get("content-type")).toBe("application/json");
    expect(calls[0]?.init?.body).toBe('{"a":1}');
  });
});
