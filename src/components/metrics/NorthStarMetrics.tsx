import { Fragment, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, Pencil, Check } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { fetchNorthStar, saveNorthStar } from "@/lib/north-star.functions";
import { cn } from "@/lib/utils";

type Def = { key: string; label: string; num: string; den: string };
const KKB_DEFS: Def[] = [
  { key: "pickup_to_app", label: "Pickup → Connection", num: "applicationsTotal", den: "answeredCalls" },
  { key: "highintent_to_app", label: "High-Intent → Connection", num: "applicationsTotal", den: "highIntentCalls" },
  { key: "pickup_to_highintent", label: "Pickup → High-Intent", num: "highIntentCalls", den: "answeredCalls" },
  { key: "jobsshown_to_app", label: "Jobs shown → Connection", num: "applicationsTotal", den: "jobsShownCalls" },
];

function statusColor(value: number | null, threshold: number | null): string {
  if (value == null || threshold == null) return "text-foreground";
  if (value >= threshold) return "text-emerald-600 dark:text-emerald-400";
  if (value >= threshold * 0.5) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export function NorthStarMetrics({ program, m }: { program: string; m: Record<string, number> }) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(fetchNorthStar);
  const saveFn = useServerFn(saveNorthStar);
  const [edit, setEdit] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: config } = useQuery({
    queryKey: ["north-star", program],
    queryFn: () => fetchFn({ data: { program } }),
    staleTime: 5 * 60_000,
  });
  const cfg = new Map((config ?? []).map((r) => [r.key, r]));

  const save = useMutation({
    mutationFn: (v: { key: string; threshold: number | null }) =>
      saveFn({ data: { program, key: v.key, threshold: v.threshold, enabled: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["north-star", program] }),
  });

  const items = KKB_DEFS.map((d) => {
    const den = Number(m?.[d.den] ?? 0);
    const num = Number(m?.[d.num] ?? 0);
    const value = den > 0 ? (num / den) * 100 : null;
    const threshold = cfg.get(d.key)?.threshold ?? null;
    return { ...d, value, threshold };
  });

  const commit = (key: string) => {
    const raw = drafts[key];
    if (raw === undefined) return;
    const parsed = raw.trim() === "" ? null : Number(raw);
    save.mutate({ key, threshold: parsed != null && Number.isFinite(parsed) ? parsed : null });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Star className="h-3.5 w-3.5" />
          North Star Metrics
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[400px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">North Star Metrics</span>
          <button type="button" onClick={() => setEdit((e) => !e)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {edit ? <><Check className="h-3.5 w-3.5" /> Done</> : <><Pencil className="h-3 w-3" /> Edit</>}
          </button>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-2 px-3 py-3 text-xs">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Metric</div>
          <div className="text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Target</div>
          <div className="text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">This campaign</div>
          {items.map((it) => (
            <Fragment key={it.key}>
              <div className="truncate text-foreground">{it.label}</div>
              <div className="text-right tabular-nums text-muted-foreground">
                {edit ? (
                  <input
                    type="number"
                    defaultValue={it.threshold ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [it.key]: e.target.value }))}
                    onBlur={() => commit(it.key)}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    placeholder="—"
                    className="w-14 rounded border border-input bg-background px-1.5 py-0.5 text-right text-xs"
                  />
                ) : it.threshold == null ? "—" : `${it.threshold}%`}
              </div>
              <div className={cn("text-right font-semibold tabular-nums", statusColor(it.value, it.threshold))}>
                {it.value == null ? "—" : `${it.value.toFixed(1)}%`}
              </div>
            </Fragment>
          ))}
        </div>
        <div className="border-t border-border px-3 py-2 text-[10px] leading-snug text-muted-foreground">
          Green ≥ target · amber ≥ half of target · red below. Targets are shared across the team.
        </div>
      </PopoverContent>
    </Popover>
  );
}
