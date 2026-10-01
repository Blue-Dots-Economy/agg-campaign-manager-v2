// Server-only. Per-actor Supabase project selection. Default = CURRENT project (fail-safe).
// Never import this from client code. Use sbForAuth() (not sbFor) on auth/login paths.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";

const SWITCH_EMAILS = new Set(["vineela@purpledots.com"]);
const AUTH_COOKIE = "rozgar_auth";
const OPTS = { auth: { persistSession: false, autoRefreshToken: false } } as const;

// Global cutover flag. When PURPLE_CUTOVER is truthy AND the new project's env is present,
// ALL traffic routes to the new project (not just pilot emails). Absent/false => current
// behavior (pilot-only). Flip = set the PURPLE_CUTOVER secret; rollback = unset it.
function cutoverOn(): boolean {
  const v = (process.env.PURPLE_CUTOVER || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
function newEnvPresent(): boolean {
  return !!(process.env.PURPLE_SUPABASE_URL && process.env.PURPLE_SUPABASE_SERVICE_ROLE_KEY);
}

function currentClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, OPTS);
}
function secondClient(): SupabaseClient | null {
  const url = process.env.PURPLE_SUPABASE_URL;
  const key = process.env.PURPLE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    if (!!url !== !!key) {
      console.warn("[db.server] PURPLE_SUPABASE_* partially configured — falling back to the current project");
    }
    return null;
  }
  return createClient(url, key, OPTS);
}
function actorEmail(): string | null {
  try {
    const cookie = getRequest()?.headers?.get("cookie");
    if (!cookie) return null;
    // Parsing here is deliberately lenient: a failed parse does not throw — it
    // silently sends the session to the default database with no error
    // anywhere. The Cookie header is only required to separate pairs with
    // ";" (the usual serialisation adds a space, and proxies/runtimes may
    // normalise it away), so split on ";" + optional whitespace and trim each
    // segment before testing the prefix.
    const m = cookie
      .split(/;\s*/)
      .map((c) => c.trim())
      .find((c) => c.startsWith(AUTH_COOKIE + "="));
    if (!m) return null;
    const raw = decodeURIComponent(m.split("=").slice(1).join("="));
    const email = String(JSON.parse(raw)?.email ?? "").trim().toLowerCase();
    return email || null;
  } catch { return null; }
}
/** True when the current actor should read/write the second project:
 *  cutover ON (everyone) OR a pilot email — and only if the new env is present. */
export function usesSecondProject(): boolean {
  try {
    if (!newEnvPresent()) return false;
    if (cutoverOn()) return true;
    const email = actorEmail();
    return !!(email && SWITCH_EMAILS.has(email));
  } catch (e) {
    console.error("[db.server] usesSecondProject failed, falling back to current project:", e);
    return false;
  }
}
/** Admin Supabase client for the current actor. Default = CURRENT project. */
export function sbFor(): SupabaseClient {
  try {
    if (usesSecondProject()) {
      const second = secondClient();
      if (second) return second;
    }
  } catch (e) {
    console.error("[db.server] sbFor failed, falling back to current project:", e);
  }
  return currentClient();
}
/** Which project the current actor reads. For diagnostics — never use to gate security. */
export function activeSource(): "purple" | "current" {
  return usesSecondProject() ? "purple" : "current";
}

// TEMPORARY ROUTING DIAGNOSTIC — remove once the pilot routing issue is resolved.
// Exposes booleans (never the env values themselves — the service role key must not
// leave the server) for each condition of usesSecondProject().
export function diagnosticRouting(): {
  hasUrl: boolean;
  hasKey: boolean;
  cutover: boolean;
  actor: string | null;
  pilotMatch: boolean;
} {
  const actor = actorEmail();
  return {
    hasUrl: !!process.env.PURPLE_SUPABASE_URL,
    hasKey: !!process.env.PURPLE_SUPABASE_SERVICE_ROLE_KEY,
    cutover: cutoverOn(),
    actor,
    pilotMatch: !!(actor && SWITCH_EMAILS.has(actor)),
  };
}
/** Project selector for AUTH/LOGIN paths (no actor cookie exists yet), so it must be
 *  flag-based only. New project when cutover is ON and its env is present; else current. */
export function sbForAuth(): SupabaseClient {
  try {
    if (cutoverOn() && newEnvPresent()) {
      const second = secondClient();
      if (second) return second;
    }
  } catch { /* fall through to current */ }
  return currentClient();
}
