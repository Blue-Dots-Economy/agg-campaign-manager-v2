// Filters, ordering and the bulk queue for the review hub call list.
import { z } from "zod";
import { HIGH_INTENT_MIN_SCORE } from "@/programs/metrics";
import { getReviewKey, type JobReviewStatus, type ReviewCall } from "@/lib/review-ui";

/** Outcome choices in the review hub. */
export const OUTCOME_OPTIONS = ["All", "Completed", "Early Disconnect"];
/** Call duration choices in the review hub. */
export const DURATION_OPTIONS = ["All", "< 30s", "30s – 1m", "1 – 2m", "2 – 5m", "> 5m"];
/** Intent choices in the review hub. */
export const INTENT_OPTIONS = ["All", "High Intent Score", "Low Intent Score"];
/** Channel choices in the review hub (seekers only). */
export const CHANNEL_OPTIONS = ["All", "Outbound", "Inbound"];

/** Review tabs: every call, calls still to review, reviewed calls. */
export type ReviewTab = "all" | "pending" | "reviewed";

const FiltersSchema = z.object({
  day: z.string(),
  date: z.array(z.string()),
  campaign: z.string(),
  lang: z.string(),
  city: z.string(),
  outcome: z.string(),
  duration: z.string(),
  intent: z.string(),
  dropReason: z.string(),
  channel: z.string(),
  tab: z.enum(["all", "pending", "reviewed"]),
  search: z.string(),
});

/** Review hub filter values; "All" means no filter on that field. */
export type ReviewFilters = z.infer<typeof FiltersSchema>;

/** Filters on a first visit. */
export const DEFAULT_FILTERS: ReviewFilters = {
  day: "All",
  date: [],
  campaign: "All",
  lang: "All",
  city: "All",
  outcome: "All",
  duration: "All",
  intent: "All",
  dropReason: "All",
  channel: "All",
  tab: "pending",
  search: "",
};

/**
 * Filters to start with: the stored ones over the defaults, then any prefilled call ids as a search on every tab.
 *
 * @param stored - JSON saved from an earlier visit; ignored when unreadable or wrongly shaped.
 * @param prefillIds - Call ids handed over by another page, or `null`.
 */
export function initialFilters(stored: string | null, prefillIds: string | null): ReviewFilters {
  let filters = DEFAULT_FILTERS;
  if (stored) {
    try {
      const parsed = FiltersSchema.partial().safeParse(JSON.parse(stored));
      if (parsed.success) filters = { ...DEFAULT_FILTERS, ...parsed.data };
    } catch {
      // Not JSON: start from the defaults.
    }
  }
  return prefillIds ? { ...filters, search: prefillIds, tab: "all" } : filters;
}

