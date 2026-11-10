import { Label } from "@/components/ui/label";
import type { ExistingReview } from "@/lib/review/review-form";

interface PreviousReviewsProps {
  existingReviews: (ExistingReview & { reviewer_name: string | null; created_at: string })[];
}

/** Earlier reviews of the call by any reviewer, newest first. */
export function PreviousReviews({ existingReviews }: PreviousReviewsProps) {
  return (
    <>
      {existingReviews.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <Label className="text-sm font-semibold">Previous reviews</Label>
          <div className="mt-3 space-y-3">
            {existingReviews.map((r) => (
              <div
                key={`${r.reviewer_email ?? ""}-${r.created_at}`}
                className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {r.reviewer_name || r.reviewer_email}
                  </span>
                  <span className="text-muted-foreground">
                    {r.overall_rating ? `★ ${r.overall_rating}` : "—"}
                  </span>
                </div>
                {r.quantitative_issues && (
                  <div className="flex flex-wrap gap-1">
                    {r.quantitative_issues
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((iss) => (
                        <span
                          key={iss}
                          className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                        >
                          {iss}
                        </span>
                      ))}
                  </div>
                )}
                {r.reviewer_notes && (
                  <p className="italic text-foreground/80">"{r.reviewer_notes}"</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
