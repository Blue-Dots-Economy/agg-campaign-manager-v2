import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

function sb() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface AppUser {
  email: string; name: string | null; role: string;
  district: string | null; program: string | null;
  node_type: string | null; node_name: string | null;
  active: boolean; created_at: string;
}

export const listAppUsers = createServerFn({ method: "GET" }).handler(async (): Promise<AppUser[]> => {
  const { data, error } = await sb().from("app_users")
    .select("email,name,role,district,program,node_type,node_name,active,created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AppUser[];
});

export interface UpsertAppUserInput {
  email: string; name?: string; role: string;
  district?: string; program?: string; node_type?: string; node_name?: string;
  password?: string; active?: boolean;
}

export const upsertAppUser = createServerFn({ method: "POST" })
  .inputValidator((d: { user: UpsertAppUserInput }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const u = data.user;
    if (!u.email || !u.role) throw new Error("Email and role are required.");
    const { error } = await sb().rpc("upsert_app_user", {
      _email: u.email, _name: u.name ?? "", _role: u.role,
      _district: u.district ?? "", _program: u.program ?? "",
      _node_type: u.node_type ?? "", _node_name: u.node_name ?? "",
      _password: u.password ?? null, _active: u.active ?? true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAppUserActive = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; active: boolean }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { error } = await sb().from("app_users")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("email", data.email.trim().toLowerCase());
    if (error) throw new Error(error.message);
    return { ok: true };
  });
