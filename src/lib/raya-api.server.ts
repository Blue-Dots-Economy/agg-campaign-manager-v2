// Server-side client for the Raya voice API: API key, timeout, retries for reads and typed errors.
import { z } from "zod";
import { ResponseShapeError, UpstreamError } from "@/lib/errors";
import { intFromEnv } from "@/server/http/env-number.server";
import { fetchJson } from "@/server/http/fetch-json.server";
import { logEvent } from "@/server/log.server";

/** Raya API base URL used when `RAYA_BASE_URL` is not set. */
export const DEFAULT_RAYA_BASE_URL = "https://v1.getraya.app/api";
/** Time limit per Raya request when `RAYA_TIMEOUT_MS` is not set. */
export const DEFAULT_RAYA_TIMEOUT_MS = 30_000;
/** Extra attempts for a Raya read when `RAYA_RETRIES` is not set. Writes are never repeated. */
export const DEFAULT_RAYA_RETRIES = 3;
/** First wait before a retry; doubles per attempt. Raya's rate limit needs a wait of seconds. */
const RAYA_RETRY_BASE_DELAY_MS = 2_000;
/** Longest part of an upstream reply quoted in an error message. */
const ERROR_TEXT_MAX_CHARS = 600;
const SERVICE = "raya";

/** Raya connection settings. */
export interface RayaConfig {
  baseUrl: string;
  timeoutMs: number;
  retries: number;
}

/**
 * Reads the Raya settings from the environment.
 *
 * @throws {Error} When `RAYA_TIMEOUT_MS` or `RAYA_RETRIES` is not a valid whole number.
 */
export function readRayaConfig(env: Record<string, string | undefined>): RayaConfig {
  const baseUrl = env.RAYA_BASE_URL?.trim() || DEFAULT_RAYA_BASE_URL;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    timeoutMs: intFromEnv(env, "RAYA_TIMEOUT_MS", DEFAULT_RAYA_TIMEOUT_MS, 1),
    retries: intFromEnv(env, "RAYA_RETRIES", DEFAULT_RAYA_RETRIES, 0),
  };
}

let config: RayaConfig | undefined;

/** Settings read once per process. */
function rayaConfig(): RayaConfig {
  config ??= readRayaConfig(process.env);
  return config;
}

/** Raya answered with an error status. `body` may hold personal data: never log it. */
export class RayaApiError extends UpstreamError {
  declare readonly status: number;

  constructor(status: number, body: unknown, message: string, cause?: unknown) {
    super(message, { service: SERVICE, status, body, cause });
    this.name = "RayaApiError";
  }
}

/** Waits `ms` milliseconds. Used to space out calls under Raya's rate limit. */
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ErrorBody = z.object({
  message: z.unknown(),
  error: z.unknown(),
  detail: z.unknown(),
});

const nonEmptyString = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Builds the message shown to the user for a Raya error status. */
function rayaErrorMessage(status: number, body: unknown): string {
  if (status === 401) return "Raya rejected the API key (401). Check RAYA_API_KEY.";
  if (status === 429)
    return "Raya rate limit hit (429). Retried several times but Raya is still throttling requests.";
  if (body && typeof body === "object") {
    const parsed = ErrorBody.partial().safeParse(body);
    const text = parsed.success
      ? (nonEmptyString(parsed.data.message) ??
        nonEmptyString(parsed.data.error) ??
        nonEmptyString(parsed.data.detail))
      : null;
    if (text) return `Raya API ${status}: ${text}`;
    return `Raya API ${status}: ${JSON.stringify(body).slice(0, ERROR_TEXT_MAX_CHARS)}`;
  }
  if (typeof body === "string" && body.trim())
    return `Raya API ${status}: ${body.slice(0, ERROR_TEXT_MAX_CHARS)}`;
  return `Raya API ${status}`;
}

/** Turns a failed fetchJson call into the error callers handle. */
function toRayaError(e: unknown): unknown {
  if (e instanceof UpstreamError && e.status !== undefined) {
    return new RayaApiError(e.status, e.body, rayaErrorMessage(e.status, e.body), e);
  }
  return e;
}

/** Short error text for logs. Never includes the upstream body. */
function logSummary(e: unknown): string {
  if (e instanceof RayaApiError) return `Raya API ${e.status}`;
  if (e instanceof ResponseShapeError) return `${e.message}: ${e.issues.join("; ")}`;
  if (e instanceof Error) return e.message;
  return "Unknown error";
}

/** Request options for Raya; `json` is sent as a JSON body. */
export type RayaRequestInit = RequestInit & { json?: unknown };

/**
 * Calls the Raya API and returns the parsed response body.
 * GET requests retry on 429, 5xx and timeouts; other methods are sent once.
 *
 * @param path - Path under the Raya base URL, including any query string.
 * @param init - Fetch options; `json` is sent as the request body.
 * @param schema - Shape the response must have; any value is accepted when omitted.
 * @throws {Error} When `RAYA_API_KEY` is not set.
 * @throws {RayaApiError} When Raya answers with an error status.
 * @throws {UpstreamError} When Raya times out or cannot be reached.
 * @throws {ResponseShapeError} When the body does not match `schema`.
 */
export function rayaFetch(path: string, init?: RayaRequestInit): Promise<unknown>;
export function rayaFetch<S extends z.ZodTypeAny>(
  path: string,
  init: RayaRequestInit,
  schema: S,
): Promise<z.infer<S>>;
export async function rayaFetch(
  path: string,
  init: RayaRequestInit = {},
  schema: z.ZodTypeAny = z.unknown(),
): Promise<unknown> {
  const apiKey = process.env.RAYA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RAYA_API_KEY is not set. Add it in Project Settings → Secrets, then try again.",
    );
  }

  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("X-API-Key", apiKey);
  headers.set("Accept", "application/json");
  let body = rest.body;
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }

  const { baseUrl, timeoutMs, retries } = rayaConfig();
  const method = (rest.method ?? "GET").toUpperCase();
  const started = Date.now();
  try {
    const data: unknown = await fetchJson(
      `${baseUrl}${path}`,
      { ...rest, method, headers, body },
      schema,
      {
        service: SERVICE,
        timeoutMs,
        retries: method === "GET" ? retries : 0,
        baseDelayMs: RAYA_RETRY_BASE_DELAY_MS,
      },
    );
    logEvent("info", {
      operation: "raya.request",
      status: "success",
      method,
      path,
      latency_ms: Date.now() - started,
    });
    return data;
  } catch (e) {
    const err = toRayaError(e);
    logEvent("error", {
      operation: "raya.request",
      status: "failure",
      method,
      path,
      http_status: err instanceof RayaApiError ? err.status : undefined,
      latency_ms: Date.now() - started,
      error: logSummary(err),
    });
    throw err;
  }
}
