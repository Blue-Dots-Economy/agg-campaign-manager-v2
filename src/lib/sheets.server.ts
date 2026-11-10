// Server-only Google Sheets client: reads master sheets and writes staging sheets with a service account.
import { z } from "zod";
import { errorMessage } from "@/lib/errors";
import {
  colLetter,
  columnGroups,
  isRangeParseError,
  joinSegments,
  normalizeHeader,
  quoteTab,
} from "./sheet-ranges";

import {
  BatchGetSchema,
  FIRST_DATA_ROW,
  LAST_HEADER_COL,
  LAST_ROW,
  RW_SCOPE,
  SpreadsheetSchema,
  ValueRangeSchema,
  getAccessToken,
  isErrorStatus,
  readColumn,
  readHeaderRow,
  sheetsCall,
  spreadsheetUrl,
  statusOnly,
  valuesUrl,
  withText,
} from "./sheets-client.server";

/** Service-account address shown when sharing a sheet. */
export const DEFAULT_SA_EMAIL = "blue-dots-admin@blue-dots-project.iam.gserviceaccount.com";

/** Result of reading a staging tab's call ids. */
export interface StagingCallIds {
  existing: Set<string>;
  rowByCallId: Map<string, number>;
  hasHeaders: boolean;
  headers: string[];
}

/**
 * Reads the call_id column of a staging tab, creating the tab when it is missing.
 *
 * @returns Known call ids, their sheet row numbers and the header row.
 * @throws {UpstreamError} When Sheets refuses a read or the tab cannot be created.
 */
export async function readStagingCallIds(sheetId: string, tab: string): Promise<StagingCallIds> {
  const empty = (hasHeaders: boolean, headers: string[]): StagingCallIds => ({
    existing: new Set(),
    rowByCallId: new Map(),
    hasHeaders,
    headers,
  });
  const token = await getAccessToken(RW_SCOPE);

  const tabs = await listSheetTabs(sheetId);
  if (!tabs.includes(tab)) {
    await sheetsCall(
      spreadsheetUrl(sheetId, ":batchUpdate"),
      {
        method: "POST",
        token,
        json: { requests: [{ addSheet: { properties: { title: tab } } }] },
        failMessage: withText(`Failed to create tab '${tab}'`),
      },
      z.unknown(),
    );
    return empty(false, []);
  }

  const headers = await readHeaderRow(sheetId, tab, token, statusOnly("Sheets header read failed"));
  if (headers.length === 0) return empty(false, []);
  const callIdCol = headers.map(normalizeHeader).indexOf("call_id");
  if (callIdCol < 0) return empty(true, headers);

  const values = await readColumn(
    sheetId,
    tab,
    callIdCol,
    token,
    "",
    statusOnly("Sheets call_id read failed"),
  );
  const existing = new Set<string>();
  const rowByCallId = new Map<string, number>();
  values.forEach((row, i) => {
    const v = row[0];
    if (v != null && String(v).trim()) {
      const callId = String(v).trim();
      existing.add(callId);
      rowByCallId.set(callId, i + FIRST_DATA_ROW);
    }
  });
  return { existing, rowByCallId, hasHeaders: true, headers };
}

/**
 * Replaces the header row of a staging tab.
 *
 * @throws {UpstreamError} When Sheets refuses the clear or the write.
 */
export async function writeStagingHeaders(
  sheetId: string,
  tab: string,
  headers: string[],
): Promise<void> {
  const token = await getAccessToken(RW_SCOPE);
  const tabPrefix = quoteTab(tab);
  const endCol = colLetter(headers.length - 1);
  await sheetsCall(
    valuesUrl(sheetId, `${tabPrefix}A1:${LAST_HEADER_COL}1:clear`),
    { method: "POST", token, json: {}, failMessage: withText("Sheets header clear failed") },
    z.unknown(),
  );
  await sheetsCall(
    valuesUrl(sheetId, `${tabPrefix}A1:${endCol}1`, "?valueInputOption=RAW"),
    {
      method: "PUT",
      token,
      json: { values: [headers] },
      failMessage: withText("Sheets header write failed"),
    },
    z.unknown(),
  );
}

/**
 * Appends rows after the last filled row of a staging tab.
 *
 * @returns The number of rows sent.
 * @throws {UpstreamError} When Sheets refuses the append.
 */
