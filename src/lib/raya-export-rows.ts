// Builds one staging-sheet row per Raya contact from its last completed call.
import type { ProgramId } from "@/programs/registry";
import {
  asArr,
  asStr,
  campaignTypeFor,
  computeIntent,
  datePart,
  detectRegionForContact,
  fmtDateOnly,
  fmtDateTimeIstFromApi,
  fmtInt,
  fmtPhone,
  jsonStringOrEmptyArray,
  nonEmpty,
  normalize,
  rayaOutcomeOrDerive,
  stripIst,
  yesNo,
} from "./raya-export-format";
import {
  asRecord,
  first,
  isArray,
  type RayaItem,
  type RayaRecord,
  type RayaValue,
} from "./raya-record";

/** Call statuses that mean the call has not finished. */
const UNFINISHED_CALL_STATUSES = [
  "pending",
  "queued",
  "scheduled",
  "in_progress",
  "running",
  "started",
];

/** Returns a call's start time as Raya sent it, or "". */
export function pickCallTime(call: RayaItem): RayaValue {
  return (
    first(
      call,
      "call_start_time",
      "start_time",
      "call_start_time_ist",
      "created_at",
      "call_time",
    ) ?? ""
  );
}

/** Returns a call's id, or "". */
function callIdOf(call: RayaItem): string {
  return asStr(first(call, "uuid", "id", "execution_id"));
}

/** True when a call has an id and has finished. */
export function isCompletedCall(call: RayaItem): boolean {
  if (!call) return false;
  if (!callIdOf(call).trim()) return false;
  const status = normalize(asStr(first(call, "status", "call_status", "state")));
  return !UNFINISHED_CALL_STATUSES.includes(status);
}

/** Returns a contact's latest finished call, or null. */
export function pickLastCall(contact: RayaItem): RayaRecord | null {
  const calls = first(contact, "calls");
  if (!isArray(calls)) return null;
  const time = (c: RayaRecord) => Date.parse(stripIst(pickCallTime(c))) || 0;
  const completed = calls
    .map((c) => asRecord(c))
    .filter((c): c is RayaRecord => c !== undefined && isCompletedCall(c));
  return completed.sort((a, b) => time(b) - time(a))[0] ?? null;
}

/** Launch-time details of a batch, stored when it was launched. */
export interface LaunchMeta {
  campaignDay?: string | null;
  campaignDate?: string | null;
  campaignType?: string | null;
  language?: string | null;
  cityCampaign?: string | null;
  region?: string | null;
  batchName?: string | null;
  agentName?: string | null;
}

/** A contact row as uploaded at launch, keyed by phone. */
export interface InputRow {
  contact_name?: string | null;
  recommendations?: string | null;
  user_intent?: string | null;
  raw?: RayaValue;
}

/** What `buildRow` needs besides the contact and its call. */
export interface BuildCtx {
  columns: string[];
  program: ProgramId;
  batchName: string;
  agentName: string;
  launchMeta: LaunchMeta;
  inputByPhone: Map<string, InputRow>;
}

/**
 * Builds one staging-sheet row in `ctx.columns` order from a contact and its last call.
 * Values come from the call's call_output first.
 *
 * @returns The row, or null when there is no call or the call has no id.
 */
