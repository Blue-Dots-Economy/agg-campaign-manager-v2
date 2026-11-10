// Number helpers behind the program overview metrics.

/** Quotient, or 0 when the divisor is not positive. */
export const safeDiv = (n: number, d: number): number => (d > 0 ? n / d : 0);

/** Maps points to numbers and drops the ones that are not finite, for sparklines. */
export function series<T>(arr: T[] | undefined, fn: (p: T) => number): number[] {
  return (arr ?? []).map((p) => fn(p)).filter((v) => Number.isFinite(v));
}

/** A finite numeric field of a previous-period metrics object, or `null`. */
export function previousValue<T extends object>(prev: T | undefined, key: keyof T): number | null {
  if (!prev) return null;
  const v = prev[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Previous-period percentage `num / den`, or `null` when either is missing or the base is not positive. */
export function previousRate<T extends object>(
  prev: T | undefined,
  num: keyof T,
  den: keyof T,
): number | null {
  const n = previousValue(prev, num);
  const d = previousValue(prev, den);
  return n !== null && d !== null && d > 0 ? (n / d) * 100 : null;
}

/** Calls per outcome, as the call outcome breakdown shows them. */
export interface CallOutcomeCount {
  outcome: string;
  n: number;
}

/** True for outcomes of rows that were never dialled ("pending", "not dialled…"). */
export function isNotDialled(outcome: string): boolean {
  const o = outcome.trim().toLowerCase();
  return o === "pending" || o.startsWith("not dialled");
}

/** Outcomes split into dialled and not dialled, largest first, with the total row count. */
export function splitOutcomes(outcomes: CallOutcomeCount[]): {
  total: number;
  dialled: CallOutcomeCount[];
  skipped: CallOutcomeCount[];
} {
  const total = outcomes.reduce((s, o) => s + o.n, 0);
  const sorted = [...outcomes].sort((a, b) => b.n - a.n);
  return {
    total,
    dialled: sorted.filter((o) => !isNotDialled(o.outcome)),
    skipped: sorted.filter((o) => isNotDialled(o.outcome)),
  };
}
