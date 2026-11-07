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