export async function appendStagingRows(
  sheetId: string,
  tab: string,
  rows: string[][],
): Promise<number> {
  if (rows.length === 0) return 0;
  const token = await getAccessToken(RW_SCOPE);
  await sheetsCall(
    valuesUrl(
      sheetId,
      `${quoteTab(tab)}A1:append`,
      "?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
    ),
    {
      method: "POST",
      token,
      json: { values: rows },
      failMessage: withText("Sheets append failed"),
    },
    z.unknown(),
  );
  return rows.length;
}

/**
 * Overwrites staging rows by sheet row number.
 *
 * @returns The number of rows sent.
 * @throws {UpstreamError} When Sheets refuses the update.
 */
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
  await sheetsCall(
    spreadsheetUrl(sheetId, "/values:batchUpdate"),
    {
      method: "POST",
      token,
      json: { valueInputOption: "RAW", data },
      failMessage: withText("Sheets row update failed"),
    },
    z.unknown(),
  );
  return rows.length;
}

/** Rows read from a tab. */
export interface SheetReadResult {
  headers: string[];
  rows: string[][];
  rowCount: number;
  /** The tab actually read, after any fallback to the first tab. */
  effectiveTab: string;
}

/** Columns left out of bulk reads because they are large; `getCallDetail` reads them per call. */
const HEAVY_HEADERS_NORM = new Set(["call_transcript", "final_summary", "call_recording_url"]);
/** Columns left out of review-queue reads; the queue needs call_recording_url. */
const REVIEW_EXCLUDE_NORM = new Set(["call_transcript", "final_summary"]);

/**
 * Returns the spreadsheet's tab titles in order.
 *
 * @throws {UpstreamError} When Sheets refuses the read.
 */
