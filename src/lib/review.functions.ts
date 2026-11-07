import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { ProgramId } from "@/programs/registry";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { fromSqlNames } from "@/server/db/columns";
import { callRows, sheetConnections, transcriptReviews } from "@/server/db/schema";
import { parseInput } from "@/server/validation";
import { isRecord, programIdSchema } from "@/lib/input-schemas";
import {
  getCallDetail,
  readStagingCallIds,
  writeStagingHeaders,
  appendStagingRows,
  readReviewedIdsForEmail,
  readAllReviewedIds,
} from "./sheets.server";

/** Program whose calls are reviewed. */
export type ReviewDataset = ProgramId;

/** Most calls the review list loads for one program. */
const MAX_REVIEW_CALLS = 100_000;

/** Master-sheet tab that holds every submitted review. */
const FEEDBACK_TAB = "Feedback Responses";

const callIdText = z.string().max(200);

async function resolveSheet(
  dataset: ReviewDataset,
  channel?: string,
): Promise<{ sheet_id: string; tab_name: string | null }> {
  const rows = await getDb()
    .select({
      sheet_id: sheetConnections.sheetId,
      tab_name: sheetConnections.tabName,
      channel: sheetConnections.channel,
    })
    .from(sheetConnections)
    .where(and(eq(sheetConnections.program, dataset), eq(sheetConnections.enabled, true)));
  if (rows.length === 0) throw new Error(`No enabled sheet connection for dataset '${dataset}'`);
  const want = channel ?? "outbound";
  const pick =
    rows.find((r) => (r.channel ?? "outbound") === want) ??
    rows.find((r) => (r.channel ?? "outbound") === "outbound") ??
    rows[0];
  if (!pick) throw new Error(`No enabled sheet connection for dataset '${dataset}'`);
  return { sheet_id: pick.sheet_id, tab_name: pick.tab_name ?? null };
}

/** Lists the calls of a program for the review page. */
export const fetchReviewCalls = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.dashboard)])
  .inputValidator(parseInput(z.object({ dataset: programIdSchema })))
  .handler(async ({ data }): Promise<Array<Record<string, string>>> => {
    const rows = await getDb()
      .select({
        call_id: callRows.callId,
        campaign_day: callRows.campaignDay,
        campaign_date: callRows.campaignDate,
        campaign_type: callRows.campaignType,
        language: callRows.language,
        city_campaign: callRows.cityCampaign,
        call_outcome: callRows.callOutcome,
        call_duration_seconds: callRows.callDurationSeconds,
        intent_score: callRows.intentScore,
        drop_reason: callRows.dropReason,
        job_status: callRows.jobStatus,
        phone: callRows.phone,
        channel: callRows.channel,
        data: callRows.data,
      })
      .from(callRows)
      .where(eq(callRows.program, data.dataset))
      .orderBy(asc(callRows.callId))
      .limit(MAX_REVIEW_CALLS);
    return rows.map((r) => {
      const d = isRecord(r.data) ? r.data : {};
      const raw = isRecord(d.raw) ? d.raw : {};
      const pick = (...keys: string[]) => {
        for (const k of keys) {
          const v = d[k] ?? raw[k];
          if (v !== undefined && v !== null && String(v) !== "") return String(v);
        }
        return "";
      };
      return {
        call_id: r.call_id != null ? String(r.call_id) : "",
        job_id: pick("job_id"),

        campaign_day: r.campaign_day != null ? String(r.campaign_day) : "",
        campaign_date: r.campaign_date != null ? String(r.campaign_date) : "",
        campaign_type: r.campaign_type != null ? String(r.campaign_type) : "",
        language: r.language != null ? String(r.language) : "",
        city_campaign: r.city_campaign != null ? String(r.city_campaign) : "",
        call_outcome: r.call_outcome != null ? String(r.call_outcome) : "",
        call_duration_seconds:
          r.call_duration_seconds != null ? String(r.call_duration_seconds) : "",
        call_datetime_ist: pick("call_datetime_ist"),
        intent_score: r.intent_score != null ? String(r.intent_score) : "",
        drop_reason: r.drop_reason != null ? String(r.drop_reason) : "",
        job_status: r.job_status != null ? String(r.job_status) : "",
        channel: r.channel != null ? String(r.channel) : "outbound",
        call_recording_url: "",
      };
    });
  });

