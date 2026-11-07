// Raya → staging-sheet export. NEVER writes to a sheet_id present in
// sheet_connections (the masters). All writeback goes to a separate staging
// sheet configured in program_export_targets.

import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { sqlNamed } from "@/server/db/columns";
import {
  launchedBatchInputs,
  launchedBatches,
  programExportTargets,
  sheetConnections,
} from "@/server/db/schema";
import { delay, rayaFetch } from "./raya-api.server";
import {
  appendStagingRows,
  deleteSheetTab,
  readStagingCallIds,
  updateStagingRows,
  writeStagingHeaders,
} from "./sheets.server";
import { registry, type ProgramId } from "@/programs/registry";
import {
  asStr,
  campaignTypeFor,
  detectRegionForContact,
  normalize,
  parseSheetId,
} from "./raya-export-format";
import {
  buildRow,
  mergeCallDetail,
  pickLastCall,
  type BuildCtx,
  type InputRow,
  type LaunchMeta,
} from "./raya-export-rows";

async function exportTarget(program: string): Promise<ExportTarget | null> {
  const [row] = await getDb()
    .select(sqlNamed(programExportTargets))
    .from(programExportTargets)
    .where(eq(programExportTargets.program, program))
    .limit(1);
  return (row ?? null) as ExportTarget | null;
}

async function masterSheets() {
  return getDb()
    .select({
      sheet_id: sheetConnections.sheetId,
      name: sheetConnections.name,
      program: sheetConnections.program,
    })
    .from(sheetConnections);
}

export interface ExportTarget {
  program: ProgramId;
  sheet_id: string;
  tab_name: string | null;
  label: string | null;
  enabled: boolean;
  last_exported_at: string | null;
  last_error: string | null;
}

// ---------- target read ----------
export const getExportTarget = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator((d: { program: ProgramId }) => {
    if (!d.program) throw new Error("program required");
    return d;
  })
  .handler(async ({ data }) => exportTarget(data.program));

// ---------- target write ----------
export const setExportTarget = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(
    (d: { program: ProgramId; sheetUrlOrId: string; tabName?: string; label?: string }) => {
      if (!d.program) throw new Error("program required");
      return d;
    },
  )
  .handler(async ({ data }) => {
    const sheetId = parseSheetId(data.sheetUrlOrId);
    if (!sheetId) throw new Error("Provide a valid Google Sheet URL or ID.");

    const masters = await masterSheets();
    const clash = masters.find((m) => String(m.sheet_id).trim() === sheetId);
    if (clash) {
      throw new Error(
        `Refusing to use sheet ${sheetId} — it is configured as a master sheet (${clash.name ?? clash.program}) in Connections. Staging must be a separate sheet.`,
      );
    }

    const payload = {
      program: data.program,
      sheetId,
      tabName: "Sheet1",
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
    return row as unknown as ExportTarget;
  });

// ---------- fetch all batch contacts ----------
async function fetchAllBatchContacts(batchId: string): Promise<any[]> {
  const pageSize = 200;
  const maxPages = 20;
  const out: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    const res = (await rayaFetch(
      `/batch/${encodeURIComponent(batchId)}/contacts?${qs.toString()}`,
      { method: "GET" },
    )) as any;
    const items: any[] =
      res?.contacts ?? res?.items ?? res?.data ?? (Array.isArray(res) ? res : []);
    out.push(...items);
    if (items.length < pageSize) break;
    await delay(500);
  }
  return out;
}

