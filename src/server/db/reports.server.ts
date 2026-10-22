import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./client.server";

const text = z.string().max(500);
const isoDate = z.string().max(40);

const base = {
  state: text.default("all"),
  dateFrom: isoDate.nullish().transform((v) => v ?? null),
  dateTo: isoDate.nullish().transform((v) => v ?? null),
  channel: text.default("all"),
};
const scoped = {
  ...base,
  campaignType: text.default("all"),
  campaign: text.nullish().transform((v) => v ?? null),
};

const programFilters = z.object({ program: text, ...scoped });
const funnelFilters = programFilters.extend({ stage: text });
const kkbFilters = z.object(scoped);
const campaignListFilters = z.object({ program: text, ...base });
const campaignFilters = z.object({ campaign: text, ...base });

export type ProgramFilters = z.input<typeof programFilters>;
export type FunnelFilters = z.input<typeof funnelFilters>;
export type KkbFilters = z.input<typeof kkbFilters>;
export type CampaignListFilters = z.input<typeof campaignListFilters>;
export type CampaignFilters = z.input<typeof campaignFilters>;

type Fn =
  | "get_program_aggregate_payload" | "get_program_aggregates" | "get_program_metric_groups"
  | "get_program_metrics_raw" | "get_program_filter_options" | "get_funnel_call_ids"
  | "get_funnel_durations" | "get_kkb_drop_analysis" | "get_kkb_call_outcomes"
  | "get_dkb_drop_analysis" | "get_campaign_list" | "get_campaign_drop_causes"
  | "get_dkb_campaign_causes";

// fn is one of the literals above.
async function call(fn: Fn, args: SQL[]): Promise<unknown> {
  const { rows } = await getDb().execute<{ r: unknown }>(
    sql`select public.${sql.raw(fn)}(${sql.join(args, sql`, `)}) as r`,
  );
  return rows[0]?.r ?? null;
}

const scopedArgs = (p: z.output<typeof kkbFilters>) => [
  sql`_state => ${p.state}`,
  sql`_date_from => ${p.dateFrom}::date`,
  sql`_date_to => ${p.dateTo}::date`,
  sql`_campaign_type => ${p.campaignType}`,
  sql`_campaign => ${p.campaign}`,
  sql`_channel => ${p.channel}`,
];
const baseArgs = (p: z.output<typeof campaignListFilters> | z.output<typeof campaignFilters>) => [
  sql`_state => ${p.state}`,
  sql`_date_from => ${p.dateFrom}::date`,
  sql`_date_to => ${p.dateTo}::date`,
  sql`_channel => ${p.channel}`,
];

function program(fn: Fn) {
  return (input: ProgramFilters) => {
    const p = programFilters.parse(input);
    return call(fn, [sql`_program => ${p.program}`, ...scopedArgs(p)]);
  };
}
function kkb(fn: Fn) {
  return (input: KkbFilters) => call(fn, scopedArgs(kkbFilters.parse(input)));
}
function campaign(fn: Fn) {
  return (input: CampaignFilters) => {
    const p = campaignFilters.parse(input);
    return call(fn, [sql`_campaign => ${p.campaign}`, ...baseArgs(p)]);
  };
}

export const programAggregatePayload = program("get_program_aggregate_payload");
export const programAggregates = program("get_program_aggregates");
export const programMetricGroups = program("get_program_metric_groups");
export const programMetricsRaw = program("get_program_metrics_raw");
export const funnelDurations = program("get_funnel_durations");
export const kkbDropAnalysis = kkb("get_kkb_drop_analysis");
export const kkbCallOutcomes = kkb("get_kkb_call_outcomes");
export const dkbDropAnalysis = kkb("get_dkb_drop_analysis");
export const campaignDropCauses = campaign("get_campaign_drop_causes");
export const dkbCampaignCauses = campaign("get_dkb_campaign_causes");

export function funnelCallIds(input: FunnelFilters) {
  const p = funnelFilters.parse(input);
  return call("get_funnel_call_ids", [sql`_program => ${p.program}`, ...scopedArgs(p), sql`_stage => ${p.stage}`]);
}

export function campaignList(input: CampaignListFilters) {
  const p = campaignListFilters.parse(input);
  return call("get_campaign_list", [sql`_program => ${p.program}`, ...baseArgs(p)]);
}

export function programFilterOptions(input: { program: string }) {
  const p = z.object({ program: text }).parse(input);
  return call("get_program_filter_options", [sql`_program => ${p.program}`]);
}
