import * as React from "react";
import {
  IconPhone,
  IconPhoneOff,
  IconPhoneCall,
  IconClock,
  IconFileCheck,
  IconUserOff,
  IconAlertTriangle,
  IconSparkles,
  IconBriefcase,
} from "@tabler/icons-react";

export type Accent = "green" | "amber" | "red" | "blue";

const ACCENT_BAR: Record<Accent, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  blue: "bg-brand",
};
const ACCENT_TEXT: Record<Accent, string> = {
  green: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-rose-600 dark:text-rose-400",
  blue: "text-brand",
};
const ACCENT_SOFT: Record<Accent, string> = {
  green: "bg-emerald-500/10",
  amber: "bg-amber-500/10",
  red: "bg-rose-500/10",
  blue: "bg-brand-soft",
};

const fmtNum = (n: number) => Math.round(n).toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const ICONS = {
  IconPhone,
  IconPhoneOff,
  IconPhoneCall,
  IconClock,
  IconFileCheck,
  IconUserOff,
  IconAlertTriangle,
  IconSparkles,
  IconBriefcase,
} as const;
export type IconName = keyof typeof ICONS;

// ----------------------------------------------------------------- StatTile
export function StatTile({
  icon,
  label,
  value,
  sub,
  accent = "blue",
}: {
  icon: IconName;
  label: string;
  value: string | number;
  sub?: string;
  accent?: Accent;
}) {
  const Icon = ICONS[icon];
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-5">
      <div className={`absolute inset-y-0 left-0 w-1 ${ACCENT_BAR[accent]}`} aria-hidden />
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${ACCENT_SOFT[accent]}`}>
          <Icon className={`h-4 w-4 ${ACCENT_TEXT[accent]}`} stroke={2} />
        </div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <p className={`mt-3 text-3xl font-semibold tracking-tight ${ACCENT_TEXT[accent]}`}>
        {typeof value === "number" ? fmtNum(value) : value}
      </p>
      {sub ? <p className="mt-1.5 text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

// ----------------------------------------------------------------- RateDial
export function RateDial({
  value,
  label,
  sub,
  accent = "green",
  size = 132,
}: {
  /** percent 0–100 */
  value: number;
  label: string;
  sub?: string;
  accent?: Accent;
  size?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - pct / 100);
  const stops: Record<Accent, string> = {
    green: "stroke-emerald-500",
    amber: "stroke-amber-500",
    red: "stroke-rose-500",
    blue: "stroke-brand",
  };
  return (
    <div className="flex items-center gap-5 rounded-xl border bg-card p-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} className="fill-none stroke-muted" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className={`fill-none ${stops[accent]}`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 700ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-2xl font-semibold tracking-tight ${ACCENT_TEXT[accent]}`}>{fmtPct(pct)}</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- SegmentedBar
export interface Segment {
  label: string;
  value: number;
  color: Accent;
}

export function SegmentedBar({
  title,
  total,
  segments,
  totalLabel = "Total",
}: {
  title: string;
  total: number;
  segments: Segment[];
  totalLabel?: string;
}) {
  const safeTotal = total > 0 ? total : segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{totalLabel}</p>
      </div>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{fmtNum(total)}</p>
      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((s, i) => {
          const w = (s.value / safeTotal) * 100;
          if (w <= 0) return null;
          return (
            <div
              key={i}
              className={ACCENT_BAR[s.color]}
              style={{ width: `${w}%` }}
              title={`${s.label}: ${fmtNum(s.value)} (${fmtPct(w)})`}
            />
          );
        })}
      </div>
      <ul className="mt-4 space-y-2">
        {segments.map((s, i) => {
          const pct = (s.value / safeTotal) * 100;
          return (
            <li key={i} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${ACCENT_BAR[s.color]}`} />
                {s.label}
              </span>
              <span className="font-medium text-foreground tabular-nums">
                {fmtNum(s.value)}{" "}
                <span className={`ml-1 ${ACCENT_TEXT[s.color]}`}>{fmtPct(pct)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ----------------------------------------------------------------- SplitBar (Answered vs Unanswered)
export function SplitBar({
  answered,
  unanswered,
  title = "Answered vs Unanswered",
}: {
  answered: number;
  unanswered: number;
  title?: string;
}) {
  const total = answered + unanswered;
  const pickup = total > 0 ? (answered / total) * 100 : 0;

  // Donut chart geometry
  const size = 160;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const answeredOffset = circ * (1 - answered / (total || 1));
  const unansweredOffset = circ * (1 - unanswered / (total || 1));

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{fmtNum(total)} calls</p>
      </div>

      <div className="mt-4 flex items-center gap-6">
        {/* Left: pickup rate + legend */}
        <div className="flex-1 space-y-4">
          <div>
            <span className="text-4xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
              {fmtPct(pickup)}
            </span>
            <p className="mt-0.5 text-xs text-muted-foreground">pickup rate</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md bg-emerald-500/10 px-3 py-2 text-xs">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Answered
              </span>
              <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{fmtNum(answered)}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-rose-500/10 px-3 py-2 text-xs">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                Unanswered
              </span>
              <span className="font-medium tabular-nums text-rose-600 dark:text-rose-400">{fmtNum(unanswered)}</span>
            </div>
          </div>
        </div>

        {/* Right: donut chart */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              className="fill-none stroke-muted"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              className="fill-none stroke-emerald-500"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={answeredOffset}
              style={{ transition: "stroke-dashoffset 700ms ease" }}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              className="fill-none stroke-rose-500"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={unansweredOffset}
              style={{ transition: "stroke-dashoffset 700ms ease" }}
              transform={`rotate(${(answered / (total || 1)) * 360} ${size / 2} ${size / 2})`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] text-muted-foreground">Total</span>
            <span className="text-base font-semibold text-foreground">{fmtNum(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- ConversionFunnel
export interface FunnelStage {
  label: string;
  value: number;
  color: Accent;
}

export function ConversionFunnel({
  title,
  stages,
}: {
  title?: string;
  stages: FunnelStage[];
}) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="rounded-xl border bg-card p-5">
      {title ? <p className="text-sm font-medium text-foreground">{title}</p> : null}
      <div className={`${title ? "mt-4" : ""} space-y-3`}>
        {stages.map((s, i) => {
          const width = (s.value / max) * 100;
          const prev = i > 0 ? stages[i - 1] : null;
          const conv = prev && prev.value > 0 ? (s.value / prev.value) * 100 : null;
          return (
            <React.Fragment key={s.label}>
              {conv !== null ? (
                <div className="flex items-center gap-2 pl-3 text-[11px] text-muted-foreground">
                  <span className="h-3 w-px bg-border" />
                  <span className={ACCENT_TEXT[s.color]}>{fmtPct(conv)}</span>
                  <span>conversion vs. previous</span>
                </div>
              ) : null}
              <div className="relative">
                <div
                  className={`flex items-center justify-between rounded-lg px-4 py-3 ${ACCENT_SOFT[s.color]}`}
                  style={{ width: `${Math.max(width, 28)}%`, minWidth: 220 }}
                >
                  <span className="text-xs font-medium text-foreground">{s.label}</span>
                  <span className={`text-lg font-semibold tabular-nums ${ACCENT_TEXT[s.color]}`}>
                    {fmtNum(s.value)}
                  </span>
                </div>
                <div className={`absolute left-0 top-0 h-full w-1 rounded-l-lg ${ACCENT_BAR[s.color]}`} />
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Group wrapper
export function MetricSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle ? <p className="text-[11px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