/** Returns the transcript and summary of one call from its sheet. */
export const fetchCallDetail = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.campaigns)])
  .inputValidator(parseInput(z.object({ dataset: programIdSchema, callId: callIdText })))
  .handler(async ({ data }) => {
    const [row] = await getDb()
      .select({ channel: callRows.channel })
      .from(callRows)
      .where(and(eq(callRows.program, data.dataset), eq(callRows.callId, data.callId)))
      .limit(1);
    const channel = row?.channel ?? "outbound";
    const { sheet_id, tab_name } = await resolveSheet(data.dataset, channel);
    const detail = await getCallDetail(sheet_id, tab_name ?? undefined, data.callId);
    return (
      detail ?? { call_transcript: "", final_summary: "", call_recording_url: "", effectiveTab: "" }
    );
  });

/** Lists which calls have been reviewed and by whom. */
export const fetchReviewMap = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.dashboard)])
  .handler(async () => {
    return getDb()
      .select({
        call_id: transcriptReviews.callId,
        job_id: transcriptReviews.jobId,
        reviewer_email: transcriptReviews.reviewerEmail,
      })
      .from(transcriptReviews);
  });

/** Lists the call and job ids one reviewer has reviewed. */
export const fetchReviewedCallIds = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(
    parseInput(z.object({ email: z.string().max(320), program: programIdSchema.optional() })),
  )
  .handler(async ({ data }): Promise<string[]> => {
    const email = (data.email || "").trim().toLowerCase();
    if (!email) return [];
    const ids = new Set<string>();
    const rows = await getDb()
      .select({ call_id: transcriptReviews.callId, job_id: transcriptReviews.jobId })
      .from(transcriptReviews)
      .where(eq(transcriptReviews.reviewerEmail, email));
    for (const r of rows) {
      if (r.call_id) ids.add(String(r.call_id));
      if (r.job_id) ids.add(String(r.job_id));
    }
    // 2) Master sheet "Feedback Responses" tab (durable append-only log). Never throws.
    if (data.program) {
      try {
        const { sheet_id } = await resolveSheet(data.program);
        const sheetIds = await readReviewedIdsForEmail(sheet_id, FEEDBACK_TAB, email);
        for (const v of sheetIds) ids.add(v);
      } catch {
        // The database ids are enough; the sheet is a secondary copy.
      }
    }
    return Array.from(ids);
  });

/** Every call_id/job_id reviewed by ANY reviewer for a program (DB ∪ sheet). */
export const fetchAllReviewedCallIds = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.dashboard)])
  .inputValidator(parseInput(z.object({ program: programIdSchema })))
  .handler(async ({ data }): Promise<string[]> => {
    const ids = new Set<string>();
    // 1) transcript_reviews for this program (+ legacy null-dataset rows)
    const rows = await getDb()
      .select({ call_id: transcriptReviews.callId, job_id: transcriptReviews.jobId })
      .from(transcriptReviews)
      .where(or(eq(transcriptReviews.dataset, data.program), isNull(transcriptReviews.dataset)));
    for (const r of rows) {
      if (r.call_id) ids.add(String(r.call_id));
      if (r.job_id) ids.add(String(r.job_id));
    }
    // 2) Master sheet "Feedback Responses" tab (all reviewers). Never throws.
    try {
      const { sheet_id } = await resolveSheet(data.program);
      const sheetIds = await readAllReviewedIds(sheet_id, FEEDBACK_TAB);
      for (const v of sheetIds) ids.add(v);
    } catch {
      // The database ids are enough; the sheet is a secondary copy.
    }
    return Array.from(ids);
  });

