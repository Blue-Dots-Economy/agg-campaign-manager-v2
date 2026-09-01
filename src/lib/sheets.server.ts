// Server-only helper: read a Google Sheet via service-account JWT.
import { SignJWT, importPKCS8 } from "jose";

export interface ServiceAccountJson {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export const DEFAULT_SA_EMAIL = "blue-dots-admin@blue-dots-project.iam.gserviceaccount.com";

function parseServiceAccount(): ServiceAccountJson {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  // Tolerate base64-encoded or quote-wrapped values.
  if (!raw.startsWith("{")) {
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8").trim();
      if (decoded.startsWith("{")) raw = decoded;
    } catch {
      /* ignore */
    }
  }
  let json: ServiceAccountJson;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON — paste the full service-account JSON file contents (starting with '{').",
    );
  }
  if (!json.client_email || !json.private_key) {
    throw new Error("Service account JSON missing client_email or private_key");
  }
  return json;
}


const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(
  scope: string = "https://www.googleapis.com/auth/spreadsheets.readonly",
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > now + 60) return cached.token;

  const sa = parseServiceAccount();
  const pk = await importPKCS8(sa.private_key.replace(/\\n/g, "\n"), "RS256");
  const jwt = await new SignJWT({ scope })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(sa.token_uri ?? "https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(pk);

  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(scope, { token: data.access_token, expiresAt: now + data.expires_in });
  return data.access_token;
}

const RW_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/** Read the call_id column of a staging tab (creates tab on demand). Returns the existing call_ids set + whether headers exist. */
export async function readStagingCallIds(
  sheetId: string,
  tab: string,
): Promise<{ existing: Set<string>; rowByCallId: Map<string, number>; hasHeaders: boolean; headers: string[] }> {
  const token = await getAccessToken(RW_SCOPE);

  // Ensure the tab exists; create if missing.
  const tabs = await listSheetTabs(sheetId);
  if (!tabs.includes(tab)) {
    const addRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: tab } } }],
        }),
      },
    );
    if (!addRes.ok) {
      const text = await addRes.text();
      throw new Error(`Failed to create tab '${tab}' (${addRes.status}): ${text.slice(0, 300)}`);
    }
    return { existing: new Set(), rowByCallId: new Map(), hasHeaders: false, headers: [] };
  }

  const tabPrefix = quoteTab(tab);
  const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabPrefix}A1:ZZ1`;
  const headerRes = await fetch(headerUrl, { headers: { authorization: `Bearer ${token}` } });
  if (!headerRes.ok) throw new Error(`Sheets header read failed (${headerRes.status})`);
  const headerJson = (await headerRes.json()) as { values?: string[][] };
  const headers = (headerJson.values?.[0] ?? []).map((h) => String(h ?? "").trim());
  if (headers.length === 0) return { existing: new Set(), rowByCallId: new Map(), hasHeaders: false, headers: [] };
  const norm = headers.map(normalizeHeader);
  const callIdCol = norm.indexOf("call_id");
  if (callIdCol < 0) return { existing: new Set(), rowByCallId: new Map(), hasHeaders: true, headers };
  const letter = colLetter(callIdCol);
  const colUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabPrefix}${letter}2:${letter}200000`;
  const colRes = await fetch(colUrl, { headers: { authorization: `Bearer ${token}` } });
  if (!colRes.ok) throw new Error(`Sheets call_id read failed (${colRes.status})`);
  const colJson = (await colRes.json()) as { values?: unknown[][] };
  const existing = new Set<string>();
  const rowByCallId = new Map<string, number>();
  for (let i = 0; i < (colJson.values ?? []).length; i++) {
    const r = (colJson.values ?? [])[i];
    const rowNumber = i + 2;
    const v = (r ?? [])[0];
    if (v != null && String(v).trim()) {
      const callId = String(v).trim();
      existing.add(callId);
      rowByCallId.set(callId, rowNumber);
    }
  }
  return { existing, rowByCallId, hasHeaders: true, headers };
}

