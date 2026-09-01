import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { JobPost } from "./mockData";
import {
  GAP_LEVEL_BAR_CLASSES,
  GAP_LEVEL_TEXT_CLASSES,
  fmtInt,
  type GapLevel,
} from "./ecosystemHelpers";

export interface BalanceRow {
  key: string;
  openings: number;
  applications: number;
  gap: number;
  partial: number;
  right: number;
  level: GapLevel;
  jobs: JobPost[];
}

export interface BalanceGroup {
  key: string;
  rows: BalanceRow[];
  rollup: BalanceRow;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const xp = (f: number) => clamp(((f - 0.4) / 1.2) * 100, 1, 99);
const CENTER = xp(1.0);
const BAND_LEFT = xp(0.9);
const BAND_RIGHT = xp(1.2);

function Bar({ r }: { r: BalanceRow }) {
  const coverage = r.openings > 0 ? 1 - r.gap / r.openings : 1;
  const pos = xp(coverage);
  const left = Math.min(pos, CENTER);
  const width = Math.max(1.2, Math.abs(pos - CENTER));
  return (
    <div className="flex-1 relative h-6">
      <div className="absolute inset-y-0 rounded-md bg-emerald-500/10" style={{ left: `${BAND_LEFT}%`, width: `${BAND_RIGHT - BAND_LEFT}%` }} />
      <div className="absolute inset-y-0 w-px bg-border" style={{ left: `${CENTER}%` }} />
      <div className={`absolute top-1/2 -translate-y-1/2 h-3 rounded ${GAP_LEVEL_BAR_CLASSES[r.level]}`} style={{ left: `${left}%`, width: `${width}%` }} />
    </div>
  );
}

function Numbers({ r }: { r: BalanceRow }) {
  const rightText = r.gap > 0 ? `${r.gap} short` : r.gap < 0 ? `${Math.abs(r.gap)} surplus` : "balanced";
  return (
    <div className="flex items-center gap-3 shrink-0">
      <div className="w-[130px] text-right">
        <div className="text-sm tabular-nums">{fmtInt(r.openings)} open</div>
        <div className={`text-xs tabular-nums ${GAP_LEVEL_TEXT_CLASSES[r.level]}`}>{rightText}</div>
      </div>
      <div className="w-[68px] text-right text-sm tabular-nums text-amber-700 dark:text-amber-400">{fmtInt(r.partial)}</div>
      <div className="w-[68px] text-right text-sm tabular-nums font-medium text-emerald-700 dark:text-emerald-400">{fmtInt(r.right)}</div>
    </div>
  );
}

function HeaderRow() {
  return (
    <div className="flex items-center gap-3 px-1">
      <div className="w-[160px] shrink-0" />
      <div className="flex-1 flex justify-between text-[11px] text-muted-foreground">
        <span>← shortage</span>
        <span>balanced</span>
        <span>surplus →</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-[130px] text-right text-[11px] text-muted-foreground">Openings</div>
        <div className="w-[68px] text-right text-[11px] text-muted-foreground">Partial Fit</div>
        <div className="w-[68px] text-right text-[11px] text-emerald-700 dark:text-emerald-400">Right Fit</div>
      </div>
    </div>
  );
}

export function BalanceStrip({
  rows,
  groups,
  onRowClick,
}: {
  rows: BalanceRow[];
  groups?: BalanceGroup[];
  onRowClick: (r: BalanceRow) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setOpen((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const empty = groups ? groups.length === 0 : rows.length === 0;

  return (
    <div className="space-y-1">
      <HeaderRow />
      <div className="max-h-[440px] overflow-y-auto pr-2">
        {groups
          ? groups.map((g) => {
              const isOpen = open.has(g.key);
              return (
                <div key={g.key} className="border-b border-border/60 last:border-0">
                  <button
                    type="button"
                    onClick={() => toggle(g.key)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-3 px-1 py-2 rounded-md hover:bg-muted/40 text-left transition-colors"
                  >
                    <div className="w-[160px] shrink-0 flex items-center justify-end gap-1.5 text-sm font-semibold">
                      <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      <span className="truncate">{g.key}</span>
                      <span className="text-xs font-normal text-muted-foreground shrink-0">({g.rows.length})</span>
                    </div>
                    <Bar r={g.rollup} />
                    <Numbers r={g.rollup} />
                  </button>
                  {isOpen && (
                    <div className="pb-1">
                      {g.rows.map((r) => (
                        <button
                          key={r.key}
                          type="button"
                          onClick={() => onRowClick(r)}
                          className="w-full flex items-center gap-3 px-1 py-1.5 rounded-md hover:bg-muted/40 text-left transition-colors"
                        >
                          <div className="w-[160px] shrink-0 text-right text-sm truncate pr-1 text-muted-foreground">{r.key}</div>
                          <Bar r={r} />
                          <Numbers r={r} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          : rows.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => onRowClick(r)}
                className="w-full flex items-center gap-3 px-1 py-2 rounded-md hover:bg-muted/40 text-left transition-colors"
              >
                <div className="w-[160px] shrink-0 text-right text-sm font-medium truncate">{r.key}</div>
                <Bar r={r} />
                <Numbers r={r} />
              </button>
            ))}

        {empty && (
          <div className="text-center text-muted-foreground py-8 text-sm">
            No open jobs for this district.
          </div>
        )}
      </div>
    </div>
  );
}
