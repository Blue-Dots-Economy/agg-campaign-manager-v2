import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ProgramId } from "@/programs/registry";
import { FN_ROLES } from "@/auth/roles";
import { requireRole } from "@/auth/middleware";
import type { Json } from "@/server/db/schema";
import { parseInput } from "@/lib/validation";
import { programIdSchema } from "@/lib/input-schemas";
import {
  all,
  campaignArgs,
  campaignArgsSchema,
  campaignListSchema,
  dropFiltersSchema,
  funnelArgsSchema,
  dropArgs,
  failedPayload,
  funnelArgs,
  normalizeCallOutcomes,
  normalizeCampaignDropCauses,
  normalizeCampaignList,
  normalizeDkbCampaignCauses,
  normalizeDropAnalysis,
  normalizeFilterOptions,
  normalizeFunnelCallIds,
  normalizeFunnelDurations,
  toAggregatePayload,
  type AggregatePayload,
  type CallOutcomeCount,
  type CampaignDropCausesPayload,
  type CampaignListItem,
  type DkbCampaignCausesPayload,
  type KkbDropAnalysisPayload,
  type ProgramFilterOptions,
} from "./snapshot-payload";

export type {
  AggregatePayload,
  CallOutcomeCount,
  CampaignDropCausesPayload,
  CampaignListItem,
  CampaignRollup,
  DkbCampaignCausesPayload,
  KkbDropAnalysisPayload,
  MetricAccent,
  MetricCardDef,
  MetricGroup,
  ProgramAggregates,
  ProgramFilterOptions,
  ProgramMetricsRaw,
  ProviderFunnelStage,
} from "./snapshot-payload";

const reports = () => import("@/server/db/reports.server");
const dashboard = requireRole(FN_ROLES.dashboard);

/** Most call rows one campaign-day request returns. */
const MAX_CAMPAIGN_DAY_ROWS = 5000;

async function callStats(program: string): Promise<{ calls: number; lastCallAt: string | null }> {
  const [{ getDb }, { callRows }, { count, eq, max }] = await Promise.all([
    import("@/server/db/client.server"),
    import("@/server/db/schema"),
    import("drizzle-orm"),
  ]);
  const [row] = await getDb()
    .select({ calls: count(), lastCallAt: max(callRows.syncedAt) })
    .from(callRows)
    .where(eq(callRows.program, program));
  return { calls: row?.calls ?? 0, lastCallAt: row?.lastCallAt ?? null };
}

/** Result of one program sync. */
export interface SyncResult {
  ok: boolean;
  program: ProgramId;
  rowCount: number;
  connectionCount: number;
  errors: { id: string; name: string; message: string }[];
  lastSyncedAt: string;
  skipped?: boolean;
}

/** call_rows is a view filled by the pipeline: nothing to sync from Sheets. */
export async function performSync(program: ProgramId): Promise<SyncResult> {
  return {
    ok: false,
    program,
    rowCount: 0,
    connectionCount: 0,
    errors: [
      {
        id: "_source",
        name: "Sync disabled",
        message:
          "Sync is disabled for this data source. Campaign records are loaded directly by the upstream pipeline, not from Google Sheets.",
      },
    ],
    lastSyncedAt: new Date().toISOString(),
  };
}

/** Runs the program sync from the dashboard. */
export const syncProgramSnapshot = createServerFn({ method: "POST" })
  .middleware([dashboard])
  .validator(parseInput(z.object({ program: programIdSchema, force: z.boolean().optional() })))
  .handler(async ({ data }) => performSync(data.program));

/** Returns the dashboard payload for a program under the given filters. */
export const fetchProgramAggregates = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .validator(parseInput(funnelArgsSchema))
  .handler(async ({ data }): Promise<AggregatePayload> => {
    try {
      const out = await (await reports()).programAggregatePayload(funnelArgs(data));
      // The stored call count and last load time come from the calls themselves.
      return toAggregatePayload(out, await callStats(data.program));
    } catch (e) {
      const { logEvent } = await import("@/server/log.server");
      logEvent("error", {
        operation: "snapshot.fetchProgramAggregates",
        status: "failure",
        error: e,
      });
      return failedPayload();
    }
  });

