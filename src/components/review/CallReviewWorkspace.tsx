import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useExistingReviews } from "@/programs/useProgramAggregates";
import { fetchCallDetail, submitReview } from "@/lib/review.functions";
import { playSwoosh } from "@/lib/sfx";
import type { ReviewCall } from "@/lib/review-ui";
import type { ProgramId } from "@/programs/registry";
import { CelebrationOverlay, type Celebration } from "@/components/review/CelebrationOverlay";
import { ReviewHeader } from "@/components/review/ReviewHeader";
import { TranscriptPanel } from "@/components/review/TranscriptPanel";
import { CallInfoPanel } from "@/components/review/CallInfoPanel";
import { PreviousReviews } from "@/components/review/PreviousReviews";
import {
  IssuesPicker,
  NotesField,
  RatingPicker,
  SubmitBar,
  TurnFlagsEditor,
  type FlagEntry,
} from "@/components/review/ReviewFeedbackForm";
import { normaliseTranscript } from "@/lib/review/transcript";
import {
  BULK_QUEUE_STORAGE_KEY,
  bulkProgress,
  MILESTONE_EVERY,
  nextAfterSubmit,
  nonBlankId,
  parseBulkQueue,
  praise,
  reviewPrefill,
  safeRecordingUrl,
  SESSION_COUNT_STORAGE_KEY,
  submitHint,
  toggleIssue,
  type TurnFlag,
} from "@/lib/review/review-form";

/** Pause before moving on after a review, long enough for the check-mark animation. */
const CELEBRATE_MS = 170;

/** Longer pause for the milestone animation. */
const CELEBRATE_MILESTONE_MS = 420;

/** How long a call's transcript and recording count as fresh. */
const CALL_DETAIL_STALE_MS = 5 * 60_000;

interface CallReviewWorkspaceProps {
  call: ReviewCall;
  callId: string;
  dataset: ProgramId;
  bulkMode: boolean;
  reviewerEmail: string;
  isAdmin: boolean;
  infoOpen: boolean;
  setInfoOpen: (open: boolean) => void;
}

function readSessionCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.sessionStorage.getItem(SESSION_COUNT_STORAGE_KEY)) || 0;
  } catch {
    // Storage can be blocked; the counter then starts at zero.
    return 0;
  }
}

/**
 * Transcript, call details and the review form for one call.
 * Mount it with `key={callId}` so the form starts empty for every call.
 */
