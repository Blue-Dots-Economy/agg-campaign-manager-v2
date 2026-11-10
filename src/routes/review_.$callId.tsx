import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { z } from "zod";
import { useProgram } from "@/programs/context";
import { useAuth } from "@/auth/context";
import { useReviewCalls } from "@/programs/useProgramAggregates";
import { CallReviewWorkspace } from "@/components/review/CallReviewWorkspace";
import { findCall, SHARED_ADMIN_EMAIL } from "@/lib/review/review-form";

/** Search params of the call review page; `bulk=1` walks the stored bulk queue. */
const ReviewCallSearchSchema = z.object({
  bulk: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/review_/$callId")({
  validateSearch: (s: Record<string, unknown>) => ReviewCallSearchSchema.parse(s),
  component: TranscriptReview,
});

function TranscriptReview() {
  const { callId } = Route.useParams();
  const { bulk } = Route.useSearch();
  const bulkMode = bulk === "1";
  const navigate = useNavigate();
  const { programId: dataset } = useProgram();
  const { session } = useAuth();
  const reviewerEmail = (session?.email || "").toLowerCase();
  const isAdmin = reviewerEmail === SHARED_ADMIN_EMAIL;
  const [infoOpen, setInfoOpen] = useState(true);

  const callsQuery = useReviewCalls(dataset);
  const calls = callsQuery.data ?? null;
  const call = useMemo(() => findCall(calls, callId), [calls, callId]);

  // Each call opens at the top of the page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [callId]);

  if (calls === null)
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!call)
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate({ to: "/review", search: { prefill: undefined } })}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to review
        </button>
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          Call not found.
        </div>
      </div>
    );

  return (
    <CallReviewWorkspace
      key={callId}
      call={call}
      callId={callId}
      dataset={dataset}
      bulkMode={bulkMode}
      reviewerEmail={reviewerEmail}
      isAdmin={isAdmin}
      infoOpen={infoOpen}
      setInfoOpen={setInfoOpen}
    />
  );
}
