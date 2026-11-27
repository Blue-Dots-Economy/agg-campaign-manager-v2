import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { fromSqlNames, sqlNamed, type SqlNamedInsert } from "@/server/db/columns";
import { campaignRequests } from "@/server/db/schema";
import { parseInput } from "@/lib/validation";
import {
  campaignRequestListSchema,
  campaignRequestPatchSchema,
  campaignRequestSchema,
  campaignRequestStatusSchema,
} from "./campaign-request-input";

export type { CampaignRequestInput } from "./campaign-request-input";

type CampaignRequestPatch = Partial<SqlNamedInsert<typeof campaignRequests>>;

/** Stores a campaign request for a JFC or admin to review. */
export const submitCampaignRequest = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.requestCampaign)])
  .validator(parseInput(z.object({ request: campaignRequestSchema })))
  .handler(async ({ data, context }): Promise<{ ok: boolean; id: string | null }> => {
    const r = data.request;
    const [ins] = await getDb()
      .insert(campaignRequests)
      .values({
        program: r.program,
        agentId: r.agent_id,
        agentName: r.agent_name ?? null,
        batchName: r.batch_name,
        campaignDay: r.campaign_day ?? null,
        campaignDate: r.campaign_date ?? null,
        campaignType: r.campaign_type ?? null,
        region: r.region ?? null,
        language: r.language ?? null,
        cityCampaign: r.city_campaign ?? null,
        channel: r.channel ?? "outbound",
        source: r.source ?? null,
        cohortIntent: r.cohort_intent ?? null,
        cohortFilters: r.cohort_filters ?? null,
        contacts: r.contacts,
        contactCount: r.contacts.length,
        schedule: r.schedule ?? null,
        concurrency: r.concurrency ?? null,
        maxRetries: r.max_retries ?? null,
        retryAfterHrs: r.retry_after_hrs ?? null,
        selectedStatuses: r.selected_statuses ?? null,
        requestedBy: context.user.email,
        status: "pending",
        note: r.note ?? null,
      })
      .returning({ id: campaignRequests.id });
    return { ok: true, id: ins?.id ?? null };
  });

/** Lists campaign requests, newest first, optionally by status and program. */
export const listCampaignRequests = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.launch)])
  .validator(parseInput(campaignRequestListSchema))
  .handler(async ({ data }) => {
    return getDb()
      .select(sqlNamed(campaignRequests))
      .from(campaignRequests)
      .where(
        and(
          data.status ? eq(campaignRequests.status, data.status) : undefined,
          data.program ? eq(campaignRequests.program, data.program) : undefined,
        ),
      )
      .orderBy(desc(campaignRequests.createdAt));
  });

/** Changes the editable fields of a pending campaign request. */
export const updateCampaignRequest = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.launch)])
  .validator(parseInput(z.object({ id: z.string().uuid(), patch: campaignRequestPatchSchema })))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const patch: CampaignRequestPatch = { ...data.patch, updated_at: new Date().toISOString() };
    await getDb()
      .update(campaignRequests)
      .set(fromSqlNames(campaignRequests, patch))
      .where(and(eq(campaignRequests.id, data.id), eq(campaignRequests.status, "pending")));
    return { ok: true };
  });

/** Approves or declines a campaign request and records the reviewer. */
export const setCampaignRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.launch)])
  .validator(parseInput(campaignRequestStatusSchema))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const patch: CampaignRequestPatch = {
      status: data.status,
      updated_at: new Date().toISOString(),
      reviewer_email: context.user.email,
    };
    if (data.batch_id) patch.batch_id = data.batch_id;
    if (data.decline_reason) patch.decline_reason = data.decline_reason;
    await getDb()
      .update(campaignRequests)
      .set(fromSqlNames(campaignRequests, patch))
      .where(eq(campaignRequests.id, data.id));
    return { ok: true };
  });
