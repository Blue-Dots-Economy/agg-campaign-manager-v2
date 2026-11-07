// Search, recency and paging rules for the completed campaigns list.
import { format } from "date-fns";
import { humanizeCampaignType } from "@/lib/campaign-name";

/** Campaigns dated within this many days before today are shown as "Latest · review pending". */
export const RECENT_WINDOW_DAYS = 2;

/** Campaign rows per page in the list view. */
export const CAMPAIGNS_PAGE_SIZE = 12;

const DAY_MS = 86_400_000;

/** Parses a `YYYY-MM-DD` date as local midnight, or null when it is missing or malformed. */
export function parseCampaignDate(s: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Formats a `YYYY-MM-DD` date as "Jan 5, 2026", or "—". */
export function formatCampaignDate(d: string | null): string {
  const dt = parseCampaignDate(d);
  return dt ? format(dt, "MMM d, yyyy") : "—";
}

/** Share of `n` in `d` as a percentage with one decimal, or "—" when `d` is 0. */
export function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

/**
 * Sorts campaigns newest first, filters by name, and picks the recent ones.
 *
 * @param now - Current time; the recent window counts from local midnight of this day.
 */
export function filterCampaigns<T extends { campaignType: string; campaignDate: string | null }>(
  items: readonly T[],
  search: string,
  now: Date,
): { recent: T[]; all: T[] } {
  const sorted = items
    .slice()
    .sort((a, b) => (b.campaignDate ?? "").localeCompare(a.campaignDate ?? ""));
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const cutoff = today.getTime() - RECENT_WINDOW_DAYS * DAY_MS;
  const q = search.trim().toLowerCase();
  const all = q
    ? sorted.filter(
        (c) =>
          humanizeCampaignType(c.campaignType).toLowerCase().includes(q) ||
          c.campaignType.toLowerCase().includes(q),
      )
    : sorted;
  const recent = all.filter((c) => {
    const dt = parseCampaignDate(c.campaignDate);
    return dt ? dt.getTime() >= cutoff : false;
  });
  return { recent, all };
}

/** Returns the rows for a page, clamping the page to the last one. */
export function paginate<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): { pageRows: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clamped = Math.min(page, pageCount);
  return {
    pageRows: rows.slice((clamped - 1) * pageSize, clamped * pageSize),
    page: clamped,
    pageCount,
  };
}

/** Stable React key for a campaign: its type and date. */
export function campaignKey(c: { campaignType: string; campaignDate: string | null }): string {
  return `${c.campaignType}__${c.campaignDate ?? "nd"}`;
}
