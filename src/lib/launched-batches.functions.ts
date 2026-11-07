// Records campaign metadata for each Raya batch launched from the wizard.
// The staging export joins on batch_id to stamp campaign columns onto rows.

import { createServerFn } from "@tanstack/react-start";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { sqlNamed, type SqlNamedSelect } from "@/server/db/columns";
import { launchedBatches, launchedBatchInputs } from "@/server/db/schema";
import { parseInput } from "@/server/validation";
import { contactSchema, MAX_CONTACTS_PER_BATCH } from "@/lib/input-schemas";

/** Digits in an Indian mobile number without the country code. */
const PHONE_DIGITS = 10;

/** Recent batches read to find the highest campaign day so far. */
const RECENT_BATCHES_FOR_DAY = 50;

function normalizePhone(v: unknown): string {
  const digits = String(v ?? "").replace(/\D+/g, "");
  return digits.length >= PHONE_DIGITS ? digits.slice(-PHONE_DIGITS) : digits;
}

function normalizeKey(k: string): string {
  return String(k ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function pickRaw(row: Record<string, unknown>, candidates: string[]): string | null {
  const normalized = new Map<string, unknown>();
  Object.entries(row).forEach(([k, v]) => normalized.set(normalizeKey(k), v));
  for (const key of candidates) {
    const value = normalized.get(normalizeKey(key));
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return null;
}

/** A launched batch with its campaign metadata, keyed by SQL column name. */
export type LaunchedBatchRow = SqlNamedSelect<typeof launchedBatches>;

const optText = z.string().max(500).optional();

/** Stores the campaign metadata and input rows of a launched Raya batch. */
export const recordLaunchedBatch = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.launch)])
  .inputValidator(
    parseInput(
      z.object({
        batchId: z.string().min(1).max(200),
        program: z.string().min(1).max(100),
        agentId: optText,
        agentName: optText,
        batchName: optText,
        campaignDay: optText,
        campaignDate: optText,
        campaignType: optText,
        language: optText,
        cityCampaign: optText,
        region: optText,
        inputRows: z.array(contactSchema).max(MAX_CONTACTS_PER_BATCH).optional(),
      }),
    ),
  )
  .handler(async ({ data }): Promise<LaunchedBatchRow> => {
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
            recommendations: pickRaw(r, [
              "recommendations",
              "jobs_recommended",
              "recommended_jobs",
            ]),
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

    if (!row) throw new Error("Batch was not recorded");
    return row;
  });

/** Suggests the next campaign day label for a program. */
export const getNextCampaignDay = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.launch)])
  .inputValidator(parseInput(z.object({ program: z.string().min(1).max(100) })))
  .handler(async ({ data }) => {
    const rows = await getDb()
      .select({ campaign_day: launchedBatches.campaignDay })
      .from(launchedBatches)
      .where(eq(launchedBatches.program, data.program))
      .orderBy(desc(launchedBatches.createdAt))
      .limit(RECENT_BATCHES_FOR_DAY);
    let maxN = 0;
    for (const r of rows) {
      const m = String(r.campaign_day ?? "").match(/(\d+)/);
      if (m) maxN = Math.max(maxN, Number(m[1]));
    }
    return { next: `Day ${maxN + 1}` };
  });
