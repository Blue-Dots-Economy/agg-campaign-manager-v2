import { format } from "date-fns";

/** Formats a count in Indian digit grouping, or "—" when missing. */
export const fmtInt = (n: number | null | undefined): string =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-IN") : "—";

/** Formats a monthly salary in rupees, or "—" when missing or zero. */
export const fmtSalary = (n: number | null | undefined): string =>
  typeof n === "number" && n > 0 ? `₹${n.toLocaleString("en-IN")}/month` : "—";

/** Formats an ISO date as "dd MMM yyyy", or "—" when missing or invalid. */
export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd MMM yyyy");
};

/** Returns the text, or "—" when it is empty or blank. */
export const nz = (s: string | null | undefined): string => (s && s.trim() ? s : "—");

/** Masks each word of a name, keeping its first and last letter. */
export function maskName(name: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  return parts
    .map((p) =>
      p.length <= 2 ? p[0] + "*" : p[0] + "*".repeat(Math.max(1, p.length - 2)) + p[p.length - 1],
    )
    .join(" ");
}

/** Masks a phone number, keeping its last four digits. */
export function maskPhone(p: string): string {
  if (!p) return "—";
  const digits = p.replace(/\D/g, "");
  if (digits.length < 4) return "•".repeat(digits.length);
  return "•".repeat(digits.length - 4) + digits.slice(-4);
}

/** Masks the user part of an email address, keeping the domain. */
export function maskEmail(e: string): string {
  if (!e || !e.includes("@")) return "—";
  const [u = "", d = ""] = e.split("@");
  const uMask = u.length <= 2 ? u[0] + "*" : u.slice(0, 2) + "*".repeat(Math.max(1, u.length - 2));
  return `${uMask}@${d}`;
}

/** Supply-gap level of a job post. */
export type GapLevel = "Excellent" | "Good supply" | "Balanced" | "Borderline" | "Supply gap";

/** Maps a supply gap (openings minus fitting seekers) to a level. */
export function gapLevel(gap: number): GapLevel {
  if (gap > 4) return "Supply gap";
  if (gap >= 2) return "Borderline";
  if (gap === 1) return "Balanced";
  if (gap === 0) return "Good supply";
  return "Excellent";
}

/** Badge classes per gap level. */
export const GAP_LEVEL_CLASSES: Record<GapLevel, string> = {
  "Supply gap": "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  Borderline: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Balanced: "bg-muted text-foreground border-border",
  "Good supply": "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  Excellent: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/40",
};

/** Bar fill classes per gap level. */
export const GAP_LEVEL_BAR_CLASSES: Record<GapLevel, string> = {
  "Supply gap": "bg-rose-500",
  Borderline: "bg-amber-500",
  Balanced: "bg-muted-foreground/50",
  "Good supply": "bg-emerald-500",
  Excellent: "bg-emerald-600",
};

/** Text colour classes per gap level. */
export const GAP_LEVEL_TEXT_CLASSES: Record<GapLevel, string> = {
  "Supply gap": "text-rose-700 dark:text-rose-400",
  Borderline: "text-amber-700 dark:text-amber-400",
  Balanced: "text-muted-foreground",
  "Good supply": "text-emerald-700 dark:text-emerald-400",
  Excellent: "text-emerald-800 dark:text-emerald-300",
};

/** Kind of training institution. */
export type InstitutionType = "ITI" | "Non-ITI" | "Unknown";
/** Classifies an institution name as ITI or not. */
export function classifyInstitutionType(name: string): InstitutionType {
  if (!name) return "Unknown";
  const s = name.toLowerCase();
  if (s.includes("iti") || s.includes("industrial training")) return "ITI";
  return "Non-ITI";
}

