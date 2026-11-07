// Drop-analysis row shape and helpers shared by the drop tables and charts.

/** One drop reason at one funnel stage, with counts per region. */
export type DropRow = {
  stage: string;
  reason: string;
  byRegion: Record<string, number>;
  total: number;
};

/** Region columns for drop tables: the one selected region, or every region in the rows, sorted. */
export function regionsFromRows(rows: DropRow[], onlyRegion?: string): string[] {
  if (onlyRegion) return [onlyRegion];
  const set = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r.byRegion ?? {})) set.add(k);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Drop counts summed for one reason or one stage. */
export interface DropAggregate {
  key: string;
  byRegion: Record<string, number>;
  total: number;
}

/** Count to show for a row: the selected region's count, or the total when no region is selected. */
export function dropValue(
  r: { byRegion: Record<string, number>; total: number },
  onlyRegion?: string,
): number {
  return onlyRegion ? (r.byRegion?.[onlyRegion] ?? 0) : r.total;
}

function addRow(agg: DropAggregate, r: DropRow): void {
  for (const [k, v] of Object.entries(r.byRegion ?? {})) {
    agg.byRegion[k] = (agg.byRegion[k] ?? 0) + v;
  }
  agg.total += r.total;
}

/**
 * Sums drop rows per reason (largest first) and, when a reason is selected, per stage for that reason.
 *
 * @param onlyRegion - Count only this region; rows with no drops there are left out of the reason totals.
 * @param selectedReason - Reason whose stages to break down; no stage breakdown when empty.
 */
export function dropBreakdown(
  rows: DropRow[],
  onlyRegion: string | undefined,
  selectedReason: string | null | undefined,
): { reasonTotals: DropAggregate[]; grandTotal: number; stageBreakdown: DropAggregate[] } {
  const byReason = new Map<string, DropAggregate>();
  let grandTotal = 0;
  for (const r of rows) {
    const v = dropValue(r, onlyRegion);
    if (v <= 0) continue;
    grandTotal += v;
    const agg = byReason.get(r.reason) ?? { key: r.reason, byRegion: {}, total: 0 };
    addRow(agg, r);
    byReason.set(r.reason, agg);
  }
  const reasonTotals = Array.from(byReason.values()).sort(
    (a, b) => dropValue(b, onlyRegion) - dropValue(a, onlyRegion),
  );

  const byStage = new Map<string, DropAggregate>();
  if (selectedReason) {
    for (const r of rows) {
      if (r.reason !== selectedReason) continue;
      const agg = byStage.get(r.stage) ?? { key: r.stage, byRegion: {}, total: 0 };
      addRow(agg, r);
      byStage.set(r.stage, agg);
    }
  }
  return { reasonTotals, grandTotal, stageBreakdown: Array.from(byStage.values()) };
}
