import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Search } from "lucide-react";
import { Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useTabVisible } from "@/components/campaigns/useTabVisible";
import { listProgramLiveBatches, type LiveBatch } from "@/lib/raya-live.functions";
import {
  RUNNING_STATUSES,
  searchBatches,
  splitActiveBatches,
  statusBadgeClass,
} from "@/lib/campaigns/batches";
import { cn } from "@/lib/utils";

/** How long the batch list counts as fresh. */
const LIVE_BATCHES_STALE_MS = 20_000;

/** Batch list poll interval while the tab is visible. */
const LIVE_BATCHES_POLL_MS = 30_000;

/** Live and scheduled Raya batches for the program, polled while the tab is visible. */
export function LiveBatchesSection({
  program,
  onOpen,
}: {
  program: "seekers" | "providers";
  onOpen: (b: LiveBatch) => void;
}) {
  const listFn = useServerFn(listProgramLiveBatches);
  const visible = useTabVisible();
  const query = useQuery({
    queryKey: ["live-batches", program],
    queryFn: () => listFn({ data: { program } }),
    staleTime: LIVE_BATCHES_STALE_MS,
    refetchInterval: visible ? LIVE_BATCHES_POLL_MS : false,
    refetchOnWindowFocus: false,
  });
  const batches = query.data?.ok ? query.data.batches : [];
  const error = query.data && !query.data.ok ? query.data.error : null;
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");

  const { active, inactive } = splitActiveBatches(searchBatches(batches, search));

  const runningCount = active.filter((b) => RUNNING_STATUSES.has(b.status)).length;

  return (
    <Panel
      title="Live & scheduled"
      description="Reads directly from Raya across this program's agents."
      action={
        batches.length > 0 ? (
          <div className="flex items-center gap-2">
            {runningCount > 0 && (
              <Badge
                variant="outline"
                className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
              >
                <span className="relative mr-1.5 inline-flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                {runningCount} live
              </Badge>
            )}
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search batches"
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>
        ) : null
      }
    >
      {query.isLoading && !query.data ? (
        <p className="text-sm text-muted-foreground">Loading batches…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Failed to load: {error}</p>
      ) : batches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No batches yet for this program. Launch one from the Launch wizard.
        </p>
      ) : (
        <div className="space-y-5">
          {active.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Active · {active.length}
              </h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {active.map((b) => (
                  <LiveBatchCard key={b.batchId} batch={b} onOpen={() => onOpen(b)} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active or scheduled batches right now.
            </p>
          )}
          {inactive.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowInactive((v) => !v)}
                className="flex w-full items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted"
              >
                <span>Inactive / completed · {inactive.length}</span>
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", showInactive && "rotate-180")}
                />
              </button>
              {showInactive && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {inactive.map((b) => (
                    <LiveBatchCard key={b.batchId} batch={b} onOpen={() => onOpen(b)} compact />
                  ))}
                </div>
              )}
            </div>
          )}
          {active.length === 0 && inactive.length === 0 && search && (
            <p className="text-sm text-muted-foreground">No batches match "{search}".</p>
          )}
        </div>
      )}
    </Panel>
  );
}
function LiveBatchCard({
  batch,
  onOpen,
  compact,
}: {
  batch: LiveBatch;
  onOpen: () => void;
  compact?: boolean;
}) {
  const isRunning = RUNNING_STATUSES.has(batch.status);
  const p = batch.total > 0 ? Math.round((batch.dialed / batch.total) * 100) : 0;
  return (
    <button
      onClick={onOpen}
      className={cn(
        "group relative rounded-xl border bg-card text-left transition hover:border-brand/50 hover:shadow-sm",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isRunning && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            )}
            <p className="truncate text-sm font-semibold text-foreground">{batch.batchName}</p>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{batch.agentName}</p>
        </div>
        <Badge variant="outline" className={cn("shrink-0", statusBadgeClass(batch.status))}>
          {isRunning ? "● Live" : batch.status || "—"}
        </Badge>
      </div>
      <div className={cn(compact ? "mt-2" : "mt-3", "space-y-1")}>
        <Progress value={p} className="h-1.5" />
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {batch.dialed} / {batch.total || "?"} dialed · {batch.pickedUp} picked up
        </p>
      </div>
    </button>
  );
}
