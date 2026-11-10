// Rules behind the call review form: issues, turn flags, prefill, bulk queue and feedback text.
import { z } from "zod";

/** A note pinned to one transcript turn (1-based). */
export interface TurnFlag {
  turn: number;
  note: string;
}

/** A previous review of the call, as returned by `fetchExistingReviews`. */
export interface ExistingReview {
  reviewer_email: string | null;
  overall_rating: number | null;
  quantitative_issues: string | null;
  reviewer_notes: string | null;
  turn_flags: string | null;
}

/** Shared admin login; it may look at calls but its reviews would not be credited to a person. */
export const SHARED_ADMIN_EMAIL = "admin@bluedots.com";

/** Issue that means the reviewer found nothing wrong; it excludes every other issue. */
export const NO_ISSUES = "No Issues";

/** Longest reviewer note accepted by the form. */
export const NOTES_MAX_LENGTH = 500;

/** Highest star rating. */
export const MAX_RATING = 5;

/** Reviews per session after which every multiple gets a milestone message and animation. */
export const MILESTONE_EVERY = 10;

/** Reviews per session after which every multiple gets the bigger milestone message. */
export const BIG_MILESTONE_EVERY = 25;

/** Only recordings served from this Raya path are played. */
export const RECORDING_URL_PREFIX = "https://api.getraya.app/call_recording/";

/** sessionStorage key of the bulk review queue (call ids in order). */
export const BULK_QUEUE_STORAGE_KEY = "bulk_review_queue";

/** sessionStorage key of the number of reviews submitted this session. */
export const SESSION_COUNT_STORAGE_KEY = "reviews_done_session";

const ENCOURAGERS = [
  "Nice work!",
  "Another one down!",
  "On a roll!",
  "Great catch!",
  "Keep it going!",
  "Smooth — next!",
];

const RATING_LABELS = ["Not rated", "Very poor", "Poor", "Okay", "Good"];

/** Toast text after a review: batch done, a milestone, or a rotating encouragement. */
export function praise(count: number, hasNext: boolean, total: number): string {
  if (!hasNext) return `Batch complete — you reviewed all ${total}. Incredible work.`;
  if (count > 0 && count % BIG_MILESTONE_EVERY === 0)
    return `${count} reviews this session — you're crushing it!`;
  if (count > 0 && count % MILESTONE_EVERY === 0) return `${count} in a row — you're on fire!`;
  return ENCOURAGERS[count % ENCOURAGERS.length] ?? "";
}

/** Word for a star rating; 5 and above read "Excellent". */
export function ratingLabel(rating: number): string {
  return RATING_LABELS[rating] ?? "Excellent";
}

/** Adds or removes an issue; "No Issues" clears the others and any other issue clears it. */
export function toggleIssue(selected: string[], id: string): string[] {
  if (id === NO_ISSUES) return selected.includes(id) ? [] : [NO_ISSUES];
  const next = selected.filter((x) => x !== NO_ISSUES);
  return next.includes(id) ? next.filter((x) => x !== id) : [...next, id];
}

/** Splits a stored comma-separated issue list. */
export function parseIssueList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

const TurnFlagSchema = z.object({ turn: z.number(), note: z.string() });

/** Reads stored turn flags; returns null when the text is not a JSON array. Malformed entries are dropped. */
export function parseTurnFlags(json: string): TurnFlag[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.flatMap((f: unknown) => {
    const r = TurnFlagSchema.safeParse(f);
    return r.success ? [r.data] : [];
  });
}

/** Form values taken from the reviewer's own previous review; a missing field keeps its default. */
export interface ReviewPrefill {
  issues?: string[];
  flags?: TurnFlag[];
  notes: string;
  rating: number;
}

/** Finds the signed-in reviewer's previous review of the call and turns it into form values. */
export function reviewPrefill(
  reviews: readonly ExistingReview[],
  reviewerEmail: string,
): ReviewPrefill | null {
  const mine = reviews.find((r) => (r.reviewer_email || "").toLowerCase() === reviewerEmail);
  if (!mine) return null;
  return {
    issues: mine.quantitative_issues ? parseIssueList(mine.quantitative_issues) : undefined,
    flags: mine.turn_flags ? (parseTurnFlags(mine.turn_flags) ?? undefined) : undefined,
    notes: mine.reviewer_notes || "",
    rating: mine.overall_rating ?? 0,
  };
}

/** Reason the submit button cannot be used yet, or "" when the review is complete. */
export function submitHint(isAdmin: boolean, issueCount: number, rating: number): string {
  if (isAdmin) return "The admin account can't submit reviews — sign in with your own email";
  if (issueCount === 0) return "Select at least one issue";
  if (rating === 0) return "Add an overall rating to submit";
  return "";
}

/** Returns the recording URL only when it points at Raya's recording path. */
export function safeRecordingUrl(url: unknown): string | undefined {
  return typeof url === "string" && url.startsWith(RECORDING_URL_PREFIX) ? url : undefined;
}

/** Finds a call by call id, then by job id. */
export function findCall<T extends Record<string, string>>(
  calls: readonly T[] | null,
  callId: string,
): T | null {
  return (
    calls?.find((c) => String(c.call_id) === callId) ??
    calls?.find((c) => c.job_id === callId) ??
    null
  );
}

/** The id, or null when blank or missing. */
export function nonBlankId(v: string | undefined): string | null {
  return v && String(v).trim() ? String(v) : null;
}

const BulkQueueSchema = z.array(z.string());

/**
 * Reads the stored bulk review queue.
 *
 * @throws {SyntaxError} If the stored text is not JSON.
 * @throws {z.ZodError} If the stored value is not a list of call ids.
 */
export function parseBulkQueue(raw: string | null): string[] {
  return raw ? BulkQueueSchema.parse(JSON.parse(raw)) : [];
}

/** Reads the stored bulk review queue; an unreadable or wrongly shaped queue counts as empty. */
export function readBulkQueueOrEmpty(raw: string | null): string[] {
  try {
    return parseBulkQueue(raw);
  } catch {
    // A broken queue must not undo a review that is already saved; the run just ends.
    return [];
  }
}

/** Position of the call in the bulk queue for the progress bar (unknown calls count as first). */
export function bulkProgress(
  queue: readonly string[],
  callId: string,
): { idx: number; total: number; next: string | null; pct: number } {
  const idx = Math.max(0, queue.indexOf(callId));
  const next = idx < queue.length - 1 ? (queue[idx + 1] ?? null) : null;
  const pct = queue.length > 0 ? Math.round((idx / queue.length) * 100) : 0;
  return { idx, total: queue.length, next, pct };
}

/** Next call after a submitted review and how many remain after it; null next ends the batch. */
export function nextAfterSubmit(
  queue: readonly string[],
  callId: string,
): { next: string | null; remaining: number } {
  const idx = queue.indexOf(callId);
  const next = idx >= 0 && idx < queue.length - 1 ? (queue[idx + 1] ?? null) : null;
  return { next, remaining: queue.length - (idx + 1) };
}
