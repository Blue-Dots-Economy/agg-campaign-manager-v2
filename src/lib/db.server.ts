// Server-only. Per-actor Supabase project selection. Default = CURRENT project (fail-safe).
// Never import this from client code. Use sbForAuth() (not sbFor) on auth/login paths.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";

const SWITCH_EMAILS = new Set(["vineela@bluedots.com"]);
const AUTH_COOKIE = "rozgar_auth";
const OPTS = { auth: { persistSession: false, autoRefreshToken: false } } as const;

// Global cutover flag. When ROZGAR_CUTOVER is truthy AND the new project's env is present,
// ALL traffic routes to the new project (not just pilot emails). Absent/false => current
// behavior (pilot-only). Flip = set the ROZGAR_CUTOVER secret; rollback = unset it.
function cutoverOn(): boolean {
  const v = (process.env.ROZGAR_CUTOVER || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
function newEnvPresent(): boolean {
  return !!(process.env.NEW_SUPABASE_URL && process.env.NEW_SUPABASE_SERVICE_ROLE_KEY);
}

function currentClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, OPTS);
}
function secondClient(): SupabaseClient | null {
  const url = process.env.NEW_SUPABASE_URL;
  const key = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, OPTS);
}
function actorEmail(): string | null {
  try {
    const cookie = getRequest()?.headers?.get("cookie");
    if (!cookie) return null;
    const m = cookie.split("; ").find((c) => c.startsWith(AUTH_COOKIE + "="));
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
  } catch { return false; }
}
/** Admin Supabase client for the current actor. Default = CURRENT project. */
export function sbFor(): SupabaseClient {
  try {
    if (usesSecondProject()) {
      const second = secondClient();
      if (second) return second;
    }
  } catch { /* fall through to current */ }
  return currentClient();
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
