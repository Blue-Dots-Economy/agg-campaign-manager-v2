// Raya → staging-sheet export: reads a batch from Raya and writes one row per finished call.
// Writes go only to the staging sheet in program_export_targets, never to a master sheet in
// sheet_connections.

import { desc, eq } from "drizzle-orm";
import { errorMessage } from "@/lib/errors";
import { JsonValueSchema, type JsonObject, type JsonValue } from "@/lib/json";
import { registry, type ProgramId } from "@/programs/registry";
import { getDb } from "@/server/db/client.server";
import { sqlNamed } from "@/server/db/columns";
import {
  launchedBatchInputs,
  launchedBatches,
  programExportTargets,
  sheetConnections,
} from "@/server/db/schema";
import { logEvent } from "@/server/log.server";
import { delay, rayaFetch } from "./raya-api.server";
import {
  asStr,
  campaignTypeFor,
  detectRegionForContact,
  nextCampaignDayLabel,
  normalize,
  parseSheetId,
  sortedKeys,
} from "./raya-export-format";
import {
  buildRow,
  columnCoverage,
  mergeCallDetail,
  pickLastCall,
  type BuildCtx,
  type InputRow,
  type LaunchMeta,
} from "./raya-export-rows";
import { BatchContactsPageSchema, pageContacts } from "./raya-live-batches";
import { asRecord, first } from "./raya-record";
import {
  appendStagingRows,
  deleteSheetTab,
  readStagingCallIds,
  updateStagingRows,
  writeStagingHeaders,
  type StagingCallIds,
} from "./sheets.server";

/** Tab the export writes to. */
const STAGING_TAB = "Sheet1";
/** Stray tab some staging sheets still hold; the export deletes it. */
const LEGACY_STAGING_TAB = "Staging";
/** Contacts per page when reading a batch for export. */
const EXPORT_CONTACTS_PAGE_SIZE = 200;
/** Pages read per export, so at most 4,000 contacts are exported. */
const EXPORT_CONTACTS_MAX_PAGES = 20;
/** Pause between contact pages, to stay under Raya's rate limit. */
const CONTACT_PAGE_GAP_MS = 500;
/** Pause between call-detail reads, to stay under Raya's rate limit. */
const CALL_DETAIL_GAP_MS = 350;
/** Recent batches read to find the next campaign day number. */
const RECENT_BATCHES_FOR_DAY = 100;

/**
 * Returns a program's staging-sheet target, or null when none is set.
 *
 * @throws {Error} When the database read fails.
 */
export async function exportTarget(program: string) {
  const [row] = await getDb()
    .select(sqlNamed(programExportTargets))
    .from(programExportTargets)
    .where(eq(programExportTargets.program, program))
    .limit(1);
  return row ?? null;
}

/** A program's staging-sheet target. */
export type ExportTarget = NonNullable<Awaited<ReturnType<typeof exportTarget>>>;

async function masterSheets() {
  return getDb()
    .select({
      sheet_id: sheetConnections.sheetId,
      name: sheetConnections.name,
      program: sheetConnections.program,
    })
    .from(sheetConnections);
}

/** Returns the master sheet with this id, if any. */
async function findMaster(sheetId: string) {
  const masters = await masterSheets();
  return masters.find((m) => String(m.sheet_id).trim() === sheetId.trim());
}

/** Input for `saveExportTarget`. */
export interface SaveExportTargetInput {
  program: ProgramId;
  sheetUrlOrId: string;
  label?: string;
}

/**
 * Stores a program's staging sheet. Refuses a sheet that is a master sheet in Connections.
 *
 * @throws {Error} When the sheet id is invalid or belongs to a master sheet.
 */
export async function saveExportTarget(data: SaveExportTargetInput): Promise<ExportTarget> {
  const sheetId = parseSheetId(data.sheetUrlOrId);
  if (!sheetId) throw new Error("Provide a valid Google Sheet URL or ID.");

  const clash = await findMaster(sheetId);
  if (clash) {
    throw new Error(
      `Refusing to use sheet ${sheetId} — it is configured as a master sheet (${clash.name ?? clash.program}) in Connections. Staging must be a separate sheet.`,
    );
  }

  const payload = {
    program: data.program,
    sheetId,
    tabName: STAGING_TAB,
    label: data.label?.trim() || null,
    enabled: true,
    lastError: null,
  };
  const [row] = await getDb()
    .insert(programExportTargets)
    .values(payload)
    .onConflictDoUpdate({
      target: programExportTargets.program,
      set: { ...payload, updatedAt: new Date().toISOString() },
    })
    .returning(sqlNamed(programExportTargets));
  if (!row) throw new Error("Saving the staging sheet returned no row.");
  return row;
}

