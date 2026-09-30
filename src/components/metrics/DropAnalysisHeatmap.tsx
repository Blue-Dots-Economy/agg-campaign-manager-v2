import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { KkbDropAnalysisPayload } from "@/lib/snapshot.functions";

const nf = new Intl.NumberFormat();

// UI-only display names for the legacy stage labels. Still required: sessions pointed at the
// pre-migration database return the old labels and need remapping. Sessions on the migrated
// database return real stage names, which fall through this map untouched. Safe to delete only
// once every session is on the migrated database.
const STAGE_LABEL_DISPLAY: Record<string, string> = {
  "jobs shown": "Update Profile",
  "extra job shown": "Providers Identified",
  "job deliberation": "Consent to Share Info",
  "apply": "Connection Request Sent",
};

const stageLabel = (label: string) =>
  STAGE_LABEL_DISPLAY[label?.trim().toLowerCase() ?? ""] ?? label;

function cellBg(value: number, maxCell: number): string {
  if (!value || value <= 0 || maxCell <= 0) return "var(--color-muted)";
  const intensity = 0.14 + 0.86 * Math.sqrt(value / maxCell);
  return `color-mix(in srgb, var(--brand) ${Math.round(intensity * 100)}%, transparent)`;
}

export function DropAnalysisHeatmap({ data }: { data?: KkbDropAnalysisPayload }) {
  const [open, setOpen] = useState<string | null>(null);

  if (!data || !data.stages.length || !data.buckets.length) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">
        No drop data for the current filters.
      </div>
    );
  }

  const safeguarding = data.safeguardingFlagged ?? 0;

  const { stages, buckets, maxCell, grandTotal } = data;
  // grid: bucket label | one col per stage | total
  const gridTemplate = `minmax(180px, 1.4fr) repeat(${stages.length}, minmax(96px, 1fr)) minmax(80px, 0.8fr)`;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div
        className="grid items-end gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <div className="px-2 py-1">Drop reason</div>
        {stages.map((s) => (
          <div key={s.key} className="px-2 py-1 text-center leading-tight">
            {stageLabel(s.label)}
          </div>
        ))}
        <div className="px-2 py-1 text-right">Total</div>
      </div>

      <div className="space-y-1">
        {buckets.map((b) => {
          const isOpen = open === b.bucket;
          const maxRaw = b.raw.reduce((acc, r) => Math.max(acc, r.count), 0) || 1;
          return (
            <div key={b.bucket} className="rounded-md border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : b.bucket)}
                className="grid w-full items-stretch gap-1 text-left hover:bg-muted/40 transition-colors"
                style={{ gridTemplateColumns: gridTemplate }}
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2 px-2 py-2 text-sm font-medium text-foreground">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    className="shrink-0 text-muted-foreground transition-transform"
                    style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                  >
                    <path d="M3 1 L7 5 L3 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="truncate">{b.bucket}</span>
                </div>
                {stages.map((s) => {
                  const v = b.byStage[s.key] ?? 0;
                  return (
                    <div
                      key={s.key}
                      className="flex items-center justify-center px-2 py-2 text-sm tabular-nums"
                      style={{ background: cellBg(v, maxCell), color: "var(--color-foreground)" }}
                    >
                      {v > 0 ? nf.format(Math.round(v)) : "·"}
                    </div>
                  );
                })}
                <div className="flex items-center justify-end px-2 py-2 text-sm font-semibold tabular-nums text-foreground">
                  {nf.format(Math.round(b.total))}
                </div>
              </button>

              {isOpen && (
                <div className="border-t bg-muted/20 px-3 py-3">
                  {b.raw.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No raw reasons recorded.</div>
                  ) : (
                    <ul className="space-y-1">
                      {b.raw.map((r, i) => (
                        <li
                          key={`${r.reason}-${i}`}
                          className="grid items-center gap-2"
                          style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 2fr) 64px" }}
                        >
                          <span
                            className="truncate text-[11px] text-foreground"
                            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                            title={r.reason}
                          >
                            {r.reason}
                          </span>
                          <div className="h-2 rounded bg-muted overflow-hidden">
                            <div
                              className="h-full"
                              style={{
                                width: `${Math.max(2, (r.count / maxRaw) * 100)}%`,
                                background: "rgba(216, 90, 48, 0.75)",
                              }}
                            />
                          </div>
                          <span className="text-right text-[11px] tabular-nums text-foreground">
                            {nf.format(Math.round(r.count))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-[11px] text-muted-foreground">
        <span>Click a bucket to see the raw reasons inside it.</span>
        <div className="flex items-center gap-2">
          <span>fewer</span>
          <div className="flex h-3 w-32 overflow-hidden rounded">
            {[0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1].map((t) => (
              <div key={t} className="flex-1" style={{ background: `rgba(216,90,48,${t})` }} />
            ))}
          </div>
          <span>more drops</span>
          <span className="ml-3">Total drops: {nf.format(grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}
