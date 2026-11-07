// JSON over HTTP for calls to external services: timeout, optional retry and a schema check.
import type { z } from "zod";
import { ResponseShapeError, UpstreamError } from "@/lib/errors";

/** Options for one external call. */
export interface FetchJsonOptions {
  /** Service name used in errors and logs, for example "raya". */
  service: string;
  /** Time limit per attempt. */
  timeoutMs: number;
  /** Extra attempts after a 429, a 5xx, a timeout or a network error. Leave 0 for calls that are not safe to repeat. */
  retries?: number;
  /** First backoff delay; doubles per attempt. A `Retry-After` header wins when present. */
  baseDelayMs?: number;
}

/** Longest wait between attempts, so a large Retry-After header cannot stall a request. */
const MAX_RETRY_DELAY_MS = 12_000;
/** Default first backoff delay. */
const DEFAULT_BASE_DELAY_MS = 500;
const TOO_MANY_REQUESTS = 429;
const FIRST_SERVER_ERROR = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableStatus(status: number): boolean {
  return status === TOO_MANY_REQUESTS || status >= FIRST_SERVER_ERROR;
}

/** Reads a Retry-After header given in seconds or as a date. */
function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

function backoffMs(attempt: number, base: number, retryAfter: string | null): number {
  const fromHeader = retryAfterMs(retryAfter);
  return Math.min(MAX_RETRY_DELAY_MS, fromHeader ?? base * 2 ** attempt);
}

/** Parses a body as JSON; an empty body is null and non-JSON text is returned as text. */
function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isTimeout(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
}

/**
 * Calls an external service and returns the response body parsed with `schema`.
 *
 * @throws {UpstreamError} On a non-2xx reply, a timeout or a network error, after any retries.
 * @throws {ResponseShapeError} When the body does not match `schema`.
 */
export async function fetchJson<S extends z.ZodTypeAny>(
  url: string,
  init: RequestInit,
  schema: S,
  options: FetchJsonOptions,
): Promise<z.infer<S>> {
  const { service, timeoutMs, retries = 0, baseDelayMs = DEFAULT_BASE_DELAY_MS } = options;

  for (let attempt = 0; ; attempt += 1) {
    const canRetry = attempt < retries;
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      if (canRetry) {
        await sleep(backoffMs(attempt, baseDelayMs, null));
        continue;
      }
      const message = isTimeout(e) ? `${service} timed out` : `${service} could not be reached`;
      throw new UpstreamError(message, { service, cause: e });
    }

    const body = parseBody(await res.text());
    if (!res.ok) {
      if (canRetry && isRetryableStatus(res.status)) {
        await sleep(backoffMs(attempt, baseDelayMs, res.headers.get("retry-after")));
        continue;
      }
      throw new UpstreamError(`${service} answered ${res.status}`, {
        service,
        status: res.status,
        body,
      });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ResponseShapeError(
        service,
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      );
    }
    return parsed.data;
  }
}
