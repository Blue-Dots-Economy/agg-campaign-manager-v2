// Pure mapping of Raya batch and contact data into the live-campaign view.

export interface LiveBatch {
  batchId: string;
  batchName: string;
  agentId: string;
  agentName: string;
  status: string;
  concurrency: number;
  maxRetries: number | null;
  retryAfterHrs: number | null;
  total: number;
  dialed: number;
  pickedUp: number;
  pending: number;
  inProgress: number;
  completed: number;
  unanswered: number;
  failed: number;
  schedule: any;
  createdAt: string | null;
  startedAt: string | null;
  raw: any;
}

export function normalizeStatus(s: any): string {
  return String(s ?? "")
    .toLowerCase()
    .trim();
}

export function pickNum(item: any, ...keys: string[]): number {
  for (const k of keys) {
    const v = item?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v && !isNaN(Number(v))) return Number(v);
  }
  return 0;
}

export function extractStatusCounts(item: any) {
  // Raya batch object often includes counts like total_contacts, completed, pending, etc.
  // Try a variety of keys and fall back to 0.
  const counts = item?.status_counts ?? item?.statusCounts ?? item?.counts ?? item?.summary ?? {};
  const total =
    pickNum(item, "total_contacts", "totalContacts", "total", "contacts_count") ||
    pickNum(counts, "total");
  const pending = pickNum(counts, "Pending", "pending");
  const inProgress = pickNum(
    counts,
    "In Progress",
    "InProgress",
    "in_progress",
    "Calling",
    "calling",
  );
  const completed = pickNum(counts, "Completed", "completed");
  const unanswered = pickNum(counts, "Unanswered", "unanswered");
  const failed = pickNum(counts, "Failed", "failed");
  const pickedUp =
    pickNum(counts, "PickedUp", "Picked Up", "picked_up", "Answered", "answered") || completed;
  const dialed = total
    ? Math.max(0, total - pending)
    : inProgress + completed + unanswered + failed;
  return { total, pending, inProgress, completed, unanswered, failed, pickedUp, dialed };
}

export function toLiveBatch(item: any, agentId: string, agentName: string): LiveBatch {
  const counts = extractStatusCounts(item);
  return {
    batchId: String(item?.id ?? item?.batch_id ?? item?.batchId ?? ""),
    batchName: String(item?.name ?? item?.batch_name ?? "—"),
    agentId,
    agentName,
    status: normalizeStatus(item?.status),
    concurrency:
      pickNum(item, "concurrency", "max_concurrency", "parallel_calls", "parallelCalls") || 0,
    maxRetries: typeof item?.max_retries === "number" ? item.max_retries : null,
    retryAfterHrs: typeof item?.retry_after_hrs === "number" ? item.retry_after_hrs : null,
    ...counts,
    schedule: item?.schedule ?? null,
    createdAt: item?.created_at ?? item?.createdAt ?? null,
    startedAt: item?.started_at ?? item?.startedAt ?? null,
    raw: item,
  };
}

export const STATUS_PRIORITY: Record<string, number> = {
  running: 0,
  in_progress: 0,
  "in progress": 0,
  processing: 0,
  active: 0,
  live: 0,
  started: 0,
  scheduled: 1,
  queued: 1,
  pending: 1,
  stopping: 2,
  paused: 3,
  completed: 4,
  finished: 4,
  stopped: 5,
  failed: 6,
};

export interface BatchContactLite {
  name: string;
  phone: string;
  status: string;
  duration: number;
  updatedAt: string | null;
}

export interface BatchLiveDetail {
  batchId: string;
  batchName: string;
  agentName: string;
  status: string;
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  unanswered: number;
  failed: number;
  pickedUp: number;
  dialed: number;
  concurrency: number;
  maxRetries: number | null;
  retryAfterHrs: number | null;
  schedule: any;
  createdAt: string | null;
  startedAt: string | null;
  recent: BatchContactLite[];
}

export function contactStatus(c: any): string {
  return String(c?.status ?? c?.call_status ?? "").trim();
}
export function contactDuration(c: any): number {
  const v = c?.call_duration_seconds ?? c?.duration_seconds ?? c?.duration ?? c?.call_duration ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function sortLiveBatches(all: LiveBatch[]): LiveBatch[] {
  return [...all].sort((x, y) => {
    const px = STATUS_PRIORITY[x.status] ?? 9;
    const py = STATUS_PRIORITY[y.status] ?? 9;
    if (px !== py) return px - py;
    const cx = x.createdAt ? Date.parse(x.createdAt) : 0;
    const cy = y.createdAt ? Date.parse(y.createdAt) : 0;
    return cy - cx;
  });
}

export function buildLiveDetail(
  data: { batchId: string; batchName?: string; agentName?: string },
  contacts: any[],
  batchMeta: any,
  totalReported: number,
): BatchLiveDetail {
  let pending = 0,
    inProgress = 0,
    completed = 0,
    unanswered = 0,
    failed = 0,
    pickedUp = 0;
  for (const c of contacts) {
    const s = contactStatus(c).toLowerCase();
    if (s === "pending") pending++;
    else if (s.includes("progress") || s === "calling" || s === "in_progress") inProgress++;
    else if (s === "completed" || s === "answered") completed++;
    else if (s === "unanswered" || s === "no_answer" || s === "no answer") unanswered++;
    else if (s === "failed" || s === "error") failed++;
    if (contactDuration(c) > 0 || s === "completed" || s === "answered") pickedUp++;
  }

  const total = totalReported || contacts.length;
  const dialed = Math.max(0, total - pending);

  // Sort recent by updated/created desc
  const sorted = [...contacts].sort((a, b) => {
    const ta = Date.parse(a?.updated_at ?? a?.last_call_at ?? a?.created_at ?? "") || 0;
    const tb = Date.parse(b?.updated_at ?? b?.last_call_at ?? b?.created_at ?? "") || 0;
    return tb - ta;
  });
  const recent: BatchContactLite[] = sorted.slice(0, 10).map((c) => ({
    name: String(c?.contact_name ?? c?.name ?? "—"),
    phone: String(c?.contact_phone ?? c?.phone ?? ""),
    status: contactStatus(c) || "—",
    duration: contactDuration(c),
    updatedAt: c?.updated_at ?? c?.last_call_at ?? c?.created_at ?? null,
  }));

  const detail: BatchLiveDetail = {
    batchId: data.batchId,
    batchName: String(batchMeta?.name ?? batchMeta?.batch_name ?? data.batchName ?? "—"),
    agentName: String(batchMeta?.agent_name ?? data.agentName ?? "—"),
    status: normalizeStatus(batchMeta?.status),
    total,
    pending,
    inProgress,
    completed,
    unanswered,
    failed,
    pickedUp,
    dialed,
    concurrency: pickNum(batchMeta, "concurrency", "max_concurrency", "parallel_calls"),
    maxRetries: typeof batchMeta?.max_retries === "number" ? batchMeta.max_retries : null,
    retryAfterHrs:
      typeof batchMeta?.retry_after_hrs === "number" ? batchMeta.retry_after_hrs : null,
    schedule: batchMeta?.schedule ?? null,
    createdAt: batchMeta?.created_at ?? batchMeta?.createdAt ?? null,
    startedAt: batchMeta?.started_at ?? batchMeta?.startedAt ?? null,
    recent,
  };
  return detail;
}
