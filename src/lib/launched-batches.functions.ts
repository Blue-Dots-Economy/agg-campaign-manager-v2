// Records campaign metadata for each Raya batch launched from the wizard.
// The staging export joins on batch_id to stamp campaign columns onto rows.

import { createServerFn } from "@tanstack/react-start";
import { desc, eq, sql } from "drizzle-orm";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { sqlNamed } from "@/server/db/columns";
import { launchedBatches, launchedBatchInputs } from "@/server/db/schema";

function normalizePhone(v: any): string {
  const digits = String(v ?? "").replace(/\D+/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizeKey(k: string): string {
  return String(k ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function pickRaw(row: Record<string, any>, candidates: string[]): string | null {
  const normalized = new Map<string, any>();
  Object.entries(row ?? {}).forEach(([k, v]) => normalized.set(normalizeKey(k), v));
  for (const key of candidates) {
    const value = normalized.get(normalizeKey(key));
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return null;
}

export interface LaunchedBatchRow {
  batch_id: string;
  program: string;
  agent_id: string | null;
  agent_name: string | null;
  batch_name: string | null;
  campaign_day: string | null;
  campaign_date: string | null;
  campaign_type: string | null;
  language: string | null;
  city_campaign: string | null;
  region: string | null;
  created_at: string;
  updated_at: string;
}

export const recordLaunchedBatch = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.launch)])
  .inputValidator(
    (d: {
      batchId: string;
      program: string;
      agentId?: string;
      agentName?: string;
      batchName?: string;
      campaignDay?: string;
      campaignDate?: string;
      campaignType?: string;
      language?: string;
      cityCampaign?: string;
      region?: string;
        inputRows?: Array<Record<string, any>>;
    }) => {
      if (!d.batchId) throw new Error("batchId required");
      if (!d.program) throw new Error("program required");
      return d;
    },
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const payload = {
      batchId: data.batchId,
      program: data.program,
      agentId: data.agentId ?? null,
      agentName: data.agentName ?? null,
      batchName: data.batchName ?? null,
      campaignDay: data.campaignDay ?? null,
      campaignDate: data.campaignDate ?? null,
      campaignType: data.campaignType ?? null,
      language: data.language ?? null,
      cityCampaign: data.cityCampaign ?? null,
      region: data.region ?? null,
      updatedAt: new Date().toISOString(),
    };
    const [row] = await db
      .insert(launchedBatches)
      .values(payload)
      .onConflictDoUpdate({ target: launchedBatches.batchId, set: payload })
      .returning(sqlNamed(launchedBatches));

    if (Array.isArray(data.inputRows) && data.inputRows.length > 0) {
      const rows = data.inputRows
        .map((r) => {
          const phone = normalizePhone(
            r.normalized_phone ?? r.contact_phone ?? r.phone ?? r.mobile ?? r.phone_number,
          );
          if (!phone) return null;
          return {
            batchId: data.batchId,
            program: data.program,
            normalizedPhone: phone,
            contactName: pickRaw(r, ["contact_name", "name", "seeker_name", "candidate_name"]),
            recommendations: pickRaw(r, ["recommendations", "jobs_recommended", "recommended_jobs"]),
            userIntent: pickRaw(r, ["user_intent", "intent"]),
            raw: r,
            updatedAt: new Date().toISOString(),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      // One upsert cannot repeat a key.
      const unique = [...new Map(rows.map((r) => [r.normalizedPhone, r])).values()];
      if (unique.length > 0) {
        await db
          .insert(launchedBatchInputs)
          .values(unique)
          .onConflictDoUpdate({
            target: [launchedBatchInputs.batchId, launchedBatchInputs.normalizedPhone],
            set: {
              program: sql`excluded.program`,
              contactName: sql`excluded.contact_name`,
              recommendations: sql`excluded.recommendations`,
              userIntent: sql`excluded.user_intent`,
              raw: sql`excluded.raw`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
      }
    }

    return row as LaunchedBatchRow;
  });

export const getNextCampaignDay = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.launch)])
  .inputValidator((d: { program: string }) => {
    if (!d.program) throw new Error("program required");
    return d;
  })
  .handler(async ({ data }) => {
    const rows = await getDb()
      .select({ campaign_day: launchedBatches.campaignDay })
      .from(launchedBatches)
      .where(eq(launchedBatches.program, data.program))
      .orderBy(desc(launchedBatches.createdAt))
      .limit(50);
    let maxN = 0;
    for (const r of rows) {
      const m = String(r.campaign_day ?? "").match(/(\d+)/);
      if (m) maxN = Math.max(maxN, Number(m[1]));
    }
    return { next: `Day ${maxN + 1}` };
  });
