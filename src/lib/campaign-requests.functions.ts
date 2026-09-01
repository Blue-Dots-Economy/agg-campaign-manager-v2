import { createServerFn } from "@tanstack/react-start";

async function sb() {
  const { sbFor } = await import("@/lib/db.server");
  return sbFor();
}

export interface CampaignRequestInput {
  program: string;
  agent_id: string;
  agent_name?: string | null;
  batch_name: string;
  campaign_day?: string | null;
  campaign_date?: string | null;
  campaign_type?: string | null;
  region?: string | null;
  language?: string | null;
  city_campaign?: string | null;
  channel?: string | null;
  source?: string | null;
  cohort_intent?: string | null;
  cohort_filters?: Record<string, unknown> | null;
  contacts: Array<Record<string, unknown>>;
  schedule?: Record<string, unknown> | null;
  concurrency?: number | null;
  max_retries?: number | null;
  retry_after_hrs?: number | null;
  selected_statuses?: string[] | null;
  requested_by?: string | null;
  note?: string | null;
}

export const submitCampaignRequest = createServerFn({ method: "POST" })
  .inputValidator((data: { request: CampaignRequestInput }) => data)
  .handler(async ({ data }): Promise<{ ok: boolean; id: string | null }> => {
    const r = data.request;
    if (!r.agent_id) throw new Error("Missing agent.");
    if (!r.contacts?.length) throw new Error("No contacts to request.");
    const client = await sb();
    const row = {
      program: r.program, agent_id: r.agent_id, agent_name: r.agent_name ?? null,
      batch_name: r.batch_name, campaign_day: r.campaign_day ?? null, campaign_date: r.campaign_date ?? null,
      campaign_type: r.campaign_type ?? null, region: r.region ?? null, language: r.language ?? null,
      city_campaign: r.city_campaign ?? null, channel: r.channel ?? "outbound",
      source: r.source ?? null, cohort_intent: r.cohort_intent ?? null, cohort_filters: r.cohort_filters ?? null,
      contacts: r.contacts, contact_count: r.contacts.length, schedule: r.schedule ?? null,
      concurrency: r.concurrency ?? null, max_retries: r.max_retries ?? null, retry_after_hrs: r.retry_after_hrs ?? null,
      selected_statuses: r.selected_statuses ?? null, requested_by: r.requested_by ?? null, status: "pending",
      note: r.note ?? null,
    };
    const { data: ins, error } = await client.from("campaign_requests").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (ins as { id: string }).id };
  });

export const listCampaignRequests = createServerFn({ method: "GET" })
  .inputValidator((data: { status?: string; program?: string }) => data)
  .handler(async ({ data }) => {
    const client = await sb();
    let q = client.from("campaign_requests").select("*").order("created_at", { ascending: false });
    if (data?.status) q = q.eq("status", data.status);
    if (data?.program) q = q.eq("program", data.program);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateCampaignRequest = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; patch: Record<string, unknown> }) => data)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const client = await sb();
    const allowed = ["schedule", "concurrency", "max_retries", "retry_after_hrs", "selected_statuses", "batch_name", "campaign_day", "campaign_date"];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in data.patch) patch[k] = (data.patch as Record<string, unknown>)[k];
    patch["updated_at"] = new Date().toISOString();
    const { error } = await client.from("campaign_requests").update(patch).eq("id", data.id).eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCampaignRequestStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; status: string; reviewer_email?: string; batch_id?: string; decline_reason?: string }) => data)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const client = await sb();
    const patch: Record<string, unknown> = { status: data.status, updated_at: new Date().toISOString() };
    if (data.reviewer_email) patch["reviewer_email"] = data.reviewer_email;
    if (data.batch_id) patch["batch_id"] = data.batch_id;
    if (data.decline_reason) patch["decline_reason"] = data.decline_reason;
    const { error } = await client.from("campaign_requests").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