/** Lists the reviews of one call or job, newest first. */
export const fetchExistingReviews = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.dashboard)])
  .inputValidator(
    parseInput(z.object({ callId: callIdText.nullish(), jobId: callIdText.nullish() })),
  )
  .handler(async ({ data }) => {
    const callId = (data.callId ?? "").trim();
    const jobId = (data.jobId ?? "").trim();
    if (!callId && !jobId) return [];
    return getDb()
      .select({
        reviewer_email: transcriptReviews.reviewerEmail,
        reviewer_name: transcriptReviews.reviewerName,
        overall_rating: transcriptReviews.overallRating,
        quantitative_issues: transcriptReviews.quantitativeIssues,
        reviewer_notes: transcriptReviews.reviewerNotes,
        turn_flags: transcriptReviews.turnFlags,
        created_at: transcriptReviews.createdAt,
      })
      .from(transcriptReviews)
      .where(callId ? eq(transcriptReviews.callId, callId) : eq(transcriptReviews.jobId, jobId))
      .orderBy(desc(transcriptReviews.createdAt));
  });

const reviewText = z.string().max(500).nullish();

/** A transcript review as the review page submits it. */
const reviewInputSchema = z.object({
  job_id: callIdText.nullish(),
  call_id: callIdText.nullish(),
  company_name: reviewText,
  campaign_day: reviewText,
  campaign_type: reviewText,
  language: reviewText,
  city_campaign: reviewText,
  contact_phone: reviewText,
  call_outcome: reviewText,
  job_status_in_master: reviewText,
  review_type: reviewText,
  quantitative_issues: z.string().max(5000).nullish(),
  turn_flags: z.string().max(50_000).nullish(),
  overall_rating: z.number().int().min(0).max(5).nullish(),
  reviewer_notes: z.string().max(10_000).nullish(),
  summary_match: reviewText,
  job_status_correct: reviewText,
  output_fields_accurate: reviewText,
  dataset: programIdSchema,
});

/** A transcript review as the browser sends it. */
export type ReviewInput = z.input<typeof reviewInputSchema>;

const FEEDBACK_COLUMNS = [
  "timestamp",
  "reviewer_email",
  "reviewer_name",
  "campaign_day",
  "campaign_type",
  "language",
  "city_campaign",
  "company_name",
  "contact_phone",
  "job_id",
  "call_id",
  "call_outcome",
  "job_status_in_master",
  "quantitative_issues",
  "turn_flags",
  "overall_rating",
  "reviewer_notes",
  "review_type",
  "dataset",
];

/** Stores the signed-in user's review of a call and appends it to the master sheet. */
export const submitReview = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.campaigns)])
  .inputValidator(parseInput(z.object({ review: reviewInputSchema })))
  .handler(async ({ data, context }) => {
    // The reviewer is the signed-in user, never what the browser sends.
    const review = {
      review_type: "transcript",
      ...data.review,
      company_name: "",
      reviewer_email: context.user.email,
      reviewer_name: context.user.email,
    };
    // One review per (call_id, reviewer_email); no unique constraint to upsert on.
    const values = fromSqlNames(transcriptReviews, review);
    const db = getDb();
    await db.transaction(async (tx) => {
      if (review.call_id) {
        await tx
          .delete(transcriptReviews)
          .where(
            and(
              eq(transcriptReviews.callId, review.call_id),
              eq(transcriptReviews.reviewerEmail, review.reviewer_email),
            ),
          );
      }
      await tx.insert(transcriptReviews).values(values);
    });

    // Append to master sheet's "Feedback Responses" tab. Never fail the DB write on a sheet hiccup.
    try {
      const { sheet_id } = await resolveSheet(review.dataset);
      const tab = FEEDBACK_TAB;
      const state = await readStagingCallIds(sheet_id, tab);
      if (!state.hasHeaders) {
        await writeStagingHeaders(sheet_id, tab, FEEDBACK_COLUMNS);
      }
      const timestamp = new Date().toISOString();
      const rec: Record<string, unknown> = { ...review, timestamp };
      const row = FEEDBACK_COLUMNS.map((c) => {
        const v = rec[c];
        return v === null || v === undefined ? "" : String(v);
      });
      await appendStagingRows(sheet_id, tab, [row]);
    } catch (e) {
      const { logEvent } = await import("@/server/log.server");
      logEvent("error", { operation: "review.sheetAppend", status: "failure", error: e });
    }

    return { ok: true };
  });
