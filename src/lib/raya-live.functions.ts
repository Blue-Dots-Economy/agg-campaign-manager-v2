// Live campaign reads from Raya. Sequential + delayed to respect the rate limit.

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { delay, rayaFetch } from "./raya-api";
import type { ProgramId } from "@/programs/registry";

function sb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

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

function normalizeStatus(s: any): string {
  return String(s ?? "").toLowerCase().trim();
}

function pickNum(item: any, ...keys: string[]): number {
  for (const k of keys) {
    const v = item?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v && !isNaN(Number(v))) return Number(v);
  }
  return 0;
}

function extractStatusCounts(item: any) {
  // Raya batch object often includes counts like total_contacts, completed, pending, etc.
  // Try a variety of keys and fall back to 0.
  const counts =
    item?.status_counts ?? item?.statusCounts ?? item?.counts ?? item?.summary ?? {};
  const total =
    pickNum(item, "total_contacts", "totalContacts", "total", "contacts_count") ||
    pickNum(counts, "total");
  const pending = pickNum(counts, "Pending", "pending");
  const inProgress = pickNum(counts, "In Progress", "InProgress", "in_progress", "Calling", "calling");
  const completed = pickNum(counts, "Completed", "completed");
  const unanswered = pickNum(counts, "Unanswered", "unanswered");
  const failed = pickNum(counts, "Failed", "failed");
  const pickedUp = pickNum(counts, "PickedUp", "Picked Up", "picked_up", "Answered", "answered") || completed;
  const dialed = total ? Math.max(0, total - pending) : (inProgress + completed + unanswered + failed);
  return { total, pending, inProgress, completed, unanswered, failed, pickedUp, dialed };
}

function toLiveBatch(item: any, agentId: string, agentName: string): LiveBatch {
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

const STATUS_PRIORITY: Record<string, number> = {
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

export const listProgramLiveBatches = createServerFn({ method: "GET" })
  .inputValidator((d: { program: ProgramId }) => {
    if (!d.program) throw new Error("program required");
    return d;
  })
  .handler(async ({ data }) => {
    if (!process.env.RAYA_API_KEY) {
      return { ok: false as const, batches: [] as LiveBatch[], error: "RAYA_API_KEY not set" };
    }
    const c = sb();
    const { data: agents, error } = await c
      .from("program_agents")
      .select("agent_id,name")
      .eq("program", data.program);
    if (error) {
      return { ok: false as const, batches: [] as LiveBatch[], error: error.message };
    }
    const all: LiveBatch[] = [];
    for (const a of agents ?? []) {
      try {
        const qs = new URLSearchParams({ agent_id: a.agent_id, page_size: "50" });
        const parsed = (await rayaFetch(`/batch?${qs.toString()}`, { method: "GET" })) as any;
        const items: any[] =
          parsed?.items ?? parsed?.data ?? parsed?.batches ?? (Array.isArray(parsed) ? parsed : []);
        for (const it of items) {
          const b = toLiveBatch(it, a.agent_id, a.name ?? a.agent_id);
          if (b.batchId) all.push(b);
        }
      } catch (e) {
        console.warn("[raya-live] listProgramLiveBatches agent failed", {
          agentId: a.agent_id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      await delay(400);
    }
    all.sort((x, y) => {
      const px = STATUS_PRIORITY[x.status] ?? 9;
      const py = STATUS_PRIORITY[y.status] ?? 9;
      if (px !== py) return px - py;
      const cx = x.createdAt ? Date.parse(x.createdAt) : 0;
      const cy = y.createdAt ? Date.parse(y.createdAt) : 0;
      return cy - cx;
    });
    return { ok: true as const, batches: all, error: null };
  });

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

function contactStatus(c: any): string {
  return String(c?.status ?? c?.call_status ?? "").trim();
}
function contactDuration(c: any): number {
  const v =
    c?.call_duration_seconds ?? c?.duration_seconds ?? c?.duration ?? c?.call_duration ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const getBatchLiveDetail = createServerFn({ method: "GET" })
  .inputValidator((d: { batchId: string; agentName?: string; batchName?: string }) => {
    if (!d.batchId) throw new Error("batchId required");
    return d;
  })
  .handler(async ({ data }) => {
    if (!process.env.RAYA_API_KEY) {
      throw new Error("RAYA_API_KEY not set");
    }

    // Pull contacts (paginate up to ~5 pages of 200 = 1000 contacts max for live view).
    const pageSize = 200;
    const maxPages = 5;
    const contacts: any[] = [];
    let totalReported = 0;
    let batchMeta: any = null;

    for (let page = 1; page <= maxPages; page++) {
      const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      const res = (await rayaFetch(
        `/batch/${encodeURIComponent(data.batchId)}/contacts?${qs.toString()}`,
        { method: "GET" },
      )) as any;
      const items: any[] =
        res?.contacts ?? res?.items ?? res?.data ?? (Array.isArray(res) ? res : []);
      if (batchMeta == null) batchMeta = res?.batch ?? res?.batch_info ?? null;
      const reported = Number(res?.total ?? res?.total_count ?? res?.pagination?.total ?? 0);
      if (reported) totalReported = reported;
      contacts.push(...items);
      if (items.length < pageSize) break;
      await delay(400);
    }

    let pending = 0, inProgress = 0, completed = 0, unanswered = 0, failed = 0, pickedUp = 0;
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
      retryAfterHrs: typeof batchMeta?.retry_after_hrs === "number" ? batchMeta.retry_after_hrs : null,
      schedule: batchMeta?.schedule ?? null,
      createdAt: batchMeta?.created_at ?? batchMeta?.createdAt ?? null,
      startedAt: batchMeta?.started_at ?? batchMeta?.startedAt ?? null,
      recent,
    };
    return detail;
  });
