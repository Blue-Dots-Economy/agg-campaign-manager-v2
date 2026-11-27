// Call outcome cards shown under the seekers overview.
import { cn } from "@/lib/utils";
import { splitOutcomes, type CallOutcomeCount } from "@/components/metrics/overview-helpers";

const nfIN = new Intl.NumberFormat("en-IN");

function OutcomeCard({
  outcome,
  n,
  pct,
  muted,
}: {
  outcome: string;
  n: number;
  pct: number;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        muted ? "border-amber-500/40 bg-amber-500/5" : "border-border",
      )}
    >
      <p className="truncate text-[11px] font-medium text-muted-foreground" title={outcome}>
        {outcome}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          muted ? "text-amber-600 dark:text-amber-400" : "text-foreground",
        )}
      >
        {nfIN.format(n)}
      </p>
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {pct.toFixed(1)}% of all rows
      </p>
    </div>
  );
}

/** Call outcome cards for a batch, with not-dialled rows listed apart. */
export function CallOutcomeBreakdown({ outcomes }: { outcomes: CallOutcomeCount[] }) {
  if (!outcomes.length) return null;
  const { total, dialled, skipped } = splitOutcomes(outcomes);
  const pctOf = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div className="mt-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Call outcomes</h3>
        <p className="text-[11px] text-muted-foreground">
          {nfIN.format(total)} rows in the batch · grouped by outcome
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {dialled.map((o) => (
          <OutcomeCard key={o.outcome} outcome={o.outcome} n={o.n} pct={pctOf(o.n)} />
        ))}
      </div>
      {skipped.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground">Not dialled</h4>
            <p className="text-[11px] text-muted-foreground">Excluded from Calls made</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {skipped.map((o) => (
              <OutcomeCard key={o.outcome} outcome={o.outcome} n={o.n} pct={pctOf(o.n)} muted />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
