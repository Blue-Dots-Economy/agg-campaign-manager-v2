// Server functions for Raya batches, agents and test calls. RAYA_API_KEY stays on the server.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { parseInput } from "@/server/validation";
import { MAX_CONTACTS_PER_BATCH } from "@/lib/input-schemas";
import { JsonObjectSchema, JsonValueSchema, type JsonObject } from "@/lib/json";
import { DEFAULT_COUNTRY_CODE, validateContactRows } from "./contact-validation";
import { delay, rayaFetch, RayaApiError } from "./raya-api.server";

/** Most rows accepted by the upload check. */
export const MAX_UPLOAD_ROWS = MAX_CONTACTS_PER_BATCH;
/** Most columns accepted by the upload check. */
export const MAX_UPLOAD_COLUMNS = 200;
/** Wait before starting a batch, so Raya has finished creating it. */
const START_AFTER_CREATE_DELAY_MS = 1_500;
/** Statuses dialled when the caller picks none: freshly uploaded contacts only. */
const DEFAULT_SELECTED_STATUSES = ["Pending"];

const requiredId = (message: string) => z.string().min(1, message);
const optionalCount = z.number().optional();

/** One contact sent to Raya. Extra fields are kept: Raya passes them to the agent. */
export const RayaContactSchema = z
  .object({
    contact_name: z.string(),
    contact_phone: z.string(),
    country_code: z.string().optional(),
  })
  .catchall(z.unknown());

/** One contact sent to Raya. */
export type RayaContact = z.infer<typeof RayaContactSchema>;

/** Daily calling window for a batch. */
export const RayaScheduleSchema = z
  .object({
    /** IANA time zone, for example "Asia/Kolkata". */
    timezone: z.string(),
    /** "HH:mm". */
    start_time: z.string().min(1, "Schedule requires start_time and end_time."),
    /** "HH:mm". */
    end_time: z.string().min(1, "Schedule requires start_time and end_time."),
    /** 1 = Monday … 7 = Sunday. */
    days: z.array(z.number().int().min(1).max(7)).min(1, "Pick at least one day of the week."),
  })
  .refine((s) => s.start_time < s.end_time, {
    message: "end_time must be after start_time.",
    path: ["end_time"],
  });

/** Daily calling window for a batch. */
export type RayaSchedule = z.infer<typeof RayaScheduleSchema>;

/** A Raya reply passed back to the page as it is. Any JSON is accepted, so a write Raya has done is never reported as failed. */
const RayaReply = JsonValueSchema;

const RayaId = z.union([z.string(), z.number()]);
/** Optional reply field; an unexpected type reads as missing. */
const lenient = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().catch(null);
const RayaIds = z.object({
  batchId: lenient(RayaId),
  batch_id: lenient(RayaId),
  id: lenient(RayaId),
});

/**
 * Fields of Raya's batch-creation reply, for both success and row validation errors.
 * Fields are lenient: the batch may already exist, so an odd reply must not fail the launch.
 */
export const CreateBatchReply = z.object({
  status: lenient(z.string()),
  message: lenient(z.string()),
  batchId: lenient(RayaId),
  batch_id: lenient(RayaId),
  id: lenient(RayaId),
  data: lenient(RayaIds),
  batch: lenient(RayaIds),
  totalRows: lenient(z.number()),
  validRows: lenient(z.number()),
  invalidRows: lenient(z.number()),
  contactsInserted: lenient(z.number()),
  errors: z.unknown(),
});
type CreateBatchReply = z.infer<typeof CreateBatchReply>;

