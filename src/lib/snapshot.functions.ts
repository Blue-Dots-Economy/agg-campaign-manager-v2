import { createServerFn } from "@tanstack/react-start";
import type { CallRow } from "@/programs/data";
import type { ProgramId } from "@/programs/registry";
import { FN_ROLES } from "@/auth/roles";
import { requireRole } from "@/auth/middleware";

const reports = () => import("@/server/db/reports.server");
const dashboard = requireRole(FN_ROLES.dashboard);
const all = (v: string | undefined) => (v && v !== "all" ? v : "all");

export interface SyncResult {
  ok: boolean;
  program: ProgramId;
  rowCount: number;
  connectionCount: number;
  errors: { id: string; name: string; message: string }[];
  lastSyncedAt: string;
  skipped?: boolean;
}

// call_rows is a view filled by the pipeline: nothing to sync from Sheets.
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

export const syncProgramSnapshot = createServerFn({ method: "POST" })
  .middleware([dashboard])
  .inputValidator((d: { program: ProgramId; force?: boolean }) => d)
  .handler(async ({ data }) => performSync(data.program));

export interface CampaignRollup {
  day: string;
  date: string;
  type: string;
  language: string;
  rows: number;
  answered: number;
  engaged: number;
  converted: number;
  new_jobs: number;
  answered_pct: number;
  high_intent: number;
}

export interface ProgramAggregates {
  kpis: Record<string, number>;
  perDay: CampaignRollup[];
  drops: Array<{ reason: string; count: number }>;
  intents: Array<{ score: string; count: number }>;
  regions: Array<{ region: string; count: number }>;
  phases: Array<{ phase: string; count: number }>;
  jobStatus: Array<{ status: string; count: number }>;
  outcomes: Array<{ outcome: string; count: number }>;
  dkbIntents: Array<{ score: string; count: number }>;
  dropAnalysis: Array<{
    stage: string;
    reason: string;
    byRegion: Record<string, number>;
    total: number;
  }>;
}

function emptyAggregates(): ProgramAggregates {
  return {
    kpis: {},
    perDay: [],
    drops: [],
    intents: [],
    regions: [],
    phases: [],
    jobStatus: [],
    outcomes: [],
    dkbIntents: [],
    dropAnalysis: [],
  };
}

function normalizeAggregates(value: unknown): ProgramAggregates {
  if (!value || typeof value !== "object") return emptyAggregates();
  const raw = value as Partial<ProgramAggregates>;
  const kpis: Record<string, number> =
    raw.kpis && typeof raw.kpis === "object" ? { ...(raw.kpis as Record<string, number>) } : {};
  // RPC historically emits `total_rows`; frontend registry uses `total_calls`.
  // Mirror both so either consumer reads the same filtered count.
  if (kpis.total_calls == null && kpis.total_rows != null) kpis.total_calls = kpis.total_rows;
  if (kpis.total_rows == null && kpis.total_calls != null) kpis.total_rows = kpis.total_calls;
  return {
    kpis,
    perDay: Array.isArray(raw.perDay) ? raw.perDay : [],
    drops: Array.isArray(raw.drops) ? raw.drops : [],
    intents: Array.isArray(raw.intents) ? raw.intents : [],
    regions: Array.isArray(raw.regions) ? raw.regions : [],
    phases: Array.isArray(raw.phases) ? raw.phases : [],
    jobStatus: Array.isArray(raw.jobStatus) ? raw.jobStatus : [],
    outcomes: Array.isArray(raw.outcomes) ? raw.outcomes : [],
    dkbIntents: Array.isArray(raw.dkbIntents) ? raw.dkbIntents : [],
    dropAnalysis: Array.isArray(raw.dropAnalysis)
      ? (raw.dropAnalysis as unknown[]).flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const e = entry as Record<string, unknown>;
          const byRegion: Record<string, number> = {};
          if (e.byRegion && typeof e.byRegion === "object") {
            for (const [k, v] of Object.entries(e.byRegion as Record<string, unknown>)) {
              if (typeof v === "number" && Number.isFinite(v)) byRegion[k] = v;
            }
          }
          const total = typeof e.total === "number" && Number.isFinite(e.total) ? e.total : 0;
          return [
            {
              stage: typeof e.stage === "string" ? e.stage : String(e.stage ?? ""),
              reason: typeof e.reason === "string" ? e.reason : String(e.reason ?? ""),
              byRegion,
              total,
            },
          ];
        })
      : [],
  };
}