/** Milliseconds for a call time written in IST ("YYYY-MM-DD HH:mm[:ss] IST" or ISO without a zone); 0 when unreadable. */
export function parseIst(s: string | undefined): number {
  if (!s) return 0;
  let m = s.trim();
  if (m.toUpperCase().endsWith("IST")) m = m.slice(0, -3).trim();
  const d = new Date(m.includes("T") ? m + "+05:30" : m.replace(" ", "T") + "+05:30");
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Number at the end of a day label such as "Day 12"; 0 when there is none. */
export function dayNum(s: string | undefined): number {
  const t = (s ?? "").trimEnd();
  let i = t.length;
  while (i > 0 && t.charCodeAt(i - 1) >= 48 && t.charCodeAt(i - 1) <= 57) i--;
  return i < t.length ? Number(t.slice(i)) : 0;
}

/** Distinct non-blank values, in first-seen order. */
export function distinct(arr: Array<string | undefined>): string[] {
  const out = new Set<string>();
  for (const x of arr) if (x && x.trim()) out.add(x);
  return Array.from(out);
}

/** Whether a call duration in seconds falls in a duration choice; unknown choices match everything. */
export function durationBucket(sec: number, bucket: string): boolean {
  if (bucket === "All") return true;
  if (bucket === "< 30s") return sec < 30;
  if (bucket === "30s – 1m") return sec >= 30 && sec < 60;
  if (bucket === "1 – 2m") return sec >= 60 && sec < 120;
  if (bucket === "2 – 5m") return sec >= 120 && sec < 300;
  if (bucket === "> 5m") return sec >= 300;
  return true;
}

/** Search terms from the search box: ids separated by spaces, commas, semicolons or new lines. */
export function searchTokens(search: string): string[] {
  return search
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
}

/** Choices for the data-driven filters, from the loaded calls. */
export function reviewFilterOptions(calls: ReviewCall[]) {
  return {
    days: distinct(calls.map((c) => c.campaign_day)).sort((a, b) => dayNum(b) - dayNum(a)),
    dates: distinct(calls.map((c) => c.campaign_date)).sort(),
    campaigns: distinct(calls.map((c) => c.campaign_type)).sort(),
    langs: distinct(calls.map((c) => c.language)).sort(),
    cities: distinct(calls.map((c) => c.city_campaign)).sort(),
    drops: distinct(calls.map((c) => c.drop_reason)).sort(),
  };
}

/** Calls the review hub lists at all: completed calls and early disconnects. */
export function reviewableCalls(calls: ReviewCall[]): ReviewCall[] {
  return calls.filter(
    (c) => c.call_outcome === "Completed" || c.call_outcome === "Early Disconnect",
  );
}

const seconds = (c: ReviewCall) => Number(c.call_duration_seconds) || 0;

/**
 * Applies the filters and orders calls by day (latest first), then duration, then call time.
 * A search by id ignores the review tab; the review tabs show nothing until review statuses load.
 *
 * @param dataset - The program; the channel filter applies to seekers only.
 */
export function filterReviewCalls(
  calls: ReviewCall[],
  filters: ReviewFilters,
  statusMap: Map<string, JobReviewStatus> | null,
  dataset: string,
): ReviewCall[] {
  const tokens = searchTokens(filters.search);
  const rows = calls.filter((c) => {
    if (filters.day !== "All" && c.campaign_day !== filters.day) return false;
    if (filters.date.length > 0 && !filters.date.includes(c.campaign_date ?? "")) return false;
    if (filters.campaign !== "All" && c.campaign_type !== filters.campaign) return false;
    if (filters.lang !== "All" && c.language !== filters.lang) return false;
    if (filters.city !== "All" && c.city_campaign !== filters.city) return false;
    if (filters.outcome !== "All" && c.call_outcome !== filters.outcome) return false;
    if (filters.dropReason !== "All" && c.drop_reason !== filters.dropReason) return false;
    if (
      dataset === "seekers" &&
      filters.channel !== "All" &&
      String(c.channel || "outbound").toLowerCase() !== filters.channel.toLowerCase()
    )
      return false;
    if (!durationBucket(seconds(c), filters.duration)) return false;
    if (filters.intent !== "All") {
      const score = Number(c.intent_score);
      if (!Number.isFinite(score)) return false;
      if (filters.intent === "High Intent Score" && score < HIGH_INTENT_MIN_SCORE) return false;
      if (filters.intent === "Low Intent Score" && score >= HIGH_INTENT_MIN_SCORE) return false;
    }
    if (tokens.length > 0) {
      const cid = String(c.call_id || "").toLowerCase();
      const jid = String(c.job_id || "").toLowerCase();
      return tokens.some((t) => cid.includes(t) || jid.includes(t));
    }
    if (filters.tab !== "all") {
      if (!statusMap) return false;
      const reviewed = !!statusMap.get(getReviewKey(c))?.is_reviewed;
      if (filters.tab === "reviewed" && !reviewed) return false;
      if (filters.tab === "pending" && reviewed) return false;
    }
    return true;
  });
  return rows.sort((a, b) => {
    const dd = dayNum(b.campaign_day) - dayNum(a.campaign_day);
    if (dd) return dd;
    const du = seconds(b) - seconds(a);
    if (du) return du;
    return parseIst(b.call_datetime_ist) - parseIst(a.call_datetime_ist);
  });
}

/** Ids of the not-yet-reviewed calls among `calls`, newest call first, for a bulk review session. */
export function bulkReviewQueue(
  calls: ReviewCall[],
  statusMap: Map<string, JobReviewStatus> | null,
): string[] {
  return calls
    .filter((c) => !statusMap?.get(getReviewKey(c))?.is_reviewed)
    .slice()
    .sort((a, b) => {
      const dt = parseIst(b.call_datetime_ist) - parseIst(a.call_datetime_ist);
      if (dt) return dt;
      return seconds(b) - seconds(a);
    })
    .map((c) => String(c.call_id || c.job_id || ""))
    .filter(Boolean);
}