export async function listSheetTabs(sheetId: string): Promise<string[]> {
  const token = await getAccessToken();
  const data = await sheetsCall(
    spreadsheetUrl(sheetId, "?fields=sheets.properties.title"),
    { token, failMessage: withText("Sheets metadata failed") },
    SpreadsheetSchema,
  );
  return (data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
}

/**
 * Deletes a tab by title.
 *
 * @returns True when a tab was deleted; false when it is missing or Sheets refused.
 */
export async function deleteSheetTab(sheetId: string, title: string): Promise<boolean> {
  const token = await getAccessToken(RW_SCOPE);
  try {
    const meta = await sheetsCall(
      spreadsheetUrl(sheetId, "?fields=sheets.properties"),
      { token, failMessage: statusOnly("Sheets metadata failed") },
      SpreadsheetSchema,
    );
    const sheetTabId = (meta.sheets ?? []).find((s) => s.properties?.title === title)?.properties
      ?.sheetId;
    if (sheetTabId === undefined) return false;
    await sheetsCall(
      spreadsheetUrl(sheetId, ":batchUpdate"),
      {
        method: "POST",
        token,
        json: { requests: [{ deleteSheet: { sheetId: sheetTabId } }] },
        failMessage: statusOnly("Sheets tab delete failed"),
      },
      z.unknown(),
    );
    return true;
  } catch (e) {
    if (isErrorStatus(e)) return false;
    throw e;
  }
}

async function readSheetForTab(
  sheetId: string,
  token: string,
  tab: string,
  startRow: number,
  pageSize: number,
  exclude: ReadonlySet<string>,
): Promise<SheetReadResult> {
  const tabPrefix = quoteTab(tab);
  const allHeaders = await readHeaderRow(sheetId, tab, token, withText("Sheets read failed"));
  if (allHeaders.length === 0) return { headers: [], rows: [], rowCount: 0, effectiveTab: tab };

  const groups = columnGroups(allHeaders, exclude);
  const endRow = startRow + pageSize - 1;
  const ranges = groups.map(
    ([s, e]) => `${tabPrefix}${colLetter(s)}${startRow}:${colLetter(e)}${endRow}`,
  );

  // FORMATTED_VALUE + FORMATTED_STRING return date cells as shown ("2026-06-23"), not serials.
  const url = spreadsheetUrl(
    sheetId,
    "/values:batchGet?" +
      ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&") +
      `&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  );
  const data = await sheetsCall(
    url,
    { token, failMessage: withText("Sheets read failed") },
    BatchGetSchema,
  );
  const segments = (data.valueRanges ?? []).map((vr) => vr.values ?? []);
  const rows = joinSegments(groups, segments);
  const headers = groups.flatMap(([s, e]) => allHeaders.slice(s, e + 1));
  return { headers, rows, rowCount: rows.length, effectiveTab: tab };
}

/** Returns the first tab's title. */
async function firstTab(sheetId: string): Promise<string> {
  const [first] = await listSheetTabs(sheetId);
  if (first === undefined) throw new Error("Spreadsheet has no tabs");
  return first;
}

/** Reads a tab, or the first tab when `tabName` is blank or does not exist. */
async function readWithFallback(
  sheetId: string,
  tabName: string | undefined,
  startRow: number,
  pageSize: number,
  exclude: ReadonlySet<string>,
): Promise<SheetReadResult> {
  const token = await getAccessToken();
  const trimmed = (tabName ?? "").trim();
  if (trimmed) {
    try {
      return await readSheetForTab(sheetId, token, trimmed, startRow, pageSize, exclude);
    } catch (err) {
      if (!isRangeParseError(errorMessage(err))) throw err;
    }
  }
  return readSheetForTab(sheetId, token, await firstTab(sheetId), startRow, pageSize, exclude);
}

/**
 * Returns the number of data rows in a tab (rows after the header).
 *
 * @returns 0 when Sheets refuses the read.
 * @throws {UpstreamError} When Sheets times out or cannot be reached.
 */
export async function getSheetRowCount(sheetId: string, tab: string): Promise<number> {
  const token = await getAccessToken();
  const range = `${quoteTab(tab)}A${FIRST_DATA_ROW}:A${LAST_ROW}`;
  try {
    const data = await sheetsCall(
      valuesUrl(sheetId, range, "?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE"),
      { token, failMessage: statusOnly("Sheets row count failed") },
      ValueRangeSchema,
    );
    return (data.values ?? []).length;
  } catch (e) {
    if (isErrorStatus(e)) return 0;
    throw e;
  }
}

/**
 * Reads a sheet without its large columns. A blank or unknown tab falls back to the first tab;
 * `effectiveTab` names the tab read so callers can store the correction.
 *
 * @throws {UpstreamError} When Sheets refuses the read.
 */
export async function readSheet(
  sheetId: string,
  tabName?: string,
  startRow: number = FIRST_DATA_ROW,
  pageSize: number = LAST_ROW,
): Promise<SheetReadResult> {
  return readWithFallback(sheetId, tabName, startRow, pageSize, HEAVY_HEADERS_NORM);
}

/**
 * Reads a sheet like `readSheet`, but keeps call_recording_url for the review queue.
 *
 * @throws {UpstreamError} When Sheets refuses the read.
 */
export async function readSheetForReview(
  sheetId: string,
  tabName?: string,
  startRow: number = FIRST_DATA_ROW,
  pageSize: number = LAST_ROW,
): Promise<SheetReadResult> {
  return readWithFallback(sheetId, tabName, startRow, pageSize, REVIEW_EXCLUDE_NORM);
}

/** Large columns of one call row. */
export interface CallDetail {
  call_transcript: string;
  final_summary: string;
  call_recording_url: string;
  effectiveTab: string;
}

/** Reads the header row, falling back to the first tab when the named tab does not exist. */
async function headerRowWithFallback(
  sheetId: string,
  tabName: string | undefined,
  token: string,
): Promise<{ tab: string; headers: string[] }> {
  const named = (tabName ?? "").trim();
  if (!named) {
    const tab = await firstTab(sheetId);
    return {
      tab,
      headers: await readHeaderRow(sheetId, tab, token, withText("Sheets read failed")),
    };
  }
  try {
    return {
      tab: named,
      headers: await readHeaderRow(sheetId, named, token, withText("Sheets read failed")),
    };
  } catch (e) {
    if (!(isErrorStatus(e) && isRangeParseError(errorMessage(e)))) throw e;
    const tab = await firstTab(sheetId);
    return {
      tab,
      headers: await readHeaderRow(sheetId, tab, token, statusOnly("Sheets read failed")),
    };
  }
}

/**
 * Reads the large columns (transcript, summary, recording) of one call row by call_id.
 *
 * @returns Null when the tab has no call_id column or the call is not in it.
 * @throws {UpstreamError} When Sheets refuses a read.
 */
export async function getCallDetail(
  sheetId: string,
  tabName: string | undefined,
  callId: string,
): Promise<CallDetail | null> {
  const token = await getAccessToken();
  const { tab, headers } = await headerRowWithFallback(sheetId, tabName, token);
  const norm = headers.map(normalizeHeader);
  const callIdCol = norm.indexOf("call_id");
  if (callIdCol < 0) return null;

  const unformatted = "?valueRenderOption=UNFORMATTED_VALUE";
  const ids = await readColumn(
    sheetId,
    tab,
    callIdCol,
    token,
    unformatted,
    statusOnly("Sheets read failed"),
  );
  const rowIdx = ids.findIndex((row) => String(row[0] ?? "") === String(callId));
  if (rowIdx < 0) return null;
  const sheetRow = rowIdx + FIRST_DATA_ROW;

  const range = `${quoteTab(tab)}A${sheetRow}:${LAST_HEADER_COL}${sheetRow}`;
  const full = await sheetsCall(
    valuesUrl(sheetId, range, unformatted),
    { token, failMessage: statusOnly("Sheets read failed") },
    ValueRangeSchema,
  );
  const values = full.values?.[0] ?? [];
  const byKey = new Map<string, string>();
  norm.forEach((k, i) => {
    const v = values[i];
    byKey.set(k, v == null ? "" : String(v));
  });
  return {
    call_transcript: byKey.get("call_transcript") ?? "",
    final_summary: byKey.get("final_summary") ?? "",
    call_recording_url: byKey.get("call_recording_url") ?? "",
    effectiveTab: tab,
  };
}

/** Reads all data rows of a feedback tab with normalized headers. */
async function readFeedbackRows(
  sheetId: string,
  tab: string,
): Promise<{ headers: string[]; rows: unknown[][] }> {
  const token = await getAccessToken();
  const headers = (
    await readHeaderRow(sheetId, tab, token, statusOnly("Sheets feedback read failed"))
  ).map(normalizeHeader);
  if (headers.length === 0) return { headers, rows: [] };
  const range = `${quoteTab(tab)}A${FIRST_DATA_ROW}:${colLetter(headers.length - 1)}${LAST_ROW}`;
  const data = await sheetsCall(
    valuesUrl(sheetId, range, "?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE"),
    { token, failMessage: statusOnly("Sheets feedback read failed") },
    ValueRangeSchema,
  );
  return { headers, rows: data.values ?? [] };
}

/** Adds the trimmed call_id and job_id cells of a row to `out`. */
function addIds(row: unknown[], cols: number[], out: Set<string>): void {
  for (const col of cols) {
    if (col < 0) continue;
    const v = String(row[col] ?? "").trim();
    if (v) out.add(v);
  }
}

/**
 * Returns the call_id and job_id values a reviewer has already reviewed (email match ignores case).
 * Returns an empty set on any error so that resuming a review never fails on a sheet problem.
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
    const { headers, rows } = await readFeedbackRows(sheetId, tab);
    const emailCol = headers.indexOf("reviewer_email");
    if (emailCol < 0) return out;
    const idCols = [headers.indexOf("call_id"), headers.indexOf("job_id")];
    for (const row of rows) {
      const em = String(row[emailCol] ?? "")
        .trim()
        .toLowerCase();
      if (em === target) addIds(row, idCols, out);
    }
  } catch {
    // sheetsCall has logged the failure; an empty set lets the review continue.
  }
  return out;
}

/**
 * Returns every call_id and job_id value in a feedback tab, for all reviewers.
 * Returns an empty set on any error so that the review queue never fails on a sheet problem.
 */
export async function readAllReviewedIds(sheetId: string, tab: string): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const { headers, rows } = await readFeedbackRows(sheetId, tab);
    const idCols = [headers.indexOf("call_id"), headers.indexOf("job_id")];
    if (idCols.every((c) => c < 0)) return out;
    for (const row of rows) addIds(row, idCols, out);
  } catch {
    // sheetsCall has logged the failure; an empty set lets the queue load.
  }
  return out;
}