export type MetricAccent = "green" | "amber" | "red" | "blue";

export interface MetricCardDef {
  key: string;
  label: string;
  value: string;
  sub: string;
  accent: MetricAccent;
}

export interface MetricGroup {
  key: string;
  title: string;
  subtitle?: string;
  cards: MetricCardDef[];
}

export interface ProviderFunnelStage {
  key: string;
  label: string;
  providers: number;
  openings: number;
  calls: number;
}
export interface ProgramMetricsRaw {
  program?: string;
  providerFunnel?: ProviderFunnelStage[];
  [k: string]: number | string | ProviderFunnelStage[] | undefined;
}

export interface AggregatePayload {
  source: "snapshot" | "empty";
  hasSnapshot: boolean;
  totalRows: number;
  /** Total rows in the unfiltered snapshot (for distinguishing "no snapshot" vs "filter excludes everything"). */
  snapshotRowCount: number;
  connectionCount: number;
  lastSyncedAt: string | null;
  syncStatus: string;
  aggregates: ProgramAggregates;
  metricGroups: MetricGroup[];
  metrics: ProgramMetricsRaw;
  /** Lightweight per-day index for the Campaigns table (no row payload). */
  campaigns: ProgramAggregates["perDay"];
  /** Why a payload is empty — UI uses this to pick the right empty-state copy. */
  emptyReason?: "no_connections" | "no_snapshot" | "no_results";
  error?: string;
}

function emptyPayload(
  connectionCount: number,
  state: { last_synced_at: string | null; status: string } | null,
  error?: string,
  emptyReason: AggregatePayload["emptyReason"] = connectionCount === 0 ? "no_connections" : "no_snapshot",
): AggregatePayload {
  return {
    source: "empty",
    hasSnapshot: false,
    totalRows: 0,
    snapshotRowCount: 0,
    connectionCount,
    lastSyncedAt: state?.last_synced_at ?? null,
    syncStatus: state?.status ?? "idle",
    aggregates: emptyAggregates(),
    metricGroups: [],
    metrics: {},
    campaigns: [],
    emptyReason,
    error,
  };
}

interface AggregateRpcPayload {
  connectionCount?: number;
  lastSyncedAt?: string | null;
  syncStatus?: string;
  stateRowCount?: number;
  aggregates?: unknown;
  metricGroups?: unknown;
  metrics?: unknown;
}

function normalizeMetricsRaw(value: unknown): ProgramMetricsRaw {
  if (!value || typeof value !== "object") return {};
  const out: ProgramMetricsRaw = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "program") out.program = String(v);
    else if (k === "providerFunnel" && Array.isArray(v)) {
      out.providerFunnel = v.flatMap((it) => {
        if (!it || typeof it !== "object") return [];
        const o = it as Record<string, unknown>;
        return [{
          key: String(o.key ?? ""),
          label: String(o.label ?? ""),
          providers: Number(o.providers ?? 0) || 0,
          openings: Number(o.openings ?? 0) || 0,
          calls: Number(o.calls ?? 0) || 0,
        }];
      });
    }
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v !== "" && !isNaN(Number(v))) out[k] = Number(v);
  }
  return out;
}


function normalizeMetricGroups(value: unknown): MetricGroup[] {
  if (!Array.isArray(value)) return [];
  const allowed: MetricAccent[] = ["green", "amber", "red", "blue"];
  return value.flatMap((g): MetricGroup[] => {
    if (!g || typeof g !== "object") return [];
    const o = g as Record<string, unknown>;
    const cards = Array.isArray(o.cards)
      ? o.cards.flatMap((c): MetricCardDef[] => {
          if (!c || typeof c !== "object") return [];
          const x = c as Record<string, unknown>;
          const accent = allowed.includes(x.accent as MetricAccent) ? (x.accent as MetricAccent) : "blue";
          return [{
            key: String(x.key ?? ""),
            label: String(x.label ?? ""),
            value: String(x.value ?? ""),
            sub: String(x.sub ?? ""),
            accent,
          }];
        })
      : [];
    return [{
      key: String(o.key ?? ""),
      title: String(o.title ?? ""),
      subtitle: o.subtitle ? String(o.subtitle) : undefined,
      cards,
    }];
  });
}