/** Write the header row to a tab (used when staging tab is empty). */
export async function writeStagingHeaders(
  sheetId: string,
  tab: string,
  headers: string[],
): Promise<void> {
  const token = await getAccessToken(RW_SCOPE);
  const tabPrefix = quoteTab(tab);
  const endCol = colLetter(headers.length - 1);
  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabPrefix}A1:ZZ1:clear`;
  const clearRes = await fetch(clearUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!clearRes.ok) {
    const text = await clearRes.text();
    throw new Error(`Sheets header clear failed (${clearRes.status}): ${text.slice(0, 300)}`);
  }
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabPrefix}A1:${endCol}1` +
    `?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ values: [headers] }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets header write failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

/** Append rows to a staging tab. */
export async function appendStagingRows(
  sheetId: string,
  tab: string,
  rows: string[][],
): Promise<number> {
  if (rows.length === 0) return 0;
  const token = await getAccessToken(RW_SCOPE);
  const tabPrefix = quoteTab(tab);
  // append to A1 — the API finds the next empty row in the table.
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabPrefix}A1:append` +
    `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets append failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return rows.length;
}

/** Update existing staging rows by exact sheet row number. */
export async function updateStagingRows(
  sheetId: string,
  tab: string,
  rows: Array<{ rowNumber: number; values: string[] }>,
): Promise<number> {
  if (rows.length === 0) return 0;
  const token = await getAccessToken(RW_SCOPE);
  const tabPrefix = quoteTab(tab);
  const data = rows.map((row) => ({
    range: `${tabPrefix}A${row.rowNumber}:${colLetter(row.values.length - 1)}${row.rowNumber}`,
    majorDimension: "ROWS",
    values: [row.values],
  }));
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets row update failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return rows.length;
}


export interface SheetReadResult {
  headers: string[];
  rows: string[][];
  rowCount: number;
  effectiveTab: string;
}

function colLetter(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function quoteTab(tab: string): string {
  if (/^[A-Za-z0-9_]+$/.test(tab)) return `${tab}!`;
  return `'${tab.replace(/'/g, "''")}'!`;
}

// Columns excluded from the bulk read — they balloon Worker memory on 20k+ row sheets.
// Fetched on demand via getCallDetail when a user opens a specific call.
function normalizeHeader(h: string): string {
  return String(h ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}
const HEAVY_HEADERS_NORM = new Set([
  "call_transcript",
  "final_summary",
  "call_recording_url",
]);

/** Fetch the spreadsheet's tab titles in order. */
export async function listSheetTabs(sheetId: string): Promise<string[]> {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets metadata failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  return (data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
}

/** Delete a tab by title if it exists. No-op if not present. */
export async function deleteSheetTab(sheetId: string, title: string): Promise<boolean> {
  const token = await getAccessToken(RW_SCOPE);
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`;
  const metaRes = await fetch(metaUrl, { headers: { authorization: `Bearer ${token}` } });
  if (!metaRes.ok) return false;
  const meta = (await metaRes.json()) as { sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> };
  const match = (meta.sheets ?? []).find((s) => s.properties?.title === title);
  if (!match?.properties?.sheetId && match?.properties?.sheetId !== 0) return false;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        requests: [{ deleteSheet: { sheetId: match.properties!.sheetId } }],
      }),
    },
  );
  return res.ok;
}

function isRangeParseError(msg: string): boolean {
  return /Unable to parse range|INVALID_ARGUMENT/i.test(msg);
}

async function readSheetForTab(
  sheetId: string,
  token: string,
  tab: string,
  startRow: number = 2,
  pageSize: number = 200000,
  excludeSet: Set<string> = HEAVY_HEADERS_NORM,
): Promise<SheetReadResult> {

  const tabPrefix = quoteTab(tab);
  const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabPrefix}A1:ZZ1`;
  const headerRes = await fetch(headerUrl, { headers: { authorization: `Bearer ${token}` } });
  if (!headerRes.ok) {
    const text = await headerRes.text();
    throw new Error(`Sheets read failed (${headerRes.status}): ${text.slice(0, 300)}`);
  }
  const headerJson = (await headerRes.json()) as { values?: string[][] };
  const allHeaders = (headerJson.values?.[0] ?? []).map((h) => String(h ?? "").trim());
  if (allHeaders.length === 0) return { headers: [], rows: [], rowCount: 0, effectiveTab: tab };

  const keep: number[] = [];
  allHeaders.forEach((h, i) => {
    if (!excludeSet.has(normalizeHeader(h))) keep.push(i);
  });

  const groups: Array<[number, number]> = [];
  for (const i of keep) {
    const last = groups[groups.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else groups.push([i, i]);
  }
  const endRow = startRow + pageSize - 1;
  const ranges = groups.map(([s, e]) => `${tabPrefix}${colLetter(s)}${startRow}:${colLetter(e)}${endRow}`);

  // FORMATTED_VALUE + FORMATTED_STRING so date cells come back as their
  // displayed strings ("2026-06-23") instead of Excel serials ("46196").
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?` +
    ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&") +
    `&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets read failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { valueRanges?: Array<{ values?: unknown[][] }> };
  const segments = (data.valueRanges ?? []).map((vr) => vr.values ?? []);
  const rowCount = segments.reduce((m, s) => Math.max(m, s.length), 0);

  const keptHeaders: string[] = [];
  for (const [s, e] of groups) for (let i = s; i <= e; i++) keptHeaders.push(allHeaders[i]);

  const rows: string[][] = new Array(rowCount);
  for (let r = 0; r < rowCount; r++) {
    const out: string[] = [];
    for (let g = 0; g < segments.length; g++) {
      const [s, e] = groups[g];
      const width = e - s + 1;
      const segRow = (segments[g][r] ?? []) as unknown[];
      for (let i = 0; i < width; i++) {
        const v = segRow[i];
        out.push(v == null ? "" : String(v));
      }
    }
    rows[r] = out;
  }

  return { headers: keptHeaders, rows, rowCount, effectiveTab: tab };
}

/** Returns the data-row count for a tab (rows after the header). */
export async function getSheetRowCount(sheetId: string, tab: string): Promise<number> {
  const token = await getAccessToken();
  const tabPrefix = quoteTab(tab);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabPrefix}A2:A200000?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return 0;
  const data = (await res.json()) as { values?: unknown[][] };
  return (data.values ?? []).length;
}

/**
 * Reads a sheet. If tabName is missing or invalid, falls back to the first
 * tab in the spreadsheet. The returned `effectiveTab` reflects the tab actually
 * used so callers can persist any correction.
 */
export async function readSheet(
  sheetId: string,
  tabName?: string,
  startRow: number = 2,
  pageSize: number = 200000,
): Promise<SheetReadResult> {
  const token = await getAccessToken();
  const trimmed = (tabName ?? "").trim();

  if (trimmed) {
    try {
      return await readSheetForTab(sheetId, token, trimmed, startRow, pageSize);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRangeParseError(msg)) throw err;
      // Fall through to first-tab fallback below.
    }
  }

  const tabs = await listSheetTabs(sheetId);
  if (tabs.length === 0) throw new Error("Spreadsheet has no tabs");
  return await readSheetForTab(sheetId, token, tabs[0], startRow, pageSize);
}

// For the review queue: exclude only the very large transcript/summary
// columns, but KEEP call_recording_url so the queue can filter to calls
// that have a Raya recording.
const REVIEW_EXCLUDE_NORM = new Set(["call_transcript", "final_summary"]);

/**
 * Same as readSheet, but keeps call_recording_url in the returned rows.
 */
export async function readSheetForReview(
  sheetId: string,
  tabName?: string,
  startRow: number = 2,
  pageSize: number = 200000,
): Promise<SheetReadResult> {
  const token = await getAccessToken();
  const trimmed = (tabName ?? "").trim();

  if (trimmed) {
    try {
      return await readSheetForTab(sheetId, token, trimmed, startRow, pageSize, REVIEW_EXCLUDE_NORM);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRangeParseError(msg)) throw err;
    }
  }

  const tabs = await listSheetTabs(sheetId);
  if (tabs.length === 0) throw new Error("Spreadsheet has no tabs");
  return await readSheetForTab(sheetId, token, tabs[0], startRow, pageSize, REVIEW_EXCLUDE_NORM);
}



