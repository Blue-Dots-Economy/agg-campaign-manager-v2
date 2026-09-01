import type { DropRow } from "./DropAnalysisTable";

const REASON_COLORS: Record<string, string> = {
  "Hung up / disengaged": "#3b82f6",
  "Not interested / declined": "#fb7185",
  "No / unclear audio": "#f59e0b",
  "Bot / tech difficulty": "#8b5cf6",
  "Language barrier": "#ec4899",
  "Profile friction": "#14b8a6",
  "No matching jobs": "#10b981",
  "Job mismatch (salary/location)": "#6b7280",
  "Apply failure (API)": "#ef4444",
  Other: "#cbd5e1",
};
const FALLBACK = "#cbd5e1";
const colorFor = (reason: string) => REASON_COLORS[reason] ?? FALLBACK;

const fmt = (n: number) => n.toLocaleString();

export function DropStackedBars({
  rows,
  hideRegion,
}: {
  rows: DropRow[];
  hideRegion?: "GZB" | "KA";
}) {
  if (!rows || rows.length === 0) return null;

  const valueOf = (r: DropRow) =>
    hideRegion === "KA" ? r.gzb : hideRegion === "GZB" ? r.ka : r.total;

  // Group rows by stage with reason→count
  const stageMap = new Map<string, { reason: string; value: number }[]>();
  const reasonsUsed = new Set<string>();
  for (const r of rows) {
    const v = valueOf(r);
    if (v <= 0) continue;
    reasonsUsed.add(r.reason);
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

  // Legend in a stable order: spec order, but only reasons actually present.
  const legendOrder = Object.keys(REASON_COLORS).filter((r) => reasonsUsed.has(r));
  for (const r of reasonsUsed) if (!legendOrder.includes(r)) legendOrder.push(r);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {legendOrder.map((reason) => (
          <div key={reason} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: colorFor(reason) }}
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
                        style={{ width: `${segPct}%`, background: colorFor(it.reason) }}
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