export function CallReviewWorkspace({
  call,
  callId,
  dataset,
  bulkMode,
  reviewerEmail,
  isAdmin,
  infoOpen,
  setInfoOpen,
}: CallReviewWorkspaceProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const detailFn = useServerFn(fetchCallDetail);
  const detailQuery = useQuery({
    queryKey: ["call-detail", dataset, callId],
    queryFn: () => detailFn({ data: { dataset, callId } }),
    staleTime: CALL_DETAIL_STALE_MS,
    enabled: !!callId,
  });
  const transcript = useMemo(
    () => normaliseTranscript(detailQuery.data?.call_transcript),
    [detailQuery.data],
  );

  const existing = useExistingReviews(call.call_id || callId, call.job_id || null);
  const existingReviews = existing.data ?? [];
  // The reviewer's earlier review fills the form until they change a field.
  const prefill = reviewPrefill(existingReviews, reviewerEmail);

  const [issuesEdit, setIssuesEdit] = useState<string[] | null>(null);
  const [flagsEdit, setFlagsEdit] = useState<FlagEntry[] | null>(null);
  const [notesEdit, setNotesEdit] = useState<string | null>(null);
  const [ratingEdit, setRatingEdit] = useState<number | null>(null);
  const issues = issuesEdit ?? prefill?.issues ?? [];
  const flags: FlagEntry[] =
    flagsEdit ?? (prefill?.flags ?? []).map((f, i) => ({ ...f, key: `saved-${i}` }));
  const notes = notesEdit ?? prefill?.notes ?? "";
  const rating = ratingEdit ?? prefill?.rating ?? 0;

  const [submitting, setSubmitting] = useState(false);
  const [sessionReviewed, setSessionReviewed] = useState<number>(readSessionCount);
  const [celebrate, setCelebrate] = useState<Celebration | null>(null);
  const turnRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const nextFlagKey = useRef(0);
  const navTimer = useRef<number | undefined>(undefined);

  // Cancel a pending move to the next call if the page goes away first.
  useEffect(() => () => window.clearTimeout(navTimer.current), []);

  const flaggedSet = new Set(flags.map((f) => f.turn));

  const addFlag = (flag: TurnFlag) => {
    const key = `new-${nextFlagKey.current++}`;
    setFlagsEdit((prev) => [...(prev ?? flags), { ...flag, key }]);
  };
  const removeFlag = (key: string) =>
    setFlagsEdit((prev) => (prev ?? flags).filter((f) => f.key !== key));
  const scrollToTurn = (n: number) =>
    turnRefs.current[n]?.scrollIntoView({ behavior: "smooth", block: "center" });

  const submitFn = useServerFn(submitReview);

  async function submit() {
    if (isAdmin) {
      toast.error("The shared admin account can't submit reviews.", {
        description: "Sign in with your own email to review.",
      });
      return;
    }
    if (issues.length === 0) {
      toast.error("Select at least one issue (or 'No Issues').");
      return;
    }
    if (rating === 0) {
      toast.error("Give an overall rating.");
      return;
    }
    if (!reviewerEmail) {
      toast.error("Session expired. Please sign in again.");
      return;
    }
    setSubmitting(true);
    const callIdStr = nonBlankId(call.call_id);
    const jobIdStr = nonBlankId(call.job_id);
    const review = {
      job_id: jobIdStr ?? callIdStr ?? "unknown",
      call_id: callIdStr ?? jobIdStr ?? "unknown",
      campaign_day: call.campaign_day,
      campaign_type: call.campaign_type,
      language: call.language,
      city_campaign: call.city_campaign,
      company_name: call.company_name,
      contact_phone: call.contact_phone ?? null,
      call_outcome: call.call_outcome,
      job_status_in_master: call.job_status,
      reviewer_notes: notes,
      quantitative_issues: issues.join(", "),
      turn_flags: JSON.stringify(flags.map(({ turn, note }) => ({ turn, note }))),
      overall_rating: rating,
      review_type: "transcript",
      dataset,
    };
    try {
      await submitFn({ data: { review } });
      qc.invalidateQueries({ queryKey: ["review-map"] });
      qc.invalidateQueries({ queryKey: ["existing-reviews", callIdStr, jobIdStr] });
      const newCount = sessionReviewed + 1;
      setSessionReviewed(newCount);
      try {
        window.sessionStorage.setItem(SESSION_COUNT_STORAGE_KEY, String(newCount));
      } catch {
        // Storage can be blocked; the counter is only a motivation aid.
      }
      playSwoosh();
      if (bulkMode) {
        const queue = parseBulkQueue(sessionStorage.getItem(BULK_QUEUE_STORAGE_KEY));
        const { next, remaining } = nextAfterSubmit(queue, callId);
        const milestone = !next || (newCount > 0 && newCount % MILESTONE_EVERY === 0);
        toast.success(
          praise(newCount, !!next, queue.length),
          next
            ? { description: `${remaining} ${remaining === 1 ? "call" : "calls"} to go` }
            : undefined,
        );
        setCelebrate(milestone ? "milestone" : "normal");
        navTimer.current = window.setTimeout(
          () => {
            if (next) {
              navigate({ to: "/review/$callId", params: { callId: next }, search: { bulk: "1" } });
            } else {
              try {
                sessionStorage.removeItem(BULK_QUEUE_STORAGE_KEY);
              } catch {
                // Storage can be blocked; the queue is replaced on the next bulk run.
              }
              navigate({ to: "/review", search: { prefill: undefined } });
            }
          },
          milestone ? CELEBRATE_MILESTONE_MS : CELEBRATE_MS,
        );
        return;
      }
      toast.success("Review submitted — nice work!");
      setCelebrate("normal");
      navTimer.current = window.setTimeout(
        () => navigate({ to: "/review", search: { prefill: undefined } }),
        CELEBRATE_MS,
      );
    } catch (e) {
      toast.error(`Failed to submit: ${e instanceof Error ? e.message : "Try again."}`);
      setSubmitting(false);
    }
  }

  const bulkInfo = (() => {
    if (!bulkMode) return null;
    try {
      return bulkProgress(parseBulkQueue(sessionStorage.getItem(BULK_QUEUE_STORAGE_KEY)), callId);
    } catch {
      // A missing or unreadable queue hides the bulk progress bar.
      return null;
    }
  })();
  const canSubmit = issues.length > 0 && rating > 0 && !isAdmin;

  return (
    <div className="space-y-4">
      <CelebrationOverlay celebrate={celebrate} />
      <ReviewHeader
        call={call}
        bulkInfo={bulkInfo}
        sessionReviewed={sessionReviewed}
        reviewerEmail={reviewerEmail}
        isAdmin={isAdmin}
      />

      <div className="grid gap-4 lg:grid-cols-5 lg:h-[calc(100vh-11rem)] lg:overflow-hidden">
        <TranscriptPanel
          call={call}
          isLoading={detailQuery.isLoading}
          transcript={transcript}
          flaggedSet={flaggedSet}
          turnRefs={turnRefs}
          recordingUrl={safeRecordingUrl(detailQuery.data?.call_recording_url)}
        />

        <aside className="space-y-3 lg:col-span-2 lg:h-full lg:overflow-y-auto lg:pr-1">
          <CallInfoPanel
            call={call}
            finalSummary={detailQuery.data?.final_summary}
            open={infoOpen}
            onOpenChange={setInfoOpen}
          />
          <PreviousReviews existingReviews={existingReviews} />
          <IssuesPicker
            dataset={dataset}
            issues={issues}
            onToggleIssue={(id) => setIssuesEdit((prev) => toggleIssue(prev ?? issues, id))}
          />
          <TurnFlagsEditor
            turnCount={transcript.length}
            flags={flags}
            onAdd={addFlag}
            onRemove={removeFlag}
            onScrollToTurn={scrollToTurn}
          />
          <NotesField notes={notes} setNotes={setNotesEdit} />
          <RatingPicker rating={rating} setRating={setRatingEdit} />
          <SubmitBar
            canSubmit={canSubmit}
            hint={submitHint(isAdmin, issues.length, rating)}
            submitting={submitting}
            isAdmin={isAdmin}
            bulkMode={bulkMode}
            onSubmit={submit}
          />
        </aside>
      </div>
    </div>
  );
}
