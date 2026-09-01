import * as React from "react";

export interface MetricCardProps {
  label: string;
  /** Numeric value or pre-formatted string. For trend math, prefer passing `value` as number and `previous` as number. */
  value: number | string;
  sub?: string;
  /** When provided alongside numeric value, renders a trend pill and overrides sub with "from {previous} (prev period)" unless `sub` is set. */
  previous?: number | null;
  /** Format hint for numeric value */
  format?: "number" | "percent" | "duration";
  /** When format is "duration", unit appended (default "sec"). */
  unit?: string;
  /** Optional bottom-right small badge (e.g. denominator). Ignored when trend pill present. */
  trailing?: React.ReactNode;
  /** Optional time-series for the sparkline rendered in the empty right side. */
  trend?: number[];
  /** Override the "(prev period)" parenthetical in the auto-generated sub line. */
  comparisonLabel?: string;
  className?: string;
}

const fmtNum = (n: number) => Math.round(n).toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function formatValue(v: number | string, format: MetricCardProps["format"], unit?: string): string {
  if (typeof v === "string") return v;
  if (format === "percent") return fmtPct(v);
  if (format === "duration") return `${v.toFixed(1)} ${unit ?? "sec"}`;
  return fmtNum(v);
}

export function MetricCard({
  label,
  value,
  sub,
  previous,
  format = "number",
  unit,
  trailing,
  trend,
  comparisonLabel,
  className,
}: MetricCardProps) {
  const numericValue = typeof value === "number" ? value : null;
  const hasTrend =
    numericValue !== null &&
    previous !== null &&
    previous !== undefined &&
    Number.isFinite(previous);

  let trendPct: number | null = null;
  if (hasTrend) {
    if (previous === 0) {
      trendPct = numericValue! > 0 ? 100 : 0;
    } else {
      trendPct = ((numericValue! - (previous as number)) / Math.abs(previous as number)) * 100;
    }
  }

  const display = formatValue(value, format, unit);
  const parenthetical = comparisonLabel ?? "prev period";
  const subLine =
    sub ??
    (hasTrend
      ? `from ${formatValue(previous as number, format, unit)} (${parenthetical})`
      : undefined);

  const sparkSeries = (trend ?? []).filter((n) => Number.isFinite(n));
  const showSpark = sparkSeries.length >= 2;

  return (
    <div className={`relative overflow-hidden rounded-xl border bg-card p-5 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <p className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
              {display}
            </p>
            {hasTrend && trendPct !== null ? <TrendPill pct={trendPct} /> : null}
            {!hasTrend && trailing ? <span>{trailing}</span> : null}
          </div>
          {subLine ? (
            <p className="mt-2 text-[13px] text-muted-foreground">{subLine}</p>
          ) : null}
        </div>
        {showSpark ? (
          <div className="shrink-0 self-center">
            <Sparkline data={sparkSeries} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TrendPill({ pct }: { pct: number }) {
  const positive = pct >= 0;
  const cls = positive
    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : "bg-rose-500/10 text-rose-700 dark:text-rose-400";
  const display = `${positive ? "↑" : "↓"} ${Math.abs(pct).toFixed(0)}%`;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {display}
    </span>
  );
}

interface SparkProps {
  data: number[];
  width?: number;
  height?: number;
}

function Sparkline({ data, width = 110, height = 40 }: SparkProps) {
  const n = data.length;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padY = 3;
  const innerH = height - padY * 2;
  const stepX = n > 1 ? width / (n - 1) : 0;
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = padY + innerH - ((v - min) / range) * innerH;
    return [x, y] as const;
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${(points[n - 1][0]).toFixed(1)},${height} L0,${height} Z`;

  // Direction: compare mean of first third vs last third (robust to single-point spikes).
  const seg = Math.max(1, Math.floor(n / 3));
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const headAvg = avg(data.slice(0, seg));
  const tailAvg = avg(data.slice(-seg));
  const denom = Math.abs(headAvg) || 1;
  const change = (tailAvg - headAvg) / denom;

  let color: { stroke: string; fill: string };
  if (change > 0.05) {
    color = { stroke: "rgb(16,185,129)", fill: "rgba(16,185,129,0.15)" }; // emerald
  } else if (change < -0.05) {
    color = { stroke: "rgb(244,63,94)", fill: "rgba(244,63,94,0.15)" }; // rose
  } else {
    color = { stroke: "rgb(217,119,6)", fill: "rgba(217,119,6,0.15)" }; // amber
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={areaPath} fill={color.fill} />
      <path d={linePath} fill="none" stroke={color.stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
