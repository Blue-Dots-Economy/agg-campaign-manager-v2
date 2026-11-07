// Input schemas for the campaign-request server functions.
import { z } from "zod";
import { JsonObjectSchema } from "@/lib/json";
import { contactSchema, MAX_CONTACTS_PER_BATCH, programIdSchema } from "@/server/validation";

const optText = z.string().max(500).nullish();
const optCount = z.number().int().min(0).nullish();

/** Statuses a campaign request moves through. */
export const CAMPAIGN_REQUEST_STATUSES = ["pending", "approved", "declined"] as const;

/** A campaign request as the launch and request pages submit it. */
export const campaignRequestSchema = z.object({
  program: programIdSchema,
  agent_id: z.string().trim().min(1).max(200),
  agent_name: optText,
  batch_name: z.string().max(500),
  campaign_day: optText,
  campaign_date: optText,
  campaign_type: optText,
  region: optText,
  language: optText,
  city_campaign: optText,
  channel: optText,
  source: optText,
  cohort_intent: optText,
  cohort_filters: JsonObjectSchema.nullish(),
  contacts: z.array(contactSchema).min(1).max(MAX_CONTACTS_PER_BATCH),
  schedule: JsonObjectSchema.nullish(),
  concurrency: optCount,
  max_retries: optCount,
  retry_after_hrs: optCount,
  selected_statuses: z.array(z.string().max(100)).max(50).nullish(),
  note: z.string().max(2000).nullish(),
});

/** A campaign request as the browser sends it. */
export type CampaignRequestInput = z.input<typeof campaignRequestSchema>;

/** The fields a reviewer may change on a pending request; other keys are dropped. */
export const campaignRequestPatchSchema = z
  .object({
    schedule: JsonObjectSchema.nullable(),
    concurrency: optCount,
    max_retries: optCount,
    retry_after_hrs: optCount,
    selected_statuses: z.array(z.string().max(100)).max(50).nullable(),
    batch_name: z.string().max(500),
    campaign_day: z.string().max(100).nullable(),
    campaign_date: z.string().max(40).nullable(),
  })
  .partial();

/** Filters for the campaign request list. */
export const campaignRequestListSchema = z
  .object({
    status: z.enum(CAMPAIGN_REQUEST_STATUSES).optional(),
    program: programIdSchema.optional(),
  })
  .default({});

/** A status change on a campaign request. */
export const campaignRequestStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(CAMPAIGN_REQUEST_STATUSES),
  batch_id: z.string().max(200).optional(),
  decline_reason: z.string().max(1000).optional(),
});