export const fetchProgramAggregates = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .inputValidator((d: { program: ProgramId; state?: string; dateFrom?: string | null; dateTo?: string | null; campaignType?: string; campaign?: string | null; channel?: string }) => d)
  .handler(async ({ data }): Promise<AggregatePayload> => {
    try {
      let payload: AggregateRpcPayload;
      try {
        const out = await (await reports()).programAggregatePayload({
          program: data.program,
          state: all(data.state),
          dateFrom: data.dateFrom,
          dateTo: data.dateTo,
          campaignType: data.campaignType ?? "all",
          campaign: data.campaign,
          channel: data.channel ?? "all",
        });
        payload = (out && typeof out === "object" ? out : {}) as AggregateRpcPayload;
      } catch (e) {
        return emptyPayload(0, null, e instanceof Error ? e.message : String(e));
      }
      const connectionCount = payload.connectionCount ?? 0;
      const snapshotRowCount = Number(payload.stateRowCount ?? 0);
      const stateMeta = {
        last_synced_at: payload.lastSyncedAt ?? null,
        status: payload.syncStatus ?? "idle",
      };
      if (!snapshotRowCount) {
        return emptyPayload(
          connectionCount,
          stateMeta,
          undefined,
          connectionCount === 0 ? "no_connections" : "no_snapshot",
        );
      }
      const aggregates = normalizeAggregates(payload.aggregates);
      const metricGroups = normalizeMetricGroups(payload.metricGroups);
      const metrics = normalizeMetricsRaw(payload.metrics);
      // Filtered count — use the reconciled KPI (mirrors total_rows/total_calls).
      // Do NOT fall back to the unfiltered snapshot size; that masks filter results.
      const totalRows = Number(aggregates.kpis.total_calls ?? 0);
      return {
        source: "snapshot",
        hasSnapshot: true,
        totalRows,
        snapshotRowCount,
        connectionCount,
        lastSyncedAt: stateMeta.last_synced_at,
        syncStatus: stateMeta.status,
        aggregates,
        metricGroups,
        metrics,
        campaigns: aggregates.perDay,
        emptyReason: totalRows === 0 ? "no_results" : undefined,
      };
    } catch (e) {
      return emptyPayload(0, null, e instanceof Error ? e.message : String(e));
    }
  });

export const fetchCampaignDayRowsFn = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator((d: { program: ProgramId; day: string }) => d)
  .handler(async ({ data }): Promise<{ rows: CallRow[] }> => {
    const [{ getDb }, { callRows }, { and, eq }] = await Promise.all([
      import("@/server/db/client.server"),
      import("@/server/db/schema"),
      import("drizzle-orm"),
    ]);
    const out = await getDb()
      .select({ data: callRows.data })
      .from(callRows)
      .where(and(eq(callRows.program, data.program), eq(callRows.campaignDay, data.day)))
      .limit(5000);
    return { rows: out.map((r) => r.data as unknown as CallRow) };
  });

export interface KkbDropAnalysisPayload {
  stages: Array<{ key: string; label: string }>;
  buckets: Array<{
    bucket: string;
    byStage: Record<string, number>;
    total: number;
    raw: Array<{ reason: string; count: number }>;
  }>;
  maxCell: number;
  grandTotal: number;
  /** Calls flagged for severe distress / suicidal ideation — excluded from the matrix. Optional while the field is absent. */
  safeguardingFlagged?: number;
}

type DropFilters = { state?: string; dateFrom?: string | null; dateTo?: string | null; campaignType?: string; campaign?: string | null; channel?: string };

function dropArgs(d: DropFilters) {
  return {
    state: all(d.state),
    dateFrom: d.dateFrom,
    dateTo: d.dateTo,
    campaignType: d.campaignType ?? "all",
    campaign: d.campaign,
    channel: d.channel ?? "all",
  };
}

