import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Layers } from "lucide-react";
import { useProgram } from "@/programs/context";
import { useAuth } from "@/auth/context";
import { useReviewCalls, useReviewMap } from "@/programs/useProgramAggregates";
import { buildStatusMap, getReviewKey, type ReviewCall } from "@/lib/review-ui";
import {
  CHANNEL_OPTIONS,
  DURATION_OPTIONS,
  INTENT_OPTIONS,
  OUTCOME_OPTIONS,
  bulkReviewQueue,
  filterReviewCalls,
  initialFilters,
  reviewFilterOptions,
  reviewableCalls,
  type ReviewFilters,
} from "@/lib/review-filters";
import { CallCard } from "@/components/review/CallCard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BULK_QUEUE_STORAGE_KEY } from "@/lib/review/review-form";

export const Route = createFileRoute("/review")({
  validateSearch: (s: Record<string, unknown>) => ({
    prefill: typeof s.prefill === "string" ? s.prefill : undefined,
  }),
  component: ReviewHub,
});

const FILTER_KEY = "review_filters_v1";
const PREFILL_KEY = "review_prefill_ids";
/** Calls shown per page. */
const PAGE_SIZE = 20;

/** Reads a sessionStorage value; `null` on the server or when storage is blocked. */
function readSession(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    // Storage can be blocked by browser settings.
    return null;
  }
}

function SelectFilter({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-full">
        <span className="truncate text-sm">
          <span className="text-muted-foreground">{placeholder}: </span>
          <span className="font-medium text-foreground">{value}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-3xl font-semibold", tone)}>{value}</div>
    </div>
  );
}

function ReviewHub() {
  const { programId } = useProgram();
  const dataset = programId;
  const { session } = useAuth();
  const email = session?.email;
  const navigate = useNavigate();

  const callsQuery = useReviewCalls(dataset);
  const mapQuery = useReviewMap();
  const calls: ReviewCall[] | null = callsQuery.data ?? null;

  const statusMap = useMemo(() => {
    if (!mapQuery.data) return null;
    return buildStatusMap(mapQuery.data, email);
  }, [mapQuery.data, email]);

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ReviewFilters>(() =>
    initialFilters(readSession(FILTER_KEY), readSession(PREFILL_KEY)),
  );
  useEffect(() => {
    try {
      window.sessionStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    } catch {
      // Storage can be blocked; the filters then last only for this visit.
    }
  }, [filters]);
  // Prefilled ids are used once; the initial filters already hold them.
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(PREFILL_KEY);
    } catch {
      // Storage can be blocked by browser settings.
    }
  }, []);
  const set = <K extends keyof ReviewFilters>(k: K, v: ReviewFilters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  const options = useMemo(() => reviewFilterOptions(calls ?? []), [calls]);
  const baseSet = useMemo(() => reviewableCalls(calls ?? []), [calls]);
  const filtered = useMemo(
    () => filterReviewCalls(baseSet, filters, statusMap, dataset),
    [baseSet, filters, statusMap, dataset],
  );

  const stats = useMemo(() => {
    let reviewed = 0;
    if (statusMap) {
      for (const c of baseSet) {
        if (statusMap.get(getReviewKey(c))?.is_reviewed) reviewed++;
      }
    }
    return { total: baseSet.length, reviewed, pending: baseSet.length - reviewed };
  }, [baseSet, statusMap]);

  const startBulk = async () => {
    const ids = bulkReviewQueue(filtered, statusMap);
    const first = ids[0];
    if (!first) return;
    try {
      window.sessionStorage.setItem(BULK_QUEUE_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Storage can be blocked; the review page then opens without a queue.
    }
    await navigate({ to: "/review/$callId", params: { callId: first }, search: { bulk: "1" } });
  };

  if (calls === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Review hub</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {email ? (
              <>
                Reviewing as <span className="font-medium text-foreground">{email}</span>
              </>
            ) : (
              "Not signed in"
            )}
            {" · "}
            <span className="uppercase">{dataset}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Total Call Recordings" value={stats.total} />
        <StatCard label="Pending" value={stats.pending} tone="text-amber-600" />
        <StatCard label="Reviewed" value={stats.reviewed} tone="text-emerald-600" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search by Call ID or Job ID — paste multiple separated by spaces, commas, or new lines"
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {dataset === "seekers" && (
            <SelectFilter
              value={filters.channel}
              onChange={(v) => set("channel", v)}
              options={CHANNEL_OPTIONS}
              placeholder="Channel"
            />
          )}
          <SelectFilter
            value={filters.day}
            onChange={(v) => set("day", v)}
            options={["All", ...options.days]}
            placeholder="Day"
          />
          <SelectFilter
            value={filters.campaign}
            onChange={(v) => set("campaign", v)}
            options={["All", ...options.campaigns]}
            placeholder="Campaign"
          />
          <SelectFilter
            value={filters.lang}
            onChange={(v) => set("lang", v)}
            options={["All", ...options.langs]}
            placeholder="Language"
          />
          <SelectFilter
            value={filters.city}
            onChange={(v) => set("city", v)}
            options={["All", ...options.cities]}
            placeholder="City"
          />
          <SelectFilter
            value={filters.outcome}
            onChange={(v) => set("outcome", v)}
            options={OUTCOME_OPTIONS}
            placeholder="Outcome"
          />
          <SelectFilter
            value={filters.duration}
            onChange={(v) => set("duration", v)}
            options={DURATION_OPTIONS}
            placeholder="Duration"
          />
          <SelectFilter
            value={filters.intent}
            onChange={(v) => set("intent", v)}
            options={INTENT_OPTIONS}
            placeholder="Intent"
          />
          <SelectFilter
            value={filters.dropReason}
            onChange={(v) => set("dropReason", v)}
            options={["All", ...options.drops]}
            placeholder="Drop reason"
          />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex rounded-lg bg-muted p-1">
            {(["all", "pending", "reviewed"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("tab", t)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md capitalize transition",
                  filters.tab === t
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "pending" ? "Pending Review" : t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void startBulk()}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Layers className="h-4 w-4" />
            Bulk Review
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
            No calls match these filters.
          </div>
        ) : (
          <>
            {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((c) => (
              <CallCard
                key={String(c.call_id || c.job_id)}
                call={c}
                reviewStatus={statusMap?.get(getReviewKey(c))}
              />
            ))}
            {filtered.length > PAGE_SIZE &&
              (() => {
                const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
                const current = Math.min(page, totalPages);
                const start = (current - 1) * PAGE_SIZE + 1;
                const end = Math.min(current * PAGE_SIZE, filtered.length);
                return (
                  <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
                    <div className="text-xs text-muted-foreground">
                      Showing{" "}
                      <span className="font-medium text-foreground">
                        {start}–{end}
                      </span>{" "}
                      of <span className="font-medium text-foreground">{filtered.length}</span>
                    </div>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={current <= 1}
                        className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="px-2 text-xs text-muted-foreground">
                        Page <span className="font-medium text-foreground">{current}</span> of{" "}
                        {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={current >= totalPages}
                        className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                );
              })()}
          </>
        )}
      </div>
    </div>
  );
}
