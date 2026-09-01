import { Fragment } from "react";

export type DropRow = {
  stage: string;
  reason: string;
  gzb: number;
  ka: number;
  total: number;
};

const STAGE_ORDER = [
  "Before / at greeting",
  "Profile collection",
  "Job matching",
  "After jobs shown",
  "Apply step",
  "Mid-call",
];

const fmt = (n: number) => n.toLocaleString();

export function DropAnalysisTable({
  rows,
  hideRegion,
}: {
  rows: DropRow[];
  hideRegion?: "GZB" | "KA";
}) {
  const showGzb = hideRegion !== "GZB";
  const showKa = hideRegion !== "KA";
  if (!rows || rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No drop data available.
      </div>
    );
  }

  // Group by stage, in fixed order, then by total desc
  const byStage = new Map<string, DropRow[]>();
  for (const r of rows) {
    if (!byStage.has(r.stage)) byStage.set(r.stage, []);
    byStage.get(r.stage)!.push(r);
  }
  const stages = STAGE_ORDER.filter((s) => byStage.has(s)).concat(
    Array.from(byStage.keys()).filter((s) => !STAGE_ORDER.includes(s)),
  );

  let grandG = 0,
    grandK = 0,
    grandT = 0;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary text-primary-foreground">
            <th className="text-left font-semibold px-4 py-2.5">Drop point (stage)</th>
            <th className="text-left font-semibold px-4 py-2.5">Drop reason</th>
            {showGzb && <th className="text-right font-semibold px-4 py-2.5 w-24">GZB</th>}
            {showKa && <th className="text-right font-semibold px-4 py-2.5 w-24">KA</th>}
            <th className="text-right font-semibold px-4 py-2.5 w-28">Total</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((stage) => {
            const reasons = (byStage.get(stage) ?? []).slice().sort((a, b) => b.total - a.total);
            const sG = reasons.reduce((s, r) => s + r.gzb, 0);
            const sK = reasons.reduce((s, r) => s + r.ka, 0);
            const sT = reasons.reduce((s, r) => s + r.total, 0);
            grandG += sG;
            grandK += sK;
            grandT += sT;
            return (
              <Fragment key={stage}>
                {reasons.map((r, i) => (
                  <tr
                    key={`${stage}-${r.reason}`}
                    className="border-t border-border hover:bg-muted/40"
                  >
                    <td className="px-4 py-2 text-muted-foreground">
                      {i === 0 ? <span className="font-medium text-foreground">{stage}</span> : ""}
                    </td>
                    <td className="px-4 py-2">{r.reason}</td>
                    {showGzb && <td className="px-4 py-2 text-right tabular-nums">{fmt(r.gzb)}</td>}
                    {showKa && <td className="px-4 py-2 text-right tabular-nums">{fmt(r.ka)}</td>}
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(r.total)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-primary/5 font-semibold">
                  <td className="px-4 py-2">{stage}</td>
                  <td className="px-4 py-2 text-muted-foreground">Subtotal</td>
                  {showGzb && <td className="px-4 py-2 text-right tabular-nums">{fmt(sG)}</td>}
                  {showKa && <td className="px-4 py-2 text-right tabular-nums">{fmt(sK)}</td>}
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(sT)}</td>
                </tr>
              </Fragment>
            );
          })}
          <tr className="border-t-2 border-primary/40 bg-primary/10 font-bold">
            <td className="px-4 py-2.5" colSpan={2}>
              Total drops
            </td>
            {showGzb && <td className="px-4 py-2.5 text-right tabular-nums">{fmt(grandG)}</td>}
            {showKa && <td className="px-4 py-2.5 text-right tabular-nums">{fmt(grandK)}</td>}
            <td className="px-4 py-2.5 text-right tabular-nums">{fmt(grandT)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
