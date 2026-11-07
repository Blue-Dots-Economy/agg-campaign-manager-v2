import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { z } from "zod";
import { ResponseShapeError, UpstreamError } from "../../src/lib/errors";
import {
  DEFAULT_RAYA_BASE_URL,
  DEFAULT_RAYA_RETRIES,
  DEFAULT_RAYA_TIMEOUT_MS,
  RayaApiError,
  rayaFetch,
  readRayaConfig,
} from "../../src/lib/raya-api.server";

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

describe("rayaFetch retry policy", () => {
  const NO_WAIT = { "retry-after": "0" };

  test("retries a GET after a 429 or 5xx", async () => {
    const calls = stubFetch([json({}, 429, NO_WAIT), json({}, 503, NO_WAIT), json({ ok: 1 })]);
    expect(await rayaFetch("/batch?agent_id=a", { method: "GET" })).toEqual({ ok: 1 });
    expect(calls.length).toBe(3);
  });

  test("treats a call without a method as a GET", async () => {
    const calls = stubFetch([json({}, 502, NO_WAIT), json([])]);
    expect(await rayaFetch("/agents")).toEqual([]);
    expect(calls.length).toBe(2);
  });

  test("never repeats a write", async () => {
    const calls = stubFetch([json({}, 429, NO_WAIT), json({ batchId: 1 })]);
    const err = await rayaFetch("/batch", { method: "POST", json: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RayaApiError);
    expect(calls.length).toBe(1);
  });

  test("gives up after the configured retries", async () => {
    const replies = Array.from({ length: DEFAULT_RAYA_RETRIES + 2 }, () => json({}, 500, NO_WAIT));
    const calls = stubFetch(replies);
    await expect(rayaFetch("/agents")).rejects.toThrow("Raya API 500");
    expect(calls.length).toBe(DEFAULT_RAYA_RETRIES + 1);
  });
});

describe("rayaFetch timeouts and shapes", () => {
  test("passes a timeout signal to fetch", async () => {
    const calls = stubFetch([json({})]);
    await rayaFetch("/agents");
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("throws UpstreamError when Raya cannot be reached", async () => {
    const stub = async () => {
      throw new DOMException("timed out", "TimeoutError");
    };
    globalThis.fetch = Object.assign(stub, { preconnect: realFetch.preconnect });
    const err = await rayaFetch("/batch", { method: "POST", json: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err).not.toBeInstanceOf(RayaApiError);
  });

  test("parses the body with the given schema", async () => {
    stubFetch([json({ batchId: 7, extra: true })]);
    const Schema = z.object({ batchId: z.number() });
    expect(await rayaFetch("/batch", { method: "POST", json: {} }, Schema)).toEqual({ batchId: 7 });
  });

  test("throws ResponseShapeError when the body does not match", async () => {
    stubFetch([json({ batchId: "x" })]);
    const Schema = z.object({ batchId: z.number() });
    const err = await rayaFetch("/batch/1", {}, Schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ResponseShapeError);
  });
});

describe("readRayaConfig", () => {
  test("uses named defaults", () => {
    expect(readRayaConfig({})).toEqual({
      baseUrl: DEFAULT_RAYA_BASE_URL,
      timeoutMs: DEFAULT_RAYA_TIMEOUT_MS,
      retries: DEFAULT_RAYA_RETRIES,
    });
  });
  test("reads overrides and drops a trailing slash", () => {
    expect(
      readRayaConfig({
        RAYA_BASE_URL: "https://raya.test/api/",
        RAYA_TIMEOUT_MS: "5000",
        RAYA_RETRIES: "0",
      }),
    ).toEqual({ baseUrl: "https://raya.test/api", timeoutMs: 5000, retries: 0 });
  });
  test("refuses invalid numbers", () => {
    expect(() => readRayaConfig({ RAYA_TIMEOUT_MS: "soon" })).toThrow("RAYA_TIMEOUT_MS");
  });
});
