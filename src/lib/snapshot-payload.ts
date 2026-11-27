// Pure helpers for the dashboard server functions: filter arguments and the normalisers that turn
// report SQL results into the payloads the dashboard reads.
import { z } from "zod";
import { isRecord, programIdSchema } from "@/lib/input-schemas";

/** Maps a missing or empty filter value to "all", the report functions' "no filter" value. */
export const all = (v: string | undefined) => (v && v !== "all" ? v : "all");

/** Text field of a report row; anything else reads as "". */
const text = z.string().catch("");
/** Number field of a report row; anything else reads as 0. */
const num = z.number().catch(0);

/** Keeps the finite numbers of a JSON object. */
function finiteNumbers(record: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(record)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** Map of numbers in a report row; non-numbers are dropped. */
const numberMap = z.record(z.string(), z.unknown()).catch({}).transform(finiteNumbers);

/**
 * Parses each object of a report list with `schema` and drops other entries. Every field of the
 * schemas below has a fallback, so an object never fails to parse.
 */
function sqlList<T>(v: unknown, schema: z.ZodType<T, unknown>): T[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isRecord).map((x) => schema.parse(x));
}

/** A report list field: a list of rows of one schema. */
const listOf = <T>(schema: z.ZodType<T, unknown>) =>
  z.unknown().transform((v) => sqlList(v, schema));

const campaignRollupRow = z.object({
  day: text,
  date: text,
  type: text,
  language: text,
  rows: num,
  answered: num,
  engaged: num,
  converted: num,
  new_jobs: num,
  answered_pct: num,
  high_intent: num,
});
const reasonCountRow = z.object({ reason: text, count: num });
const scoreCountRow = z.object({ score: text, count: num });
const regionCountRow = z.object({ region: text, count: num });
const phaseCountRow = z.object({ phase: text, count: num });
const statusCountRow = z.object({ status: text, count: num });
const outcomeCountRow = z.object({ outcome: text, count: num });
const stageRow = z.object({ key: text, label: text });
const bucketRow = z.object({
  bucket: text,
  byStage: numberMap,
  total: num,
  raw: listOf(reasonCountRow),
});
const topCauseRow = z.object({ phase: text, reason: text, count: num, pct: num });
const phaseShareRow = z.object({
  phaseKey: text,
  phaseLabel: text,
  campaignPct: num,
  regionPct: num,
});

/** Returns `v` as a number, or 0 when it is missing or not numeric. */
function toCount(v: unknown): number {
  return Number(v ?? 0) || 0;
}

/** One campaign day in the aggregate report. */
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

/** KPIs and breakdowns for one program under the current filters. */
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

