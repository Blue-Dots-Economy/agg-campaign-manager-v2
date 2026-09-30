import { Fragment } from "react";

export type DropRow = {
  stage: string;
  reason: string;
  byRegion: Record<string, number>;
  total: number;
};

const fmt = (n: number) => n.toLocaleString();

export function regionsFromRows(rows: DropRow[], onlyRegion?: string): string[] {
  if (onlyRegion) return [onlyRegion];
  const set = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r.byRegion ?? {})) set.add(k);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function DropAnalysisTable({
  rows,
  onlyRegion,
}: {
  rows: DropRow[];
  onlyRegion?: string;
}) {
  if (!rows || rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No drop data available.
      </div>
    );
  }

  const regions = regionsFromRows(rows, onlyRegion);

  // Group by stage in backend arrival order, then by total desc
  const byStage = new Map<string, DropRow[]>();
  for (const r of rows) {
    if (!byStage.has(r.stage)) byStage.set(r.stage, []);
    byStage.get(r.stage)!.push(r);
  }
  const stages = Array.from(byStage.keys());

  const grandByRegion: Record<string, number> = {};
  for (const reg of regions) grandByRegion[reg] = 0;
  let grandT = 0;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary text-primary-foreground">
            <th className="text-left font-semibold px-4 py-2.5">Drop point (stage)</th>
            <th className="text-left font-semibold px-4 py-2.5">Drop reason</th>
            {regions.map((reg) => (
              <th key={reg} className="text-right font-semibold px-4 py-2.5 w-24">
                {reg}
              </th>
            ))}
            <th className="text-right font-semibold px-4 py-2.5 w-28">Total</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((stage) => {
            const reasons = (byStage.get(stage) ?? []).slice().sort((a, b) => b.total - a.total);
            const subByRegion: Record<string, number> = {};
            for (const reg of regions) {
              subByRegion[reg] = reasons.reduce((s, r) => s + (r.byRegion?.[reg] ?? 0), 0);
              grandByRegion[reg] += subByRegion[reg];
            }
            const sT = reasons.reduce((s, r) => s + r.total, 0);
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
                    {regions.map((reg) => (
                      <td key={reg} className="px-4 py-2 text-right tabular-nums">
                        {fmt(r.byRegion?.[reg] ?? 0)}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(r.total)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-primary/5 font-semibold">
                  <td className="px-4 py-2">{stage}</td>
                  <td className="px-4 py-2 text-muted-foreground">Subtotal</td>
                  {regions.map((reg) => (
                    <td key={reg} className="px-4 py-2 text-right tabular-nums">
                      {fmt(subByRegion[reg] ?? 0)}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(sT)}</td>
                </tr>
              </Fragment>
            );
          })}
          <tr className="border-t-2 border-primary/40 bg-primary/10 font-bold">
            <td className="px-4 py-2.5" colSpan={2}>
              Total drops
            </td>
            {regions.map((reg) => (
              <td key={reg} className="px-4 py-2.5 text-right tabular-nums">
                {fmt(grandByRegion[reg] ?? 0)}
              </td>
            ))}
            <td className="px-4 py-2.5 text-right tabular-nums">{fmt(grandT)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
