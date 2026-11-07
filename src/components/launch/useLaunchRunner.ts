// Sends a finished launch wizard to the server: a campaign request, or a direct Raya launch.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { rayaCreateBatch, rayaStartBatch } from "@/lib/raya.functions";
import { recordLaunchedBatch } from "@/lib/launched-batches.functions";
import { submitCampaignRequest } from "@/lib/campaign-requests.functions";
import { useRefreshConcurrency } from "@/hooks/useConcurrencyUsage";
import { appendLaunchLog } from "@/lib/launch-log";
import type { ProgramId } from "@/programs/registry";
import type { ScheduleState } from "@/components/ScheduleEditor";
import type { CohortIntent, ConfidenceBand } from "@/lib/cohort";
import {
  DEFAULT_CALL_STATUSES,
  exceedsAvailable,
  formatBatchValidationError,
  startedBatchStatus,
  type AudienceSource,
  type LaunchContact,
} from "@/lib/launch/wizard";

/** Everything the wizard collected, as needed to request or launch a batch. */
export interface LaunchPlan {
  program: ProgramId;
  agentId: string;
  agentName: string;
  batchName: string;
  campaignDay: string;
  campaignDate: string;
  campaignType: string;
  region: string;
  language: string;
  city: string;
  source: AudienceSource;
  cohortIntent: CohortIntent;
  profileStatuses: string[];
  confidenceBand: ConfidenceBand;
  contacts: LaunchContact[];
  schedule: ScheduleState;
  concurrency: number;
  maxRetries: number;
  retryAfterHrs: number;
  selectedStatuses: string[];
  available: number;
  fileName: string | undefined;
  /** Valid rows in the uploaded CSV report, or 0 without one. */
  reportValid: number;
}

function rayaSchedule(schedule: ScheduleState) {
  return {
    timezone: schedule.timezone,
    start_time: schedule.startTime,
    end_time: schedule.endTime,
    days: schedule.days,
  };
}

/** Holds the launch progress and exposes the request, launch and retry-start actions. */
export function useLaunchRunner() {
  const [launching, setLaunching] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [startStatus, setStartStatus] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [startPending, setStartPending] = useState(false);
  const [requested, setRequested] = useState(false);

  const createBatchFn = useServerFn(rayaCreateBatch);
  const startBatchFn = useServerFn(rayaStartBatch);
  const recordBatchFn = useServerFn(recordLaunchedBatch);
  const submitRequestFn = useServerFn(submitCampaignRequest);
  const refreshUsage = useRefreshConcurrency();

  const startCreatedBatch = async (plan: LaunchPlan, id: string, logRows?: number) => {
    setLaunching(true);
    setLaunchError(null);
    setStartPending(false);
    try {
      const started: unknown = await startBatchFn({
        data: {
          batchId: id,
          schedule: rayaSchedule(plan.schedule),
          maxRetries: plan.maxRetries,
          retryAfterHrs: plan.retryAfterHrs,
          concurrency: plan.concurrency,
          selectedStatuses: plan.selectedStatuses.length
            ? plan.selectedStatuses
            : DEFAULT_CALL_STATUSES,
        },
      });
      setStartStatus(startedBatchStatus(started));
      appendLaunchLog({
        date: new Date().toISOString(),
        program: plan.program,
        file: plan.fileName ?? plan.batchName,
        rows: logRows ?? plan.reportValid,
        status: "appended",
        batchId: id,
      });
      toast.success(`Batch launched · ${id}`);
      refreshUsage();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Start failed";
      setLaunchError(
        `${msg}\nBatch ${id} was created but not started. Use Retry start to resume without creating a duplicate batch.`,
      );
      setStartPending(true);
      toast.error(msg.split("\n")[0]);
    } finally {
      setLaunching(false);
    }
  };

  const requestCampaign = async (plan: LaunchPlan) => {
    if (plan.contacts.length === 0) {
      toast.error("No contacts to request.");
      return;
    }
    const cohort = plan.source === "cohort";
    try {
      await submitRequestFn({
        data: {
          request: {
            program: plan.program,
            agent_id: plan.agentId,
            agent_name: plan.agentName,
            batch_name: plan.batchName,
            campaign_day: plan.campaignDay,
            campaign_date: plan.campaignDate,
            campaign_type: plan.campaignType,
            region: plan.region,
            language: plan.language,
            city_campaign: plan.city,
            channel: "outbound",
            source: plan.source,
            cohort_intent: cohort ? plan.cohortIntent : null,
            cohort_filters: cohort
              ? plan.cohortIntent === "drive"
                ? { profileStatuses: plan.profileStatuses }
                : { confidenceBand: plan.confidenceBand }
              : null,
            contacts: plan.contacts,
            schedule: rayaSchedule(plan.schedule),
            concurrency: plan.concurrency,
            max_retries: plan.maxRetries,
            retry_after_hrs: plan.retryAfterHrs,
            selected_statuses: plan.selectedStatuses,
          },
        },
      });
      setRequested(true);
      toast.success(
        "Request submitted — it'll appear in Campaign Requests for a JFC/admin to review and launch.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    }
  };

  const launch = async (plan: LaunchPlan) => {
    if (exceedsAvailable(plan.concurrency, plan.available)) {
      const msg = `Only ${plan.available} concurrency available — reduce concurrency or stop a running batch.`;
      setLaunchError(msg);
      toast.error(msg);
      return;
    }
    setLaunching(true);
    setLaunchError(null);
    setStartPending(false);
    setStartStatus(null);
    const { contacts } = plan;
    try {
      if (contacts.length === 0) {
        toast.error("No contacts to launch.");
        setLaunching(false);
        return;
      }
      const created = await createBatchFn({
        data: { agentId: plan.agentId, batchName: plan.batchName, contacts },
      });
      if (!created.ok) throw new Error(formatBatchValidationError(created.validation));

      const id = created.batchId;
      setBatchId(id);
      // Persist campaign metadata for the staging export to join on later.
      try {
        await recordBatchFn({
          data: {
            batchId: id,
            program: plan.program,
            agentId: plan.agentId,
            agentName: plan.agentName,
            batchName: plan.batchName,
            campaignDay: plan.campaignDay,
            campaignDate: plan.campaignDate,
            campaignType: plan.campaignType,
            language: plan.language,
            cityCampaign: plan.city,
            region: plan.region,
            inputRows: contacts,
          },
        });
      } catch (e) {
        console.error("recordLaunchedBatch failed", e);
      }
      await startCreatedBatch(plan, id, contacts.length);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Launch failed";
      setLaunchError(msg);
      toast.error(msg.split("\n")[0]);
      appendLaunchLog({
        date: new Date().toISOString(),
        program: plan.program,
        file: plan.fileName ?? plan.batchName,
        rows: plan.source === "cohort" ? contacts.length : plan.reportValid,
        status: "failed",
      });
    } finally {
      setLaunching(false);
    }
  };

  /** Clears the result of the last launch so the wizard can start over. */
  const reset = () => {
    setBatchId(null);
    setStartStatus(null);
    setStartPending(false);
  };

  return {
    launching,
    batchId,
    startStatus,
    launchError,
    startPending,
    requested,
    requestCampaign,
    launch,
    retryStart: (plan: LaunchPlan, id: string) => startCreatedBatch(plan, id),
    reset,
  };
}