async function fetchCallDetail(callId: string): Promise<any | null> {
  if (!callId) return null;
  try {
    return (await rayaFetch(`/call/${encodeURIComponent(callId)}`, { method: "GET" })) as any;
  } catch (e) {
    console.warn(
      "[raya-export] call detail unavailable",
      callId,
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

async function nextCampaignDay(program: ProgramId): Promise<string> {
  const rows = await getDb()
    .select({ campaign_day: launchedBatches.campaignDay })
    .from(launchedBatches)
    .where(eq(launchedBatches.program, program))
    .orderBy(desc(launchedBatches.createdAt))
    .limit(100);
  let maxN = 0;
  for (const r of rows) {
    const m = String(r.campaign_day ?? "").match(/(\d+)/);
    if (m) maxN = Math.max(maxN, Number(m[1]));
  }
  return `Day ${maxN + 1}`;
}

// ---------- main export ----------
export const exportBatchToStaging = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.campaigns)])
  .inputValidator(
    (d: { program: ProgramId; batchId: string; batchName?: string; agentName?: string }) => {
      if (!d.program) throw new Error("program required");
      if (!d.batchId) throw new Error("batchId required");
      return d;
    },
  )
  .handler(async ({ data }) => {
    if (!process.env.RAYA_API_KEY) throw new Error("RAYA_API_KEY not set");

    const db = getDb();
    const target = await exportTarget(data.program);
    if (!target || !target.sheet_id) {
      throw new Error(
        "No staging sheet configured for this program. Add one in Settings → Results export sheet (staging).",
      );
    }
    if (!target.enabled) throw new Error("Staging export is disabled for this program.");

    // SAFETY: never write to a master.
    const masters = await masterSheets();
    const clash = masters.find((m) => String(m.sheet_id).trim() === String(target.sheet_id).trim());
    if (clash) {
      throw new Error(
        `Refusing to export — staging sheet matches the master in Connections (${clash.name ?? clash.program}). Update Settings with a different sheet.`,
      );
    }

    const config = registry[data.program];
    if (!config) throw new Error(`Unknown program: ${data.program}`);
    const columns = config.columns;
    const tab = "Sheet1";
    const sheetId = target.sheet_id;

    // Cleanup: never keep or write to the stray tab that older builds created.
    try {
      await deleteSheetTab(sheetId, "Staging");
    } catch {
      /* ignore */
    }

    let existing: Set<string> = new Set();
    let rowByCallId: Map<string, number> = new Map();
    let hasHeaders = false;
    try {
      const r = await readStagingCallIds(sheetId, tab);
      existing = r.existing;
      rowByCallId = r.rowByCallId;
      hasHeaders = r.hasHeaders;
      if (r.hasHeaders && r.headers.join("\u001f") !== columns.join("\u001f")) {
        await writeStagingHeaders(sheetId, tab, columns);
      }
      try {
        await deleteSheetTab(sheetId, "Staging");
      } catch {
        /* ignore */
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db
        .update(programExportTargets)
        .set({ lastError: msg })
        .where(eq(programExportTargets.program, data.program));
      throw new Error(
        `Staging sheet not accessible: ${msg}. Share it with the service account as Editor.`,
      );
    }
    if (!hasHeaders) {
      await writeStagingHeaders(sheetId, tab, columns);
    }

    // Look up launch-time metadata for this batch.
    const [lb] = await db
      .select(sqlNamed(launchedBatches))
      .from(launchedBatches)
      .where(eq(launchedBatches.batchId, data.batchId))
      .limit(1);
    const contacts = await fetchAllBatchContacts(data.batchId);
    const sampleContact = contacts.find((contact) => pickLastCall(contact)) ?? contacts[0] ?? {};
    const detected = detectRegionForContact(sampleContact, {
      batchName: data.batchName ?? (lb as any)?.batch_name ?? "",
      agentName: data.agentName ?? (lb as any)?.agent_name ?? "",
      program: data.program,
    });
    const campaignDay = (lb as any)?.campaign_day ?? (await nextCampaignDay(data.program));
    const language = (lb as any)?.language ?? detected.language;
    const launchMeta: LaunchMeta = {
      campaignDay,
      campaignDate: (lb as any)?.campaign_date ?? null,
      campaignType:
        (lb as any)?.campaign_type ?? campaignTypeFor(data.program, language, campaignDay),
      language,
      cityCampaign: (lb as any)?.city_campaign ?? detected.city,
      region: (lb as any)?.region ?? detected.region,
      batchName: (lb as any)?.batch_name ?? data.batchName ?? null,
      agentName: (lb as any)?.agent_name ?? data.agentName ?? null,
    };
    if (!(lb as any)?.batch_id || !(lb as any)?.campaign_day || !(lb as any)?.campaign_type) {
      const meta = {
        batchId: data.batchId,
        program: data.program,
        agentName: launchMeta.agentName,
        batchName: launchMeta.batchName,
        campaignDay: launchMeta.campaignDay,
        campaignDate: launchMeta.campaignDate,
        campaignType: launchMeta.campaignType,
        language: launchMeta.language,
        cityCampaign: launchMeta.cityCampaign,
        region: launchMeta.region,
        updatedAt: new Date().toISOString(),
      };
      await db
        .insert(launchedBatches)
        .values(meta)
        .onConflictDoUpdate({ target: launchedBatches.batchId, set: meta });
    }

    const inputByPhone = new Map<string, InputRow>();
    try {
      const inputRows = await db
        .select({
          normalized_phone: launchedBatchInputs.normalizedPhone,
          contact_name: launchedBatchInputs.contactName,
          recommendations: launchedBatchInputs.recommendations,
          user_intent: launchedBatchInputs.userIntent,
          raw: launchedBatchInputs.raw,
        })
        .from(launchedBatchInputs)
        .where(eq(launchedBatchInputs.batchId, data.batchId));
      for (const r of inputRows) {
        inputByPhone.set(String((r as any).normalized_phone), r as InputRow);
      }
    } catch (e) {
      console.warn(
        "[raya-export] input rows unavailable",
        e instanceof Error ? e.message : String(e),
      );
    }

    const ctx: BuildCtx = {
      columns,
      program: data.program,
      batchName: data.batchName ?? launchMeta.batchName ?? "",
      agentName: data.agentName ?? launchMeta.agentName ?? "",
      launchMeta,
      inputByPhone,
    };

    const rows: string[][] = [];
    const updates: Array<{ rowNumber: number; values: string[] }> = [];
    const allRowsForStatus: string[][] = [];
    let skippedNoCall = 0;
    let skippedDup = 0;
    let skippedNoId = 0;
    for (const contact of contacts) {
      let lastCall = pickLastCall(contact);
      if (!lastCall) {
        skippedNoCall++;
        continue;
      }
      const callIdForDetail = asStr(lastCall?.uuid ?? lastCall?.id ?? lastCall?.execution_id ?? "");
      lastCall = mergeCallDetail(lastCall, await fetchCallDetail(callIdForDetail));
      await delay(350);
      const row = buildRow(contact, lastCall, ctx);
      if (!row) {
        skippedNoId++;
        continue;
      }
      allRowsForStatus.push(row);
      // call_id position in columns
      const idIdx = columns.findIndex((c) => normalize(c) === "call_id");
      const callId = idIdx >= 0 ? row[idIdx] : "";
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

    let appended = 0;
    let updated = 0;
    if (rows.length > 0) {
      appended = await appendStagingRows(sheetId, tab, rows);
    }
    if (updates.length > 0) {
      updated = await updateStagingRows(sheetId, tab, updates);
    }

    await db
      .update(programExportTargets)
      .set({ lastExportedAt: new Date().toISOString(), lastError: null })
      .where(eq(programExportTargets.program, data.program));

    return {
      appended,
      updated,
      totalContacts: contacts.length,
      completed: contacts.length - skippedNoCall,
      skippedNoCall,
      skippedDup,
      skippedNoId,
      sheetId,
      tab,
      header: columns,
      populatedColumns: columns.filter((_, i) =>
        allRowsForStatus.some((row) => String(row[i] ?? "").trim() !== ""),
      ),
      emptyColumns: columns.filter(
        (_, i) => !allRowsForStatus.some((row) => String(row[i] ?? "").trim() !== ""),
      ),
      rayaFields: {
        contact: Object.keys(sampleContact ?? {}).sort(),
        call: Object.keys(pickLastCall(sampleContact) ?? {}).sort(),
        call_output: Object.keys((pickLastCall(sampleContact) as any)?.call_output ?? {}).sort(),
      },
      sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
    };
  });