function normalizeDropAnalysis(out: unknown): KkbDropAnalysisPayload {
  const empty: KkbDropAnalysisPayload = { stages: [], buckets: [], maxCell: 0, grandTotal: 0 };
  if (!out || typeof out !== "object") return empty;
  const p = out as KkbDropAnalysisPayload;
  return {
    stages: Array.isArray(p.stages) ? p.stages : [],
    buckets: Array.isArray(p.buckets) ? p.buckets : [],
    maxCell: Number(p.maxCell ?? 0) || 0,
    grandTotal: Number(p.grandTotal ?? 0) || 0,
    safeguardingFlagged: p.safeguardingFlagged != null ? Number(p.safeguardingFlagged) || 0 : undefined,
  };
}

export const fetchKkbDropAnalysis = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .inputValidator((d: DropFilters) => d)
  .handler(async ({ data }): Promise<KkbDropAnalysisPayload> => {
    try {
      return normalizeDropAnalysis(await (await reports()).kkbDropAnalysis(dropArgs(data)));
    } catch {
      return normalizeDropAnalysis(null);
    }
  });

export const fetchDkbDropAnalysis = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .inputValidator((d: DropFilters) => d)
  .handler(async ({ data }): Promise<KkbDropAnalysisPayload> => {
    try {
      return normalizeDropAnalysis(await (await reports()).dkbDropAnalysis(dropArgs(data)));
    } catch {
      return normalizeDropAnalysis(null);
    }
  });

export interface CampaignListItem {
  campaignType: string;
  campaignDate: string | null;
  language: string | null;
  region: string | null;
  totalCalls: number;
  answered: number;
  engaged: number;
  highIntent: number;
  converted: number;
}

export const fetchCampaignList = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .inputValidator(
    (d: { program: ProgramId; state?: string; dateFrom?: string | null; dateTo?: string | null; channel?: string }) => d,
  )
  .handler(async ({ data }): Promise<CampaignListItem[]> => {
    try {
      const out = await (await reports()).campaignList({
        program: data.program,
        state: all(data.state),
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        channel: data.channel ?? "all",
      });
      if (!Array.isArray(out)) return [];
      return out.flatMap((it): CampaignListItem[] => {
        if (!it || typeof it !== "object") return [];
        const o = it as Record<string, unknown>;
        return [{
          campaignType: String(o.campaignType ?? ""),
          campaignDate: o.campaignDate ? String(o.campaignDate) : null,
          language: o.language ? String(o.language) : null,
          region: o.region ? String(o.region) : null,
          totalCalls: Number(o.totalCalls ?? 0) || 0,
          answered: Number(o.answered ?? 0) || 0,
          engaged: Number(o.engaged ?? 0) || 0,
          highIntent: Number(o.highIntent ?? 0) || 0,
          converted: Number(o.converted ?? 0) || 0,
        }];
      });
    } catch {
      return [];
    }
  });

export interface CampaignDropCausesPayload {
  sampleCalls: number;
  region: string | null;
  highIntentNonApply: {
    segment: number;
    top: Array<{ phase: string; reason: string; count: number; pct: number }>;
  };
  phaseShare: Array<{
    phaseKey: string;
    phaseLabel: string;
    campaignPct: number;
    regionPct: number;
  }>;
}

type CampaignArgs = { campaign: string; state?: string; dateFrom?: string | null; dateTo?: string | null; channel?: string };

function campaignArgs(d: CampaignArgs) {
  return { campaign: d.campaign, state: all(d.state), dateFrom: d.dateFrom, dateTo: d.dateTo, channel: d.channel ?? "all" };
}

export const fetchCampaignDropCauses = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .inputValidator((d: CampaignArgs) => d)
  .handler(async ({ data }): Promise<CampaignDropCausesPayload> => {
    const empty: CampaignDropCausesPayload = {
      sampleCalls: 0,
      region: null,
      highIntentNonApply: { segment: 0, top: [] },
      phaseShare: [],
    };
    try {
      const out = await (await reports()).campaignDropCauses(campaignArgs(data));
      if (!out || typeof out !== "object") return empty;
      const p = out as CampaignDropCausesPayload;
      return {
        sampleCalls: Number(p.sampleCalls ?? 0) || 0,
        region: p.region ?? null,
        highIntentNonApply: {
          segment: Number(p.highIntentNonApply?.segment ?? 0) || 0,
          top: Array.isArray(p.highIntentNonApply?.top) ? p.highIntentNonApply.top : [],
        },
        phaseShare: Array.isArray(p.phaseShare) ? p.phaseShare : [],
      };
    } catch {
      return empty;
    }
  });

