import { Gauge } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useConcurrencyUsage } from "@/hooks/useConcurrencyUsage";
import { cn } from "@/lib/utils";

export function ConcurrencyChip() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data, isLoading } = useConcurrencyUsage({ enabled: pathname !== "/launch" });
  const cap = data?.cap ?? 20;
  const used = data?.used ?? 0;
  const available = data?.available ?? cap;
  const pct = Math.min(100, Math.round((used / cap) * 100));

  const tone =
    available === 0
      ? "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-400"
      : available <= 5
        ? "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300"
        : "border-brand/20 bg-brand-soft text-brand";
  const barTone =
    available === 0 ? "bg-red-500" : available <= 5 ? "bg-amber-500" : "bg-brand";

  const title = data?.error
    ? `Concurrency check failed: ${data.error}`
    : data?.batches.length
      ? `Active batches:\n${data.batches.map((b) => `· ${b.program.toUpperCase()} ${b.batchName} (${b.concurrency})`).join("\n")}`
      : "No batches currently consuming concurrency";

  return (
    <div
      title={title}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium",
        tone,
      )}
    >
      <Gauge className="h-3.5 w-3.5" />
      <span className="whitespace-nowrap">
        Concurrency {isLoading ? "…" : `${used} / ${cap}`}
      </span>
      <span className="hidden sm:block h-1.5 w-14 rounded-full bg-foreground/10 overflow-hidden">
        <span className={cn("block h-full transition-all", barTone)} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}
