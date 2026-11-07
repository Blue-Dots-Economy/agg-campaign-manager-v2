import { afterEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { ResponseShapeError, UpstreamError } from "../../src/lib/errors";
import { fetchJson } from "../../src/server/http/fetch-json.server";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Reply = Response | (() => Promise<Response>);

/** Replaces fetch with a queue of replies and records each call. */
function stubFetch(replies: Reply[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const stub = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = replies.shift();
    if (!next) throw new Error("no reply queued");
    return typeof next === "function" ? next() : next;
  };
  globalThis.fetch = Object.assign(stub, { preconnect: realFetch.preconnect });
  return calls;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const Item = z.object({ id: z.string(), count: z.number() });
const FAST = { service: "test", timeoutMs: 1_000, baseDelayMs: 1 };

describe("fetchJson", () => {
  test("returns the parsed body", async () => {
    stubFetch([json({ id: "a", count: 2, extra: true })]);
    expect(await fetchJson("https://x/items/a", {}, Item, FAST)).toEqual({ id: "a", count: 2 });
  });

  test("passes a timeout signal to fetch", async () => {
    const calls = stubFetch([json({ id: "a", count: 1 })]);
    await fetchJson("https://x", { method: "GET" }, Item, FAST);
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("treats an empty body as null", async () => {
    stubFetch([new Response("", { status: 204 })]);
    expect(await fetchJson("https://x", {}, z.null(), FAST)).toBeNull();
  });

  test("throws ResponseShapeError when the body does not match", async () => {
    stubFetch([json({ id: 1 })]);
    const err = await fetchJson("https://x", {}, Item, FAST).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ResponseShapeError);
    if (err instanceof ResponseShapeError) expect(err.issues.length).toBeGreaterThan(0);
  });

  test("throws UpstreamError with status and body on a non-2xx reply", async () => {
    stubFetch([json({ message: "no such batch" }, 404)]);
    const err = await fetchJson("https://x", {}, Item, FAST).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    if (err instanceof UpstreamError) {
      expect(err.status).toBe(404);
      expect(err.body).toEqual({ message: "no such batch" });
      expect(err.service).toBe("test");
    }
  });

  test("keeps a non-JSON error body as text", async () => {
    stubFetch([new Response("Bad gateway", { status: 400 })]);
    const err = await fetchJson("https://x", {}, Item, FAST).catch((e: unknown) => e);
    expect(err instanceof UpstreamError && err.body).toBe("Bad gateway");
  });

  test("does not retry unless asked", async () => {
    const calls = stubFetch([json({}, 503), json({ id: "a", count: 1 })]);
    await expect(fetchJson("https://x", {}, Item, FAST)).rejects.toBeInstanceOf(UpstreamError);
    expect(calls).toHaveLength(1);
  });

  test("retries 429 and 5xx replies when retries are allowed", async () => {
    const calls = stubFetch([json({}, 429), json({}, 502), json({ id: "a", count: 1 })]);
    const out = await fetchJson("https://x", {}, Item, { ...FAST, retries: 2 });
    expect(out).toEqual({ id: "a", count: 1 });
    expect(calls).toHaveLength(3);
  });

  test("gives up after the allowed retries", async () => {
    const calls = stubFetch([json({}, 503), json({}, 503)]);
    const err = await fetchJson("https://x", {}, Item, { ...FAST, retries: 1 }).catch(
      (e: unknown) => e,
    );
    expect(err instanceof UpstreamError && err.status).toBe(503);
    expect(calls).toHaveLength(2);
  });

  test("does not retry a 4xx other than 429", async () => {
    const calls = stubFetch([json({}, 400), json({ id: "a", count: 1 })]);
    await expect(fetchJson("https://x", {}, Item, { ...FAST, retries: 3 })).rejects.toBeInstanceOf(
      UpstreamError,
    );
    expect(calls).toHaveLength(1);
  });

  test("turns a timeout into an UpstreamError without a status", async () => {
    stubFetch([() => Promise.reject(new DOMException("The operation timed out.", "TimeoutError"))]);
    const err = await fetchJson("https://x", {}, Item, FAST).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    if (err instanceof UpstreamError) {
      expect(err.status).toBeUndefined();
      expect(err.message).toContain("timed out");
    }
  });

  test("retries a network failure when retries are allowed", async () => {
    const calls = stubFetch([
      () => Promise.reject(new TypeError("fetch failed")),
      json({ id: "a", count: 1 }),
    ]);
    expect(await fetchJson("https://x", {}, Item, { ...FAST, retries: 1 })).toEqual({
      id: "a",
      count: 1,
    });
    expect(calls).toHaveLength(2);
  });
});
