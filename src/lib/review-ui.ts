export const REVIEW_THRESHOLD = 1;
export type JobReviewStatus = { unique_reviewers: number; is_reviewed: boolean; you_reviewed: boolean };
export type ReviewCall = Record<string, string>;

export function getReviewKey(input: { call_id?: string | number | null; job_id?: string | null }) {
  const callId = input.call_id != null ? String(input.call_id).trim() : "";
  if (callId) return callId;
  return String(input.job_id ?? "").trim();
}

export function buildStatusMap(
  rows: Array<{ call_id: string | null; job_id: string | null; reviewer_email: string | null }>,
  myEmail?: string,
): Map<string, JobReviewStatus> {
  const map = new Map<string, Set<string>>();
  for (const row of rows || []) {
    const key = getReviewKey({ call_id: row.call_id, job_id: row.job_id });
    if (!key) continue;
    const email = String(row.reviewer_email || "").toLowerCase();
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(email);
  }
  const me = (myEmail || "").toLowerCase();
  const out = new Map<string, JobReviewStatus>();
  map.forEach((set, key) =>
    out.set(key, { unique_reviewers: set.size, is_reviewed: set.size >= REVIEW_THRESHOLD, you_reviewed: !!me && set.has(me) }),
  );
  return out;
}
