// Pure formatting helpers that turn Raya values into staging-sheet cell text.
import type { ProgramId } from "@/programs/registry";
import { MOBILE_DIGITS } from "./contact-validation";
import { asRecord, first, type RayaItem } from "./raya-record";
import { compareCodeUnits } from "./sort";

/** Shortest bare sheet id accepted; shorter text is not a Google Sheet id. */
const MIN_SHEET_ID_LENGTH = 20;
const SHEET_URL_ID = /\/d\/([A-Za-z0-9-_]+)/;
const BARE_SHEET_ID = new RegExp(`^[A-Za-z0-9-_]{${MIN_SHEET_ID_LENGTH},}$`);

/** Reads a Google Sheet id from a sheet URL or a bare id; returns "" when there is none. */
export function parseSheetId(input: string): string {
  const t = input.trim();
  if (!t) return "";
  const m = SHEET_URL_ID.exec(t);
  if (m?.[1]) return m[1];
  if (BARE_SHEET_ID.test(t)) return t;
  return "";
}

/** Lowercases a column name and joins words with underscores, so names match row keys. */
export function normalize(k: string): string {
  return String(k ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Returns a value as cell text: "" for null, JSON for objects and arrays. */
export function asStr(v: unknown): string {
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

/** Returns an array, or the array inside a JSON array string; anything else is []. */
export function asArr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string" || v === "") return [];
  try {
    const p: unknown = JSON.parse(v);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

/** Returns a transcript as text: strings as they are, other values as JSON, "[]" when empty. */
export function jsonStringOrEmptyArray(v: unknown): string {
  if (v == null || v === "") return "[]";
  if (typeof v === "string") return v.trim() || "[]";
  try {
    return JSON.stringify(v);
  } catch {
    return "[]";
  }
}

/** True for non-blank text, non-empty arrays and objects with keys, and other non-null values. */
export function nonEmpty(v: unknown): boolean {
  if (v == null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return String(v).trim().length > 0;
}

/** Trims the text and drops one trailing "IST" marker (any case). Runs in linear time. */
export function stripIst(s: unknown): string {
  const t = String(s ?? "").trim();
  return /IST$/i.test(t) ? t.slice(0, -"IST".length).trim() : t;
}

/** Returns the "YYYY-MM-DD" date of a time text, or "". */
export function datePart(s: unknown): string {
  const t = stripIst(s);
  if (!t) return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(t);
  if (m?.[1]) return m[1];
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

/** Campaign region with its call language and city. */
export interface Region {
  region: string;
  language: string;
  city: string;
}

const KARNATAKA: Region = { region: "KA", language: "Kannada", city: "Hubli-Dharwad" };
const GHAZIABAD: Region = { region: "GZB", language: "Hindi", city: "Ghaziabad" };
const NO_REGION: Region = { region: "", language: "", city: "" };

/** Finds a region named in free text (region code, language or city), or null. */
export function detectRegionFromText(s: string): Region | null {
  const t = (s || "").toLowerCase();
  if (/(^|[^a-z])ka([^a-z]|$)|kannada|hubli|dharwad|karnataka/.test(t)) return { ...KARNATAKA };
  if (/(^|[^a-z])gzb([^a-z]|$)|hindi|ghaziabad|uttar.?pradesh/.test(t)) return { ...GHAZIABAD };
  return null;
}

/**
 * Finds a contact's region: its explicit region, then its city, then the batch, agent and
 * program names. Returns blanks when none names a region.
 */
export function detectRegionForContact(
  contact: RayaItem,
  fallbacks: { batchName?: string; agentName?: string; program?: string },
): Region {
  const args = asRecord(first(contact, "agent_args", "metadata", "args"));
  const explicit = first(args, "_region", "region") ?? first(contact, "region", "_region") ?? "";
  const fromExplicit = detectRegionFromText(String(explicit));
  if (fromExplicit) return fromExplicit;
  const cityHint = first(args, "city_campaign", "city") ?? first(contact, "city_campaign") ?? "";
  const fromCity = detectRegionFromText(String(cityHint));
  if (fromCity) return fromCity;
  for (const txt of [fallbacks.batchName, fallbacks.agentName, fallbacks.program]) {
    const r = detectRegionFromText(String(txt ?? ""));
    if (r) return r;
  }
  return { ...NO_REGION };
}

/** Returns the last 10 digits of a phone number, or all digits when there are fewer. */
export function fmtPhone(v: unknown): string {
  const digits = String(v ?? "").replace(/\D+/g, "");
  if (digits.length >= MOBILE_DIGITS) return digits.slice(-MOBILE_DIGITS);
  return digits;
}

/** Returns a number as whole-number text, or "0". */
export function fmtInt(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return String(Math.trunc(n));
}

const LEADING_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[ T]?(\d{2}:\d{2}:\d{2})?/;

/** Formats a Raya call time as "YYYY-MM-DD HH:MM:SS", the master-sheet format. */
export function fmtDateTimeIstFromApi(v: unknown): string {
  const raw = stripIst(v).replace(/T/, " ");
  const m = LEADING_DATE_TIME.exec(raw);
  if (m?.[1]) return `${m[1]} ${m[2] ?? "00:00:00"}`;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** Formats a date as "YYYY-MM-DD", or "". */
export function fmtDateOnly(v: unknown): string {
  const raw = stripIst(v).replace(/T/, " ");
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (m?.[1]) return m[1];
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

const YES_WORDS = ["yes", "y", "true", "1", "completed", "success"];
const NO_WORDS = ["no", "n", "false", "0", "none", "null", "undefined"];

/** Maps a Raya flag to "Yes" or "No"; empty or unknown text uses `fallback`. */
export function yesNo(v: unknown, fallback = false): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v > 0 ? "Yes" : "No";
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (!s) return fallback ? "Yes" : "No";
  if (YES_WORDS.includes(s)) return "Yes";
  if (NO_WORDS.includes(s)) return "No";
  return fallback ? "Yes" : "No";
}

/** Returns Raya's call outcome, or derives one from the call when Raya sent none. */
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

/** Intent points per call length: the first band whose minimum seconds the call reaches. */
const INTENT_DURATION_BANDS: ReadonlyArray<{ minSec: number; points: number }> = [
  { minSec: 180, points: 4 },
  { minSec: 120, points: 3 },
  { minSec: 60, points: 2 },
  { minSec: 30, points: 1 },
];
/** Intent points for applying to a job. */
const INTENT_APPLIED_POINTS = 4;
/** Intent points for trying to apply without success. */
const INTENT_TRIED_POINTS = 2;
/** Highest intent score: 4 for duration, 4 for applying, 2 for engagement. */
const INTENT_MAX_SCORE = 10;

/**
 * Scores a seeker's intent from 0 to 10 from call length, applications and engagement.
 *
 * @returns The score and the master-sheet reasoning text.
 */
export function computeIntent(opts: {
  durationSec: number;
  applied: boolean;
  triedToApply: boolean;
  jobsShown: boolean;
  userIntent: string;
}): { score: number; reasoning: string } {
  const d = opts.durationSec;
  const dur = INTENT_DURATION_BANDS.find((b) => d >= b.minSec)?.points ?? 0;
  let app = 0;
  if (opts.applied) app = INTENT_APPLIED_POINTS;
  else if (opts.triedToApply) app = INTENT_TRIED_POINTS;
  let eng = 0;
  if (opts.jobsShown) eng += 1;
  if (nonEmpty(opts.userIntent)) eng += 1;
  const score = dur + app + eng;
  const reasoning = `Duration ${d}s (+${dur})|Application (+${app})|Engagement (+${eng}) → ${score}/${INTENT_MAX_SCORE}`;
  return { score, reasoning };
}

/** Returns the day number in a campaign day label ("Day 3" → "3"), or "1". */
export function campaignDayNumber(campaignDay: string): string {
  return /\d+/.exec(String(campaignDay))?.[0] ?? "1";
}

/** Builds the campaign type label, for example "SEEKERS_Hindi_Day3". */
export function campaignTypeFor(program: ProgramId, language: string, campaignDay: string): string {
  return `${program.toUpperCase()}_${language || ""}_Day${campaignDayNumber(campaignDay)}`;
}

/** Returns the label after the highest day number among `days`, for example "Day 4". */
export function nextCampaignDayLabel(days: ReadonlyArray<string | null>): string {
  let maxN = 0;
  for (const d of days) {
    const m = /(\d+)/.exec(String(d ?? ""));
    if (m?.[1]) maxN = Math.max(maxN, Number(m[1]));
  }
  return `Day ${maxN + 1}`;
}

/** Returns an object's keys in code-unit order, for listing the fields Raya sent. */
export function sortedKeys(obj: object): string[] {
  return Object.keys(obj).sort(compareCodeUnits);
}
