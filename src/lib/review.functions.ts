import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { fromSqlNames } from "@/server/db/columns";
import { callRows, sheetConnections, transcriptReviews } from "@/server/db/schema";
import {
  getCallDetail,
  readStagingCallIds,
  writeStagingHeaders,
  appendStagingRows,
  readReviewedIdsForEmail,
  readAllReviewedIds,
} from "./sheets.server";

export type ReviewDataset = "seekers" | "providers";

function normKey(h: string): string {
  return String(h ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

async function resolveSheet(
  dataset: ReviewDataset,
  channel?: string,
): Promise<{ sheet_id: string; tab_name: string | null }> {
  const rows = await getDb()
    .select({ sheet_id: sheetConnections.sheetId, tab_name: sheetConnections.tabName, channel: sheetConnections.channel })
    .from(sheetConnections)
    .where(and(eq(sheetConnections.program, dataset), eq(sheetConnections.enabled, true)));
  if (rows.length === 0) throw new Error(`No enabled sheet connection for dataset '${dataset}'`);
  const want = channel ?? "outbound";
  const pick =
    rows.find((r) => (r.channel ?? "outbound") === want) ??
    rows.find((r) => (r.channel ?? "outbound") === "outbound") ??
    rows[0];
  return { sheet_id: pick.sheet_id, tab_name: pick.tab_name ?? null };
}

export const fetchReviewCalls = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.dashboard)])
  .inputValidator((data: { dataset: ReviewDataset }) => data)
  .handler(async ({ data }): Promise<Array<Record<string, string>>> => {
    const rows: Record<string, unknown>[] = await getDb()
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
      .limit(100000);
    return rows.map((r: Record<string, unknown>) => {
      const d = (r.data ?? {}) as Record<string, unknown>;
      const raw = (d.raw ?? {}) as Record<string, unknown>;
      const pick = (...keys: string[]) => {
        for (const k of keys) {
          const v = (d as Record<string, unknown>)[k] ?? (raw as Record<string, unknown>)[k];
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
        call_duration_seconds: r.call_duration_seconds != null ? String(r.call_duration_seconds) : "",
        call_datetime_ist: pick("call_datetime_ist"),
        intent_score: r.intent_score != null ? String(r.intent_score) : "",
        drop_reason: r.drop_reason != null ? String(r.drop_reason) : "",
        job_status: r.job_status != null ? String(r.job_status) : "",
        channel: r.channel != null ? String(r.channel) : "outbound",
        call_recording_url: "",
      } as Record<string, string>;
    });
  });

export const fetchCallDetail = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.campaigns)])
  .inputValidator((data: { dataset: ReviewDataset; callId: string }) => data)
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

export const fetchReviewedCallIds = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator((data: { email: string; program?: ReviewDataset }) => data)
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
        const sheetIds = await readReviewedIdsForEmail(sheet_id, "Feedback Responses", email);
        for (const v of sheetIds) ids.add(v);
      } catch { /* ignore */ }
    }
    return Array.from(ids);
  });

/** Every call_id/job_id reviewed by ANY reviewer for a program (DB ∪ sheet). */
export const fetchAllReviewedCallIds = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.dashboard)])
  .inputValidator((data: { program: ReviewDataset }) => data)
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
      const sheetIds = await readAllReviewedIds(sheet_id, "Feedback Responses");
      for (const v of sheetIds) ids.add(v);
    } catch { /* ignore */ }
    return Array.from(ids);
  });

export const fetchExistingReviews = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.dashboard)])
  .inputValidator((data: { callId?: string | null; jobId?: string | null }) => data)
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

export interface ReviewInput {
  job_id?: string | null;
  call_id?: string | null;
  reviewer_email: string;
  reviewer_name?: string | null;
  company_name?: string | null;
  campaign_day?: string | null;
  campaign_type?: string | null;
  language?: string | null;
  city_campaign?: string | null;
  contact_phone?: string | null;
  call_outcome?: string | null;
  job_status_in_master?: string | null;
  review_type?: string | null;
  quantitative_issues?: string | null;
  turn_flags?: string | null;
  overall_rating?: number | null;
  reviewer_notes?: string | null;
  summary_match?: string | null;
  job_status_correct?: string | null;
  output_fields_accurate?: string | null;
  dataset: ReviewDataset;
}

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

export const submitReview = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.campaigns)])
  .inputValidator((data: { review: ReviewInput }) => data)
  .handler(async ({ data }) => {
    const review: ReviewInput = { review_type: "transcript", ...data.review, company_name: "" };
    // One review per (call_id, reviewer_email); no unique constraint to upsert on.
    const values = fromSqlNames(transcriptReviews, review as unknown as Record<string, unknown>);
    const db = getDb();
    await db.transaction(async (tx) => {
      if (review.call_id) {
        await tx
          .delete(transcriptReviews)
          .where(and(eq(transcriptReviews.callId, review.call_id), eq(transcriptReviews.reviewerEmail, review.reviewer_email)));
      }
      await tx.insert(transcriptReviews).values(values);
    });

    // Append to master sheet's "Feedback Responses" tab. Never fail the DB write on a sheet hiccup.
    try {
      const { sheet_id } = await resolveSheet(review.dataset);
      const tab = "Feedback Responses";
      const state = await readStagingCallIds(sheet_id, tab);
      if (!state.hasHeaders) {
        await writeStagingHeaders(sheet_id, tab, FEEDBACK_COLUMNS);
      }
      const timestamp = new Date().toISOString();
      const rec: Record<string, unknown> = { ...(review as unknown as Record<string, unknown>), timestamp };
      const row = FEEDBACK_COLUMNS.map((c) => {
        const v = rec[c];
        return v === null || v === undefined ? "" : String(v);
      });
      await appendStagingRows(sheet_id, tab, [row]);
    } catch (e) {
      console.error("[submitReview] sheet append failed:", e);
    }

    return { ok: true };
  });
