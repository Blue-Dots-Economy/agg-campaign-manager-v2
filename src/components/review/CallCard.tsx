import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, FileText } from "lucide-react";
import { StatusChip, OutcomeChip } from "./Chips";
import { cn } from "@/lib/utils";
import { getReviewKey, REVIEW_THRESHOLD, type JobReviewStatus, type ReviewCall } from "@/lib/review-ui";

function ReviewerChip({ status }: { status?: JobReviewStatus }) {
  const n = status?.unique_reviewers ?? 0;
  const reviewed = !!status?.is_reviewed;
  const cls = reviewed ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : n > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", cls)}>{reviewed && <CheckCircle2 className="h-3 w-3" />}{n}/{REVIEW_THRESHOLD} reviewers</span>;
}

export function CallCard({ call, reviewStatus }: { call: ReviewCall; reviewStatus?: JobReviewStatus }) {
  const navigate = useNavigate();
  const isReviewed = !!reviewStatus?.is_reviewed;
  const youReviewed = !!reviewStatus?.you_reviewed;
  const callId = String(call.call_id || call.job_id || "");
  const go = () => navigate({ to: "/review/$callId", params: { callId }, search: { bulk: undefined } });
  return (
    <div className={cn("rounded-2xl bg-card shadow-sm transition-all", isReviewed ? "border-l-4 border-l-emerald-500" : "border border-border")}>
      <div className="flex w-full items-start justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{call.call_id || call.job_id}</span>
            <StatusChip status={call.job_status} />
            <OutcomeChip outcome={call.call_outcome} />
            <ReviewerChip status={reviewStatus} />
            {youReviewed && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30">You reviewed this</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{call.call_datetime_ist}</span>
            {call.call_duration_seconds && <span>{call.call_duration_seconds}s</span>}
            <span>{call.campaign_day} · {call.language} · {call.city_campaign}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center self-center">
          <button type="button" onClick={go} className={cn("inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition", youReviewed ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25" : isReviewed ? "bg-muted text-muted-foreground ring-1 ring-border hover:bg-muted/80" : "border border-primary text-primary hover:bg-primary/5")}>
            {youReviewed || isReviewed ? <><CheckCircle2 className="h-4 w-4" /> View Review</> : <><FileText className="h-4 w-4" /> Review</>}
          </button>
        </div>
      </div>
    </div>
  );
}
