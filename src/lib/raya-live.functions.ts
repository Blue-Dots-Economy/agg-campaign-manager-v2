// Live campaign reads from Raya. Calls run one after another with a pause, to stay under Raya's rate limit.

import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { errorMessage } from "@/lib/errors";
import type { JsonObject } from "@/lib/json";
import { registry, type ProgramId } from "@/programs/registry";
import { getDb } from "@/server/db/client.server";
import { programAgents } from "@/server/db/schema";
import { logEvent } from "@/server/log.server";
import { delay, rayaFetch } from "./raya-api.server";
import {
  BatchContactsPageSchema,
  BatchListReplySchema,
  batchItems,
  buildLiveDetail,
  pageBatchMeta,
  pageContacts,
  pageTotal,
  sortLiveBatches,
  toLiveBatch,
  type BatchContactLite,
  type BatchLiveDetail,
  type LiveBatch,
} from "./raya-live-batches";

export type { BatchContactLite, BatchLiveDetail, LiveBatch };

/** Batches read per agent; the campaigns page shows the most recent ones. */
const BATCHES_PER_AGENT = 50;
/** Pause between Raya calls, to stay under Raya's rate limit. */
const RAYA_CALL_GAP_MS = 400;
/** Contacts per page when reading a batch for the live view. */
const LIVE_CONTACTS_PAGE_SIZE = 200;
/** Pages read for the live view, so at most 1,000 contacts are counted. */
const LIVE_CONTACTS_MAX_PAGES = 5;

/** A program id from the program registry. */
const ProgramIdSchema = z
  .string()
  .refine((v): v is ProgramId => Object.hasOwn(registry, v), "Unknown program");

/** Input of `listProgramLiveBatches`. */
export const ListProgramLiveBatchesInput = z.object({ program: ProgramIdSchema });

export const listProgramLiveBatches = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.campaigns)])
  .inputValidator((d: unknown) => ListProgramLiveBatchesInput.parse(d))
  .handler(async ({ data }) => {
    if (!process.env.RAYA_API_KEY) {
      return { ok: false as const, batches: [], error: "RAYA_API_KEY not set" };
    }
    let agents: Array<{ agent_id: string; name: string }>;
    try {
      agents = await getDb()
        .select({ agent_id: programAgents.agentId, name: programAgents.name })
        .from(programAgents)
        .where(eq(programAgents.program, data.program));
    } catch (e) {
      return { ok: false as const, batches: [], error: errorMessage(e) };
    }
    const all: LiveBatch[] = [];
    for (const a of agents) {
      try {
        const qs = new URLSearchParams({
          agent_id: a.agent_id,
          page_size: String(BATCHES_PER_AGENT),
        });
        const reply = await rayaFetch(
          `/batch?${qs.toString()}`,
          { method: "GET" },
          BatchListReplySchema,
        );
        for (const it of batchItems(reply)) {
          const b = toLiveBatch(it, a.agent_id, a.name ?? a.agent_id);
          if (b.batchId) all.push(b);
        }
      } catch (e) {
        logEvent("warn", {
          operation: "raya-live.listProgramLiveBatches",
          status: "skipped",
          agent_id: a.agent_id,
          error: e instanceof Error ? e.name : "Unknown error",
        });
      }
      await delay(RAYA_CALL_GAP_MS);
    }
    return { ok: true as const, batches: sortLiveBatches(all), error: null };
  });

/** Input of `getBatchLiveDetail`; the names are shown when Raya sends none. */
export const GetBatchLiveDetailInput = z.object({
  batchId: z.string().min(1, "batchId required"),
  agentName: z.string().optional(),
  batchName: z.string().optional(),
});

export const getBatchLiveDetail = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.campaigns)])
  .inputValidator((d: unknown) => GetBatchLiveDetailInput.parse(d))
  .handler(async ({ data }) => {
    if (!process.env.RAYA_API_KEY) {
      throw new Error("RAYA_API_KEY not set");
    }

    const contacts: JsonObject[] = [];
    let totalReported = 0;
    let batchMeta: JsonObject | null = null;

    for (let page = 1; page <= LIVE_CONTACTS_MAX_PAGES; page++) {
      const qs = new URLSearchParams({
        page: String(page),
        page_size: String(LIVE_CONTACTS_PAGE_SIZE),
      });
      const reply = await rayaFetch(
        `/batch/${encodeURIComponent(data.batchId)}/contacts?${qs.toString()}`,
        { method: "GET" },
        BatchContactsPageSchema,
      );
      const items = pageContacts(reply);
      batchMeta ??= pageBatchMeta(reply);
      const reported = pageTotal(reply);
      if (reported) totalReported = reported;
      contacts.push(...items);
      if (items.length < LIVE_CONTACTS_PAGE_SIZE) break;
      await delay(RAYA_CALL_GAP_MS);
    }

    return buildLiveDetail(data, contacts, batchMeta, totalReported);
  });
