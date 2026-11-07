// HTTP layer for Google Sheets: service-account tokens, timeouts, retries for reads and error messages.
import { SignJWT, importPKCS8 } from "jose";
import { z } from "zod";
import { UpstreamError } from "@/lib/errors";
import { intFromEnv } from "@/server/http/env-number.server";
import { fetchJson } from "@/server/http/fetch-json.server";
import { logEvent } from "@/server/log.server";
import { colLetter, quoteTab } from "./sheet-ranges";

/** Service-account fields used to sign the token request. */
export interface ServiceAccountJson {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** Sheets API base URL for spreadsheets. */
export const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets/";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
/** OAuth scope for reads. */
export const READ_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
/** OAuth scope for reads and writes. */
export const RW_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SERVICE = "sheets";

/** Time limit per Sheets request when `SHEETS_TIMEOUT_MS` is not set. Full reads of large sheets are slow. */
export const DEFAULT_SHEETS_TIMEOUT_MS = 60_000;
/** Extra attempts for a Sheets read when `SHEETS_RETRIES` is not set. Writes are never repeated. */
export const DEFAULT_SHEETS_RETRIES = 2;
/** Lifetime requested for a service-account token. Google allows at most one hour. */
const TOKEN_LIFETIME_S = 3600;
/** A cached token is renewed when it has less than this left. */
const TOKEN_RENEW_MARGIN_S = 60;
/** Last row read from a tab; sheets stay well below it. */
export const LAST_ROW = 200_000;
/** Last column read for header rows. */
export const LAST_HEADER_COL = "ZZ";
/** Longest part of a Sheets error reply quoted in an error message. */
const ERROR_TEXT_MAX_CHARS = 300;
/** First data row; row 1 holds the headers. */
export const FIRST_DATA_ROW = 2;

/** Sheets connection settings. */
export interface SheetsConfig {
  timeoutMs: number;
  retries: number;
}

/**
 * Reads the Sheets settings from the environment.
 *
 * @throws {Error} When `SHEETS_TIMEOUT_MS` or `SHEETS_RETRIES` is not a valid whole number.
 */
export function readSheetsConfig(env: Record<string, string | undefined>): SheetsConfig {
  return {
    timeoutMs: intFromEnv(env, "SHEETS_TIMEOUT_MS", DEFAULT_SHEETS_TIMEOUT_MS, 1),
    retries: intFromEnv(env, "SHEETS_RETRIES", DEFAULT_SHEETS_RETRIES, 0),
  };
}

let config: SheetsConfig | undefined;

/** Settings read once per process. */
function sheetsConfig(): SheetsConfig {
  config ??= readSheetsConfig(process.env);
  return config;
}

const ServiceAccountSchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  token_uri: z.string().optional(),
});

const TokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });

/** One range of cell values. */
export const ValueRangeSchema = z.object({ values: z.array(z.array(z.unknown())).optional() });

/** Reply of values:batchGet. */
export const BatchGetSchema = z.object({ valueRanges: z.array(ValueRangeSchema).optional() });

/** Spreadsheet metadata with tab titles and ids. */
export const SpreadsheetSchema = z.object({
  sheets: z
    .array(
      z.object({
        properties: z
          .object({ title: z.string().optional(), sheetId: z.number().optional() })
          .optional(),
      }),
    )
    .optional(),
});

function parseServiceAccount(): ServiceAccountJson {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  // Accept base64-encoded values too.
  if (!raw.startsWith("{")) {
    const decoded = Buffer.from(raw, "base64").toString("utf8").trim();
    if (decoded.startsWith("{")) raw = decoded;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON — paste the full service-account JSON file contents (starting with '{').",
    );
  }
  const parsed = ServiceAccountSchema.safeParse(json);
  if (!parsed.success) throw new Error("Service account JSON missing client_email or private_key");
  return parsed.data;
}

/** Text of an upstream error body, for error messages. */
function bodyText(body: unknown): string {
  if (body == null) return "";
  return typeof body === "string" ? body : JSON.stringify(body);
}

/** Options for one Sheets call. */
export interface SheetsRequest {
  method?: "GET" | "POST" | "PUT";
  token?: string;
  /** Sent as a JSON body. */
  json?: unknown;
  /** Sent as a form body. */
  form?: URLSearchParams;
  /** Builds the error message for an error status. */
  failMessage: (status: number, text: string) => string;
}

