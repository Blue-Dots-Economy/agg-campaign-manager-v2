// Program config registry. Add a new program = add a new ProgramConfig here.

export type KpiKey = string;

export interface KpiDef {
  key: KpiKey;
  label: string;
  icon: string; // lucide icon name
  format: "number" | "percent";
  /** Optional target for the progress ring. When omitted, the ring is hidden. */
  target?: number;
}

export interface LaunchStep {
  title: string;
  description: string;
}

export interface ProgramConfig {
  id: "seekers" | "providers";
  label: string;
  subtitle: string;
  brandColor: string;
  sheetCsvUrl: string;
  sheetLabel: string;
  rayaAgentId: string;
  columns: string[];
  kpis: KpiDef[];
  dropReasons: string[];
  launchSteps: LaunchStep[];
  successMetric: "applications" | "interviews";
}

const KKB_COLUMNS = [
  "campaign_day",
  "campaign_date",
  "campaign_type",
  "language",
  "call_id",
  "phone",
  "call_duration_seconds",
  "call_datetime_ist",
  "call_outcome",
  "call_answered",
  "call_engaged",
  "applied_to_job",
  "applications_count",
  "jobs_shown",
  "primary_topic",
  "call_language",
  "call_recording_url",
  "final_summary",
  "call_transcript",
  "tried_to_apply",
  "drop_reason",
  "city_campaign",
  "seeker_name",
  "user_intent",
  "jobs_recommended",
  "jobs_applied",
  "jobs_failed_to_apply",
  "intent_score",
  "intent_score_reasoning",
];

const DKB_COLUMNS = [
  "campaign_day",
  "campaign_date",
  "campaign_type",
  "contact_phone",
  "job_id",
  "city_campaign",
  "language",
  "company_name",
  "job_role_input",
  "num_vacancies_input",
  "city_input",
  "location_input",
  "salary_input",
  "qualification_input",
  "call_id",
  "call_duration_seconds",
  "call_datetime_ist",
  "call_recording_url",
  "call_outcome",
  "call_status",
  "contact_attempts",
  "phases_reached",
  "job_status",
  "job_role_value",
  "num_vacancies_value",
  "salary_value",
  "location_value",
  "qualification_value",
  "fields_updated",
  "new_job_mentioned",
  "new_job_role",
  "new_job_vacancies",
  "new_job_salary",
  "new_job_location",
  "new_job_qualification",
  "new_job_posted",
  "talent_insights_shown",
  "final_summary",
  "call_transcript",
  "drop_reason",
  "intent_score",
  "intent_score_reasoning",
];

export const kkb: ProgramConfig = {
  id: "seekers",
  label: "Seekers",
  subtitle: "",
  brandColor: "#7C3AED",
  sheetCsvUrl: "",
  sheetLabel: "KKB master sheet",
  rayaAgentId: "",
  columns: KKB_COLUMNS,
  successMetric: "applications",
  kpis: [
    { key: "total_calls", label: "Total calls", icon: "Phone", format: "number" },
    { key: "answered_pct", label: "Answered %", icon: "PhoneCall", format: "percent" },
    { key: "engaged_pct", label: "Engaged %", icon: "MessageCircle", format: "percent" },
    { key: "applications", label: "Applications", icon: "FileCheck", format: "number" },
    { key: "high_intent", label: "High-intent (≥5)", icon: "Flame", format: "number" },
  ],
  dropReasons: [
    "early_hangup",
    "user_declined",
    "no_matching_jobs",
    "apply_failed",
    "profile_loop",
    "other",
  ],
  launchSteps: [
    { title: "Upload seeker CSV", description: "Drop the source list of seekers" },
    { title: "Auto-detect region (KA / GZB)", description: "Region inferred from filename" },
    { title: "Match + derive columns", description: "Map to the 29-column KKB schema" },
    { title: "Schedule call window", description: "Pick a date and time window" },
    { title: "Push batch to Raya", description: "Hand off to the voice agent" },
  ],
};

export const dkb: ProgramConfig = {
  id: "providers",
  label: "Providers",
  subtitle: "",
  brandColor: "#6366F1",
  sheetCsvUrl: "",
  sheetLabel: "DKB master sheet",
  rayaAgentId: "",
  columns: DKB_COLUMNS,
  successMetric: "interviews",
  kpis: [
    { key: "total_calls", label: "Total calls", icon: "Phone", format: "number" },
    { key: "answered_pct", label: "Answered %", icon: "PhoneCall", format: "percent" },
    { key: "jobs_verified", label: "Jobs verified", icon: "ShieldCheck", format: "number" },
    { key: "new_jobs_posted", label: "New jobs posted", icon: "Plus", format: "number" },
    { key: "high_intent", label: "High-intent (≥5)", icon: "Flame", format: "number" },
    { key: "talent_insights_shown", label: "Talent insights shown", icon: "Sparkles", format: "number" },
  ],
  dropReasons: [
    "Early Disconnect",
    "No Answer",
    "Completed",
    "Callback Requested",
    "Failure",
  ],
  launchSteps: [
    { title: "Upload employer CSV", description: "Drop the source list of employers / job postings" },
    { title: "Map job & company fields", description: "Match to the DKB verification schema" },
    { title: "Assign verification slot", description: "Pick a window for outbound calls" },
    { title: "Schedule call window", description: "Pick a date and time window" },
    { title: "Push batch to Raya", description: "Hand off to the voice agent" },
  ],
};

export const registry: Record<"seekers" | "providers", ProgramConfig> = { kkb, dkb };
export type ProgramId = keyof typeof registry;
