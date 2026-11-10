import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTabVisible } from "@/components/campaigns/useTabVisible";
import { getBatchLiveDetail, type LiveBatch } from "@/lib/raya-live.functions";
import { rayaStopBatch } from "@/lib/raya.functions";
import { exportBatchToStaging } from "@/lib/raya-export.functions";
import {
  formatSchedule,
  maskPhone,
  RUNNING_STATUSES,
  statusBadgeClass,
} from "@/lib/campaigns/batches";

/** Batch detail poll interval while the dialog is open and the tab is visible. */
const BATCH_DETAIL_POLL_MS = 12_000;

/** How long batch detail counts as fresh. */
const BATCH_DETAIL_STALE_MS = 8_000;

function StatusTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "brand" | "amber" | "rose" | "muted";
}) {
  const cls =
    accent === "brand"
      ? "text-brand"
      : accent === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : accent === "rose"
          ? "text-rose-600 dark:text-rose-400"
          : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`truncate text-foreground ${mono ? "font-mono text-[11px]" : ""}`}>
        {value}
      </span>
    </div>
  );
}
/** Live detail for one batch: progress, call outcomes, recent calls, export and stop. */
export function LiveBatchDetailDialog({
  batch,
  program,
  onClose,
}: {
  batch: LiveBatch | null;
  program: "seekers" | "providers";
  onClose: () => void;
}) {
  const detailFn = useServerFn(getBatchLiveDetail);
  const stopFn = useServerFn(rayaStopBatch);
  const exportFn = useServerFn(exportBatchToStaging);
  const qc = useQueryClient();
  const visible = useTabVisible();
  const open = !!batch;
  const [confirmStop, setConfirmStop] = useState(false);
  const [mountedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());
  const exportMut = useMutation({
    mutationFn: () => {
      if (!batch) throw new Error("No batch selected.");
      return exportFn({
        data: {
          program,
          batchId: batch.batchId,
          batchName: batch.batchName,
          agentName: batch.agentName,
        },
      });
    },
    onSuccess: (r) =>
      toast.success(
        `Appended ${r.appended} row${r.appended === 1 ? "" : "s"}; updated ${r.updated ?? 0} existing row${(r.updated ?? 0) === 1 ? "" : "s"} in staging.`,
        { action: { label: "Open sheet", onClick: () => window.open(r.sheetUrl, "_blank") } },
      ),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Export failed."),
  });
  const query = useQuery({
    enabled: open,
    queryKey: ["live-batch-detail", batch?.batchId],
    queryFn: () => {
      if (!batch) throw new Error("No batch selected.");
      return detailFn({
        data: { batchId: batch.batchId, agentName: batch.agentName, batchName: batch.batchName },
      });
    },
    refetchInterval: open && visible ? BATCH_DETAIL_POLL_MS : false,
    refetchOnWindowFocus: false,
    staleTime: BATCH_DETAIL_STALE_MS,
  });
  const updatedAt = query.dataUpdatedAt || mountedAt;
  // Ticks the "Updated Ns ago" label once a second while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);
  const stopMut = useMutation({
    mutationFn: () => {
      if (!batch) throw new Error("No batch selected.");
      return stopFn({ data: { batchId: batch.batchId } });
    },
    onSuccess: () => {
      toast.success("Stop requested.");
      qc.invalidateQueries({ queryKey: ["live-batches"] });
      qc.invalidateQueries({ queryKey: ["live-batch-detail", batch?.batchId] });
      setConfirmStop(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to stop batch."),
  });
  const d = query.data;
  const total = d?.total ?? batch?.total ?? 0;
  const dialed = d?.dialed ?? batch?.dialed ?? 0;
  const p = total > 0 ? Math.round((dialed / total) * 100) : 0;
  const agoSec = Math.max(0, Math.floor((now - updatedAt) / 1000));
  const isRunning = d
    ? RUNNING_STATUSES.has(d.status)
    : batch
      ? RUNNING_STATUSES.has(batch.status)
      : false;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{batch?.batchName || "Batch"}</span>
            {batch && (
              <Badge variant="outline" className={statusBadgeClass(d?.status || batch.status)}>
                {isRunning ? "● Live" : d?.status || batch.status || "—"}
              </Badge>
            )}
            <span className="ml-auto text-[11px] font-normal text-muted-foreground">
              {query.isFetching ? "Refreshing…" : `Updated ${agoSec}s ago`}
            </span>
          </DialogTitle>
        </DialogHeader>
        {!batch ? null : (
          <div className="space-y-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                <span>
                  {dialed} / {total || "?"} dialed
                </span>
                <span>{p}%</span>
              </div>
              <Progress value={p} className="h-2" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
              <StatusTile label="Pending" value={d?.pending ?? 0} accent="muted" />
              <StatusTile label="Calling" value={d?.inProgress ?? 0} accent="amber" />
              <StatusTile label="Picked up" value={d?.pickedUp ?? 0} accent="brand" />
              <StatusTile label="Completed" value={d?.completed ?? 0} accent="brand" />
              <StatusTile label="Unanswered" value={d?.unanswered ?? 0} accent="muted" />
              <StatusTile label="Failed" value={d?.failed ?? 0} accent="rose" />
            </div>
            <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-xs sm:grid-cols-2">
              <Meta label="Agent" value={d?.agentName || batch.agentName} />
              <Meta label="Schedule" value={formatSchedule(d?.schedule ?? batch.schedule)} />
              <Meta
                label="Concurrency"
                value={String(d?.concurrency ?? batch.concurrency ?? "—")}
              />
              <Meta label="Max retries" value={String(d?.maxRetries ?? batch.maxRetries ?? "—")} />
              <Meta label="Batch ID" value={batch.batchId} mono />
              <Meta
                label="Created"
                value={
                  d?.createdAt
                    ? new Date(d.createdAt).toLocaleString()
                    : batch.createdAt
                      ? new Date(batch.createdAt).toLocaleString()
                      : "—"
                }
              />
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Recent calls</h4>
              {!d || d.recent.length === 0 ? (
                <p className="text-xs text-muted-foreground">No recent calls yet.</p>
              ) : (
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.recent.map((c, i) => (
                        <TableRow key={`${c.phone}-${i}`}>
                          <TableCell className="font-mono text-xs">{maskPhone(c.phone)}</TableCell>
                          <TableCell className="text-xs">{c.status}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {c.duration > 0 ? `${c.duration}s` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}
        {batch && (
          <div className="mt-3 flex flex-wrap items-start justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
            <span className="inline-flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> Writing to staging sheet for QC —
              master sheets are not modified.
            </span>
            <div className="flex items-center gap-2">
              {exportMut.data?.sheetUrl && (
                <a
                  href={exportMut.data.sheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand underline"
                >
                  open staging <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={exportMut.isPending}
                onClick={() => exportMut.mutate()}
              >
                {exportMut.isPending ? "Exporting…" : "Export results to staging"}
              </Button>
            </div>
          </div>
        )}
        <DialogFooter className="mt-4 flex items-center justify-between gap-2 sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            Auto-refresh every {BATCH_DETAIL_POLL_MS / 1000}s while tab is visible.
          </p>
          {isRunning &&
            (confirmStop ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Stop this campaign?</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirmStop(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={stopMut.isPending}
                  onClick={() => stopMut.mutate()}
                >
                  {stopMut.isPending ? "Stopping…" : "Confirm stop"}
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => setConfirmStop(true)}>
                Stop campaign
              </Button>
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
