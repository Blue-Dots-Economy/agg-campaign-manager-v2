// Raya → staging-sheet export. NEVER writes to a sheet_id present in
// sheet_connections (the masters). All writeback goes to a separate staging
// sheet configured in program_export_targets.

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { delay, rayaFetch } from "./raya-api";
import {
  appendStagingRows,
  deleteSheetTab,
  readStagingCallIds,
  updateStagingRows,
  writeStagingHeaders,
} from "./sheets.server";
import { registry, type ProgramId } from "@/programs/registry";

function sb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export interface ExportTarget {
  program: ProgramId;
  sheet_id: string;
  tab_name: string | null;
  label: string | null;
  enabled: boolean;
  last_exported_at: string | null;
  last_error: string | null;
}

// ---------- read sheet id from URL ----------
function parseSheetId(input: string): string {
  const t = input.trim();
  if (!t) return "";
  const m = t.match(/\/d\/([A-Za-z0-9-_]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9-_]{20,}$/.test(t)) return t;
  return "";
}

// ---------- target read ----------
export const getExportTarget = createServerFn({ method: "GET" })
  .inputValidator((d: { program: ProgramId }) => {
    if (!d.program) throw new Error("program required");
    return d;
  })
  .handler(async ({ data }) => {
    const c = sb();
    const { data: row } = await c
      .from("program_export_targets")
      .select("*")
      .eq("program", data.program)
      .maybeSingle();
    return (row ?? null) as ExportTarget | null;
  });

