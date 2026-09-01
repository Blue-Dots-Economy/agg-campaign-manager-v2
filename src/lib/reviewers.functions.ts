import { createServerFn } from "@tanstack/react-start";

// Auth + reviewer tables live wherever auth lives. Use the flag-based selector so that
// today (cutover off) everything runs on the CURRENT project exactly as before, and at
// cutover (ROZGAR_CUTOVER on) all of these move to the new project in lockstep with login.
async function sb() {
  const { sbForAuth } = await import("@/lib/db.server");
  return sbForAuth();
}
const ADMIN_CREDENTIALS: Record<string, string> = {
  "admin@bluedots.com": "456789",
  "sanketika@bluedots.com": "456789",
  "aggregator-coordinator@bluedots.com": "456789",
  "aggregator-owner@bluedots.com": "456789",
};
const ECOSYSTEM_CREDENTIALS: Record<string, string> = {
  "ecosystem@bluedots.com": "456789",
};

export const resolveLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password?: string }) => d)
  .handler(async ({ data }): Promise<{ role: "admin" | "user" | "ecosystem" | "jfc" | "owner" | "coordinator" | null; name?: string | null; district?: string | null; program?: string | null; node_type?: string | null; node_name?: string | null }> => {
    const email = (data.email || "").trim().toLowerCase();
    const password = data.password || "";
    const client = await sb();
    try {
      const { data: rows } = await client.rpc("app_user_login", { _email: email, _password: password || null });
      const row = (Array.isArray(rows) ? rows[0] : rows) as Record<string, string> | undefined;
      if (row?.role) {
        return {
          role: row.role as "admin" | "user" | "ecosystem" | "jfc" | "owner" | "coordinator",
          name: row.name ?? null,
          district: row.district ?? null,
          program: row.program ?? null,
          node_type: row.node_type ?? null,
          node_name: row.node_name ?? null,
        };
      }
    } catch { /* fall through to legacy checks */ }
    if (ADMIN_CREDENTIALS[email] && ADMIN_CREDENTIALS[email] === password) return { role: "admin" };
    if (ECOSYSTEM_CREDENTIALS[email] && ECOSYSTEM_CREDENTIALS[email] === password) return { role: "ecosystem" };
    try {
      const { data: r } = await client.from("reviewers").select("email").eq("email", email).maybeSingle();
      if (r) return { role: "user" };
    } catch { /* ignore */ }
    return { role: null };
  });

export const listReviewers = createServerFn({ method: "GET" })
  .handler(async (): Promise<string[]> => {
    try {
      const { data } = await (await sb()).from("reviewers").select("email").order("email");
      return (data ?? []).map((r: { email: string }) => r.email);
    } catch { return []; }
  });

export const addReviewer = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const email = (data.email || "").trim().toLowerCase();
    if (!email) return { ok: false };
    try { await (await sb()).from("reviewers").upsert({ email }, { onConflict: "email" }); return { ok: true }; }
    catch { return { ok: false }; }
  });

export const removeReviewer = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const email = (data.email || "").trim().toLowerCase();
    try { await (await sb()).from("reviewers").delete().eq("email", email); return { ok: true }; }
    catch { return { ok: false }; }
  });
