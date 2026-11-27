// Readers for the JSON columns of a campaign request (schedule, cohort filters, statuses, contacts).
import { z } from "zod";
import type { ScheduleState } from "@/components/ScheduleEditor";

/** Schedule used when a request has none, or a field is missing. */
const FALLBACK_SCHEDULE: ScheduleState = {
  timezone: "Asia/Kolkata",
  startTime: "09:00",
  endTime: "18:00",
  days: [1, 2, 3, 4, 5],
};

/** Status filter used when a request has no stored statuses. */
const FALLBACK_STATUSES = ["Pending"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const nonEmptyString = (v: unknown): string | undefined =>
  typeof v === "string" && v ? v : undefined;

/** Editor state for a stored request schedule; missing or unreadable fields take the fallback. */
export function scheduleFromJson(value: unknown): ScheduleState {
  const s = isRecord(value) ? value : {};
  const days = Array.isArray(s.days)
    ? s.days.filter((d): d is number => typeof d === "number")
    : [];
  return {
    timezone: nonEmptyString(s.timezone) ?? FALLBACK_SCHEDULE.timezone,
    startTime: nonEmptyString(s.start_time) ?? FALLBACK_SCHEDULE.startTime,
    endTime: nonEmptyString(s.end_time) ?? FALLBACK_SCHEDULE.endTime,
    days: days.length > 0 ? days : FALLBACK_SCHEDULE.days,
  };
}

/** One-line summary of the cohort filters: the profile statuses, else the confidence band, else `null`. */
export function cohortFiltersLine(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const statuses = Array.isArray(value.profileStatuses)
    ? value.profileStatuses.filter((s): s is string => typeof s === "string")
    : [];
  if (statuses.length > 0) return statuses.join(", ");
  const band = nonEmptyString(value.confidenceBand);
  return band ? `Confidence: ${band}` : null;
}

/** Stored retry statuses as strings; the fallback when none are stored. */
export function selectedStatusesFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return FALLBACK_STATUSES;
  return value.filter((s): s is string => typeof s === "string");
}

const BatchContactsSchema = z.array(
  z
    .object({ contact_name: z.string(), contact_phone: z.string(), country_code: z.string() })
    .catchall(z.unknown()),
);

/** A contact as the batch launch sends it to Raya. */
export type BatchContact = z.infer<typeof BatchContactsSchema>[number];

/** The request's contacts in the shape a batch launch needs, or `null` when they do not have it. */
export function batchContacts(value: unknown): BatchContact[] | null {
  const parsed = BatchContactsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
