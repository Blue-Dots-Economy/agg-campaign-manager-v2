// Live campaign reads from Raya. Sequential + delayed to respect the rate limit.

import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { programAgents } from "@/server/db/schema";
import { delay, rayaFetch } from "./raya-api.server";
import type { ProgramId } from "@/programs/registry";
import {
  buildLiveDetail,
  sortLiveBatches,
  toLiveBatch,
  type BatchContactLite,
  type BatchLiveDetail,
  type LiveBatch,
} from "./raya-live-batches";

export type { BatchContactLite, BatchLiveDetail, LiveBatch };

export const listProgramLiveBatches = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.campaigns)])
  .inputValidator((d: { program: ProgramId }) => {
    if (!d.program) throw new Error("program required");
    return d;
  })
  .handler(async ({ data }) => {
    if (!process.env.RAYA_API_KEY) {
      return { ok: false as const, batches: [] as LiveBatch[], error: "RAYA_API_KEY not set" };
    }
    let agents: Array<{ agent_id: string; name: string }>;
    try {
      agents = await getDb()
        .select({ agent_id: programAgents.agentId, name: programAgents.name })
        .from(programAgents)
        .where(eq(programAgents.program, data.program));
    } catch (e) {
      return {
        ok: false as const,
        batches: [] as LiveBatch[],
        error: e instanceof Error ? e.message : String(e),
      };
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
    return { ok: true as const, batches: sortLiveBatches(all), error: null };
  });

export const getBatchLiveDetail = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.campaigns)])
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

    return buildLiveDetail(data, contacts, batchMeta, totalReported);
  });
