import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewCall } from "@/lib/review-ui";

/** Where the call sits in a bulk review run. */
export interface BulkInfo {
  idx: number;
  total: number;
  next: string | null;
  pct: number;
}

interface ReviewHeaderProps {
  call: ReviewCall;
  bulkInfo: BulkInfo | null;
  sessionReviewed: number;
  reviewerEmail: string;
  isAdmin: boolean;
}

/** Call title, skip button, reviewer identity, admin warning and bulk progress. */
export function ReviewHeader({
  call,
  bulkInfo,
  sessionReviewed,
  reviewerEmail,
  isAdmin,
}: ReviewHeaderProps) {
  const navigate = useNavigate();
  const bulkPct = bulkInfo?.pct ?? 0;
  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/review", search: { prefill: undefined } })}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{call.call_id || call.job_id}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {call.campaign_day} · {call.language} · {call.city_campaign} · {call.call_datetime_ist}
          </p>
        </div>
        {bulkInfo && (
          <button
            onClick={() =>
              bulkInfo.next
                ? navigate({
                    to: "/review/$callId",
                    params: { callId: bulkInfo.next },
                    search: { bulk: "1" },
                  })
                : navigate({ to: "/review", search: { prefill: undefined } })
            }
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Skip <SkipForward className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
          <span
            className={cn("h-1.5 w-1.5 rounded-full", isAdmin ? "bg-amber-500" : "bg-emerald-500")}
          />
          Reviewing as{" "}
          <span className="font-medium text-foreground">{reviewerEmail || "unknown"}</span>
        </span>
      </div>
      {isAdmin && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            You're signed in as the shared <strong>admin</strong> account. Reviews you submit here
            are credited to admin, not you — and won't be tracked against your own work. Sign out
            and sign in with your own email before reviewing.
          </span>
        </div>
      )}

      {bulkInfo && (
        <div className="space-y-1.5 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">
              Reviewing call {bulkInfo.idx + 1} of {bulkInfo.total}
            </span>
            <span className="text-muted-foreground">
              {bulkPct}% complete
              {sessionReviewed > 0 ? ` · ${sessionReviewed} reviewed this session` : ""}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={bulkPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Batch review progress"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${bulkPct}%` }}
            />
          </div>
        </div>
      )}
    </>
  );
}