async function fetchAllBatchContacts(batchId: string): Promise<JsonObject[]> {
  const out: JsonObject[] = [];
  for (let page = 1; page <= EXPORT_CONTACTS_MAX_PAGES; page++) {
    const qs = new URLSearchParams({
      page: String(page),
      page_size: String(EXPORT_CONTACTS_PAGE_SIZE),
    });
    const reply = await rayaFetch(
      `/batch/${encodeURIComponent(batchId)}/contacts?${qs.toString()}`,
      { method: "GET" },
      BatchContactsPageSchema,
    );
    const items = pageContacts(reply);
    out.push(...items);
    if (items.length < EXPORT_CONTACTS_PAGE_SIZE) break;
    await delay(CONTACT_PAGE_GAP_MS);
  }
  return out;
}

/** Reads one call's full detail; returns null when Raya cannot give it, so the row uses the batch data. */
async function fetchCallDetail(callId: string): Promise<JsonValue | null> {
  if (!callId) return null;
  try {
    return await rayaFetch(
      `/call/${encodeURIComponent(callId)}`,
      { method: "GET" },
      JsonValueSchema,
    );
  } catch (e) {
    logEvent("warn", {
      operation: "raya-export.callDetail",
      status: "skipped",
      call_id: callId,
      error: e instanceof Error ? e.name : "Unknown error",
    });
    return null;
  }
}

async function nextCampaignDay(program: ProgramId): Promise<string> {
  const rows = await getDb()
    .select({ campaign_day: launchedBatches.campaignDay })
    .from(launchedBatches)
    .where(eq(launchedBatches.program, program))
    .orderBy(desc(launchedBatches.createdAt))
    .limit(RECENT_BATCHES_FOR_DAY);
  return nextCampaignDayLabel(rows.map((r) => r.campaign_day));
}

/** Deletes the legacy tab. Failure is logged and ignored: the tab is only clutter. */
async function removeLegacyTab(sheetId: string): Promise<void> {
  try {
    await deleteSheetTab(sheetId, LEGACY_STAGING_TAB);
  } catch (e) {
    logEvent("warn", {
      operation: "raya-export.removeLegacyTab",
      status: "skipped",
      error: e instanceof Error ? e.name : "Unknown error",
    });
  }
}

const sameHeaders = (a: string[], b: string[]) =>
  a.length === b.length && a.every((h, i) => h === b[i]);

/** Reads the staging tab's call ids and makes sure its header row matches `columns`. */
async function prepareStagingTab(
  program: ProgramId,
  sheetId: string,
  columns: string[],
): Promise<StagingCallIds> {
  let staging: StagingCallIds;
  try {
    staging = await readStagingCallIds(sheetId, STAGING_TAB);
    if (staging.hasHeaders && !sameHeaders(staging.headers, columns)) {
      await writeStagingHeaders(sheetId, STAGING_TAB, columns);
    }
    await removeLegacyTab(sheetId);
  } catch (e) {
    const msg = errorMessage(e);
    await getDb()
      .update(programExportTargets)
      .set({ lastError: msg })
      .where(eq(programExportTargets.program, program));
    throw new Error(
      `Staging sheet not accessible: ${msg}. Share it with the service account as Editor.`,
    );
  }
  if (!staging.hasHeaders) await writeStagingHeaders(sheetId, STAGING_TAB, columns);
  return staging;
}

/** Contact rows uploaded at launch, keyed by normalized phone. Empty when the read fails. */
async function launchInputs(batchId: string): Promise<Map<string, InputRow>> {
  const byPhone = new Map<string, InputRow>();
  try {
    const rows = await getDb()
      .select({
        normalized_phone: launchedBatchInputs.normalizedPhone,
        contact_name: launchedBatchInputs.contactName,
        recommendations: launchedBatchInputs.recommendations,
        user_intent: launchedBatchInputs.userIntent,
        raw: launchedBatchInputs.raw,
      })
      .from(launchedBatchInputs)
      .where(eq(launchedBatchInputs.batchId, batchId));
    for (const r of rows) byPhone.set(r.normalized_phone, r);
  } catch (e) {
    logEvent("warn", {
      operation: "raya-export.launchInputs",
      status: "skipped",
      error: e instanceof Error ? e.name : "Unknown error",
    });
  }
  return byPhone;
}

/** Input for `exportBatch`. */
export interface ExportBatchInput {
  program: ProgramId;
  batchId: string;
  batchName?: string;
  agentName?: string;
}

