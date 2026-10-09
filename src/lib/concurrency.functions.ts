// Account-wide concurrency budget across all Raya batches.
// Raya gives ONE pool (default 20) shared by every agent / program.

import { createServerFn } from "@tanstack/react-start";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { programAgents } from "@/server/db/schema";
import { delay, rayaFetch } from "./raya-api";

export const CONCURRENCY_CAP_DEFAULT = 20;

const ACTIVE_STATUSES = new Set([
  "running",
  "scheduled",
  "processing",
  "in_progress",
  "in progress",
  "active",
  "queued",
  "pending",
  "started",
  "live",
]);

interface ActiveBatch {
  program: string;
  agentName: string;
  agentId: string;
  batchId: string;
  batchName: string;
  concurrency: number;
  status: string;
}

async function rayaListAgentBatches(agentId: string): Promise<any[]> {
  const qs = new URLSearchParams({ agent_id: agentId, page_size: "100" });
  const parsed = await rayaFetch(`/batch?${qs.toString()}`, { method: "GET" }) as any;
  const items: any[] =
    parsed?.items ?? parsed?.data ?? parsed?.batches ?? (Array.isArray(parsed) ? parsed : []);
  return items;
}

function pickConcurrency(item: any): number {
  const c =
    item?.concurrency ??
    item?.max_concurrency ??
    item?.parallel_calls ??
    item?.parallelCalls ??
    item?.schedule?.concurrency ??
    item?.settings?.concurrency ??
    0;
  const n = Number(c);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const getConcurrencyUsage = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.dashboard)])
  .inputValidator((d: { cap?: number }) => d ?? {})
  .handler(async ({ data }) => {
    const cap = Number.isFinite(data?.cap) && (data!.cap as number) > 0
      ? (data!.cap as number)
      : CONCURRENCY_CAP_DEFAULT;

    if (!process.env.RAYA_API_KEY) {
      return { cap, used: 0, available: cap, batches: [] as ActiveBatch[], error: "RAYA_API_KEY not set" };
    }

    let agents: Array<{ program: string; agent_id: string; name: string }>;
    try {
      agents = await getDb()
        .select({ program: programAgents.program, agent_id: programAgents.agentId, name: programAgents.name })
        .from(programAgents);
    } catch (e) {
      return { cap, used: 0, available: cap, batches: [] as ActiveBatch[], error: e instanceof Error ? e.message : String(e) };
    }

    const active: ActiveBatch[] = [];
    // Sequential to respect Raya's API request-rate limit; avoid parallel bursts across agents.
    for (const a of agents ?? []) {
      try {
        const items = await rayaListAgentBatches(a.agent_id);
        for (const item of items) {
          const status = String(item?.status ?? "").toLowerCase().trim();
          if (!ACTIVE_STATUSES.has(status)) continue;
          const concurrency = pickConcurrency(item);
          if (concurrency <= 0) continue;
          active.push({
            program: String(a.program),
            agentName: String(a.name ?? a.agent_id),
            agentId: String(a.agent_id),
            batchId: String(item.id ?? item.batch_id ?? item.batchId ?? ""),
            batchName: String(item.name ?? item.batch_name ?? "—"),
            concurrency,
            status,
          });
        }
      } catch (e) {
        console.warn("[raya] concurrency usage check skipped an agent", {
          agentId: a.agent_id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      await delay(400);
    }

    const used = active.reduce((s, b) => s + b.concurrency, 0);
    const available = Math.max(0, cap - used);
    return { cap, used, available, batches: active };
  });