/** Returns the stored call data of one campaign day. */
export const fetchCampaignDayRowsFn = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.admin)])
  .validator(parseInput(z.object({ program: programIdSchema, day: z.string().max(40) })))
  .handler(async ({ data }): Promise<{ rows: Array<Json | null> }> => {
    const [{ getDb }, { callRows }, { and, eq }] = await Promise.all([
      import("@/server/db/client.server"),
      import("@/server/db/schema"),
      import("drizzle-orm"),
    ]);
    const out = await getDb()
      .select({ data: callRows.data })
      .from(callRows)
      .where(and(eq(callRows.program, data.program), eq(callRows.campaignDay, data.day)))
      .limit(MAX_CAMPAIGN_DAY_ROWS);
    return { rows: out.map((r) => r.data) };
  });

/** Returns the KKB drop-analysis matrix. */
export const fetchKkbDropAnalysis = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .validator(parseInput(dropFiltersSchema))
  .handler(async ({ data }): Promise<KkbDropAnalysisPayload> => {
    try {
      return normalizeDropAnalysis(await (await reports()).kkbDropAnalysis(dropArgs(data)));
    } catch {
      return normalizeDropAnalysis(null);
    }
  });

/** Returns the DKB drop-analysis matrix. */
export const fetchDkbDropAnalysis = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .validator(parseInput(dropFiltersSchema))
  .handler(async ({ data }): Promise<KkbDropAnalysisPayload> => {
    try {
      return normalizeDropAnalysis(await (await reports()).dkbDropAnalysis(dropArgs(data)));
    } catch {
      return normalizeDropAnalysis(null);
    }
  });

/** Lists the campaigns of a program with their call counts. */
export const fetchCampaignList = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .validator(parseInput(campaignListSchema))
  .handler(async ({ data }): Promise<CampaignListItem[]> => {
    try {
      const out = await (
        await reports()
      ).campaignList({
        program: data.program,
        state: all(data.state),
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        channel: data.channel ?? "all",
      });
      return normalizeCampaignList(out);
    } catch {
      return [];
    }
  });

/** Returns why calls in one campaign dropped, compared with its region. */
export const fetchCampaignDropCauses = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .validator(parseInput(campaignArgsSchema))
  .handler(async ({ data }): Promise<CampaignDropCausesPayload> => {
    try {
      return normalizeCampaignDropCauses(
        await (await reports()).campaignDropCauses(campaignArgs(data)),
      );
    } catch {
      return normalizeCampaignDropCauses(null);
    }
  });

/** Returns the phase share of one DKB campaign, compared with its region. */
export const fetchDkbCampaignCauses = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .validator(parseInput(campaignArgsSchema))
  .handler(async ({ data }): Promise<DkbCampaignCausesPayload> => {
    try {
      return normalizeDkbCampaignCauses(
        await (await reports()).dkbCampaignCauses(campaignArgs(data)),
      );
    } catch {
      return normalizeDkbCampaignCauses(null);
    }
  });

/** Lists the call ids that reached one funnel stage. */
export const fetchFunnelCallIds = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .validator(parseInput(funnelArgsSchema.extend({ stage: z.string().max(200) })))
  .handler(async ({ data }): Promise<{ count: number; ids: string[] }> => {
    try {
      return normalizeFunnelCallIds(
        await (await reports()).funnelCallIds({ ...funnelArgs(data), stage: data.stage }),
      );
    } catch {
      return { count: 0, ids: [] };
    }
  });

/** Returns the time spent per funnel stage. */
export const fetchFunnelDurations = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .validator(parseInput(funnelArgsSchema))
  .handler(async ({ data }): Promise<Record<string, number>> => {
    try {
      return normalizeFunnelDurations(await (await reports()).funnelDurations(funnelArgs(data)));
    } catch {
      return {};
    }
  });

/** KKB-only: call_outcome breakdown honouring the same filters as the funnel. */
export const fetchKkbCallOutcomes = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .validator(parseInput(dropFiltersSchema))
  .handler(async ({ data }): Promise<CallOutcomeCount[]> => {
    try {
      return normalizeCallOutcomes(await (await reports()).kkbCallOutcomes(dropArgs(data)));
    } catch {
      return [];
    }
  });

/** Returns the values for the dashboard filter menus. */
export const fetchProgramFilterOptions = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .validator(parseInput(z.object({ program: programIdSchema })))
  .handler(async ({ data }): Promise<ProgramFilterOptions> => {
    try {
      return normalizeFilterOptions(
        await (await reports()).programFilterOptions({ program: data.program }),
      );
    } catch {
      return normalizeFilterOptions(null);
    }
  });