/** Launch details for the batch: the stored row, filled in from detection where it is missing. */
async function launchMetaFor(data: ExportBatchInput, contacts: JsonObject[]): Promise<LaunchMeta> {
  const db = getDb();
  const [lb] = await db
    .select(sqlNamed(launchedBatches))
    .from(launchedBatches)
    .where(eq(launchedBatches.batchId, data.batchId))
    .limit(1);
  const sampleContact = contacts.find((c) => pickLastCall(c)) ?? contacts[0] ?? {};
  const detected = detectRegionForContact(sampleContact, {
    batchName: data.batchName ?? lb?.batch_name ?? "",
    agentName: data.agentName ?? lb?.agent_name ?? "",
    program: data.program,
  });
  const campaignDay = lb?.campaign_day ?? (await nextCampaignDay(data.program));
  const language = lb?.language ?? detected.language;
  const launchMeta = {
    campaignDay,
    campaignDate: lb?.campaign_date ?? null,
    campaignType: lb?.campaign_type ?? campaignTypeFor(data.program, language, campaignDay),
    language,
    cityCampaign: lb?.city_campaign ?? detected.city,
    region: lb?.region ?? detected.region,
    batchName: lb?.batch_name ?? data.batchName ?? null,
    agentName: lb?.agent_name ?? data.agentName ?? null,
  };
  if (!lb?.batch_id || !lb.campaign_day || !lb.campaign_type) {
    const meta = {
      batchId: data.batchId,
      program: data.program,
      ...launchMeta,
      updatedAt: new Date().toISOString(),
    };
    await db
      .insert(launchedBatches)
      .values(meta)
      .onConflictDoUpdate({ target: launchedBatches.batchId, set: meta });
  }
  return launchMeta;
}

/**
 * Exports a Raya batch to the program's staging sheet: appends new calls and updates calls
 * already in the sheet.
 *
 * @throws {Error} When no staging sheet is set, it is disabled, it is a master sheet, or it cannot be read.
 * @throws {UpstreamError} When Raya or Sheets fails.
 */
export async function exportBatch(data: ExportBatchInput) {
  if (!process.env.RAYA_API_KEY) throw new Error("RAYA_API_KEY not set");

  const target = await exportTarget(data.program);
  if (!target?.sheet_id) {
    throw new Error(
      "No staging sheet configured for this program. Add one in Settings → Results export sheet (staging).",
    );
  }
  if (!target.enabled) throw new Error("Staging export is disabled for this program.");

  const clash = await findMaster(target.sheet_id);
  if (clash) {
    throw new Error(
      `Refusing to export — staging sheet matches the master in Connections (${clash.name ?? clash.program}). Update Settings with a different sheet.`,
    );
  }

  const columns = registry[data.program].columns;
  const sheetId = target.sheet_id;

  const { existing, rowByCallId } = await prepareStagingTab(data.program, sheetId, columns);

  const contacts = await fetchAllBatchContacts(data.batchId);
  const [launchMeta, inputByPhone] = await Promise.all([
    launchMetaFor(data, contacts),
    launchInputs(data.batchId),
  ]);

  const ctx: BuildCtx = {
    columns,
    program: data.program,
    batchName: data.batchName ?? launchMeta.batchName ?? "",
    agentName: data.agentName ?? launchMeta.agentName ?? "",
    launchMeta,
    inputByPhone,
  };

  const idIdx = columns.findIndex((c) => normalize(c) === "call_id");
  const rows: string[][] = [];
  const updates: Array<{ rowNumber: number; values: string[] }> = [];
  const allRows: string[][] = [];
  let skippedNoCall = 0;
  let skippedDup = 0;
  let skippedNoId = 0;
  for (const contact of contacts) {
    const lastCall = pickLastCall(contact);
    if (!lastCall) {
      skippedNoCall++;
      continue;
    }
    const detail = await fetchCallDetail(asStr(first(lastCall, "uuid", "id", "execution_id")));
    await delay(CALL_DETAIL_GAP_MS);
    const row = buildRow(contact, mergeCallDetail(lastCall, detail), ctx);
    if (!row) {
      skippedNoId++;
      continue;
    }
    allRows.push(row);
    const callId = row[idIdx] ?? "";
    if (!callId) {
      skippedNoId++;
      continue;
    }
    if (existing.has(callId)) {
      skippedDup++;
      const rowNumber = rowByCallId.get(callId);
      if (rowNumber) updates.push({ rowNumber, values: row });
      continue;
    }
    existing.add(callId);
    rows.push(row);
  }

  const appended = await appendStagingRows(sheetId, STAGING_TAB, rows);
  const updated = await updateStagingRows(sheetId, STAGING_TAB, updates);

  await getDb()
    .update(programExportTargets)
    .set({ lastExportedAt: new Date().toISOString(), lastError: null })
    .where(eq(programExportTargets.program, data.program));

  const sampleContact = contacts.find((c) => pickLastCall(c)) ?? contacts[0] ?? {};
  const sampleCall = pickLastCall(sampleContact);
  return {
    appended,
    updated,
    totalContacts: contacts.length,
    completed: contacts.length - skippedNoCall,
    skippedNoCall,
    skippedDup,
    skippedNoId,
    sheetId,
    tab: STAGING_TAB,
    header: columns,
    ...columnCoverage(columns, allRows),
    rayaFields: {
      contact: sortedKeys(sampleContact),
      call: sortedKeys(sampleCall ?? {}),
      call_output: sortedKeys(asRecord(sampleCall?.call_output) ?? {}),
    },
    sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
  };
}