/**
 * Calls a Google endpoint and parses the reply. GETs retry on 429, 5xx and timeouts.
 *
 * @throws {UpstreamError} On an error status (message from `failMessage`), a timeout or a network error.
 * @throws {ResponseShapeError} When the reply does not match `schema`.
 */
export async function sheetsCall<S extends z.ZodTypeAny>(
  url: string,
  req: SheetsRequest,
  schema: S,
): Promise<z.infer<S>> {
  const method = req.method ?? "GET";
  const headers = new Headers();
  if (req.token) headers.set("authorization", `Bearer ${req.token}`);
  let body: string | URLSearchParams | undefined;
  if (req.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(req.json);
  } else if (req.form) {
    headers.set("content-type", "application/x-www-form-urlencoded");
    body = req.form;
  }
  const { timeoutMs, retries } = sheetsConfig();
  const started = Date.now();
  try {
    return await fetchJson(url, { method, headers, body }, schema, {
      service: SERVICE,
      timeoutMs,
      retries: method === "GET" ? retries : 0,
    });
  } catch (e) {
    const status = e instanceof UpstreamError ? e.status : undefined;
    logEvent("warn", {
      operation: "sheets.request",
      status: "failure",
      method,
      http_status: status,
      latency_ms: Date.now() - started,
      error: e instanceof Error ? e.name : "Unknown error",
    });
    if (e instanceof UpstreamError && status !== undefined) {
      throw new UpstreamError(req.failMessage(status, bodyText(e.body)), {
        service: SERVICE,
        status,
        body: e.body,
        cause: e,
      });
    }
    throw e;
  }
}

/** True when `e` is an error status from Google (not a timeout or network error). */
export function isErrorStatus(e: unknown): boolean {
  return e instanceof UpstreamError && e.status !== undefined;
}

/** Error message builder that quotes the start of the reply. */
export const withText = (label: string) => (status: number, text: string) =>
  `${label} (${status}): ${text.slice(0, ERROR_TEXT_MAX_CHARS)}`;
/** Error message builder with the status only. */
export const statusOnly = (label: string) => (status: number) => `${label} (${status})`;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Returns a service-account access token for `scope`, cached until shortly before it expires.
 *
 * @throws {Error} When GOOGLE_SERVICE_ACCOUNT_JSON is missing or invalid.
 * @throws {UpstreamError} When Google refuses the token request.
 */
export async function getAccessToken(scope: string = READ_SCOPE): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > now + TOKEN_RENEW_MARGIN_S) return cached.token;

  const sa = parseServiceAccount();
  const tokenUri = sa.token_uri ?? DEFAULT_TOKEN_URI;
  const pk = await importPKCS8(sa.private_key.replace(/\\n/g, "\n"), "RS256");
  const jwt = await new SignJWT({ scope })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(tokenUri)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_LIFETIME_S)
    .sign(pk);

  const data = await sheetsCall(
    tokenUri,
    {
      method: "POST",
      form: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
      failMessage: withText("Google token exchange failed"),
    },
    TokenSchema,
  );
  tokenCache.set(scope, { token: data.access_token, expiresAt: now + data.expires_in });
  return data.access_token;
}

/** URL of a values range, with an optional query string. */
export const valuesUrl = (sheetId: string, range: string, query = "") =>
  `${SHEETS_API}${sheetId}/values/${range}${query}`;

/**
 * Reads row 1 of a tab as trimmed strings.
 *
 * @throws {UpstreamError} When Sheets refuses the read.
 */
export async function readHeaderRow(
  sheetId: string,
  tab: string,
  token: string,
  failMessage: SheetsRequest["failMessage"],
): Promise<string[]> {
  const res = await sheetsCall(
    valuesUrl(sheetId, `${quoteTab(tab)}A1:${LAST_HEADER_COL}1`),
    { token, failMessage },
    ValueRangeSchema,
  );
  return (res.values?.[0] ?? []).map((h) => String(h ?? "").trim());
}

/**
 * Reads one column from row 2 down.
 *
 * @throws {UpstreamError} When Sheets refuses the read.
 */
export async function readColumn(
  sheetId: string,
  tab: string,
  col: number,
  token: string,
  query: string,
  failMessage: SheetsRequest["failMessage"],
): Promise<unknown[][]> {
  const letter = colLetter(col);
  const range = `${quoteTab(tab)}${letter}${FIRST_DATA_ROW}:${letter}${LAST_ROW}`;
  const res = await sheetsCall(
    valuesUrl(sheetId, range, query),
    { token, failMessage },
    ValueRangeSchema,
  );
  return res.values ?? [];
}
