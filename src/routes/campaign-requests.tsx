import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Inbox, Rocket, Loader2 } from "lucide-react";

import { Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScheduleEditor, type ScheduleState } from "@/components/ScheduleEditor";
import { useAuth } from "@/auth/context";
import { useConcurrencyUsage, useRefreshConcurrency } from "@/hooks/useConcurrencyUsage";
import {
  listCampaignRequests,
  updateCampaignRequest,
  setCampaignRequestStatus,
} from "@/lib/campaign-requests.functions";
import { rayaCreateBatch, rayaStartBatch } from "@/lib/raya.functions";
import { recordLaunchedBatch } from "@/lib/launched-batches.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/campaign-requests")({
  head: () => ({
    meta: [
      { title: "Campaign Requests · Review & Launch" },
      { name: "description", content: "Review, edit and launch campaign requests submitted from the launch wizard." },
      { property: "og:title", content: "Campaign Requests · Review & Launch" },
      { property: "og:description", content: "Review, edit and launch campaign requests submitted from the launch wizard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignRequestsPage,
});

type RequestRow = {
  id: string;
  program: string;
  agent_id: string;
  agent_name: string | null;
  batch_name: string;
  campaign_day: string | null;
  campaign_date: string | null;
  campaign_type: string | null;
  region: string | null;
  language: string | null;
  city_campaign: string | null;
  channel: string | null;
  source: string | null;
  cohort_intent: string | null;
  cohort_filters: Record<string, unknown> | null;
  contacts: Array<Record<string, unknown>>;
  contact_count: number;
  schedule: { timezone?: string; start_time?: string; end_time?: string; days?: number[] } | null;
  concurrency: number | null;
  max_retries: number | null;
  retry_after_hrs: number | null;
  selected_statuses: string[] | null;
  requested_by: string | null;
  status: string;
  reviewer_email: string | null;
  decline_reason: string | null;
  batch_id: string | null;
  created_at: string;
};

const FILTERS = ["pending", "approved", "declined", "all"] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_OPTIONS = ["Pending", "Unanswered", "Failed"] as const;

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function statusBadgeClass(status: string) {
  if (status === "pending") return "bg-amber-500/15 text-amber-600 border-amber-500/30";
  if (status === "approved") return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function toScheduleState(s: RequestRow["schedule"]): ScheduleState {
  return {
    timezone: s?.timezone || "Asia/Kolkata",
    startTime: s?.start_time || "09:00",
    endTime: s?.end_time || "18:00",
    days: Array.isArray(s?.days) && s!.days!.length ? s!.days! : [1, 2, 3, 4, 5],
  };
}

function sourceLine(r: RequestRow) {
  if (r.source === "upload") return "Bulk upload";
  return `Cohort · ${r.cohort_intent === "drive" ? "Drive Applications" : "Fill Missing Information"}`;
}

function filtersLine(r: RequestRow): string | null {
  const f = r.cohort_filters as { profileStatuses?: string[]; confidenceBand?: string } | null;
  if (!f) return null;
  if (Array.isArray(f.profileStatuses) && f.profileStatuses.length) return f.profileStatuses.join(", ");
  if (f.confidenceBand) return `Confidence: ${f.confidenceBand}`;
  return null;
}

function CampaignRequestsPage() {
  const [filter, setFilter] = useState<Filter>("pending");
  const listFn = useServerFn(listCampaignRequests);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["campaign-requests", filter],
    queryFn: () =>
      listFn({ data: filter === "all" ? {} : { status: filter } }) as Promise<RequestRow[]>,
  });

  const rows = data ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Inbox className="h-5 w-5" /> Campaign Requests
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review, adjust and launch campaigns requested from the launch wizard.
          </p>
        </div>
        <div className="inline-flex rounded-lg border bg-card p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors",
                filter === f ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <Panel>
          <p className="text-sm text-muted-foreground">No campaign requests yet.</p>
        </Panel>
      )}

      <div className="space-y-4">
        {rows.map((r) => (
          <RequestCard key={r.id} req={r} onChanged={() => refetch()} />
        ))}
      </div>
    </div>
  );
}

