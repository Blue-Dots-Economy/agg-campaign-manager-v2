import type { DropRow } from "./DropAnalysisTable";
import { reasonColor } from "./reasonColors";

const fmt = (n: number) => n.toLocaleString();

export function DropStackedBars({
  rows,
  onlyRegion,
}: {
  rows: DropRow[];
  onlyRegion?: string;
}) {
  if (!rows || rows.length === 0) return null;

  const valueOf = (r: DropRow) => (onlyRegion ? (r.byRegion?.[onlyRegion] ?? 0) : r.total);

  // Group rows by stage with reason→count
  const stageMap = new Map<string, { reason: string; value: number }[]>();
  const reasonTotals = new Map<string, number>();
  for (const r of rows) {
    const v = valueOf(r);
    if (v <= 0) continue;
    reasonTotals.set(r.reason, (reasonTotals.get(r.reason) ?? 0) + v);
    if (!stageMap.has(r.stage)) stageMap.set(r.stage, []);
    stageMap.get(r.stage)!.push({ reason: r.reason, value: v });
  }

  const stages = Array.from(stageMap.entries())
    .map(([stage, items]) => ({
      stage,
      items: items.slice().sort((a, b) => b.value - a.value),
      total: items.reduce((s, x) => s + x.value, 0),
    }))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total);

  if (stages.length === 0) return null;

  const max = Math.max(...stages.map((s) => s.total));

  const legendOrder = Array.from(reasonTotals.entries())
    .sort(([reasonA, valueA], [reasonB, valueB]) => valueB - valueA || reasonA.localeCompare(reasonB))
    .map(([reason]) => reason);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {legendOrder.map((reason) => (
          <div key={reason} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: reasonColor(reason) }}
              aria-hidden
            />
            {reason}
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        {stages.map(({ stage, items, total }) => {
          const widthPct = max > 0 ? (total / max) * 100 : 0;
          return (
            <div key={stage} className="grid grid-cols-[160px_1fr_64px] items-center gap-3">
              <div className="truncate text-sm font-medium text-foreground" title={stage}>
                {stage}
              </div>
              <div className="h-6 w-full overflow-hidden rounded-md bg-muted/40">
                <div
                  className="flex h-full overflow-hidden rounded-md"
                  style={{ width: `${widthPct}%` }}
                >
                  {items.map((it) => {
                    const segPct = total > 0 ? (it.value / total) * 100 : 0;
                    return (
                      <div
                        key={it.reason}
                        className="h-full"
                        style={{ width: `${segPct}%`, background: reasonColor(it.reason) }}
                        title={`${it.reason}: ${fmt(it.value)}`}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="text-right text-sm font-semibold tabular-nums text-foreground">
                {fmt(total)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
