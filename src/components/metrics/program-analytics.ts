// Pure helpers behind the program analytics view: comparison period, per-day rollup, intent buckets.
import type { CampaignRollup } from "@/lib/snapshot.functions";
import type { OverviewFilterValue } from "./OverviewFilters";
import { MAX_INTENT_SCORE } from "@/programs/metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Filters for the previous-period comparison. */
export type PreviousPeriodFilters = Pick<
  OverviewFilterValue,
  "state" | "dateFrom" | "dateTo" | "campaignType" | "channel"
>;

/**
 * The period of the same length that ends the day before the selected range starts.
 *
 * @returns `null` when no full date range is selected.
 */
export function previousPeriodFilters(filters: OverviewFilterValue): PreviousPeriodFilters | null {
  if (!filters.dateFrom || !filters.dateTo) return null;
  const from = new Date(filters.dateFrom);
  const to = new Date(filters.dateTo);
  const len = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1);
  const prevTo = new Date(from.getTime() - DAY_MS);
  const prevFrom = new Date(prevTo.getTime() - (len - 1) * DAY_MS);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    state: filters.state,
    dateFrom: iso(prevFrom),
    dateTo: iso(prevTo),
    campaignType: filters.campaignType,
    channel: filters.channel,
  };
}

/** Counts for one calendar day across every campaign run that day. */
export interface DayRollup {
  day: string;
  date: string;
  label: string;
  rows: number;
  answered: number;
  engaged: number;
  converted: number;
  new_jobs: number;
  high_intent: number;
}

/** Sums campaign rollups per date (or day label when there is no date), sorted by date. */
export function rollupPerDay(perDay: CampaignRollup[]): DayRollup[] {
  const m = new Map<string, DayRollup>();
  for (const p of perDay) {
    const key = p.date || p.day;
    const cur = m.get(key) ?? {
      day: p.day,
      date: p.date,
      label: p.date || p.day,
      rows: 0,
      answered: 0,
      engaged: 0,
      converted: 0,
      new_jobs: 0,
      high_intent: 0,
    };
    cur.rows += p.rows;
    cur.answered += p.answered;
    cur.engaged += p.engaged;
    cur.converted += p.converted;
    cur.new_jobs += p.new_jobs;
    cur.high_intent += p.high_intent;
    m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

/** Highest intent score in the "Low" bucket. */
const LOW_INTENT_MAX = 4;
/** Highest intent score in the "Medium" bucket. */
const MEDIUM_INTENT_MAX = 7;

/** Call counts in the low, medium and high intent bands; scores of 0 or below are left out. */
export function intentBuckets(
  intents: Array<{ score: number | string; count: number }>,
): Array<{ range: string; count: number }> {
  let low = 0;
  let medium = 0;
  let high = 0;
  for (const r of intents) {
    const s = Number(r.score);
    if (!Number.isFinite(s) || s <= 0) continue;
    if (s <= LOW_INTENT_MAX) low += r.count;
    else if (s <= MEDIUM_INTENT_MAX) medium += r.count;
    else if (s <= MAX_INTENT_SCORE) high += r.count;
  }
  return [
    { range: "Low (1–4)", count: low },
    { range: "Medium (5–7)", count: medium },
    { range: "High (8–10)", count: high },
  ];
}