// ---------- target write ----------
export const setExportTarget = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { program: ProgramId; sheetUrlOrId: string; tabName?: string; label?: string }) => {
      if (!d.program) throw new Error("program required");
      return d;
    },
  )
  .handler(async ({ data }) => {
    const sheetId = parseSheetId(data.sheetUrlOrId);
    if (!sheetId) throw new Error("Provide a valid Google Sheet URL or ID.");

    const c = sb();
    const { data: masters, error: e1 } = await c
      .from("sheet_connections")
      .select("sheet_id,name,program");
    if (e1) throw new Error(e1.message);
    const clash = (masters ?? []).find((m) => String(m.sheet_id).trim() === sheetId);
    if (clash) {
      throw new Error(
        `Refusing to use sheet ${sheetId} — it is configured as a master sheet (${clash.name ?? clash.program}) in Connections. Staging must be a separate sheet.`,
      );
    }

    const payload = {
      program: data.program,
      sheet_id: sheetId,
      tab_name: "Sheet1",
      label: data.label?.trim() || null,
      enabled: true,
      last_error: null,
    };
    const { data: row, error } = await c
      .from("program_export_targets")
      .upsert(payload, { onConflict: "program" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as ExportTarget;
  });

// ---------- helpers ----------
function normalize(k: string): string {
  return String(k ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function asStr(v: any): string {
  if (v == null) return "";
  if (typeof v === "object") {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

function asArr(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v == null || v === "") return [];
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  }
  return [];
}

function jsonArrayString(v: any): string {
  const arr = asArr(v);
  return JSON.stringify(arr);
}

function jsonArrayStringFromAny(v: any): string {
  if (v == null || v === "") return "[]";
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return "[]";
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return JSON.stringify(parsed);
      if (parsed && typeof parsed === "object") return JSON.stringify([parsed]);
    } catch {
      /* fall through */
    }
    return JSON.stringify([t]);
  }
  if (typeof v === "object") return JSON.stringify([v]);
  return JSON.stringify([String(v)]);
}

function jsonStringOrEmptyArray(v: any): string {
  if (v == null || v === "") return "[]";
  if (typeof v === "string") return v.trim() || "[]";
  try { return JSON.stringify(v); } catch { return "[]"; }
}

// ---------- transcript-based apply_job parsing ----------
function parseToolArgs(raw: any): Record<string, any> {
  if (raw == null) return {};
  if (typeof raw === "object") return raw as Record<string, any>;
  const s = String(raw);
  try {
    const p = JSON.parse(s);
    if (p && typeof p === "object") return p as Record<string, any>;
  } catch { /* fall through */ }
  const out: Record<string, any> = {};
  // regex fallback — job_id values can contain spaces and parens, e.g. "9988683683_ITI (Other)"
  const mj = s.match(/["']?job_id["']?\s*[:=]\s*["']([^"']+)["']/i);
  const mp = s.match(/["']?profile_id["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (mj) out.job_id = mj[1];
  if (mp) out.profile_id = mp[1];
  return out;
}

function isErrorToolResult(result: any): boolean {
  if (result == null) return false;
  if (typeof result === "string") {
    const t = result.toLowerCase();
    return /\b(error|failed|fail|404|not.?found|exception|invalid)\b/.test(t);
  }
  if (typeof result === "object") {
    const r: any = result;
    if (r.error || r.errors) return true;
    if (typeof r.status === "number" && r.status >= 400) return true;
    if (typeof r.status_code === "number" && r.status_code >= 400) return true;
    const ok = r.ok ?? r.success;
    if (ok === false) return true;
    try { return isErrorToolResult(JSON.stringify(r)); } catch { return false; }
  }
  return false;
}

interface ApplyOutcome { job_id: string; profile_id: string; ok: boolean }

function extractApplyOutcomes(transcript: any): ApplyOutcome[] {
  const out: ApplyOutcome[] = [];
  if (!transcript) return out;
  let items: any[] = [];
  if (Array.isArray(transcript)) items = transcript;
  else if (typeof transcript === "string") {
    try {
      const p = JSON.parse(transcript);
      if (Array.isArray(p)) items = p;
    } catch { return out; }
  } else return out;

  const resultsByCallId = new Map<string, any>();
  for (const it of items) {
    const role = String(it?.role ?? it?.type ?? "").toLowerCase();
    const tcid = it?.tool_call_id ?? it?.id;
    if ((role === "tool" || role === "tool_result" || it?.tool_result) && tcid) {
      resultsByCallId.set(String(tcid), it?.content ?? it?.result ?? it?.output ?? it);
    }
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const toolCalls: any[] = it?.tool_calls ?? (it?.tool_call ? [it.tool_call] : []);
    const inlineName = it?.tool_name ?? it?.name ?? it?.function?.name;
    const candidates: Array<{ name: string; args: any; id?: string; inlineResult?: any }> = [];
    for (const tc of toolCalls) {
      const name = tc?.function?.name ?? tc?.name ?? tc?.tool_name ?? "";
      const args = tc?.function?.arguments ?? tc?.arguments ?? tc?.args ?? tc?.input;
      candidates.push({ name, args, id: tc?.id ?? tc?.tool_call_id });
    }
    if (inlineName && (it?.arguments || it?.args || it?.input)) {
      candidates.push({
        name: inlineName,
        args: it?.arguments ?? it?.args ?? it?.input,
        id: it?.id ?? it?.tool_call_id,
        inlineResult: it?.result ?? it?.output,
      });
    }
    for (const cand of candidates) {
      if (String(cand.name).toLowerCase() !== "apply_job") continue;
      const a = parseToolArgs(cand.args);
      const jobId = String(a.job_id ?? a.jobId ?? "").trim();
      const profileId = String(a.profile_id ?? a.profileId ?? "").trim();
      if (!jobId) continue;
      let result: any = cand.inlineResult;
      if (result == null && cand.id) result = resultsByCallId.get(String(cand.id));
      if (result == null) {
        const next = items[i + 1];
        const nrole = String(next?.role ?? next?.type ?? "").toLowerCase();
        if (next && (nrole === "tool" || nrole === "tool_result" || next?.tool_result)) {
          result = next?.content ?? next?.result ?? next?.output ?? next;
        }
      }
      out.push({ job_id: jobId, profile_id: profileId, ok: !isErrorToolResult(result) });
    }
  }
  return out;
}

function recommendationLookup(recs: any[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const r of recs) {
    if (!r || typeof r !== "object") continue;
    const id = String((r as any).job_id ?? (r as any).id ?? "").trim();
    if (id) map.set(id, r);
  }
  return map;
}

function enrichJob(jobId: string, profileId: string, recMap: Map<string, any>): Record<string, any> {
  const rec = recMap.get(jobId) ?? {};
  const obj: Record<string, any> = { job_id: jobId };
  if (profileId) obj.profile_id = profileId;
  if (rec.role ?? rec.job_role) obj.role = rec.role ?? rec.job_role;
  if (rec.company ?? rec.company_name) obj.company = rec.company ?? rec.company_name;
  if (rec.salary != null) obj.salary = rec.salary;
  if (rec.location != null) obj.location = rec.location;
  const vac = rec.vacancy ?? rec.vacancies ?? rec.num_vacancies;
  if (vac != null) obj.vacancy = vac;
  return obj;
}

function nonEmpty(v: any): boolean {
  if (v == null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return String(v).trim().length > 0;
}

function stripIst(s: string): string {
  return String(s ?? "").replace(/\s*IST\s*$/i, "").trim();
}

function datePart(s: string): string {
  const t = stripIst(s);
  if (!t) return "";
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

function pickLastCall(contact: any): any | null {
  const arr = contact?.calls ?? null;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const completed = arr.filter(isCompletedCall);
  if (completed.length === 0) return null;
  const sorted = [...completed].sort((a, b) => {
    const ta =
      Date.parse(stripIst(pickCallTime(a))) || 0;
    const tb =
      Date.parse(stripIst(pickCallTime(b))) || 0;
    return tb - ta;
  });
  return sorted[0] ?? null;
}

function pickCallTime(call: any): any {
  return call?.call_start_time ?? call?.start_time ?? call?.call_start_time_ist ?? call?.created_at ?? call?.call_time ?? "";
}

function isCompletedCall(call: any): boolean {
  if (!call) return false;
  const callId = asStr(call?.uuid ?? call?.id ?? call?.execution_id ?? "").trim();
  if (!callId) return false;
  const status = normalize(asStr(call?.status ?? call?.call_status ?? call?.state ?? ""));
  if (["pending", "queued", "scheduled", "in_progress", "running", "started"].includes(status)) {
    return false;
  }
  return true;
}

// ---------- region detection ----------
type Region = { region: string; language: string; city: string };

function detectRegionFromText(s: string): Region | null {
  const t = (s || "").toLowerCase();
  if (/(^|[^a-z])ka([^a-z]|$)|kannada|hubli|dharwad|karnataka/.test(t))
    return { region: "KA", language: "Kannada", city: "Hubli-Dharwad" };
  if (/(^|[^a-z])gzb([^a-z]|$)|hindi|ghaziabad|uttar.?pradesh/.test(t))
    return { region: "GZB", language: "Hindi", city: "Ghaziabad" };
  return null;
}

function detectRegionForContact(
  contact: any,
  fallbacks: { batchName?: string; agentName?: string; program?: string },
): Region {
  const args = contact?.agent_args ?? contact?.metadata ?? contact?.args ?? {};
  const explicit =
    args?._region ?? args?.region ?? contact?.region ?? contact?._region ?? "";
  const fromExplicit = detectRegionFromText(String(explicit));
  if (fromExplicit) return fromExplicit;
  const cityHint = args?.city_campaign ?? args?.city ?? contact?.city_campaign ?? "";
  const fromCity = detectRegionFromText(String(cityHint));
  if (fromCity) return fromCity;
  for (const txt of [fallbacks.batchName, fallbacks.agentName, fallbacks.program]) {
    const r = detectRegionFromText(String(txt ?? ""));
    if (r) return r;
  }
  return { region: "", language: "", city: "" };
}

// ---------- format helpers (master-sheet-exact) ----------
function fmtPhone(v: any): string {
  const digits = String(v ?? "").replace(/\D+/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function fmtInt(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return String(Math.trunc(n));
}

function fmtDateTimeIst(v: any): string {
  // "YYYY-MM-DD HH:MM:SS" — Raya gives "YYYY-MM-DD HH:MM:SS IST" or ISO; strip IST + ms.
  const raw = stripIst(String(v ?? "")).replace(/T/, " ");
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T]?(\d{2}:\d{2}:\d{2})?/);
  if (m) return m[2] ? `${m[1]} ${m[2]}` : m[1];
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function fmtDateTimeIstFromApi(v: any): string {
  const raw = stripIst(String(v ?? "")).replace(/T/, " ");
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T]?(\d{2}:\d{2}:\d{2})?/);
  if (m) return `${m[1]} ${m[2] ?? "00:00:00"}`;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function fmtDateOnly(v: any): string {
  const raw = stripIst(String(v ?? "")).replace(/T/, " ");
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

function yesNo(v: any, fallback = false): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v > 0 ? "Yes" : "No";
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return fallback ? "Yes" : "No";
  if (["yes", "y", "true", "1", "completed", "success"].includes(s)) return "Yes";
  if (["no", "n", "false", "0", "none", "null", "undefined"].includes(s)) return "No";
  return fallback ? "Yes" : "No";
}

// Raya's per-call outcome string is the source of truth — pass through, only
// normalize obvious aliases. Falls back to derived bucket if Raya omitted it.
function rayaOutcomeOrDerive(
  rayaOutcome: string,
  fallback: { contactStatus: string; durationSec: number; applied: boolean; jobsShown: boolean; engaged: boolean },
): string {
  const t = String(rayaOutcome ?? "").trim();
  if (t) return t;
  const s = normalize(fallback.contactStatus);
  if (s === "pending") return "Pending";
  if (fallback.durationSec <= 0) return "No Answer";
  if (fallback.applied || fallback.jobsShown || fallback.engaged) return "Completed";
  return "Early Disconnect";
}

function computeIntent(opts: {
  durationSec: number;
  applied: boolean;
  triedToApply: boolean;
  jobsShown: boolean;
  userIntent: string;
}): { score: number; reasoning: string } {
  const d = opts.durationSec;
  let dur = 0;
  if (d >= 180) dur = 4;
  else if (d >= 120) dur = 3;
  else if (d >= 60) dur = 2;
  else if (d >= 30) dur = 1;
  let app = 0;
  if (opts.applied) app = 4;
  else if (opts.triedToApply) app = 2;
  let eng = 0;
  if (opts.jobsShown) eng += 1;
  if (nonEmpty(opts.userIntent)) eng += 1;
  const score = dur + app + eng;
  // Master format: "Duration {s}s (+{d})|Application (+{a})|Engagement (+{e}) → {total}/10"
  const reasoning =
    `Duration ${d}s (+${dur})|Application (+${app})|Engagement (+${eng}) → ${score}/10`;
  return { score, reasoning };
}

// ---------- per-contact row builder ----------
interface LaunchMeta {
  campaignDay?: string | null;
  campaignDate?: string | null;
  campaignType?: string | null;
  language?: string | null;
  cityCampaign?: string | null;
  region?: string | null;
  batchName?: string | null;
  agentName?: string | null;
}
interface InputRow {
  contact_name?: string | null;
  recommendations?: string | null;
  user_intent?: string | null;
  raw?: Record<string, any> | null;
}
interface BuildCtx {
  columns: string[];
  program: ProgramId;
  batchName: string;
  agentName: string;
  launchMeta: LaunchMeta;
  inputByPhone: Map<string, InputRow>;
}

function buildRow(contact: any, lastCall: any, ctx: BuildCtx): string[] | null {
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
    lastCall?.call_recording_url
      ?? lastCall?.recording_url
      ?? lastCall?.enhanced_recording_url
      ?? lastCall?.recording
      ?? "",
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
  const campaignDate = fmtDateOnly(lm.campaignDate) || datePart(callDateIst) || new Date().toISOString().slice(0, 10);
  const dayNum = (campaignDay.match(/\d+/) || ["1"])[0];
  const campaignType = String(lm.campaignType ?? "").trim() || `${ctx.program.toUpperCase()}_${region.language || ""}_Day${dayNum}`;

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
    company_name: asStr(callOutput?.company_name ?? contactArgs?.company_name ?? getInput("company_name")),
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
    const fb = (contact as any)?.[col] ?? (contact as any)?.[nk] ?? contactArgs?.[col] ?? contactArgs?.[nk];
    return asStr(fb);
  });
}

// ---------- fetch all batch contacts ----------
async function fetchAllBatchContacts(batchId: string): Promise<any[]> {
  const pageSize = 200;
  const maxPages = 20;
  const out: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    const res = (await rayaFetch(
      `/batch/${encodeURIComponent(batchId)}/contacts?${qs.toString()}`,
      { method: "GET" },
    )) as any;
    const items: any[] =
      res?.contacts ?? res?.items ?? res?.data ?? (Array.isArray(res) ? res : []);
    out.push(...items);
    if (items.length < pageSize) break;
    await delay(500);
  }
  return out;
}

async function fetchCallDetail(callId: string): Promise<any | null> {
  if (!callId) return null;
  try {
    return (await rayaFetch(`/call/${encodeURIComponent(callId)}`, { method: "GET" })) as any;
  } catch (e) {
    console.warn("[raya-export] call detail unavailable", callId, e instanceof Error ? e.message : String(e));
    return null;
  }
}

function mergeCallDetail(call: any, detail: any | null): any {
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

async function nextCampaignDay(c: ReturnType<typeof sb>, program: ProgramId): Promise<string> {
  const { data: rows } = await c
    .from("launched_batches")
    .select("campaign_day")
    .eq("program", program)
    .order("created_at", { ascending: false })
    .limit(100);
  let maxN = 0;
  for (const r of rows ?? []) {
    const m = String((r as any).campaign_day ?? "").match(/(\d+)/);
    if (m) maxN = Math.max(maxN, Number(m[1]));
  }
  return `Day ${maxN + 1}`;
}

function campaignTypeFor(program: ProgramId, language: string, campaignDay: string): string {
  const dayNum = (String(campaignDay).match(/\d+/) || ["1"])[0];
  return `${program.toUpperCase()}_${language || ""}_Day${dayNum}`;
}

// ---------- main export ----------
export const exportBatchToStaging = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { program: ProgramId; batchId: string; batchName?: string; agentName?: string }) => {
      if (!d.program) throw new Error("program required");
      if (!d.batchId) throw new Error("batchId required");
      return d;
    },
  )
  .handler(async ({ data }) => {
    if (!process.env.RAYA_API_KEY) throw new Error("RAYA_API_KEY not set");

    const c = sb();
    const { data: target, error: te } = await c
      .from("program_export_targets")
      .select("*")
      .eq("program", data.program)
      .maybeSingle();
    if (te) throw new Error(te.message);
    if (!target || !target.sheet_id) {
      throw new Error(
        "No staging sheet configured for this program. Add one in Settings → Results export sheet (staging).",
      );
    }
    if (!target.enabled) throw new Error("Staging export is disabled for this program.");

    // SAFETY: never write to a master.
    const { data: masters, error: me } = await c
      .from("sheet_connections")
      .select("sheet_id,name,program");
    if (me) throw new Error(me.message);
    const clash = (masters ?? []).find(
      (m) => String(m.sheet_id).trim() === String(target.sheet_id).trim(),
    );
    if (clash) {
      throw new Error(
        `Refusing to export — staging sheet matches the master in Connections (${clash.name ?? clash.program}). Update Settings with a different sheet.`,
      );
    }

    const config = registry[data.program];
    if (!config) throw new Error(`Unknown program: ${data.program}`);
    const columns = config.columns;
    const tab = "Sheet1";
    const sheetId = target.sheet_id;

    // Cleanup: never keep or write to the stray tab that older builds created.
    try { await deleteSheetTab(sheetId, "Staging"); } catch { /* ignore */ }

    let existing: Set<string> = new Set();
    let rowByCallId: Map<string, number> = new Map();
    let hasHeaders = false;
    try {
      const r = await readStagingCallIds(sheetId, tab);
      existing = r.existing;
      rowByCallId = r.rowByCallId;
      hasHeaders = r.hasHeaders;
      if (r.hasHeaders && r.headers.join("\u001f") !== columns.join("\u001f")) {
        await writeStagingHeaders(sheetId, tab, columns);
      }
      try { await deleteSheetTab(sheetId, "Staging"); } catch { /* ignore */ }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await c.from("program_export_targets")
        .update({ last_error: msg })
        .eq("program", data.program);
      throw new Error(`Staging sheet not accessible: ${msg}. Share it with the service account as Editor.`);
    }
    if (!hasHeaders) {
      await writeStagingHeaders(sheetId, tab, columns);
    }

    // Look up launch-time metadata for this batch.
    const { data: lb } = await c
      .from("launched_batches")
      .select("*")
      .eq("batch_id", data.batchId)
      .maybeSingle();
    const contacts = await fetchAllBatchContacts(data.batchId);
    const sampleContact = contacts.find((contact) => pickLastCall(contact)) ?? contacts[0] ?? {};
    const detected = detectRegionForContact(sampleContact, {
      batchName: data.batchName ?? (lb as any)?.batch_name ?? "",
      agentName: data.agentName ?? (lb as any)?.agent_name ?? "",
      program: data.program,
    });
    const campaignDay = (lb as any)?.campaign_day ?? await nextCampaignDay(c, data.program);
    const language = (lb as any)?.language ?? detected.language;
    const launchMeta: LaunchMeta = {
      campaignDay,
      campaignDate: (lb as any)?.campaign_date ?? null,
      campaignType: (lb as any)?.campaign_type ?? campaignTypeFor(data.program, language, campaignDay),
      language,
      cityCampaign: (lb as any)?.city_campaign ?? detected.city,
      region: (lb as any)?.region ?? detected.region,
      batchName: (lb as any)?.batch_name ?? data.batchName ?? null,
      agentName: (lb as any)?.agent_name ?? data.agentName ?? null,
    };
    if (!(lb as any)?.batch_id || !(lb as any)?.campaign_day || !(lb as any)?.campaign_type) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: metaError } = await supabaseAdmin.from("launched_batches").upsert({
        batch_id: data.batchId,
        program: data.program,
        agent_name: launchMeta.agentName,
        batch_name: launchMeta.batchName,
        campaign_day: launchMeta.campaignDay,
        campaign_date: launchMeta.campaignDate,
        campaign_type: launchMeta.campaignType,
        language: launchMeta.language,
        city_campaign: launchMeta.cityCampaign,
        region: launchMeta.region,
        updated_at: new Date().toISOString(),
      }, { onConflict: "batch_id" });
      if (metaError) throw new Error(metaError.message);
    }

    const inputByPhone = new Map<string, InputRow>();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: inputRows } = await supabaseAdmin
        .from("launched_batch_inputs")
        .select("normalized_phone,contact_name,recommendations,user_intent,raw")
        .eq("batch_id", data.batchId);
      for (const r of inputRows ?? []) {
        inputByPhone.set(String((r as any).normalized_phone), r as InputRow);
      }
    } catch (e) {
      console.warn("[raya-export] input rows unavailable", e instanceof Error ? e.message : String(e));
    }

    const ctx: BuildCtx = {
      columns,
      program: data.program,
      batchName: data.batchName ?? launchMeta.batchName ?? "",
      agentName: data.agentName ?? launchMeta.agentName ?? "",
      launchMeta,
      inputByPhone,
    };

    const rows: string[][] = [];
    const updates: Array<{ rowNumber: number; values: string[] }> = [];
    const allRowsForStatus: string[][] = [];
    let skippedNoCall = 0;
    let skippedDup = 0;
    let skippedNoId = 0;
    for (const contact of contacts) {
      let lastCall = pickLastCall(contact);
      if (!lastCall) { skippedNoCall++; continue; }
      const callIdForDetail = asStr(lastCall?.uuid ?? lastCall?.id ?? lastCall?.execution_id ?? "");
      lastCall = mergeCallDetail(lastCall, await fetchCallDetail(callIdForDetail));
      await delay(350);
      const row = buildRow(contact, lastCall, ctx);
      if (!row) { skippedNoId++; continue; }
      allRowsForStatus.push(row);
      // call_id position in columns
      const idIdx = columns.findIndex((c) => normalize(c) === "call_id");
      const callId = idIdx >= 0 ? row[idIdx] : "";
      if (!callId) { skippedNoId++; continue; }
      if (existing.has(callId)) {
        skippedDup++;
        const rowNumber = rowByCallId.get(callId);
        if (rowNumber) updates.push({ rowNumber, values: row });
        continue;
      }
      existing.add(callId);
      rows.push(row);
    }

    let appended = 0;
    let updated = 0;
    if (rows.length > 0) {
      appended = await appendStagingRows(sheetId, tab, rows);
    }
    if (updates.length > 0) {
      updated = await updateStagingRows(sheetId, tab, updates);
    }

    await c.from("program_export_targets")
      .update({ last_exported_at: new Date().toISOString(), last_error: null })
      .eq("program", data.program);

    return {
      appended,
      updated,
      totalContacts: contacts.length,
      completed: contacts.length - skippedNoCall,
      skippedNoCall,
      skippedDup,
      skippedNoId,
      sheetId,
      tab,
      header: columns,
      populatedColumns: columns.filter((_, i) => allRowsForStatus.some((row) => String(row[i] ?? "").trim() !== "")),
      emptyColumns: columns.filter((_, i) => !allRowsForStatus.some((row) => String(row[i] ?? "").trim() !== "")),
      rayaFields: {
        contact: Object.keys(sampleContact ?? {}).sort(),
        call: Object.keys(pickLastCall(sampleContact) ?? {}).sort(),
        call_output: Object.keys((pickLastCall(sampleContact) as any)?.call_output ?? {}).sort(),
      },
      sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
    };
  });
