import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import type { SqlNamedSelect } from "@/server/db/columns";
import { programAgents } from "@/server/db/schema";
import { errorMessage } from "./errors";
import { parseInput, programIdSchema } from "@/server/validation";
import { rayaFetch, RayaApiError } from "./raya-api";

/** A Raya agent registered for a program, as the settings page lists it. */
export type ProgramAgent = Pick<
  SqlNamedSelect<typeof programAgents>,
  "id" | "program" | "agent_id" | "name" | "status" | "last_error" | "created_at"
>;

const columns = {
  id: programAgents.id,
  program: programAgents.program,
  agent_id: programAgents.agentId,
  name: programAgents.name,
  status: programAgents.status,
  last_error: programAgents.lastError,
  created_at: programAgents.createdAt,
};

/** Raya agent fields this app reads. */
const rayaAgentSchema = z
  .object({ name: z.unknown(), agent_name: z.unknown(), title: z.unknown() })
  .partial();
const rayaAgentResponseSchema = rayaAgentSchema.extend({
  agent: rayaAgentSchema.optional(),
  data: rayaAgentSchema.optional(),
});

/** Picks the agent object out of a Raya response, which may wrap it in `agent` or `data`. */
function agentFromResponse(parsed: unknown): z.output<typeof rayaAgentSchema> {
  const res = rayaAgentResponseSchema.safeParse(parsed);
  if (!res.success) return {};
  return res.data.agent ?? res.data.data ?? res.data;
}

async function rayaGetAgent(
  agentId: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  try {
    const a = agentFromResponse(
      await rayaFetch(`/agent/${encodeURIComponent(agentId)}`, {
        method: "GET",
      }),
    );
    const name = String(a.name ?? a.agent_name ?? a.title ?? "Unnamed agent");
    return { ok: true, name };
  } catch (e) {
    if (e instanceof RayaApiError && e.status === 404)
      return { ok: false, error: `Agent not found (404): ${agentId}` };
    return { ok: false, error: errorMessage(e) };
  }
}

const agentIdSchema = z.string().trim().min(1, "agentId required").max(200);
const rowIdSchema = z.object({ id: z.string().uuid() });

export const loadAgent = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(parseInput(z.object({ agentId: agentIdSchema })))
  .handler(async ({ data }) => rayaGetAgent(data.agentId));

export const listProgramAgents = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.requestCampaign)])
  .inputValidator(parseInput(z.object({ program: programIdSchema.optional() })))
  .handler(async ({ data }): Promise<ProgramAgent[]> => {
    return getDb()
      .select(columns)
      .from(programAgents)
      .where(data.program ? eq(programAgents.program, data.program) : undefined)
      .orderBy(asc(programAgents.createdAt));
  });

export const createProgramAgent = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(
    parseInput(
      z.object({
        program: programIdSchema,
        agentId: agentIdSchema,
        name: z.string().max(200).optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const fetched = await rayaGetAgent(data.agentId);
    const status = fetched.ok ? "loaded" : "error";
    const last_error = fetched.ok ? null : fetched.error;
    const name = data.name?.trim() || (fetched.ok ? fetched.name : data.agentId);

    const values = {
      program: data.program,
      agentId: data.agentId,
      name,
      status,
      lastError: last_error,
    };
    const [row] = await getDb()
      .insert(programAgents)
      .values(values)
      .onConflictDoUpdate({ target: [programAgents.program, programAgents.agentId], set: values })
      .returning(columns);
    if (!row) throw new Error("Agent was not saved");
    const saved: ProgramAgent = row;
    return { ok: fetched.ok, row: saved, error: fetched.ok ? null : fetched.error };
  });

export const refreshProgramAgent = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(parseInput(rowIdSchema))
  .handler(async ({ data }) => {
    const db = getDb();
    const [row] = await db.select(columns).from(programAgents).where(eq(programAgents.id, data.id));
    if (!row) throw new Error("Agent not found");
    const fetched = await rayaGetAgent(row.agent_id);
    const patch = fetched.ok
      ? { status: "loaded", lastError: null, name: row.name || fetched.name }
      : { status: "error", lastError: fetched.error };
    const [updated] = await db
      .update(programAgents)
      .set(patch)
      .where(eq(programAgents.id, data.id))
      .returning(columns);
    if (!updated) throw new Error("Agent not found");
    const saved: ProgramAgent = updated;
    return { ok: fetched.ok, row: saved, error: fetched.ok ? null : fetched.error };
  });

export const deleteProgramAgent = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(parseInput(rowIdSchema))
  .handler(async ({ data }) => {
    await getDb().delete(programAgents).where(eq(programAgents.id, data.id));
    return { ok: true };
  });
