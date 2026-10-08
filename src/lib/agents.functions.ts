import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { type ProgramId } from "@/programs/registry";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { programAgents } from "@/server/db/schema";
import { rayaFetch, RayaApiError } from "./raya-api";

export interface ProgramAgent {
  id: string;
  program: ProgramId;
  agent_id: string;
  name: string;
  status: string;
  last_error: string | null;
  created_at: string;
}

const columns = {
  id: programAgents.id,
  program: programAgents.program,
  agent_id: programAgents.agentId,
  name: programAgents.name,
  status: programAgents.status,
  last_error: programAgents.lastError,
  created_at: programAgents.createdAt,
};

async function rayaGetAgent(agentId: string): Promise<{ ok: true; name: string; raw: any } | { ok: false; error: string }> {
  try {
    const parsed = await rayaFetch(`/agent/${encodeURIComponent(agentId)}`, { method: "GET" }) as any;
    const a = (parsed?.agent ?? parsed?.data ?? parsed) as any;
    const name = String(a?.name ?? a?.agent_name ?? a?.title ?? "Unnamed agent");
    return { ok: true, name, raw: a };
  } catch (e) {
    if (e instanceof RayaApiError && e.status === 404) return { ok: false, error: `Agent not found (404): ${agentId}` };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const loadAgent = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator((d: { agentId: string }) => {
    if (!d.agentId?.trim()) throw new Error("agentId required");
    return d;
  })
  .handler(async ({ data }) => rayaGetAgent(data.agentId.trim()));

export const listProgramAgents = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.requestCampaign)])
  .inputValidator((d: { program?: ProgramId }) => d)
  .handler(async ({ data }) => {
    const rows = await getDb()
      .select(columns)
      .from(programAgents)
      .where(data.program ? eq(programAgents.program, data.program) : undefined)
      .orderBy(asc(programAgents.createdAt));
    return rows as ProgramAgent[];
  });

export const createProgramAgent = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator((d: { program: ProgramId; agentId: string; name?: string }) => {
    if (!d.program) throw new Error("program required");
    if (!d.agentId?.trim()) throw new Error("agentId required");
    return d;
  })
  .handler(async ({ data }) => {
    const fetched = await rayaGetAgent(data.agentId.trim());
    const status = fetched.ok ? "loaded" : "error";
    const last_error = fetched.ok ? null : fetched.error;
    const name = (data.name?.trim()) || (fetched.ok ? fetched.name : data.agentId.trim());

    const values = { program: data.program, agentId: data.agentId.trim(), name, status, lastError: last_error };
    const [row] = await getDb()
      .insert(programAgents)
      .values(values)
      .onConflictDoUpdate({ target: [programAgents.program, programAgents.agentId], set: values })
      .returning(columns);
    return { ok: fetched.ok, row: row as ProgramAgent, error: fetched.ok ? null : fetched.error };
  });

export const refreshProgramAgent = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator((d: { id: string }) => d)
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
    return { ok: fetched.ok, row: updated as ProgramAgent, error: fetched.ok ? null : fetched.error };
  });

export const deleteProgramAgent = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await getDb().delete(programAgents).where(eq(programAgents.id, data.id));
    return { ok: true };
  });
