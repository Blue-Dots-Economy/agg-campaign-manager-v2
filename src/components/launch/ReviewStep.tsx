import { Panel } from "@/components/Panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ScheduleState } from "@/components/ScheduleEditor";
import type { CohortIntent, ConfidenceBand } from "@/lib/cohort";
import { dayLabels, type AudienceSource, type ValidationReport } from "@/lib/launch/wizard";

interface ReviewStepProps {
  programLabel: string;
  agentId: string;
  agentName: string;
  batchName: string;
  onBatchNameChange: (v: string) => void;
  source: AudienceSource;
  cohortIntent: CohortIntent;
  profileStatuses: string[];
  confidenceBand: ConfidenceBand;
  fileName: string | undefined;
  region: string;
  language: string;
  city: string;
  campaignDay: string;
  onCampaignDayChange: (v: string) => void;
  campaignDate: string;
  onCampaignDateChange: (v: string) => void;
  campaignType: string;
  cohortCount: number;
  report: ValidationReport | null;
  schedule: ScheduleState;
  concurrency: number;
  maxRetries: number;
  retryAfterHrs: number;
  selectedStatuses: string[];
}

/** Step 6: summary of every choice, with the batch name, day and date still editable. */
export function ReviewStep(p: ReviewStepProps) {
  const cohort = p.source === "cohort";
  return (
    <Panel title="Step 6 · Review" description="Confirm everything before sending to Raya">
      <div className="grid gap-3 sm:grid-cols-2 text-sm max-w-3xl">
        <Field label="Program" value={p.programLabel} />
        <Field label="Agent" value={p.agentName || p.agentId} mono />
        <Field label="Agent id" value={p.agentId} mono />
        <Field label="Batch name" value={p.batchName} />
        <Field label="Audience" value={cohort ? "Cohort · My Blue Dots" : "Bulk upload"} />
        {cohort ? (
          <>
            <Field
              label="Cohort intent"
              value={p.cohortIntent === "drive" ? "Drive Applications" : "Fill Missing Information"}
            />
            <Field
              label="Cohort filter"
              value={
                p.cohortIntent === "drive"
                  ? p.profileStatuses.join(", ")
                  : `Confidence ${p.confidenceBand}`
              }
            />
          </>
        ) : (
          <Field label="File" value={p.fileName ?? "—"} />
        )}
        <Field label="Region" value={p.region} />
        <Field label="Language" value={p.language || "—"} />
        <Field label="City campaign" value={p.city || "—"} />
        <Field label="Campaign day" value={p.campaignDay} />
        <Field label="Campaign date" value={p.campaignDate} />
        <Field label="Campaign type" value={p.campaignType} />
        <Field
          label="Contacts"
          value={
            cohort ? String(p.cohortCount) : `${p.report?.valid ?? 0} of ${p.report?.total ?? 0}`
          }
        />
        <Field label="Will skip" value={String(p.report?.invalid ?? 0)} />
        <Field label="Days" value={dayLabels(p.schedule.days)} />
        <Field label="Time window" value={`${p.schedule.startTime}–${p.schedule.endTime}`} />
        <Field label="Timezone" value={p.schedule.timezone} />
        <Field label="Concurrency" value={String(p.concurrency)} />
        <Field label="Max retries" value={String(p.maxRetries)} />
        <Field label="Retry after" value={`${p.retryAfterHrs} hrs`} />
        <Field label="Statuses to call" value={p.selectedStatuses.join(", ")} />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3 max-w-3xl">
        <div>
          <Label htmlFor="bn" className="text-xs">
            Edit batch name
          </Label>
          <Input
            id="bn"
            value={p.batchName}
            onChange={(e) => p.onBatchNameChange(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="cday" className="text-xs">
            Campaign day
          </Label>
          <Input
            id="cday"
            value={p.campaignDay}
            onChange={(e) => p.onCampaignDayChange(e.target.value)}
            placeholder="Day 1"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="cdate" className="text-xs">
            Campaign date
          </Label>
          <Input
            id="cdate"
            type="date"
            value={p.campaignDate}
            onChange={(e) => p.onCampaignDateChange(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
    </Panel>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm mt-0.5 break-all", mono && "font-mono")}>{value || "—"}</div>
    </div>
  );
}
