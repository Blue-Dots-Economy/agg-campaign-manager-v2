// Builds one staging-sheet row per Raya contact from its last completed call.
import type { ProgramId } from "@/programs/registry";
import {
  asArr,
  asStr,
  datePart,
  detectRegionForContact,
  fmtDateOnly,
  fmtDateTimeIstFromApi,
  fmtInt,
  fmtPhone,
  computeIntent,
  jsonStringOrEmptyArray,
  nonEmpty,
  normalize,
  rayaOutcomeOrDerive,
  stripIst,
  yesNo,
} from "./raya-export-format";

export function pickLastCall(contact: any): any | null {
  const arr = contact?.calls ?? null;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const completed = arr.filter(isCompletedCall);
  if (completed.length === 0) return null;
  const sorted = [...completed].sort((a, b) => {
    const ta = Date.parse(stripIst(pickCallTime(a))) || 0;
    const tb = Date.parse(stripIst(pickCallTime(b))) || 0;
    return tb - ta;
  });
  return sorted[0] ?? null;
}

export function pickCallTime(call: any): any {
  return (
    call?.call_start_time ??
    call?.start_time ??
    call?.call_start_time_ist ??
    call?.created_at ??
    call?.call_time ??
    ""
  );
}

export function isCompletedCall(call: any): boolean {
  if (!call) return false;
  const callId = asStr(call?.uuid ?? call?.id ?? call?.execution_id ?? "").trim();
  if (!callId) return false;
  const status = normalize(asStr(call?.status ?? call?.call_status ?? call?.state ?? ""));
  if (["pending", "queued", "scheduled", "in_progress", "running", "started"].includes(status)) {
    return false;
  }
  return true;
}

// ---------- per-contact row builder ----------
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
export interface InputRow {
  contact_name?: string | null;
  recommendations?: string | null;
  user_intent?: string | null;
  raw?: Record<string, any> | null;
}
export interface BuildCtx {
  columns: string[];
  program: ProgramId;
  batchName: string;
  agentName: string;
  launchMeta: LaunchMeta;
  inputByPhone: Map<string, InputRow>;
}

