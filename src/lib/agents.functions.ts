import { createServerFn } from "@tanstack/react-start";
import { type ProgramId } from "@/programs/registry";
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

async function sb() {
  const { sbFor } = await import("@/lib/db.server");
  return sbFor();
}

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
  .inputValidator((d: { agentId: string }) => {
    if (!d.agentId?.trim()) throw new Error("agentId required");
    return d;
  })
  .handler(async ({ data }) => rayaGetAgent(data.agentId.trim()));

export const listProgramAgents = createServerFn({ method: "GET" })
  .inputValidator((d: { program?: ProgramId }) => d)
  .handler(async ({ data }) => {
    const c = await sb();
    let q = c.from("program_agents").select("*").order("created_at", { ascending: true });
    if (data.program) q = q.eq("program", data.program);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as ProgramAgent[];
  });

export const createProgramAgent = createServerFn({ method: "POST" })
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

    const c = await sb();
    const { data: row, error } = await c
      .from("program_agents")
      .upsert(
        {
          program: data.program,
          agent_id: data.agentId.trim(),
          name,
          status,
          last_error,
        },
        { onConflict: "program,agent_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { ok: fetched.ok, row: row as ProgramAgent, error: fetched.ok ? null : fetched.error };
  });

export const refreshProgramAgent = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const c = await sb();
    const { data: existing, error: e1 } = await c
      .from("program_agents")
      .select("*")
      .eq("id", data.id)
      .single();
    if (e1) throw new Error(e1.message);
    const row = existing as ProgramAgent;
    const fetched = await rayaGetAgent(row.agent_id);
    const patch = fetched.ok
      ? { status: "loaded", last_error: null, name: row.name || fetched.name }
      : { status: "error", last_error: fetched.error };
    const { data: updated, error } = await c
      .from("program_agents")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { ok: fetched.ok, row: updated as ProgramAgent, error: fetched.ok ? null : fetched.error };
  });

export const deleteProgramAgent = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const c = await sb();
    const { error } = await c.from("program_agents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
