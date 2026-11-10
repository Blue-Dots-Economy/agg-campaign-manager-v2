// Small display pieces of the My Purple Dots participant page.
import type { LucideIcon } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { sumBreakdown, type ConnectionBreakdown } from "@/lib/purple-dots-participants";

const SEGMENTS = [
  { key: "requested" as const, label: "Requested", color: "bg-brand" },
  { key: "accepted" as const, label: "Accepted", color: "bg-emerald-500" },
  { key: "declined" as const, label: "Declined", color: "bg-rose-500" },
  { key: "cancelled" as const, label: "Cancelled", color: "bg-muted-foreground/40" },
];

function SegmentedBar({ breakdown, max }: { breakdown: ConnectionBreakdown; max: number }) {
  const total = sumBreakdown(breakdown);
  const fill = max > 0 ? Math.max(0, Math.min(100, (total / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
      {total > 0 && (
        <div className="flex h-full" style={{ width: `${fill}%` }}>
          {SEGMENTS.map((s) => {
            const v = breakdown[s.key];
            if (!v) return null;
            return (
              <div
                key={s.key}
                className={`h-full ${s.color}`}
                style={{ width: `${(v / total) * 100}%` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Connection total with a hover card that breaks it down by outcome. */
export function ConnectionCell({
  breakdown,
  max,
}: {
  breakdown: ConnectionBreakdown;
  max: number;
}) {
  const total = sumBreakdown(breakdown);
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button type="button" className="flex items-center gap-2 cursor-default outline-none">
          <span className="tabular-nums">{total}</span>
          <SegmentedBar breakdown={breakdown} max={max} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-52">
        <div className="space-y-1.5 text-xs">
          {SEGMENTS.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${s.color}`} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto tabular-nums">{breakdown[s.key]}</span>
            </div>
          ))}
          <div className="border-t border-border pt-1.5 flex items-center">
            <span className="font-medium">Total</span>
            <span className="ml-auto font-medium tabular-nums">{total}</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

/** Thin percentage bar, clamped to 0–100. */
export function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-brand"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

/** Headline metric tile with an icon, value and description. */
export function MetricTile({
  label,
  value,
  description,
  Icon,
}: {
  label: string;
  value: string;
  description: string;
  Icon: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-brand-soft flex items-center justify-center text-brand">
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-sm font-medium leading-tight">{label}</div>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </div>
  );
}