export interface CallDetail {
  call_transcript: string;
  final_summary: string;
  call_recording_url: string;
  effectiveTab: string;
}

/** Fetch heavy on-demand columns for a single call row by call_id. */
export async function getCallDetail(
  sheetId: string,
  tabName: string | undefined,
  callId: string,
): Promise<CallDetail | null> {
  const token = await getAccessToken();
  let tab = (tabName ?? "").trim();
  if (!tab) {
    const tabs = await listSheetTabs(sheetId);
    if (tabs.length === 0) throw new Error("Spreadsheet has no tabs");
    tab = tabs[0];
  }
  const tabPrefix = quoteTab(tab);

  const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabPrefix}A1:ZZ1`;
  let headerRes = await fetch(headerUrl, { headers: { authorization: `Bearer ${token}` } });
  if (!headerRes.ok) {
    const text = await headerRes.text();
    if (tabName && isRangeParseError(text)) {
      const tabs = await listSheetTabs(sheetId);
      if (tabs.length === 0) throw new Error("Spreadsheet has no tabs");
      tab = tabs[0];
      headerRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${quoteTab(tab)}A1:ZZ1`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!headerRes.ok) throw new Error(`Sheets read failed (${headerRes.status})`);
    } else {
      throw new Error(`Sheets read failed (${headerRes.status}): ${text.slice(0, 300)}`);
    }
  }
  const headerJson = (await headerRes.json()) as { values?: string[][] };
  const headers = (headerJson.values?.[0] ?? []).map((h) => String(h ?? "").trim());
  const norm = headers.map(normalizeHeader);
  const callIdCol = norm.indexOf("call_id");
  if (callIdCol < 0) return null;

  const prefix2 = quoteTab(tab);
  const idColLetter = colLetter(callIdCol);
  const colUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${prefix2}${idColLetter}2:${idColLetter}200000?valueRenderOption=UNFORMATTED_VALUE`;
  const colRes = await fetch(colUrl, { headers: { authorization: `Bearer ${token}` } });
  if (!colRes.ok) throw new Error(`Sheets read failed (${colRes.status})`);
  const colJson = (await colRes.json()) as { values?: unknown[][] };
  const colValues = colJson.values ?? [];
  let rowIdx = -1;
  for (let i = 0; i < colValues.length; i++) {
    if (String((colValues[i] ?? [])[0] ?? "") === String(callId)) {
      rowIdx = i;
      break;
    }
  }
  if (rowIdx < 0) return null;
  const sheetRow = rowIdx + 2;

  const fullUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${prefix2}A${sheetRow}:ZZ${sheetRow}?valueRenderOption=UNFORMATTED_VALUE`;
  const fullRes = await fetch(fullUrl, { headers: { authorization: `Bearer ${token}` } });
  if (!fullRes.ok) throw new Error(`Sheets read failed (${fullRes.status})`);
  const fullJson = (await fullRes.json()) as { values?: unknown[][] };
  const values = (fullJson.values?.[0] ?? []) as unknown[];
  const byKey: Record<string, string> = {};
  norm.forEach((k, i) => {
    const v = values[i];
    byKey[k] = v == null ? "" : String(v);
  });
  return {
    call_transcript: byKey["call_transcript"] ?? "",
    final_summary: byKey["final_summary"] ?? "",
    call_recording_url: byKey["call_recording_url"] ?? "",
    effectiveTab: tab,
  };
}

