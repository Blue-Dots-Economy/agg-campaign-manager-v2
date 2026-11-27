// Pure mapping of Raya batch and contact data into the live-campaign view.
import { z } from "zod";
import { JsonObjectSchema, type JsonObject, type JsonValue } from "@/lib/json";
import { asRecord, first, textOrNull, type RayaItem, type RayaRecord } from "./raya-record";

/** One Raya batch as shown on the campaigns page. */
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
  schedule: JsonValue | null;
  createdAt: string | null;
  startedAt: string | null;
  raw: JsonObject;
}

/** Placeholder for a missing name. */
const MISSING = "—";
/** Contacts listed under "recent calls" in the batch detail. */
const RECENT_CONTACTS = 10;
/** Sort rank for statuses not in STATUS_PRIORITY: after every known status. */
const UNKNOWN_STATUS_RANK = 9;

/** Returns `v` when it is a number, else null. */
function numberOrNull(v: JsonValue | undefined): number | null {
  return typeof v === "number" ? v : null;
}

/** Lowercases and trims a Raya status. */
export function normalizeStatus(s: JsonValue | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .trim();
}

/** Returns the first of `keys` holding a finite number or numeric text, else 0. */
export function pickNum(item: RayaItem, ...keys: string[]): number {
  for (const k of keys) {
    const v = item?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
}

/** Reads per-status contact counts from a Raya batch, trying the key names Raya has used. */
export function extractStatusCounts(item: RayaItem) {
  const counts = asRecord(first(item, "status_counts", "statusCounts", "counts", "summary"));
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

/** Maps a Raya batch to the campaigns page shape. */
export function toLiveBatch(item: JsonObject, agentId: string, agentName: string): LiveBatch {
  const counts = extractStatusCounts(item);
  return {
    batchId: String(first(item, "id", "batch_id", "batchId") ?? ""),
    batchName: String(first(item, "name", "batch_name") ?? MISSING),
    agentId,
    agentName,
    status: normalizeStatus(item.status),
    concurrency: pickNum(item, "concurrency", "max_concurrency", "parallel_calls", "parallelCalls"),
    maxRetries: numberOrNull(item.max_retries),
    retryAfterHrs: numberOrNull(item.retry_after_hrs),
    ...counts,
    schedule: item.schedule ?? null,
    createdAt: textOrNull(first(item, "created_at", "createdAt")),
    startedAt: textOrNull(first(item, "started_at", "startedAt")),
    raw: item,
  };
}

/** Sort rank per batch status: running first, then scheduled, stopping, paused, done, stopped, failed. */
export const STATUS_PRIORITY: Readonly<Record<string, number>> = {
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

/** One recent contact in the batch detail. */
export interface BatchContactLite {
  name: string;
  phone: string;
  status: string;
  duration: number;
  updatedAt: string | null;
}

/** Live progress of one batch, counted from its contacts. */
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
  schedule: JsonValue | null;
  createdAt: string | null;
  startedAt: string | null;
  recent: BatchContactLite[];
}

/** Returns a contact's call status as Raya wrote it. */
export function contactStatus(c: RayaItem): string {
  return String(first(c, "status", "call_status") ?? "").trim();
}

/** Returns a contact's call duration in seconds, or 0. */
export function contactDuration(c: RayaItem): number {
  const v = first(c, "call_duration_seconds", "duration_seconds", "duration", "call_duration") ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Orders batches by status rank, then newest first. */
export function sortLiveBatches(all: LiveBatch[]): LiveBatch[] {
  return [...all].sort((x, y) => {
    const px = STATUS_PRIORITY[x.status] ?? UNKNOWN_STATUS_RANK;
    const py = STATUS_PRIORITY[y.status] ?? UNKNOWN_STATUS_RANK;
    if (px !== py) return px - py;
    const cx = x.createdAt ? Date.parse(x.createdAt) : 0;
    const cy = y.createdAt ? Date.parse(y.createdAt) : 0;
    return cy - cx;
  });
}

/** Returns the time a contact last changed, as text, or null. */
function contactUpdatedAt(c: RayaRecord): string | null {
  return textOrNull(first(c, "updated_at", "last_call_at", "created_at"));
}

/**
 * Counts a batch's contacts by status and lists the most recent ones.
 *
 * @param data - Batch id plus names known by the page, used when Raya sends none.
 * @param batchMeta - Batch object from the contacts reply, when Raya sends one.
 * @param totalReported - Contact total reported by Raya; 0 when unknown.
 */
export function buildLiveDetail(
  data: { batchId: string; batchName?: string; agentName?: string },
  contacts: RayaRecord[],
  batchMeta: JsonObject | null,
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

  const sorted = [...contacts].sort((a, b) => {
    const ta = Date.parse(contactUpdatedAt(a) ?? "") || 0;
    const tb = Date.parse(contactUpdatedAt(b) ?? "") || 0;
    return tb - ta;
  });
  const recent: BatchContactLite[] = sorted.slice(0, RECENT_CONTACTS).map((c) => ({
    name: String(first(c, "contact_name", "name") ?? MISSING),
    phone: String(first(c, "contact_phone", "phone") ?? ""),
    status: contactStatus(c) || MISSING,
    duration: contactDuration(c),
    updatedAt: contactUpdatedAt(c),
  }));

  return {
    batchId: data.batchId,
    batchName: String(first(batchMeta, "name", "batch_name") ?? data.batchName ?? MISSING),
    agentName: String(first(batchMeta, "agent_name") ?? data.agentName ?? MISSING),
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
    maxRetries: numberOrNull(batchMeta?.max_retries),
    retryAfterHrs: numberOrNull(batchMeta?.retry_after_hrs),
    schedule: batchMeta?.schedule ?? null,
    createdAt: textOrNull(first(batchMeta, "created_at", "createdAt")),
    startedAt: textOrNull(first(batchMeta, "started_at", "startedAt")),
    recent,
  };
}

const RayaList = z.array(JsonObjectSchema);
const Count = z.union([z.number(), z.string()]).nullish();

/** Raya's batch list reply: a bare array or a wrapper object. */
export const BatchListReplySchema = z.union([
  RayaList,
  z.object({
    items: RayaList.optional(),
    data: RayaList.optional(),
    batches: RayaList.optional(),
  }),
]);

/** Returns the batches in a batch list reply. */
export function batchItems(reply: z.infer<typeof BatchListReplySchema>): JsonObject[] {
  if (Array.isArray(reply)) return reply;
  return reply.items ?? reply.data ?? reply.batches ?? [];
}

/** One page of Raya's batch contacts reply: a bare array or a wrapper with batch details. */
export const BatchContactsPageSchema = z.union([
  RayaList,
  z.object({
    contacts: RayaList.optional(),
    items: RayaList.optional(),
    data: RayaList.optional(),
    batch: JsonObjectSchema.nullish(),
    batch_info: JsonObjectSchema.nullish(),
    total: Count,
    total_count: Count,
    pagination: z.object({ total: Count }).nullish(),
  }),
]);

/** One page of batch contacts. */
export type BatchContactsPage = z.infer<typeof BatchContactsPageSchema>;

/** Returns the contacts on one page. */
export function pageContacts(page: BatchContactsPage): JsonObject[] {
  if (Array.isArray(page)) return page;
  return page.contacts ?? page.items ?? page.data ?? [];
}

/** Returns the batch details sent with a page, if any. */
export function pageBatchMeta(page: BatchContactsPage): JsonObject | null {
  if (Array.isArray(page)) return null;
  return page.batch ?? page.batch_info ?? null;
}

/** Returns the contact total Raya reports on a page, or 0. */
export function pageTotal(page: BatchContactsPage): number {
  if (Array.isArray(page)) return 0;
  return Number(page.total ?? page.total_count ?? page.pagination?.total ?? 0);
}