/** Returns Raya's row-level validation errors for the page; entries that are not objects are skipped. */
export function validationErrorList(errors: unknown): JsonObject[] {
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((entry: unknown) => {
    const parsed = JsonObjectSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function validationResult(r: CreateBatchReply) {
  return {
    ok: false as const,
    batchId: null,
    validation: {
      message: r.message ?? "Validation failed",
      totalRows: r.totalRows ?? undefined,
      validRows: r.validRows ?? undefined,
      invalidRows: r.invalidRows ?? undefined,
      errors: validationErrorList(r.errors),
    },
  };
}

/** Input of `rayaCreateBatch`. */
export const CreateBatchInput = z.object({
  agentId: requiredId("Missing agent id for this program. Set it in Settings."),
  batchName: requiredId("Missing batch name."),
  contacts: z
    .array(RayaContactSchema)
    .min(1, "No contacts to send.")
    .max(MAX_CONTACTS_PER_BATCH, "Too many contacts for one batch."),
});

/** Creates a Raya batch with the contacts; returns the batch id or Raya's row-level validation errors. */
export const rayaCreateBatch = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.launch)])
  .inputValidator(parseInput(CreateBatchInput))
  .handler(async ({ data }) => {
    const body = {
      agent_id: data.agentId,
      batch_name: data.batchName,
      contacts: data.contacts,
    };
    let r: CreateBatchReply;
    try {
      r =
        (await rayaFetch(
          "/batch",
          { method: "POST", json: body },
          CreateBatchReply.nullable().catch(null),
        )) ?? {};
    } catch (e) {
      // Raya 400 validation: { status: "error", message, errors: [{ row, field, ... }] }
      if (e instanceof RayaApiError) {
        const b = CreateBatchReply.safeParse(e.body);
        if (b.success && (b.data.status === "error" || Array.isArray(b.data.errors))) {
          return validationResult(b.data);
        }
      }
      throw e;
    }

    // Raya answers with camelCase `batchId` (a number); other keys are fallbacks.
    const rawId =
      r.batchId ??
      r.batch_id ??
      r.id ??
      r.data?.batchId ??
      r.data?.batch_id ??
      r.data?.id ??
      r.batch?.id ??
      r.batch?.batchId;

    if (
      r.status === "error" ||
      (!rawId && typeof r.invalidRows === "number" && r.invalidRows > 0)
    ) {
      return validationResult(r);
    }

    if (!rawId) throw new Error("Raya did not return a batchId.");

    return {
      ok: true as const,
      batchId: String(rawId),
      totalRows: r.totalRows ?? undefined,
      validRows: r.validRows ?? undefined,
      invalidRows: r.invalidRows ?? undefined,
      contactsInserted: r.contactsInserted ?? undefined,
      message: r.message ?? undefined,
    };
  });

/** Input of `rayaStartBatch`. */
export const StartBatchInput = z.object({
  batchId: requiredId("Missing batch id."),
  schedule: RayaScheduleSchema.optional(),
  maxRetries: optionalCount,
  retryAfterHrs: optionalCount,
  concurrency: optionalCount,
  selectedStatuses: z.array(z.string()).optional(),
});

/** Starts a created batch with its schedule and retry settings. */
export const rayaStartBatch = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.launch)])
  .inputValidator(parseInput(StartBatchInput))
  .handler(async ({ data }) => {
    await delay(START_AFTER_CREATE_DELAY_MS);
    // Raya requires selected_statuses. Adding "Unanswered" or "Failed" re-calls those contacts.
    const body = {
      ...batchSettings(data),
      selected_statuses: data.selectedStatuses?.length
        ? data.selectedStatuses
        : DEFAULT_SELECTED_STATUSES,
    };
    return rayaFetch(
      `/batch/${encodeURIComponent(data.batchId)}/start`,
      { method: "POST", json: body },
      RayaReply,
    );
  });

/** Maps optional batch settings to Raya's field names, leaving out the ones not given. */
function batchSettings(data: {
  schedule?: RayaSchedule;
  maxRetries?: number;
  retryAfterHrs?: number;
  concurrency?: number;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.schedule) body.schedule = data.schedule;
  if (data.maxRetries !== undefined) body.max_retries = data.maxRetries;
  if (data.retryAfterHrs !== undefined) body.retry_after_hrs = data.retryAfterHrs;
  if (data.concurrency !== undefined) body.concurrency = data.concurrency;
  return body;
}

/** Input of `rayaListAgents`. */
export const ListAgentsInput = z
  .object({ page: z.number().optional(), pageSize: z.number().optional() })
  .optional()
  .default({});

const AgentItem = z.object({
  id: RayaId.nullish(),
  agent_id: RayaId.nullish(),
  _id: RayaId.nullish(),
  name: RayaId.nullish(),
  agent_name: RayaId.nullish(),
  title: RayaId.nullish(),
});
const AgentList = z.array(AgentItem);
const AgentsReply = z.union([
  AgentList,
  z.object({
    agents: AgentList.optional(),
    data: AgentList.optional(),
    items: AgentList.optional(),
    results: AgentList.optional(),
  }),
]);

/** Builds the `?page=…&page_size=…` query string, or "" when neither is set. */
function pageQuery(page?: number, pageSize?: number, extra: Record<string, string> = {}): string {
  const qs = new URLSearchParams(extra);
  if (page) qs.set("page", String(page));
  if (pageSize) qs.set("page_size", String(pageSize));
  const q = qs.toString();
  return q ? `?${q}` : "";
}