/**
 * Read reviewer_email + call_id + job_id from a feedback/responses tab and
 * return the set of call_id and job_id values reviewed by `email`
 * (case-insensitive). Returns an empty set on any error — must never throw.
 */
export async function readReviewedIdsForEmail(
  sheetId: string,
  tab: string,
  email: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  const target = (email || "").trim().toLowerCase();
  if (!target) return out;
  try {
    const token = await getAccessToken();
    const tabPrefix = quoteTab(tab);
    const headerRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabPrefix}A1:ZZ1`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!headerRes.ok) return out;
    const headerJson = (await headerRes.json()) as { values?: string[][] };
    const headers = (headerJson.values?.[0] ?? []).map((h) => normalizeHeader(String(h ?? "")));
    if (headers.length === 0) return out;
    const emailCol = headers.indexOf("reviewer_email");
    const callIdCol = headers.indexOf("call_id");
    const jobIdCol = headers.indexOf("job_id");
    if (emailCol < 0) return out;
    const endCol = colLetter(headers.length - 1);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabPrefix}A2:${endCol}200000?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return out;
    const data = (await res.json()) as { values?: unknown[][] };
    for (const row of data.values ?? []) {
      const em = String((row[emailCol] ?? "")).trim().toLowerCase();
      if (em !== target) continue;
      if (callIdCol >= 0) { const v = String(row[callIdCol] ?? "").trim(); if (v) out.add(v); }
      if (jobIdCol >= 0) { const v = String(row[jobIdCol] ?? "").trim(); if (v) out.add(v); }
    }
  } catch {
    /* never break resume on a sheet hiccup */
  }
  return out;
}

/**
 * Read ALL call_id + job_id values from a feedback/responses tab (every
 * reviewer). Returns an empty set on any error — must never throw.
 */
export async function readAllReviewedIds(
  sheetId: string,
  tab: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const token = await getAccessToken();
    const tabPrefix = quoteTab(tab);
    const headerRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabPrefix}A1:ZZ1`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!headerRes.ok) return out;
    const headerJson = (await headerRes.json()) as { values?: string[][] };
    const headers = (headerJson.values?.[0] ?? []).map((h) => normalizeHeader(String(h ?? "")));
    if (headers.length === 0) return out;
    const callIdCol = headers.indexOf("call_id");
    const jobIdCol = headers.indexOf("job_id");
    if (callIdCol < 0 && jobIdCol < 0) return out;
    const endCol = colLetter(headers.length - 1);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabPrefix}A2:${endCol}200000?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return out;
    const data = (await res.json()) as { values?: unknown[][] };
    for (const row of data.values ?? []) {
      if (callIdCol >= 0) { const v = String(row[callIdCol] ?? "").trim(); if (v) out.add(v); }
      if (jobIdCol >= 0) { const v = String(row[jobIdCol] ?? "").trim(); if (v) out.add(v); }
    }
  } catch {
    /* never break the queue on a sheet hiccup */
  }
  return out;
}
