// Pure rules behind the launch wizard: step gating, campaign naming, contacts and Raya replies.
import type { CohortContact, CohortIntent } from "@/lib/cohort";
import { regionInfo } from "@/lib/launch/csv";

/** Wizard steps in order; the index is the step number used by the page. */
export const LAUNCH_STEPS = [
  "Program",
  "Agent",
  "Audience",
  "Schedule",
  "Concurrency",
  "Review",
  "Launch",
] as const;

/** Where the audience comes from: an uploaded CSV or a cohort built from the seekers list. */
export type AudienceSource = "upload" | "cohort";

/** One contact row the server accepted from an uploaded CSV. */
export interface ValidContactRow {
  name: string;
  phone: string;
  cc: string;
  extras: Record<string, string>;
  rowIndex: number;
}

/** Server report on an uploaded contact CSV (`validateContacts`). */
export interface ValidationReport {
  total: number;
  valid: number;
  invalid: number;
  missingCols: string[];
  problems: { row: number; reason: string; phone?: string; name?: string }[];
  validRows: ValidContactRow[];
}

/** Contact sent to Raya and stored with the batch; extra CSV columns ride along. */
export interface LaunchContact {
  contact_name: string;
  contact_phone: string;
  country_code: string;
  _region: string;
  [extra: string]: string;
}

/** Highest concurrency the wizard offers, whatever the account has free. */
export const MAX_CONCURRENCY = 100;

/** Free concurrency at or below which the usage banner turns amber. */
export const LOW_CONCURRENCY_WARNING = 5;

/** Raya error rows quoted in a launch error message; the rest are counted. */
export const BATCH_ERROR_SAMPLE_SIZE = 5;

/** Contact statuses Raya calls when none is selected. */
export const DEFAULT_CALL_STATUSES = ["Pending"];

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Builds the campaign type label, for example `SEEKERS_Hindi_DriveApplications_Day3`.
 * The batch name defaults to it so the two line up in reports.
 */
export function buildCampaignType(input: {
  program: string;
  region: string;
  campaignDay: string;
  source: AudienceSource;
  cohortIntent: CohortIntent;
}): string {
  const lang = regionInfo(input.region).language || input.region || "";
  const dayNum = input.campaignDay.match(/\d+/)?.[0] ?? "1";
  const intentTag =
    input.source === "cohort"
      ? input.cohortIntent === "drive"
        ? "DriveApplications"
        : "FillInfo"
      : "";
  return `${input.program.toUpperCase()}_${lang}_${intentTag ? intentTag + "_" : ""}Day${dayNum}`;
}

/** Lists ISO weekdays (1 = Mon … 7 = Sun) as short names in week order, or "—" when none. */
export function dayLabels(days: number[]): string {
  return (
    days
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DAY_NAMES[d] ?? "")
      .join(", ") || "—"
  );
}

/** Turns the chosen audience into the contacts sent to Raya, tagged with the region. */
export function toLaunchContacts(
  source: AudienceSource,
  cohortContacts: CohortContact[],
  validRows: ValidContactRow[] | undefined,
  region: string,
): LaunchContact[] {
  if (source === "cohort") return cohortContacts.map((c) => ({ ...c, _region: region }));
  return (validRows ?? []).map((r) => ({
    contact_name: r.name,
    contact_phone: r.phone,
    country_code: r.cc,
    ...r.extras,
    _region: region,
  }));
}

/** True when the requested concurrency is more than the account has free. */
export function exceedsAvailable(concurrency: number, available: number): boolean {
  return Number.isFinite(available) && concurrency > available;
}

/** Upper bound for the concurrency input: what is free, capped at `MAX_CONCURRENCY`, at least 1. */
export function concurrencyInputMax(available: number): number {
  return Math.max(
    1,
    Math.min(MAX_CONCURRENCY, Number.isFinite(available) ? available : MAX_CONCURRENCY),
  );
}

/** Everything the wizard checks before it lets the user move past a step. */
export interface StepGateInput {
  step: number;
  program: string;
  agentId: string;
  source: AudienceSource;
  cohortCount: number;
  report: ValidationReport | null;
  proceedInvalid: boolean;
  schedule: { startTime: string; endTime: string; days: number[] };
  concurrency: number;
  maxRetries: number;
  retryAfterHrs: number;
  available: number;
}

/** Whether the "Next" button is enabled on the current step. */
export function canAdvance(s: StepGateInput): boolean {
  if (s.step === 0) return !!s.program;
  if (s.step === 1) return !!s.agentId;
  if (s.step === 2) {
    if (s.source === "cohort") return s.cohortCount > 0;
    if (!s.report) return false;
    if (s.report.missingCols.length > 0) return false;
    if (s.report.invalid === 0) return true;
    return s.proceedInvalid;
  }
  if (s.step === 3) return s.schedule.startTime < s.schedule.endTime && s.schedule.days.length > 0;
  if (s.step === 4) {
    if (!(s.concurrency > 0 && s.maxRetries >= 0 && s.retryAfterHrs > 0)) return false;
    if (exceedsAvailable(s.concurrency, s.available)) return false;
    return true;
  }
  return true;
}

/** Raya's reason for refusing a batch, as returned by `rayaCreateBatch`. */
export interface BatchValidation {
  message: string;
  totalRows?: unknown;
  invalidRows?: unknown;
  errors?: { row?: unknown; field?: unknown; message?: unknown }[];
}

/** Builds the error shown when Raya refuses a batch: the message, counts and a few failing rows. */
export function formatBatchValidationError(v: BatchValidation): string {
  const errors = v.errors ?? [];
  const sample = errors
    .slice(0, BATCH_ERROR_SAMPLE_SIZE)
    .map(
      (er) =>
        `row ${er.row ?? "?"}${er.field ? ` · ${er.field}` : ""}${er.message ? `: ${er.message}` : ""}`,
    )
    .join("\n");
  const more =
    errors.length > BATCH_ERROR_SAMPLE_SIZE
      ? `\n…and ${errors.length - BATCH_ERROR_SAMPLE_SIZE} more`
      : "";
  const counts =
    typeof v.invalidRows === "number" ? ` (${v.invalidRows} invalid of ${v.totalRows ?? "?"})` : "";
  return `${v.message}${counts}${sample ? `\n${sample}${more}` : ""}`;
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

/** Reads the batch status from Raya's start reply, or "started" when it has none. */
export function startedBatchStatus(started: unknown): string {
  const status = field(started, "status") ?? field(field(started, "batch"), "status") ?? "started";
  return String(status);
}
