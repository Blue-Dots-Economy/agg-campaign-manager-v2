// CallRow type shared across the app. Live data is fetched from connected
// Google Sheets via `fetchProgramRows` — there is no mock fallback.

export interface CallRow {
  campaign_day: string;
  campaign_date: string;
  campaign_type: string;
  language: string;
  call_id: string;
  phone: string;
  call_duration_seconds: number;
  call_datetime_ist: string;
  call_outcome: string;
  call_answered: boolean;
  call_engaged: boolean;
  applied_to_job: boolean;
  applications_count: number;
  jobs_shown: boolean;
  primary_topic: string;
  call_language: string;
  call_recording_url: string;
  final_summary: string;
  call_transcript: string;
  tried_to_apply: boolean;
  drop_reason: string;
  city_campaign: string;
  seeker_name: string;
  user_intent: string;
  jobs_recommended: string[];
  jobs_applied: string[];
  jobs_failed_to_apply: string[];
  "Intent Score": number;
  "Intent Score Reasoning": string;
  // DKB-only fields (optional; coexist for simplicity)
  counselled?: boolean;
  interview_scheduled?: boolean;
  course_interest?: string;
  trade?: string;
  counsellor_id?: string;
  candidate_name?: string;
  /** Raw header→value map from the source sheet. Use for program-specific columns. */
  raw?: Record<string, string>;
}
