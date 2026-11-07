// Pure formatting helpers that turn Raya values into staging-sheet cell text.
import type { ProgramId } from "@/programs/registry";

// ---------- read sheet id from URL ----------
export function parseSheetId(input: string): string {
  const t = input.trim();
  if (!t) return "";
  const m = t.match(/\/d\/([A-Za-z0-9-_]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9-_]{20,}$/.test(t)) return t;
  return "";
}

// ---------- helpers ----------
export function normalize(k: string): string {
  return String(k ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_");
}

export function asStr(v: any): string {
  if (v == null) return "";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export function asArr(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v == null || v === "") return [];
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function jsonStringOrEmptyArray(v: any): string {
  if (v == null || v === "") return "[]";
  if (typeof v === "string") return v.trim() || "[]";
  try {
    return JSON.stringify(v);
  } catch {
    return "[]";
  }
}

export function nonEmpty(v: any): boolean {
  if (v == null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return String(v).trim().length > 0;
}

/** Trims the text and drops one trailing "IST" marker (any case). Runs in linear time. */
export function stripIst(s: string): string {
  const t = String(s ?? "").trim();
  return /IST$/i.test(t) ? t.slice(0, -"IST".length).trim() : t;
}

export function datePart(s: string): string {
  const t = stripIst(s);
  if (!t) return "";
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

// ---------- region detection ----------
export type Region = { region: string; language: string; city: string };

export function detectRegionFromText(s: string): Region | null {
  const t = (s || "").toLowerCase();
  if (/(^|[^a-z])ka([^a-z]|$)|kannada|hubli|dharwad|karnataka/.test(t))
    return { region: "KA", language: "Kannada", city: "Hubli-Dharwad" };
  if (/(^|[^a-z])gzb([^a-z]|$)|hindi|ghaziabad|uttar.?pradesh/.test(t))
    return { region: "GZB", language: "Hindi", city: "Ghaziabad" };
  return null;
}

export function detectRegionForContact(
  contact: any,
  fallbacks: { batchName?: string; agentName?: string; program?: string },
): Region {
  const args = contact?.agent_args ?? contact?.metadata ?? contact?.args ?? {};
  const explicit = args?._region ?? args?.region ?? contact?.region ?? contact?._region ?? "";
  const fromExplicit = detectRegionFromText(String(explicit));
  if (fromExplicit) return fromExplicit;
  const cityHint = args?.city_campaign ?? args?.city ?? contact?.city_campaign ?? "";
  const fromCity = detectRegionFromText(String(cityHint));
  if (fromCity) return fromCity;
  for (const txt of [fallbacks.batchName, fallbacks.agentName, fallbacks.program]) {
    const r = detectRegionFromText(String(txt ?? ""));
    if (r) return r;
  }
  return { region: "", language: "", city: "" };
}

// ---------- format helpers (master-sheet-exact) ----------
export function fmtPhone(v: any): string {
  const digits = String(v ?? "").replace(/\D+/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export function fmtInt(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return String(Math.trunc(n));
}

export function fmtDateTimeIstFromApi(v: any): string {
  const raw = stripIst(String(v ?? "")).replace(/T/, " ");
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T]?(\d{2}:\d{2}:\d{2})?/);
  if (m) return `${m[1]} ${m[2] ?? "00:00:00"}`;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function fmtDateOnly(v: any): string {
  const raw = stripIst(String(v ?? "")).replace(/T/, " ");
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

export function yesNo(v: any, fallback = false): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v > 0 ? "Yes" : "No";
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (!s) return fallback ? "Yes" : "No";
  if (["yes", "y", "true", "1", "completed", "success"].includes(s)) return "Yes";
  if (["no", "n", "false", "0", "none", "null", "undefined"].includes(s)) return "No";
  return fallback ? "Yes" : "No";
}

// Raya's per-call outcome string is the source of truth — pass through, only
// normalize obvious aliases. Falls back to derived bucket if Raya omitted it.
export function rayaOutcomeOrDerive(
  rayaOutcome: string,
  fallback: {
    contactStatus: string;
    durationSec: number;
    applied: boolean;
    jobsShown: boolean;
    engaged: boolean;
  },
): string {
  const t = String(rayaOutcome ?? "").trim();
  if (t) return t;
  const s = normalize(fallback.contactStatus);
  if (s === "pending") return "Pending";
  if (fallback.durationSec <= 0) return "No Answer";
  if (fallback.applied || fallback.jobsShown || fallback.engaged) return "Completed";
  return "Early Disconnect";
}

export function computeIntent(opts: {
  durationSec: number;
  applied: boolean;
  triedToApply: boolean;
  jobsShown: boolean;
  userIntent: string;
}): { score: number; reasoning: string } {
  const d = opts.durationSec;
  let dur = 0;
  if (d >= 180) dur = 4;
  else if (d >= 120) dur = 3;
  else if (d >= 60) dur = 2;
  else if (d >= 30) dur = 1;
  let app = 0;
  if (opts.applied) app = 4;
  else if (opts.triedToApply) app = 2;
  let eng = 0;
  if (opts.jobsShown) eng += 1;
  if (nonEmpty(opts.userIntent)) eng += 1;
  const score = dur + app + eng;
  // Master format: "Duration {s}s (+{d})|Application (+{a})|Engagement (+{e}) → {total}/10"
  const reasoning = `Duration ${d}s (+${dur})|Application (+${app})|Engagement (+${eng}) → ${score}/10`;
  return { score, reasoning };
}

export function campaignTypeFor(program: ProgramId, language: string, campaignDay: string): string {
  const dayNum = (String(campaignDay).match(/\d+/) || ["1"])[0];
  return `${program.toUpperCase()}_${language || ""}_Day${dayNum}`;
}
