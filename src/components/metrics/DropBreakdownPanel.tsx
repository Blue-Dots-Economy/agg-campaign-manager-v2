import { useMemo } from "react";
import { regionsFromRows, type DropRow } from "./DropAnalysisTable";
import { reasonColor } from "./reasonColors";

const fmt = (n: number) => n.toLocaleString();

export function DropBreakdownPanel({
  rows,
  onlyRegion,
  selectedReason,
  onSelectReason,
}: {
  rows: DropRow[];
  onlyRegion?: string;
  selectedReason?: string | null;
  onSelectReason?: (reason: string | null) => void;
}) {
  const regions = useMemo(() => regionsFromRows(rows, onlyRegion), [rows, onlyRegion]);

  const valueOf = (r: { byRegion: Record<string, number>; total: number }) =>
    onlyRegion ? (r.byRegion?.[onlyRegion] ?? 0) : r.total;

  const { reasonTotals, grandTotal, stageBreakdown } = useMemo(() => {
    type Agg = { key: string; byRegion: Record<string, number>; total: number };
    const add = (cur: Agg, r: DropRow) => {
      for (const [k, v] of Object.entries(r.byRegion ?? {})) {
        cur.byRegion[k] = (cur.byRegion[k] ?? 0) + v;
      }
      cur.total += r.total;
    };
    const map = new Map<string, Agg>();
    let grand = 0;
    for (const r of rows) {
      const v = valueOf(r);
      if (v <= 0) continue;
      grand += v;
      const cur = map.get(r.reason) ?? { key: r.reason, byRegion: {}, total: 0 };
      add(cur, r);
      map.set(r.reason, cur);
    }
    const reasonTotals = Array.from(map.values()).sort((a, b) => valueOf(b) - valueOf(a));

    const stageBreakdown: Agg[] = [];
    if (selectedReason) {
      const byStage = new Map<string, Agg>();
      for (const r of rows) {
        if (r.reason !== selectedReason) continue;
        const cur = byStage.get(r.stage) ?? { key: r.stage, byRegion: {}, total: 0 };
        add(cur, r);
        byStage.set(r.stage, cur);
      }
      for (const stage of byStage.values()) stageBreakdown.push(stage);
    }
    return { reasonTotals, grandTotal: grand, stageBreakdown };
  }, [rows, onlyRegion, selectedReason]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">
            {selectedReason ? "Stage breakdown" : "Drop reasons"}
          </div>
          <div className="text-xs text-muted-foreground">
            {selectedReason
              ? <>Where <span className="font-medium text-foreground">{selectedReason}</span> happens</>
              : "Click a ribbon or label in the chart to filter"}
          </div>
        </div>
        {selectedReason && (
          <button
            type="button"
            onClick={() => onSelectReason?.(null)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-primary text-primary-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">
                {selectedReason ? "Stage" : "Reason"}
              </th>
              {regions.map((reg) => (
                <th key={reg} className="px-3 py-2 text-right font-semibold w-16">
                  {reg}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold w-20">Total</th>
            </tr>
          </thead>
          <tbody>
            {selectedReason
              ? stageBreakdown.map((s) => (
                  <tr key={s.key} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-2">{s.key}</td>
                    {regions.map((reg) => (
                      <td key={reg} className="px-3 py-2 text-right tabular-nums">
                        {fmt(s.byRegion[reg] ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(s.total)}</td>
                  </tr>
                ))
              : reasonTotals.map((r) => {
                  const color = reasonColor(r.key);
                  const pct = grandTotal > 0 ? (valueOf(r) / grandTotal) * 100 : 0;
                  return (
                    <tr
                      key={r.key}
                      onClick={() => onSelectReason?.(r.key)}
                      className="cursor-pointer border-t border-border hover:bg-muted/40"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: color }}
                          />
                          <span className="truncate">{r.key}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      {regions.map((reg) => (
                        <td key={reg} className="px-3 py-2 text-right tabular-nums">
                          {fmt(r.byRegion[reg] ?? 0)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(r.total)}</td>
                    </tr>
                  );
                })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-primary/40 bg-primary/10 font-semibold">
              <td className="px-3 py-2">Total</td>
              {regions.map((reg) => (
                <td key={reg} className="px-3 py-2 text-right tabular-nums">
                  {fmt(
                    (selectedReason ? stageBreakdown : reasonTotals).reduce(
                      (s, r) => s + (r.byRegion[reg] ?? 0),
                      0,
                    ),
                  )}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">
                {fmt(
                  (selectedReason ? stageBreakdown : reasonTotals).reduce(
                    (s, r) => s + r.total,
                    0,
                  ),
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
