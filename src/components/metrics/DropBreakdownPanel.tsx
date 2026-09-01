import { useMemo } from "react";
import type { DropRow } from "./DropAnalysisTable";
import { FUNNEL_REASON_COLORS } from "./FunnelSankey";

const STAGE_ORDER = [
  "Before / at greeting",
  "Profile collection",
  "Job matching",
  "After jobs shown",
  "Apply step",
  "Mid-call",
];

const fmt = (n: number) => n.toLocaleString();

export function DropBreakdownPanel({
  rows,
  hideRegion,
  selectedReason,
  onSelectReason,
}: {
  rows: DropRow[];
  hideRegion?: "GZB" | "KA";
  selectedReason?: string | null;
  onSelectReason?: (reason: string | null) => void;
}) {
  const showGzb = hideRegion !== "GZB";
  const showKa = hideRegion !== "KA";

  const valueOf = (r: DropRow) =>
    hideRegion === "KA" ? r.gzb : hideRegion === "GZB" ? r.ka : r.total;

  const { reasonTotals, grandTotal, stageBreakdown } = useMemo(() => {
    const map = new Map<string, { reason: string; gzb: number; ka: number; total: number }>();
    let grand = 0;
    for (const r of rows) {
      const v = valueOf(r);
      if (v <= 0) continue;
      grand += v;
      const cur = map.get(r.reason) ?? { reason: r.reason, gzb: 0, ka: 0, total: 0 };
      cur.gzb += r.gzb;
      cur.ka += r.ka;
      cur.total += r.total;
      map.set(r.reason, cur);
    }
    const reasonTotals = Array.from(map.values()).sort((a, b) => valueOf(b as any) - valueOf(a as any));

    const stageBreakdown: { stage: string; gzb: number; ka: number; total: number }[] = [];
    if (selectedReason) {
      const byStage = new Map<string, { stage: string; gzb: number; ka: number; total: number }>();
      for (const r of rows) {
        if (r.reason !== selectedReason) continue;
        const cur = byStage.get(r.stage) ?? { stage: r.stage, gzb: 0, ka: 0, total: 0 };
        cur.gzb += r.gzb;
        cur.ka += r.ka;
        cur.total += r.total;
        byStage.set(r.stage, cur);
      }
      const ordered = STAGE_ORDER.filter((s) => byStage.has(s)).concat(
        Array.from(byStage.keys()).filter((s) => !STAGE_ORDER.includes(s)),
      );
      for (const s of ordered) stageBreakdown.push(byStage.get(s)!);
    }
    return { reasonTotals, grandTotal: grand, stageBreakdown };
  }, [rows, hideRegion, selectedReason]);

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
              {showGzb && <th className="px-3 py-2 text-right font-semibold w-16">GZB</th>}
              {showKa && <th className="px-3 py-2 text-right font-semibold w-16">KA</th>}
              <th className="px-3 py-2 text-right font-semibold w-20">Total</th>
            </tr>
          </thead>
          <tbody>
            {selectedReason
              ? stageBreakdown.map((s) => (
                  <tr key={s.stage} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-2">{s.stage}</td>
                    {showGzb && <td className="px-3 py-2 text-right tabular-nums">{fmt(s.gzb)}</td>}
                    {showKa && <td className="px-3 py-2 text-right tabular-nums">{fmt(s.ka)}</td>}
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(s.total)}</td>
                  </tr>
                ))
              : reasonTotals.map((r) => {
                  const color = FUNNEL_REASON_COLORS[r.reason] ?? FUNNEL_REASON_COLORS.Other;
                  const pct = grandTotal > 0 ? (valueOf(r as any) / grandTotal) * 100 : 0;
                  return (
                    <tr
                      key={r.reason}
                      onClick={() => onSelectReason?.(r.reason)}
                      className="cursor-pointer border-t border-border hover:bg-muted/40"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: color }}
                          />
                          <span className="truncate">{r.reason}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      {showGzb && <td className="px-3 py-2 text-right tabular-nums">{fmt(r.gzb)}</td>}
                      {showKa && <td className="px-3 py-2 text-right tabular-nums">{fmt(r.ka)}</td>}
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(r.total)}</td>
                    </tr>
                  );
                })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-primary/40 bg-primary/10 font-semibold">
              <td className="px-3 py-2">Total</td>
              {showGzb && (
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmt(
                    (selectedReason ? stageBreakdown : reasonTotals).reduce(
                      (s, r) => s + (r as any).gzb,
                      0,
                    ),
                  )}
                </td>
              )}
              {showKa && (
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmt(
                    (selectedReason ? stageBreakdown : reasonTotals).reduce(
                      (s, r) => s + (r as any).ka,
                      0,
                    ),
                  )}
                </td>
              )}
              <td className="px-3 py-2 text-right tabular-nums">
                {fmt(
                  (selectedReason ? stageBreakdown : reasonTotals).reduce(
                    (s, r) => s + (r as any).total,
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