function RequestCard({ req, onChanged }: { req: RequestRow; onChanged: () => void }) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleState>(() => toScheduleState(req.schedule));
  const [concurrency, setConcurrency] = useState<number>(req.concurrency ?? 5);
  const [maxRetries, setMaxRetries] = useState<number>(req.max_retries ?? 1);
  const [retryAfterHrs, setRetryAfterHrs] = useState<number>(req.retry_after_hrs ?? 4);
  const [statuses, setStatuses] = useState<string[]>(req.selected_statuses ?? ["Pending"]);
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [createdBatchId, setCreatedBatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPending = req.status === "pending";
  const usage = useConcurrencyUsage({ enabled: isPending && open });
  const refreshUsage = useRefreshConcurrency();
  const available = usage.data?.available;

  const updateFn = useServerFn(updateCampaignRequest);
  const setStatusFn = useServerFn(setCampaignRequestStatus);
  const createBatchFn = useServerFn(rayaCreateBatch);
  const startBatchFn = useServerFn(rayaStartBatch);
  const recordBatchFn = useServerFn(recordLaunchedBatch);

  const rayaSchedule = useMemo(
    () => ({
      timezone: schedule.timezone,
      start_time: schedule.startTime,
      end_time: schedule.endTime,
      days: schedule.days,
    }),
    [schedule],
  );

  const overCap = typeof available === "number" && concurrency > available;

  const persist = async () => {
    await updateFn({
      data: {
        id: req.id,
        patch: {
          schedule: rayaSchedule,
          concurrency,
          max_retries: maxRetries,
          retry_after_hrs: retryAfterHrs,
          selected_statuses: statuses,
        },
      },
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await persist();
      toast.success("Changes saved");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const startAndFinish = async (id: string) => {
    await startBatchFn({
      data: {
        batchId: id,
        schedule: rayaSchedule,
        maxRetries,
        retryAfterHrs,
        concurrency,
        selectedStatuses: statuses.length ? statuses : ["Pending"],
      },
    });
    await setStatusFn({
      data: { id: req.id, status: "approved", batch_id: id },
    });
    onChanged();
    refreshUsage();
    toast.success(`Campaign launched · ${id}`);
  };

  const retryStart = async () => {
    if (!createdBatchId) return;
    setBusy(true);
    setError(null);
    try {
      await startAndFinish(createdBatchId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Start failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const approveAndLaunch = async () => {
    if (overCap) {
      const msg = `Only ${available} concurrency available — reduce concurrency or stop a running batch.`;
      setError(msg);
      toast.error(msg);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await persist();

      const created = (await createBatchFn({
        data: { agentId: req.agent_id, batchName: req.batch_name, contacts: req.contacts as any },
      })) as
        | { ok: true; batchId: string }
        | { ok: false; batchId: null; validation: { message: string } };

      if (!created.ok) {
        const msg = created.validation?.message ?? "Batch creation failed";
        setError(msg);
        toast.error(msg);
        return;
      }

      const id = created.batchId;
      setCreatedBatchId(id);

      try {
        await recordBatchFn({
          data: {
            batchId: id,
            program: req.program,
            agentId: req.agent_id,
            agentName: req.agent_name ?? undefined,
            batchName: req.batch_name,
            campaignDay: req.campaign_day ?? undefined,
            campaignDate: req.campaign_date ?? undefined,
            campaignType: req.campaign_type ?? undefined,
            language: req.language ?? undefined,
            cityCampaign: req.city_campaign ?? undefined,
            region: req.region ?? undefined,
            inputRows: req.contacts,
          },
        });
      } catch {
        /* non-fatal */
      }

      await startAndFinish(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Launch failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await setStatusFn({
        data: {
          id: req.id,
          status: "declined",
          decline_reason: reason,
        },
      });
      toast.success("Request declined");
      setDeclining(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Decline failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = (s: string) =>
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const cf = filtersLine(req);

  return (
    <Panel>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">{req.batch_name}</h3>
            {req.campaign_type && (
              <span className="text-xs text-muted-foreground">· {req.campaign_type}</span>
            )}
            <Badge variant="outline" className="uppercase text-[10px]">{req.program}</Badge>
            <Badge variant="outline" className={cn("capitalize text-[10px]", statusBadgeClass(req.status))}>
              {req.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {req.contact_count} contacts · {sourceLine(req)} · {req.requested_by || "unknown"} ·{" "}
            {relTime(req.created_at)}
          </p>
          {req.status === "approved" && req.batch_id && (
            <p className="text-xs text-muted-foreground">Batch: {req.batch_id}</p>
          )}
          {req.status === "declined" && req.decline_reason && (
            <p className="text-xs text-muted-foreground">Reason: {req.decline_reason}</p>
          )}
        </div>
        {isPending && (
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : "Review"}
          </Button>
        )}
      </div>

      {isPending && open && (
        <div className="mt-5 space-y-5 border-t pt-5">
          <div className="grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
            <div>Program: <span className="text-foreground">{req.program.toUpperCase()}</span></div>
            <div>Agent: <span className="text-foreground">{req.agent_name || req.agent_id}</span></div>
            <div>
              Campaign: <span className="text-foreground">
                {[req.campaign_day, req.campaign_date, req.campaign_type].filter(Boolean).join(" · ") || "—"}
              </span>
            </div>
            <div>
              Region: <span className="text-foreground">
                {[req.region, req.language].filter(Boolean).join(" · ") || "—"}
              </span>
            </div>
            <div>Contacts: <span className="text-foreground">{req.contact_count}</span></div>
            {cf && <div>Filters: <span className="text-foreground">{cf}</span></div>}
          </div>

          <ScheduleEditor value={schedule} onChange={setSchedule} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Concurrency</Label>
              <Input
                type="number"
                min={1}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Max retries</Label>
              <Input
                type="number"
                min={0}
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Retry after (hrs)</Label>
              <Input
                type="number"
                min={0}
                value={retryAfterHrs}
                onChange={(e) => setRetryAfterHrs(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Retry statuses</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((s) => {
                const on = statuses.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStatus(s)}
                    className={cn(
                      "h-8 px-3 rounded-md text-xs font-medium border transition-colors",
                      on
                        ? "bg-brand text-brand-foreground border-brand"
                        : "bg-card text-foreground border-border hover:bg-muted",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {usage.isLoading
              ? "Checking account concurrency…"
              : usage.data
                ? `Account concurrency: ${usage.data.used}/${usage.data.cap} used · ${usage.data.available} available`
                : "Concurrency usage unavailable"}
            {overCap && (
              <span className="block text-destructive mt-1">
                Requested concurrency exceeds what's available.
              </span>
            )}
          </div>

          {error && <p className="text-xs text-destructive whitespace-pre-wrap">{error}</p>}

          <div className="flex flex-wrap items-center gap-2">
            {createdBatchId ? (
              <Button onClick={retryStart} disabled={busy} className="bg-brand text-brand-foreground hover:bg-brand/90 gap-1.5">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Retry start · {createdBatchId}
              </Button>
            ) : (
              <Button
                onClick={approveAndLaunch}
                disabled={busy || overCap}
                className="bg-brand text-brand-foreground hover:bg-brand/90 gap-1.5"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Approve &amp; launch
              </Button>
            )}
            <Button variant="secondary" onClick={save} disabled={busy}>
              Save changes
            </Button>
            <Button variant="outline" onClick={() => setDeclining((v) => !v)} disabled={busy}>
              Decline
            </Button>
          </div>

          {declining && (
            <div className="space-y-2 max-w-md">
              <Label className="text-xs">Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              <Button size="sm" variant="destructive" onClick={decline} disabled={busy}>
                Confirm decline
              </Button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
