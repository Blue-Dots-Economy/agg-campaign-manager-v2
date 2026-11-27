import { AlertTriangle, Check, Loader2, Rocket } from "lucide-react";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";

interface LaunchStepProps {
  canDirectLaunch: boolean;
  requested: boolean;
  launching: boolean;
  batchId: string | null;
  startPending: boolean;
  startStatus: string | null;
  launchError: string | null;
  onRequest: () => void;
  onLaunch: () => void;
  onRetryStart: (batchId: string) => void;
}

/** Step 7: request the campaign, or (admin and JFC) launch it in Raya, and show the outcome. */
export function LaunchStep({
  canDirectLaunch,
  requested,
  launching,
  batchId,
  startPending,
  startStatus,
  launchError,
  onRequest,
  onLaunch,
  onRetryStart,
}: LaunchStepProps) {
  return (
    <Panel title="Step 7 · Launch" description="Create the batch in Raya and start the schedule">
      <div className="space-y-4 max-w-xl">
        {!requested && !batchId && !launching && (
          <div className="space-y-3">
            <Button
              onClick={onRequest}
              className="bg-brand text-brand-foreground hover:bg-brand/90 gap-1.5"
              size="lg"
            >
              <Rocket className="h-4 w-4" /> Request campaign
            </Button>
            {canDirectLaunch && (
              <div className="space-y-1">
                <Button onClick={onLaunch} variant="outline" className="gap-1.5">
                  <Rocket className="h-4 w-4" /> Launch campaign
                </Button>
                <p className="text-xs text-muted-foreground">
                  Launch now (skips the request queue)
                </p>
              </div>
            )}
          </div>
        )}
        {requested && !batchId && (
          <div className="rounded-md bg-brand-soft text-brand px-3 py-2 text-sm flex items-center gap-2">
            <Check className="h-4 w-4" /> Request submitted — pending review in Campaign Requests
          </div>
        )}
        {launching && (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Creating batch and starting schedule…
          </div>
        )}
        {batchId && (
          <div className="rounded-md bg-brand-soft text-brand px-3 py-2 text-sm flex items-center gap-2">
            <Check className="h-4 w-4" /> Batch created ·{" "}
            <span className="font-mono">{batchId}</span>
          </div>
        )}
        {startPending && batchId && !launching && (
          <Button
            onClick={() => onRetryStart(batchId)}
            className="bg-brand text-brand-foreground hover:bg-brand/90 gap-1.5"
          >
            <Rocket className="h-4 w-4" /> Retry start
          </Button>
        )}
        {startStatus && (
          <div className="rounded-md bg-brand-soft text-brand px-3 py-2 text-sm flex items-center gap-2">
            <Check className="h-4 w-4" /> Status: {startStatus}
          </div>
        )}
        {launchError && (
          <div className="rounded-md bg-red-500/15 text-red-700 dark:text-red-400 px-3 py-2 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="whitespace-pre-line">{launchError}</div>
          </div>
        )}
      </div>
    </Panel>
  );
}