export interface DkbCampaignCausesPayload {
  sampleCalls: number;
  region: string | null;
  phaseShare: Array<{
    phaseKey: string;
    phaseLabel: string;
    campaignPct: number;
    regionPct: number;
  }>;
}

export const fetchDkbCampaignCauses = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .inputValidator((d: CampaignArgs) => d)
  .handler(async ({ data }): Promise<DkbCampaignCausesPayload> => {
    const empty: DkbCampaignCausesPayload = { sampleCalls: 0, region: null, phaseShare: [] };
    try {
      const out = await (await reports()).dkbCampaignCauses(campaignArgs(data));
      if (!out || typeof out !== "object") return empty;
      const p = out as DkbCampaignCausesPayload;
      return {
        sampleCalls: Number(p.sampleCalls ?? 0) || 0,
        region: p.region ?? null,
        phaseShare: Array.isArray(p.phaseShare) ? p.phaseShare : [],
      };
    } catch {
      return empty;
    }
  });

type FunnelArgs = DropFilters & { program: ProgramId };

function funnelArgs(d: FunnelArgs) {
  return { program: d.program, ...dropArgs(d) };
}

export const fetchFunnelCallIds = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .inputValidator((d: FunnelArgs & { stage: string }) => d)
  .handler(async ({ data }): Promise<{ count: number; ids: string[] }> => {
    try {
      const out = await (await reports()).funnelCallIds({ ...funnelArgs(data), stage: data.stage });
      const p = (out && typeof out === "object" ? out : {}) as { count?: number; ids?: unknown };
      const ids = Array.isArray(p.ids) ? p.ids.map((x) => String(x)) : [];
      return { count: Number(p.count ?? ids.length) || ids.length, ids };
    } catch {
      return { count: 0, ids: [] };
    }
  });

export const fetchFunnelDurations = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .inputValidator((d: FunnelArgs) => d)
  .handler(async ({ data }): Promise<Record<string, number>> => {
    try {
      const out = await (await reports()).funnelDurations(funnelArgs(data));
      if (!out || typeof out !== "object") return {};
      const res: Record<string, number> = {};
      for (const [k, v] of Object.entries(out as Record<string, unknown>)) {
        const n = Number(v);
        if (Number.isFinite(n)) res[k] = n;
      }
      return res;
    } catch {
      return {};
    }
  });

export interface CallOutcomeCount { outcome: string; n: number }

/** KKB-only: call_outcome breakdown honouring the same filters as the funnel. */
export const fetchKkbCallOutcomes = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .inputValidator((d: DropFilters) => d)
  .handler(async ({ data }): Promise<CallOutcomeCount[]> => {
    try {
      const out = await (await reports()).kkbCallOutcomes(dropArgs(data));
      if (!Array.isArray(out)) return [];
      return (out as Array<Record<string, unknown>>)
        .map((r) => ({ outcome: String(r.outcome ?? "Unknown"), n: Number(r.n ?? 0) || 0 }))
        .sort((a, b) => b.n - a.n);
    } catch {
      return [];
    }
  });

export interface ProgramFilterOptions {
  cities: string[];
  campaignTypes: string[];
  channels: string[];
}

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.flatMap((x) => (typeof x === "string" && x.trim() ? [x] : []))
    : [];

export const fetchProgramFilterOptions = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .inputValidator((d: { program: ProgramId }) => d)
  .handler(async ({ data }): Promise<ProgramFilterOptions> => {
    try {
      const out = await (await reports()).programFilterOptions({ program: data.program });
      if (!out || typeof out !== "object") return { cities: [], campaignTypes: [], channels: [] };
      const o = out as Record<string, unknown>;
      return {
        cities: toStringArray(o.cities),
        campaignTypes: toStringArray(o.campaignTypes),
        channels: toStringArray(o.channels),
      };
    } catch {
      return { cities: [], campaignTypes: [], channels: [] };
    }
  });
