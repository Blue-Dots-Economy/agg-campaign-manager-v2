// Account-wide concurrency budget across all Raya batches.
// Raya gives ONE pool (default 20) shared by every agent / program.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { programAgents } from "@/server/db/schema";
import { isRecord, parseInput } from "@/server/validation";
import { CONCURRENCY_CAP_DEFAULT } from "./concurrency-cap";
import { errorMessage } from "./errors";
import { delay, rayaFetch } from "./raya-api";

/** Batches requested per agent; enough to cover every batch an agent runs at once. */
const BATCH_PAGE_SIZE = 100;

/** Pause between agents, to stay under Raya's request-rate limit. */
const AGENT_CHECK_SPACING_MS = 400;

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

/** Reads the batch list out of a Raya response, which uses `items`, `data`, `batches` or a bare array. */
function batchItems(parsed: unknown): Record<string, unknown>[] {
  const list = isRecord(parsed)
    ? (parsed.items ?? parsed.data ?? parsed.batches)
    : Array.isArray(parsed)
      ? parsed
      : undefined;
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

async function rayaListAgentBatches(agentId: string): Promise<Record<string, unknown>[]> {
  const qs = new URLSearchParams({ agent_id: agentId, page_size: String(BATCH_PAGE_SIZE) });
  return batchItems(await rayaFetch(`/batch?${qs.toString()}`, { method: "GET" }));
}

function pickConcurrency(item: Record<string, unknown>): number {
  const nested = (key: string) => {
    const v = item[key];
    return isRecord(v) ? v.concurrency : undefined;
  };
  const c =
    item.concurrency ??
    item.max_concurrency ??
    item.parallel_calls ??
    item.parallelCalls ??
    nested("schedule") ??
    nested("settings") ??
    0;
  const n = Number(c);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Sums the concurrency of every active Raya batch against the account cap. */
export const getConcurrencyUsage = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.dashboard)])
  .inputValidator(parseInput(z.object({ cap: z.number().optional() }).optional()))
  .handler(async ({ data }) => {
    const requested = data?.cap;
    const cap =
      requested !== undefined && Number.isFinite(requested) && requested > 0
        ? requested
        : CONCURRENCY_CAP_DEFAULT;

    if (!process.env.RAYA_API_KEY) {
      return {
        cap,
        used: 0,
        available: cap,
        batches: [] satisfies ActiveBatch[],
        error: "RAYA_API_KEY not set",
      };
    }

    let agents: Array<{ program: string; agent_id: string; name: string }>;
    try {
      agents = await getDb()
        .select({
          program: programAgents.program,
          agent_id: programAgents.agentId,
          name: programAgents.name,
        })
        .from(programAgents);
    } catch (e) {
      return {
        cap,
        used: 0,
        available: cap,
        batches: [] satisfies ActiveBatch[],
        error: errorMessage(e),
      };
    }

    const active: ActiveBatch[] = [];
    // Sequential to respect Raya's API request-rate limit; avoid parallel bursts across agents.
    for (const a of agents) {
      try {
        const items = await rayaListAgentBatches(a.agent_id);
        for (const item of items) {
          const status = String(item.status ?? "")
            .toLowerCase()
            .trim();
          if (!ACTIVE_STATUSES.has(status)) continue;
          const concurrency = pickConcurrency(item);
          if (concurrency <= 0) continue;
          active.push({
            program: a.program,
            agentName: a.name,
            agentId: a.agent_id,
            batchId: String(item.id ?? item.batch_id ?? item.batchId ?? ""),
            batchName: String(item.name ?? item.batch_name ?? "—"),
            concurrency,
            status,
          });
        }
      } catch (e) {
        const { logEvent } = await import("@/server/log.server");
        logEvent("warn", {
          operation: "raya.concurrencyUsage",
          status: "skipped",
          agent_id: a.agent_id,
          error: e,
        });
      }
      await delay(AGENT_CHECK_SPACING_MS);
    }

    const used = active.reduce((s, b) => s + b.concurrency, 0);
    const available = Math.max(0, cap - used);
    return { cap, used, available, batches: active };
  });