/** Lists Raya agents as id and name. */
export const rayaListAgents = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(parseInput(ListAgentsInput))
  .handler(async ({ data }) => {
    const res = await rayaFetch(
      `/agents${pageQuery(data.page, data.pageSize)}`,
      { method: "GET" },
      AgentsReply,
    );
    const list = Array.isArray(res)
      ? res
      : (res.agents ?? res.data ?? res.items ?? res.results ?? []);
    return list
      .map((a) => ({
        id: String(a.id ?? a.agent_id ?? a._id ?? ""),
        name: String(a.name ?? a.agent_name ?? a.title ?? a.id ?? "Unnamed agent"),
      }))
      .filter((a) => a.id);
  });

/** Input of `validateContacts`: an uploaded CSV as headers plus rows of cells. */
export const ValidateContactsInput = z.object({
  headers: z.array(z.string()).max(MAX_UPLOAD_COLUMNS),
  rows: z.array(z.array(z.string()).max(MAX_UPLOAD_COLUMNS)).max(MAX_UPLOAD_ROWS),
});

/** Checks an uploaded contact list before launch, without calling Raya. */
export const validateContacts = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.launch)])
  .inputValidator(parseInput(ValidateContactsInput))
  .handler(async ({ data }) => validateContactRows(data.headers, data.rows));

/** Input of `rayaUpdateBatch`. */
export const UpdateBatchInput = z.object({
  batchId: requiredId("Missing batch id."),
  name: z.string().optional(),
  schedule: RayaScheduleSchema.optional(),
  maxRetries: optionalCount,
  retryAfterHrs: optionalCount,
  concurrency: optionalCount,
});

/** Changes a batch's name, schedule or retry settings. */
export const rayaUpdateBatch = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(parseInput(UpdateBatchInput))
  .handler(async ({ data }) => {
    const body = { ...(data.name ? { name: data.name } : {}), ...batchSettings(data) };
    return rayaFetch(
      `/batch/${encodeURIComponent(data.batchId)}`,
      { method: "PATCH", json: body },
      RayaReply,
    );
  });

/** Input of `rayaStopBatch`. */
export const StopBatchInput = z.object({ batchId: requiredId("Missing batch id.") });

/** Stops a running batch. */
export const rayaStopBatch = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.campaigns)])
  .inputValidator(parseInput(StopBatchInput))
  .handler(async ({ data }) =>
    rayaFetch(
      `/batch/${encodeURIComponent(data.batchId)}/stop`,
      { method: "POST", json: {} },
      RayaReply,
    ),
  );

/** Input of `rayaListBatches`. */
export const ListBatchesInput = z
  .object({
    agentId: z.string().optional(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
  })
  .optional()
  .default({});

/** Lists Raya batches, optionally for one agent. */
export const rayaListBatches = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(parseInput(ListBatchesInput))
  .handler(async ({ data }) => {
    const agent: Record<string, string> = data.agentId ? { agent_id: data.agentId } : {};
    return rayaFetch(
      `/batch${pageQuery(data.page, data.pageSize, agent)}`,
      { method: "GET" },
      RayaReply,
    );
  });

/** Input of `rayaGetBatchContacts`. */
export const GetBatchContactsInput = z.object({
  batchId: requiredId("Missing batch id."),
  page: z.number().optional(),
  pageSize: z.number().optional(),
});

/** Returns one page of a batch's contacts as Raya sends them. */
export const rayaGetBatchContacts = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(parseInput(GetBatchContactsInput))
  .handler(async ({ data }) =>
    rayaFetch(
      `/batch/${encodeURIComponent(data.batchId)}/contacts${pageQuery(data.page, data.pageSize)}`,
      { method: "GET" },
      RayaReply,
    ),
  );

/** Input of `rayaInitiateCall`. */
export const InitiateCallInput = z.object({
  agentId: requiredId("Missing agent id."),
  toNumber: requiredId("Missing phone number."),
  countryCode: z.string().optional(),
  agentArgs: z.record(z.string(), z.unknown()).optional(),
});

/** Places one test call from an agent to a phone number. */
export const rayaInitiateCall = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(parseInput(InitiateCallInput))
  .handler(async ({ data }) => {
    const body = {
      agent_id: data.agentId,
      to_number: data.toNumber,
      country_code: data.countryCode ?? DEFAULT_COUNTRY_CODE,
      agent_args: data.agentArgs ?? {},
    };
    return rayaFetch("/call", { method: "POST", json: body }, RayaReply);
  });

/** Tells whether RAYA_API_KEY is set, without returning the key. */
export const rayaKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.admin)])
  .handler(async () => {
    return { configured: Boolean(process.env.RAYA_API_KEY) };
  });
