// Display rules for live Raya batches on the campaigns page: status groups, colours and labels.

/** Raya batch statuses that mean calls are being placed now. */
export const RUNNING_STATUSES: ReadonlySet<string> = new Set([
  "running",
  "in_progress",
  "in progress",
  "processing",
  "active",
  "live",
  "started",
]);

/** Statuses, besides running ones, that keep a batch in the "Active" group. */
const WAITING_STATUSES: ReadonlySet<string> = new Set([
  "scheduled",
  "queued",
  "pending",
  "stopping",
  "paused",
  "not started",
  "not_started",
]);

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAME_BY_KEY = new Map(DAY_NAMES.map((name, i) => [String(i), name]));

/** Digits left visible at the end of a masked phone number. */
const PHONE_VISIBLE_DIGITS = 4;

/** Minimum width of the masked tail, so short numbers still show a mask. */
const PHONE_MASKED_TAIL_WIDTH = 6;

/** True when the batch is placing calls now. */
export function isRunningStatus(status: string): boolean {
  return RUNNING_STATUSES.has(status);
}

/** Tailwind classes for a batch status badge. */
export function statusBadgeClass(status: string): string {
  if (RUNNING_STATUSES.has(status))
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (status === "scheduled" || status === "queued" || status === "pending")
    return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
  if (status === "stopping" || status === "paused")
    return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30";
  if (status === "completed" || status === "finished")
    return "bg-brand-soft text-brand border-brand/30";
  if (status === "stopped" || status === "failed")
    return "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30";
  return "bg-muted text-muted-foreground border-border";
}

/** Hides all but the last four digits of a phone number. Never show raw numbers in the batch list. */
export function maskPhone(p: string): string {
  if (!p) return "—";
  if (p.length <= PHONE_VISIBLE_DIGITS) return p;
  return (
    p.slice(0, p.length - PHONE_MASKED_TAIL_WIDTH).replace(/\d/g, "•") +
    p.slice(-PHONE_VISIBLE_DIGITS).padStart(PHONE_MASKED_TAIL_WIDTH, "•")
  );
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

/** Formats a Raya schedule (`days`, `start_time`, `end_time`, `timezone`) as one line. */
export function formatSchedule(s: unknown): string {
  if (!s) return "—";
  const rawDays = field(s, "days");
  const days: unknown[] = Array.isArray(rawDays) ? rawDays : [];
  const dayStr = days.map((d) => DAY_NAME_BY_KEY.get(String(d)) ?? d).join(", ");
  const start = field(s, "start_time") ?? "?";
  const end = field(s, "end_time") ?? "?";
  const tz = field(s, "timezone") ?? "";
  return `${dayStr || "—"} · ${start}–${end} ${tz}`.trim();
}

/** Keeps batches whose name or agent contains the search text (case-insensitive). */
export function searchBatches<T extends { batchName: string; agentName: string }>(
  batches: T[],
  search: string,
): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return batches;
  return batches.filter(
    (b) => b.batchName.toLowerCase().includes(q) || b.agentName.toLowerCase().includes(q),
  );
}

/** Splits batches into active (running or waiting to run) and inactive, keeping their order. */
export function splitActiveBatches<T extends { status: string }>(
  batches: T[],
): { active: T[]; inactive: T[] } {
  const active: T[] = [];
  const inactive: T[] = [];
  for (const b of batches) {
    const isActive = RUNNING_STATUSES.has(b.status) || WAITING_STATUSES.has(b.status);
    (isActive ? active : inactive).push(b);
  }
  return { active, inactive };
}