export function buildRow(contact: any, lastCall: any, ctx: BuildCtx): string[] | null {
  // Skip contacts with no completed call (no call recordings/duration).
  // lastCall presence is required.
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

  // ============================================================
  // SINGLE SOURCE OF TRUTH: calls[last].call_output
  // ============================================================
  const callOutput = lastCall?.call_output ?? {};
  const contactArgs = contact?.agent_args ?? contact?.args ?? contact?.metadata ?? {};
  const phoneRaw = asStr(contact?.contact_phone ?? contact?.phone ?? contactArgs?.phone);
  const phone = fmtPhone(phoneRaw);
  const input = ctx.inputByPhone.get(phone) ?? null;
  const inputRaw = input?.raw ?? {};
  const getInput = (k: string) => inputRaw?.[k] ?? inputRaw?.[normalize(k)] ?? "";

  // Call-object fields
  const callId = asStr(lastCall?.uuid ?? lastCall?.id ?? lastCall?.execution_id ?? "");
  if (!callId) return null;
  const callDur = Number(lastCall?.call_duration ?? lastCall?.duration ?? 0);
  const callDateIst = pickCallTime(lastCall); // call.call_start_time
  const callRecording = asStr(
    lastCall?.call_recording_url ??
      lastCall?.recording_url ??
      lastCall?.enhanced_recording_url ??
      lastCall?.recording ??
      "",
  );
  const rayaOutcomeStr = asStr(lastCall?.outcome ?? lastCall?.call_outcome ?? "");

  // call_output fields — these are authoritative; no agent_args/input/transcript fallbacks here
  const jobsRecommendedArr = asArr(callOutput?.jobs_recommended);
  const jobsAppliedArr = asArr(callOutput?.jobs_applied);
  const jobsFailedArr = asArr(callOutput?.jobs_failed_to_apply);
  const finalSummary = asStr(callOutput?.final_summary ?? "");
  const primaryTopic = asStr(callOutput?.primary_topic ?? "");
  const dropReason = asStr(callOutput?.drop_reason ?? "");
  const seekerName = asStr(callOutput?.seeker_name ?? contact?.name ?? "");
  const userIntentRaw = asStr(callOutput?.user_intent ?? "");
  const appliedToJob = yesNo(callOutput?.applied_to_job, jobsAppliedArr.length > 0);
  const jobsShown = yesNo(callOutput?.jobs_shown, jobsRecommendedArr.length > 0);
  const callEngaged = yesNo(callOutput?.call_engaged, nonEmpty(primaryTopic));
  const callAnswered = yesNo(callOutput?.call_answered, callDur > 0);
  const applicationsCount = Number(callOutput?.applications_count ?? jobsAppliedArr.length ?? 0);

  // Computed
  const triedToApply = jobsAppliedArr.length > 0 || jobsFailedArr.length > 0;
  const contactStatus = asStr(contact?.status ?? "");
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

  // Campaign metadata (from launched_batches join)
  const campaignDay = String(lm.campaignDay ?? "").trim();
  const campaignDate =
    fmtDateOnly(lm.campaignDate) || datePart(callDateIst) || new Date().toISOString().slice(0, 10);
  const dayNum = (campaignDay.match(/\d+/) || ["1"])[0];
  const campaignType =
    String(lm.campaignType ?? "").trim() ||
    `${ctx.program.toUpperCase()}_${region.language || ""}_Day${dayNum}`;

  const byCol: Record<string, string> = {
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
    call_transcript: jsonStringOrEmptyArray(lastCall?.call_transcript ?? lastCall?.transcript),
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
    job_id: asStr(callOutput?.job_id ?? contactArgs?.job_id ?? getInput("job_id")),
    company_name: asStr(
      callOutput?.company_name ?? contactArgs?.company_name ?? getInput("company_name"),
    ),
    job_role_input: asStr(contactArgs?.job_role_input ?? getInput("job_role_input")),
    num_vacancies_input: asStr(contactArgs?.num_vacancies_input ?? getInput("num_vacancies_input")),
    city_input: asStr(contactArgs?.city_input ?? getInput("city_input")),
    location_input: asStr(contactArgs?.location_input ?? getInput("location_input")),
    salary_input: asStr(contactArgs?.salary_input ?? getInput("salary_input")),
    qualification_input: asStr(contactArgs?.qualification_input ?? getInput("qualification_input")),
    call_status: contactStatus,
    contact_attempts: asStr(contact?.contact_attempts ?? contact?.attempts ?? ""),
    phases_reached: asStr(callOutput?.phases_reached ?? ""),
    job_status: asStr(callOutput?.job_status ?? ""),
    job_role_value: asStr(callOutput?.job_role_value ?? ""),
    num_vacancies_value: asStr(callOutput?.num_vacancies_value ?? ""),
    salary_value: asStr(callOutput?.salary_value ?? ""),
    location_value: asStr(callOutput?.location_value ?? ""),
    qualification_value: asStr(callOutput?.qualification_value ?? ""),
    fields_updated: asStr(callOutput?.fields_updated ?? ""),
    new_job_mentioned: asStr(callOutput?.new_job_mentioned ?? ""),
    new_job_role: asStr(callOutput?.new_job_role ?? ""),
    new_job_vacancies: asStr(callOutput?.new_job_vacancies ?? ""),
    new_job_salary: asStr(callOutput?.new_job_salary ?? ""),
    new_job_location: asStr(callOutput?.new_job_location ?? ""),
    new_job_qualification: asStr(callOutput?.new_job_qualification ?? ""),
    new_job_posted: asStr(callOutput?.new_job_posted ?? ""),
    talent_insights_shown: asStr(callOutput?.talent_insights_shown ?? ""),
  };

  return ctx.columns.map((col) => {
    const nk = normalize(col);
    if (Object.prototype.hasOwnProperty.call(byCol, nk)) return byCol[nk];
    // case-insensitive header (e.g., "Intent Score")
    const lower = col.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(byCol, lower)) return byCol[lower];
    // best-effort fall through to contact field or agent_args
    const fb =
      (contact as any)?.[col] ?? (contact as any)?.[nk] ?? contactArgs?.[col] ?? contactArgs?.[nk];
    return asStr(fb);
  });
}

export function mergeCallDetail(call: any, detail: any | null): any {
  if (!detail || typeof detail !== "object") return call;
  return {
    ...call,
    ...detail,
    call_output: {
      ...(call?.call_output ?? {}),
      ...(detail?.call_output ?? {}),
    },
  };
}
