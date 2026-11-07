// Derived values for the My Purple Dots page: dates, initials, profile field completion and the participant filter.
import type { Lifecycle, Participant } from "@/lib/purple-dots-participants";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthDayYear(month: number, day: number, year: number | string, raw: string): string {
  const name = MONTHS[month - 1];
  return name ? `${name} ${day}, ${year}` : raw;
}

/**
 * Formats a join date ("YYYY-MM-DD" or "M/D/YYYY") as "Mon D, YYYY".
 *
 * @returns "—" for an empty value; the raw text when it is not one of those formats.
 */
export function formatJoined(raw: string): string {
  if (!raw) return "—";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return monthDayYear(Number(iso[2]), Number(iso[3]), iso[1] ?? "", raw);
  const parts = raw.trim().split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts.map((p) => parseInt(p, 10));
    if (m && d && y) return monthDayYear(m, d, y, raw);
  }
  return raw;
}

/** Up to two initials from a name; "?" for a blank name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return "?";
  return ((first[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

/** How many profiles pass each profile field check, as a count and a rounded percentage. */
export function fieldCompletion(
  labels: readonly string[],
  profiles: Array<{ profileFieldChecks: Array<{ passed: boolean }> }>,
): Array<{ label: string; count: number; pct: number }> {
  const counts = labels.map(() => 0);
  for (const s of profiles) {
    s.profileFieldChecks.forEach((c, i) => {
      if (c.passed && i < counts.length) counts[i] = (counts[i] ?? 0) + 1;
    });
  }
  const total = profiles.length;
  return labels.map((label, i) => {
    const count = counts[i] ?? 0;
    return { label, count, pct: total ? Math.round((count / total) * 100) : 0 };
  });
}

/** Participants per lifecycle stage. */
export function lifecycleCounts(participants: Participant[]): Record<Lifecycle, number> {
  const counts: Record<Lifecycle, number> = { New: 0, Active: 0, "At Risk": 0, Inactive: 0 };
  for (const p of participants) counts[p.lifecycle]++;
  return counts;
}

/**
 * Participants matching the table filters.
 *
 * @param filters.search - Matched case-insensitively against name and id.
 * @param filters.lifecycle - A lifecycle stage, or "all".
 * @param filters.minCompletion - Lowest profile completion percentage to include.
 */
export function filterParticipants(
  participants: Participant[],
  filters: { search: string; lifecycle: string; minCompletion: number },
): Participant[] {
  const q = filters.search.trim().toLowerCase();
  return participants.filter((p) => {
    if (filters.lifecycle !== "all" && p.lifecycle !== filters.lifecycle) return false;
    if (p.profileCompletion < filters.minCompletion) return false;
    if (q && !(p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))) return false;
    return true;
  });
}