export function buildRow(contact: RayaItem, lastCall: RayaItem, ctx: BuildCtx): string[] | null {
  if (!lastCall) return null;

  const lm = ctx.launchMeta;
  const detectedRegion = detectRegionForContact(contact, {
    batchName: ctx.batchName,
    agentName: ctx.agentName,
    program: ctx.program,
  });
  const region = {
    region: String(lm.region ?? detectedRegion.region),
    language: String(lm.language ?? detectedRegion.language),
    city: String(lm.cityCampaign ?? detectedRegion.city),
  };

  const callOutput = asRecord(lastCall.call_output) ?? {};
  const contactArgs = asRecord(first(contact, "agent_args", "args", "metadata")) ?? {};
  const phone = fmtPhone(asStr(first(contact, "contact_phone", "phone") ?? contactArgs.phone));
  const inputRaw = asRecord(ctx.inputByPhone.get(phone)?.raw) ?? {};
  const getInput = (k: string) => first(inputRaw, k, normalize(k)) ?? "";

  const callId = callIdOf(lastCall);
  if (!callId) return null;
  const callDur = Number(first(lastCall, "call_duration", "duration") ?? 0);
  const callDateIst = pickCallTime(lastCall);
  const callRecording = asStr(
    first(lastCall, "call_recording_url", "recording_url", "enhanced_recording_url", "recording"),
  );
  const rayaOutcomeStr = asStr(first(lastCall, "outcome", "call_outcome"));

  const jobsRecommendedArr = asArr(callOutput.jobs_recommended);
  const jobsAppliedArr = asArr(callOutput.jobs_applied);
  const jobsFailedArr = asArr(callOutput.jobs_failed_to_apply);
  const finalSummary = asStr(callOutput.final_summary);
  const primaryTopic = asStr(callOutput.primary_topic);
  const dropReason = asStr(callOutput.drop_reason);
  const seekerName = asStr(first(callOutput, "seeker_name") ?? first(contact, "name"));
  const userIntentRaw = asStr(callOutput.user_intent);
  const appliedToJob = yesNo(callOutput.applied_to_job, jobsAppliedArr.length > 0);
  const jobsShown = yesNo(callOutput.jobs_shown, jobsRecommendedArr.length > 0);
  const callEngaged = yesNo(callOutput.call_engaged, nonEmpty(primaryTopic));
  const callAnswered = yesNo(callOutput.call_answered, callDur > 0);
  const applicationsCount = Number(callOutput.applications_count ?? jobsAppliedArr.length);

  const triedToApply = jobsAppliedArr.length > 0 || jobsFailedArr.length > 0;
  const contactStatus = asStr(first(contact, "status"));
  const outcome = rayaOutcomeOrDerive(rayaOutcomeStr, {
    contactStatus,
    durationSec: callDur,
    applied: appliedToJob === "Yes",
    jobsShown: jobsShown === "Yes",
    engaged: callEngaged === "Yes",
  });
  const intent = computeIntent({
    durationSec: callDur,
    applied: appliedToJob === "Yes",
    triedToApply,
    jobsShown: jobsShown === "Yes",
    userIntent: userIntentRaw,
  });

  const campaignDay = String(lm.campaignDay ?? "").trim();
  const campaignDate =
    fmtDateOnly(lm.campaignDate) || datePart(callDateIst) || new Date().toISOString().slice(0, 10);
  const campaignType =
    String(lm.campaignType ?? "").trim() ||
    campaignTypeFor(ctx.program, region.language, campaignDay);

  const byCol = new Map<string, string>(
    Object.entries({
      campaign_day: campaignDay,
      campaign_date: campaignDate,
      campaign_type: campaignType,
      language: region.language,
      call_id: callId,
      phone,
      contact_phone: phone,
      call_duration_seconds: fmtInt(callDur),
      call_datetime_ist: fmtDateTimeIstFromApi(callDateIst),
      call_outcome: outcome,
      call_answered: callAnswered,
      call_engaged: callEngaged,
      applied_to_job: appliedToJob,
      applications_count: fmtInt(applicationsCount),
      jobs_shown: jobsShown,
      primary_topic: primaryTopic,
      call_language: region.language,
      call_recording_url: callRecording,
      final_summary: finalSummary,
      call_transcript: jsonStringOrEmptyArray(first(lastCall, "call_transcript", "transcript")),
      tried_to_apply: triedToApply ? "Yes" : "No",
      drop_reason: dropReason,
      city_campaign: region.city,
      seeker_name: seekerName,
      user_intent: userIntentRaw,
      jobs_recommended: JSON.stringify(jobsRecommendedArr),
      jobs_applied: JSON.stringify(jobsAppliedArr),
      jobs_failed_to_apply: JSON.stringify(jobsFailedArr),
      intent_score: fmtInt(intent.score),
      intent_score_reasoning: intent.reasoning,
      // DKB extras (best-effort passthrough from call_output / contact)
      job_id: asStr(
        first(callOutput, "job_id") ?? first(contactArgs, "job_id") ?? getInput("job_id"),
      ),
      company_name: asStr(
        first(callOutput, "company_name") ??
          first(contactArgs, "company_name") ??
          getInput("company_name"),
      ),
      job_role_input: asStr(first(contactArgs, "job_role_input") ?? getInput("job_role_input")),
      num_vacancies_input: asStr(
        first(contactArgs, "num_vacancies_input") ?? getInput("num_vacancies_input"),
      ),
      city_input: asStr(first(contactArgs, "city_input") ?? getInput("city_input")),
      location_input: asStr(first(contactArgs, "location_input") ?? getInput("location_input")),
      salary_input: asStr(first(contactArgs, "salary_input") ?? getInput("salary_input")),
      qualification_input: asStr(
        first(contactArgs, "qualification_input") ?? getInput("qualification_input"),
      ),
      call_status: contactStatus,
      contact_attempts: asStr(first(contact, "contact_attempts", "attempts")),
      phases_reached: asStr(callOutput.phases_reached),
      job_status: asStr(callOutput.job_status),
      job_role_value: asStr(callOutput.job_role_value),
      num_vacancies_value: asStr(callOutput.num_vacancies_value),
      salary_value: asStr(callOutput.salary_value),
      location_value: asStr(callOutput.location_value),
      qualification_value: asStr(callOutput.qualification_value),
      fields_updated: asStr(callOutput.fields_updated),
      new_job_mentioned: asStr(callOutput.new_job_mentioned),
      new_job_role: asStr(callOutput.new_job_role),
      new_job_vacancies: asStr(callOutput.new_job_vacancies),
      new_job_salary: asStr(callOutput.new_job_salary),
      new_job_location: asStr(callOutput.new_job_location),
      new_job_qualification: asStr(callOutput.new_job_qualification),
      new_job_posted: asStr(callOutput.new_job_posted),
      talent_insights_shown: asStr(callOutput.talent_insights_shown),
    }),
  );

  return ctx.columns.map((col) => {
    const nk = normalize(col);
    // Exact key, then the lowercased header (e.g. "Intent Score"), then the contact's own fields.
    const known = byCol.get(nk) ?? byCol.get(col.toLowerCase());
    if (known !== undefined) return known;
    return asStr(first(contact, col, nk) ?? first(contactArgs, col, nk));
  });
}

/** Merges a call-detail reply into a call; the two call_output objects are merged too. */
export function mergeCallDetail(call: RayaRecord, detail: RayaValue | undefined): RayaRecord {
  const extra = asRecord(detail);
  if (!extra) return call;
  return {
    ...call,
    ...extra,
    call_output: {
      ...asRecord(call.call_output),
      ...asRecord(extra.call_output),
    },
  };
}

/** Splits the columns into those with a value in at least one row and those empty in every row. */
export function columnCoverage(
  columns: string[],
  rows: string[][],
): { populatedColumns: string[]; emptyColumns: string[] } {
  const filled = (i: number) => rows.some((row) => String(row[i] ?? "").trim() !== "");
  return {
    populatedColumns: columns.filter((_, i) => filled(i)),
    emptyColumns: columns.filter((_, i) => !filled(i)),
  };
}