/** Aggregates with every list empty. */
export function emptyAggregates(): ProgramAggregates {
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

/** Cleans the `aggregates` part of the aggregate report; anything malformed becomes empty. */
export function normalizeAggregates(value: unknown): ProgramAggregates {
  if (!isRecord(value)) return emptyAggregates();
  const raw = value;
  const kpis: Record<string, number> = {};
  if (isRecord(raw.kpis)) {
    for (const [k, v] of Object.entries(raw.kpis)) if (typeof v === "number") kpis[k] = v;
  }
  // RPC historically emits `total_rows`; frontend registry uses `total_calls`.
  // Mirror both so either consumer reads the same filtered count.
  if (kpis.total_calls == null && kpis.total_rows != null) kpis.total_calls = kpis.total_rows;
  if (kpis.total_rows == null && kpis.total_calls != null) kpis.total_rows = kpis.total_calls;
  return {
    kpis,
    perDay: sqlList(raw.perDay, campaignRollupRow),
    drops: sqlList(raw.drops, reasonCountRow),
    intents: sqlList(raw.intents, scoreCountRow),
    regions: sqlList(raw.regions, regionCountRow),
    phases: sqlList(raw.phases, phaseCountRow),
    jobStatus: sqlList(raw.jobStatus, statusCountRow),
    outcomes: sqlList(raw.outcomes, outcomeCountRow),
    dkbIntents: sqlList(raw.dkbIntents, scoreCountRow),
    dropAnalysis: Array.isArray(raw.dropAnalysis)
      ? raw.dropAnalysis.flatMap((e: unknown) => {
          if (!isRecord(e)) return [];
          const byRegion: Record<string, number> = {};
          if (isRecord(e.byRegion)) {
            for (const [k, v] of Object.entries(e.byRegion)) {
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

const METRIC_ACCENTS = ["green", "amber", "red", "blue"] as const;

/** Colour of a metric card. */
export type MetricAccent = (typeof METRIC_ACCENTS)[number];

function isMetricAccent(v: unknown): v is MetricAccent {
  return METRIC_ACCENTS.some((a) => a === v);
}

/** One metric card on the dashboard. */
export interface MetricCardDef {
  key: string;
  label: string;
  value: string;
  sub: string;
  accent: MetricAccent;
}

/** A titled group of metric cards. */
export interface MetricGroup {
  key: string;
  title: string;
  subtitle?: string;
  cards: MetricCardDef[];
}

/** One stage of the provider funnel. */
export interface ProviderFunnelStage {
  key: string;
  label: string;
  providers: number;
  openings: number;
  calls: number;
}
/** Raw program metrics keyed by metric name. */
export interface ProgramMetricsRaw {
  program?: string;
  providerFunnel?: ProviderFunnelStage[];
  [k: string]: number | string | ProviderFunnelStage[] | undefined;
}

/** Everything the program dashboard reads in one request. */
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

/** Builds a payload with no data, with the reason the dashboard shows for it. */
export function emptyPayload(
  connectionCount: number,
  state: { last_synced_at: string | null; status: string } | null,
  error?: string,
  emptyReason: AggregatePayload["emptyReason"] = connectionCount === 0
    ? "no_connections"
    : "no_snapshot",
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

/** Message the browser gets when the dashboard data could not be read. The cause is logged on the server only. */
export const AGGREGATES_UNAVAILABLE = "Dashboard data could not be loaded. Try again shortly.";

/** Empty payload for a failed read; never carries the underlying error text to the browser. */
export function failedPayload(): AggregatePayload {
  return emptyPayload(0, null, AGGREGATES_UNAVAILABLE);
}

/** Cleans the raw metrics: keeps numbers, numeric strings, the program and the provider funnel. */
export function normalizeMetricsRaw(value: unknown): ProgramMetricsRaw {
  if (!isRecord(value)) return {};
  const out: ProgramMetricsRaw = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === "program") out.program = String(v);
    else if (k === "providerFunnel" && Array.isArray(v)) {
      out.providerFunnel = v.flatMap((o: unknown) => {
        if (!isRecord(o)) return [];
        return [
          {
            key: String(o.key ?? ""),
            label: String(o.label ?? ""),
            providers: toCount(o.providers),
            openings: toCount(o.openings),
            calls: toCount(o.calls),
          },
        ];
      });
    } else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v !== "" && !Number.isNaN(Number(v))) out[k] = Number(v);
  }
  return out;
}

/** Cleans the metric card groups; an unknown accent becomes blue. */
export function normalizeMetricGroups(value: unknown): MetricGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((o: unknown): MetricGroup[] => {
    if (!isRecord(o)) return [];
    const cards = Array.isArray(o.cards)
      ? o.cards.flatMap((x: unknown): MetricCardDef[] => {
          if (!isRecord(x)) return [];
          const accent = isMetricAccent(x.accent) ? x.accent : "blue";
          return [
            {
              key: String(x.key ?? ""),
              label: String(x.label ?? ""),
              value: String(x.value ?? ""),
              sub: String(x.sub ?? ""),
              accent,
            },
          ];
        })
      : [];
    return [
      {
        key: String(o.key ?? ""),
        title: String(o.title ?? ""),
        subtitle: o.subtitle ? String(o.subtitle) : undefined,
        cards,
      },
    ];
  });
}

/** Builds the dashboard payload from the aggregate report and the stored call stats. */
export function toAggregatePayload(
  out: unknown,
  calls: { calls: number; lastCallAt: string | null },
): AggregatePayload {
  const payload = isRecord(out) ? out : {};
  const connectionCount = typeof payload.connectionCount === "number" ? payload.connectionCount : 0;
  const { calls: snapshotRowCount, lastCallAt } = calls;
  const stateMeta = {
    last_synced_at: lastCallAt,
    status: typeof payload.syncStatus === "string" ? payload.syncStatus : "idle",
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
}

/** Drop reasons per call stage, for the drop-analysis heatmap. */
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

const filterText = z.string().max(500);
const isoDate = z.string().max(40);

/** Date, region and channel filters shared by every dashboard report. */
const baseFilters = {
  state: filterText.optional(),
  dateFrom: isoDate.nullish(),
  dateTo: isoDate.nullish(),
  channel: filterText.optional(),
};

/** Dashboard filters shared by the drop-analysis and funnel reports. */
export const dropFiltersSchema = z.object({
  ...baseFilters,
  campaignType: filterText.optional(),
  campaign: filterText.nullish(),
});

/** Dashboard filters shared by the drop-analysis and funnel reports. */
export type DropFilters = z.output<typeof dropFiltersSchema>;

/** Turns optional drop-analysis filters into report arguments with defaults. */
export function dropArgs(d: DropFilters) {
  return {
    state: all(d.state),
    dateFrom: d.dateFrom,
    dateTo: d.dateTo,
    campaignType: d.campaignType ?? "all",
    campaign: d.campaign,
    channel: d.channel ?? "all",
  };
}

/** Cleans a KKB or DKB drop-analysis report. */
export function normalizeDropAnalysis(out: unknown): KkbDropAnalysisPayload {
  const empty: KkbDropAnalysisPayload = { stages: [], buckets: [], maxCell: 0, grandTotal: 0 };
  if (!isRecord(out)) return empty;
  const p = out;
  return {
    stages: sqlList(p.stages, stageRow),
    buckets: sqlList(p.buckets, bucketRow),
    maxCell: toCount(p.maxCell),
    grandTotal: toCount(p.grandTotal),
    safeguardingFlagged: p.safeguardingFlagged != null ? toCount(p.safeguardingFlagged) : undefined,
  };
}

/** One campaign in the campaign list, with its call counts. */
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

/** Cleans the campaign list report; non-object entries are dropped. */
export function normalizeCampaignList(out: unknown): CampaignListItem[] {
  if (!Array.isArray(out)) return [];
  return out.flatMap((o: unknown): CampaignListItem[] => {
    if (!isRecord(o)) return [];
    return [
      {
        campaignType: String(o.campaignType ?? ""),
        campaignDate: o.campaignDate ? String(o.campaignDate) : null,
        language: o.language ? String(o.language) : null,
        region: o.region ? String(o.region) : null,
        totalCalls: toCount(o.totalCalls),
        answered: toCount(o.answered),
        engaged: toCount(o.engaged),
        highIntent: toCount(o.highIntent),
        converted: toCount(o.converted),
      },
    ];
  });
}

/** Why calls in one campaign dropped, compared with its region. */
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

/** Filters for the per-campaign reports. */
export const campaignArgsSchema = z.object({ campaign: filterText, ...baseFilters });

/** Filters for the per-campaign reports. */
export type CampaignArgs = z.output<typeof campaignArgsSchema>;

/** Filters for the campaign list of one program. */
export const campaignListSchema = z.object({ program: programIdSchema, ...baseFilters });

/** Turns optional campaign filters into report arguments with defaults. */
export function campaignArgs(d: CampaignArgs) {
  return {
    campaign: d.campaign,
    state: all(d.state),
    dateFrom: d.dateFrom,
    dateTo: d.dateTo,
    channel: d.channel ?? "all",
  };
}

/** Cleans the campaign drop-causes report. */
export function normalizeCampaignDropCauses(out: unknown): CampaignDropCausesPayload {
  const empty: CampaignDropCausesPayload = {
    sampleCalls: 0,
    region: null,
    highIntentNonApply: { segment: 0, top: [] },
    phaseShare: [],
  };
  if (!isRecord(out)) return empty;
  const hina = isRecord(out.highIntentNonApply) ? out.highIntentNonApply : {};
  return {
    sampleCalls: toCount(out.sampleCalls),
    region: typeof out.region === "string" ? out.region : null,
    highIntentNonApply: { segment: toCount(hina.segment), top: sqlList(hina.top, topCauseRow) },
    phaseShare: sqlList(out.phaseShare, phaseShareRow),
  };
}

/** Phase share for one DKB campaign, compared with its region. */
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

/** Cleans the DKB campaign-causes report. */
export function normalizeDkbCampaignCauses(out: unknown): DkbCampaignCausesPayload {
  const empty: DkbCampaignCausesPayload = { sampleCalls: 0, region: null, phaseShare: [] };
  if (!isRecord(out)) return empty;
  return {
    sampleCalls: toCount(out.sampleCalls),
    region: typeof out.region === "string" ? out.region : null,
    phaseShare: sqlList(out.phaseShare, phaseShareRow),
  };
}

/** Funnel and aggregate report filters for one program. */
export const funnelArgsSchema = dropFiltersSchema.extend({ program: programIdSchema });

/** Funnel and aggregate report filters for one program. */
export type FunnelArgs = z.output<typeof funnelArgsSchema>;

/** Turns funnel filters into report arguments with defaults. */
export function funnelArgs(d: FunnelArgs) {
  return { program: d.program, ...dropArgs(d) };
}

/** Cleans the funnel call-id report; the count falls back to the number of ids. */
export function normalizeFunnelCallIds(out: unknown): { count: number; ids: string[] } {
  const p = isRecord(out) ? out : {};
  const ids = Array.isArray(p.ids) ? p.ids.map((x) => String(x)) : [];
  return { count: Number(p.count ?? ids.length) || ids.length, ids };
}

/** Keeps the finite numbers of the funnel-duration report. */
export function normalizeFunnelDurations(out: unknown): Record<string, number> {
  if (!isRecord(out)) return {};
  const res: Record<string, number> = {};
  for (const [k, v] of Object.entries(out)) {
    const n = Number(v);
    if (Number.isFinite(n)) res[k] = n;
  }
  return res;
}

/** Number of calls with one call outcome. */
export interface CallOutcomeCount {
  outcome: string;
  n: number;
}

/** Cleans the KKB call-outcome report, highest count first. */
export function normalizeCallOutcomes(out: unknown): CallOutcomeCount[] {
  if (!Array.isArray(out)) return [];
  return out
    .map((x: unknown) => (isRecord(x) ? x : {}))
    .map((r) => ({ outcome: String(r.outcome ?? "Unknown"), n: toCount(r.n) }))
    .sort((a, b) => b.n - a.n);
}

/** Values offered in the dashboard filter menus. */
export interface ProgramFilterOptions {
  cities: string[];
  campaignTypes: string[];
  channels: string[];
}

/** Keeps the non-blank strings of a JSON array. */
export const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.flatMap((x) => (typeof x === "string" && x.trim() ? [x] : [])) : [];

/** Cleans the filter-option report. */
export function normalizeFilterOptions(out: unknown): ProgramFilterOptions {
  if (!isRecord(out)) return { cities: [], campaignTypes: [], channels: [] };
  const o = out;
  return {
    cities: toStringArray(o.cities),
    campaignTypes: toStringArray(o.campaignTypes),
    channels: toStringArray(o.channels),
  };
}