/** Ownership of an institution. */
export type Association = "Govt" | "Pvt" | "Unknown";
/** Classifies an institution name as government or private. */
export function classifyAssociation(name: string): Association {
  if (!name) return "Unknown";
  const s = name.toLowerCase();
  if (s.includes("govt") || s.includes("government")) return "Govt";
  if (s.includes("pvt") || s.includes("private")) return "Pvt";
  return "Unknown";
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Job posts younger than this many days count as "latest". */
const LATEST_JOB_MAX_DAYS = 14;
/** Job posts up to this many days old count as "recent"; older ones are "old". */
const RECENT_JOB_MAX_DAYS = 28;

/** Buckets a job post by how long ago it was posted. */
export function jobFreshness(postedIso: string): "latest" | "recent" | "old" {
  const d = new Date(postedIso).getTime();
  const days = (Date.now() - d) / MS_PER_DAY;
  if (days < LATEST_JOB_MAX_DAYS) return "latest";
  if (days <= RECENT_JOB_MAX_DAYS) return "recent";
  return "old";
}

/** Labels for the job freshness buckets. */
export const FRESHNESS_LABEL: Record<"latest" | "recent" | "old", string> = {
  latest: "Latest (<14d)",
  recent: "Recent (14–28d)",
  old: "Old (>28d)",
};

/** Buckets a job post by its number of applications. */
export function applicationBucket(n: number): "0" | "1-5" | "6-20" | "20+" {
  if (n === 0) return "0";
  if (n <= 5) return "1-5";
  if (n <= 20) return "6-20";
  return "20+";
}

/** Age bucket of an application. */
export type AppAgeBucket = "week" | "month" | "older";

/** Applications younger than this many days fall in "This week". */
const WEEK_DAYS = 7;
/** Applications up to this many days old fall in "This month"; days per month in `relativeAge` too. */
const MONTH_DAYS = 30;

/** Buckets an application by how long ago it was made. */
export function appAgeBucket(iso: string): AppAgeBucket {
  const d = new Date(iso).getTime();
  const days = (Date.now() - d) / MS_PER_DAY;
  if (days < WEEK_DAYS) return "week";
  if (days <= MONTH_DAYS) return "month";
  return "older";
}

/** Labels for the application age buckets. */
export const APP_AGE_LABEL: Record<AppAgeBucket, string> = {
  week: "This week",
  month: "This month",
  older: "Older",
};

/** Describes how long ago a date was, in days or months. */
export function relativeAge(iso: string): string {
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return "—";
  const days = Math.floor((Date.now() - d) / MS_PER_DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < MONTH_DAYS) return `${days} days ago`;
  const months = Math.floor(days / MONTH_DAYS);
  if (months === 1) return "1 month ago";
  return `${months} months ago`;
}

/** Placeholder previous-period value until real period data exists. */
export function mockPrevious(value: number, ratio: number): number {
  return Math.max(0, Math.round(value * ratio));
}

/** Placeholder trend series from the previous value to the current one. */
export function mockTrend(value: number, previous: number, points = 7): number[] {
  if (value <= 0 && previous <= 0) return [];
  const start = previous;
  const end = value;
  const series: number[] = [];
  // deterministic pseudo-noise from value+previous
  let seed = (Math.abs(value * 9301 + previous * 49297) % 233280) + 1;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const base = start + (end - start) * t;
    const jitter = base * (rand() * 0.16 - 0.08);
    series.push(Math.max(0, Math.round(base + jitter)));
  }
  series[points - 1] = end;
  return series;
}

/** Role categories used to group job posts. */
export const ROLE_CATEGORIES = [
  "Manufacturing & Trades",
  "Retail & Promotion",
  "Sales & Telecalling",
  "Logistics & Delivery",
  "Office & Data",
  "Services",
  "Other",
] as const;
/** One of the role categories. */
export type RoleCategory = (typeof ROLE_CATEGORIES)[number];

const CATEGORY_RULES: { cat: RoleCategory; kw: RegExp }[] = [
  {
    cat: "Office & Data",
    kw: /(data entry|data operator|computer op|back ?office|\boffice\b|admin|account|reception|clerk|copa|tally|documentation)/i,
  },
  {
    cat: "Sales & Telecalling",
    kw: /(sales|tele|telecal|bpo|\bcalling\b|call ?cent(er|re)|caller|\bbde\b|business develop|marketing|collection)/i,
  },
  {
    cat: "Retail & Promotion",
    kw: /(retail|in ?store|store|promoter|promotion|cashier|merchandis|counter|shop|fmcg|billing)/i,
  },
  {
    cat: "Logistics & Delivery",
    kw: /(driver|driving|delivery|logistic|warehouse|loader|courier|rider|picker|packer|supply chain|dispatch)/i,
  },
  {
    cat: "Services",
    kw: /(security|guard|housekeep|hospitality|cook|chef|waiter|steward|cleaning|facility|beautician|salon|\bcare\b|nursing|ward boy|tailor|stitch|garment|textile)/i,
  },
  {
    cat: "Manufacturing & Trades",
    kw: /(manufactur|production|factory|machine|operator|welder|weld|fitter|electric|mechanic|technician|\biti\b|turner|assembl|fabricat|\bplant\b|wireman|plumber|cnc|denter|painter|helper|trainee)/i,
  },
];

/** Picks the role category for a job title and sector by keyword. */
export function roleCategory(title: string, sector?: string): RoleCategory {
  const hay = `${title ?? ""} ${sector ?? ""}`.toLowerCase();
  for (const r of CATEGORY_RULES) if (r.kw.test(hay)) return r.cat;
  return "Other";
}
