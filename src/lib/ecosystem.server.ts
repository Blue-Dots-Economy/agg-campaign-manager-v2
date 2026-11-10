// Server-only loader for the Ecosystem View: reads the region's job and seeker sheets and
// returns a compact payload for the page.
import { logEvent } from "@/server/log.server";
import { listSheetTabs, readSheet, getSheetRowCount } from "./sheets.server";
import { REGION_CONFIGS, type RegionConfig } from "./ecosystem-config";

/** One job post in a district. */
export interface EcoJob {
  id: string;
  title: string;
  category: string;
  sector: string;
  partial_fit_seekers: number;
  right_fit_seekers: number;
  area: string;
  current_openings: number;
  applications: number;
  status: "open" | "closed";
  posted_date: string;
  posted_by: string;
  salary_offered: number;
  shortlisted: number;
  application_pending_from: string;
  recommended_action_provider: string;
  recommended_action_seeker: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  location_district: string;
  location_state: string;
}

/** One job application. */
export interface EcoApplication {
  id: string;
  seeker_role: string;
  location: string;
  job_id: string;
  applied_date: string;
}

/** Everything the Ecosystem View shows for one district. */
export interface EcoPayload {
  jobs: EcoJob[];
  applications: {
    total: number;
    buckets: { week: number; month: number; older: number };
    /** At most APPLICATION_SAMPLE_SIZE applications. */
    sample: EcoApplication[];
  };
  seekerCounts: { profiles: number; accounts: number; orgs: number };
  lastSyncedAt: string;
  unmapped: string[];
}

const normKey = (h: string): string =>
  String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-()./]+/g, "_")
    .replace(/_+$/g, "");

/** Column index per normalized header; the first column wins when headers repeat. */
type HeaderIndex = Map<string, number>;

function indexHeaders(headers: string[]): HeaderIndex {
  const idx: HeaderIndex = new Map();
  headers.forEach((h, i) => {
    const k = normKey(h);
    if (!idx.has(k)) idx.set(k, i);
  });
  return idx;
}

/** Returns the first non-blank cell among the alias columns, or "". */
function pick(idx: HeaderIndex, row: string[], aliases: string[]): string {
  for (const a of aliases) {
    const i = idx.get(normKey(a));
    if (i === undefined) continue;
    const v = row[i];
    if (v !== undefined && v.trim() !== "") return v;
  }
  return "";
}

const asNum = (v: string): number => {
  if (!v) return 0;
  const n = Number(String(v).replace(/[,%₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const ci = (s: string) => s.trim().toLowerCase();

function detectStatus(raw: string): "open" | "closed" {
  const s = ci(raw);
  if (!s) return "open";
  if (
    s.includes("closed") ||
    s.includes("archived") ||
    s.includes("filled") ||
    s.includes("cancel")
  )
    return "closed";
  return "open";
}

/** Choose the best tab for jobs / applications / seekers in a workbook. */
async function resolveTabs(
  sheetId: string,
  preferred: string,
  matcher: (t: string) => boolean,
): Promise<string> {
  const tabs = await listSheetTabs(sheetId);
  if (tabs.includes(preferred)) return preferred;
  const hit = tabs.find(matcher);
  return hit ?? tabs[0] ?? preferred;
}

async function readJobs(
  cfg: RegionConfig,
  district: string,
  unmapped: Set<string>,
): Promise<EcoJob[]> {
  const tab = await resolveTabs(cfg.jobsSheet, cfg.jobsTab, (t) =>
    /open_?roles|jobs?_post|job_posts?/i.test(t),
  );
  const { headers, rows } = await readSheet(cfg.jobsSheet, tab);
  const idx = indexHeaders(headers);

  const REQUIRED = ["current_openings", "openings", "role", "title"];
  for (const r of REQUIRED) if (!idx.has(r)) unmapped.add(`jobs:${r}`);

  const districtCi = ci(district);
  const mapped: EcoJob[] = rows.map((row, i) => {
    const openings = asNum(
      pick(idx, row, [
        "current_openings",
        "openings",
        "number_of_openings",
        "no_of_openings",
        "vacancies",
      ]),
    );
    const applications = asNum(
      pick(idx, row, ["applications", "no_of_applications", "total_applications"]),
    );
    const partial = asNum(
      pick(idx, row, [
        "partial_fit_seeker_count",
        "partial_fit_seekers_count",
        "partial_fit_seekers",
        "partial_fit",
      ]),
    );
    const right = asNum(
      pick(idx, row, [
        "right_fit_seekers_count",
        "right_fit_seeker_count",
        "right_fit_seekers",
        "right_fit",
        "direct_fit",
      ]),
    );
    const title = pick(idx, row, ["role", "title", "normalised_role", "normalised_title"]) || "—";
    const area = pick(idx, row, ["location", "area", "city"]);
    return {
      id: pick(idx, row, ["id"]) || `${cfg.state}-${i}`,
      title,
      category: pick(idx, row, ["job_sector", "sector", "category"]) || "—",
      sector: pick(idx, row, ["job_sector", "sector"]) || "—",
      partial_fit_seekers: partial,
      right_fit_seekers: right,
      area: area || "—",
      current_openings: openings,
      applications,
      status: detectStatus(pick(idx, row, ["status"])),
      posted_date: pick(idx, row, ["job_post_date", "posted_date", "created_at"]),
      posted_by: pick(idx, row, [
        "organization_name",
        "organisation_name",
        "company",
        "company_name",
        "posted_by",
      ]),
      salary_offered: asNum(pick(idx, row, ["salary", "salary_offered"])),
      shortlisted: asNum(pick(idx, row, ["shortlisted"])),
      application_pending_from: pick(idx, row, ["application_pending_from", "pending_from"]),
      recommended_action_provider: pick(idx, row, [
        "recommended_action_for_job_provider",
        "recommended_action_provider",
      ]),
      recommended_action_seeker: pick(idx, row, [
        "recommended_action_for_job_seeker",
        "recommended_action_seeker",
      ]),
      contact_name: pick(idx, row, ["contact_name_of_created_by_id", "contact_name"]),
      contact_phone: pick(idx, row, [
        "contact_number_of_created_by_id",
        "contact_number",
        "contact_phone",
      ]),
      contact_email: pick(idx, row, ["contact_email_id", "contact_email"]),
      location_district: pick(idx, row, ["location_district", "district"]) || district,
      location_state: pick(idx, row, ["location_state", "state"]) || cfg.state,
    };
  });

  const filtered = mapped.filter((j) => ci(j.location_district) === districtCi);
  return filtered.length > 0 ? filtered : mapped;
}

async function readApplications(
  cfg: RegionConfig,
  district: string,
  jobIds: Set<string>,
  unmapped: Set<string>,
): Promise<EcoApplication[]> {
  const tab = await resolveTabs(cfg.jobsSheet, cfg.applicationsTab, (t) => /application/i.test(t));
  const { headers, rows } = await readSheet(cfg.jobsSheet, tab);
  const idx = indexHeaders(headers);
  if (
    !idx.has("applied_at") &&
    !idx.has("applied_date") &&
    !idx.has("created_at") &&
    !idx.has("timestamp")
  ) {
    unmapped.add("applications:applied_date");
  }

  const districtCi = ci(district);
  const mapped: EcoApplication[] = rows.map((row, i) => ({
    id: pick(idx, row, ["id"]) || `${cfg.state}-A-${i}`,
    seeker_role: pick(idx, row, ["seeker_role", "job_role", "role", "title"]) || "—",
    location: pick(idx, row, ["location", "user_district", "llm_location_district", "area"]),
    job_id: pick(idx, row, ["job_id"]),
    applied_date: pick(idx, row, [
      "applied_at",
      "applied_date",
      "application_date",
      "created_at",
      "timestamp",
    ]),
  }));

  // Filter by district column if present; else by job_id membership.
  const districtCol = idx.has("user_district") || idx.has("llm_location_district");
  let out = mapped;
  if (districtCol) {
    const filtered = mapped.filter((a) => ci(a.location || "") === districtCi);
    if (filtered.length > 0) out = filtered;
  } else if (jobIds.size > 0) {
    const filtered = mapped.filter((a) => jobIds.has(a.job_id));
    if (filtered.length > 0) out = filtered;
  }
  return out;
}

async function readSeekerCounts(
  cfg: RegionConfig,
  district: string,
  unmapped: Set<string>,
): Promise<{ profiles: number; accounts: number; orgs: number }> {
  const tab = await resolveTabs(cfg.seekerSheet, cfg.seekerTab, (t) => /seeker/i.test(t));
  // Read all rows but only the light columns we need (id, user_id, organization/institution, district).
  const { headers, rows } = await readSheet(cfg.seekerSheet, tab);
  const idx = indexHeaders(headers);
  if (!idx.has("user_id")) unmapped.add("seekers:user_id");

  const districtCi = ci(district);
  const districtCol = idx.get("location_district") ?? idx.get("district");

  const profiles = new Set<string>();
  const accounts = new Set<string>();
  const orgs = new Set<string>();
  let matched = 0;
  for (const [i, row] of rows.entries()) {
    if (districtCol !== undefined && ci(row[districtCol] ?? "") !== districtCi) continue;
    matched++;
    const id = pick(idx, row, ["id"]) || `row-${i}`;
    profiles.add(id);
    const uid = pick(idx, row, ["user_id"]);
    if (uid) accounts.add(uid);
    const org = pick(idx, row, [
      "org_name",
      "organization_name",
      "organisation",
      "organization",
      "institution_name",
      "institution",
      "institute",
    ]);
    if (org) orgs.add(org.trim());
  }
  // If district filter yielded nothing, fall back to region-wide row count.
  if (matched === 0) {
    try {
      const total = await getSheetRowCount(cfg.seekerSheet, tab);
      return { profiles: total, accounts: total, orgs: orgs.size };
    } catch (e) {
      // The row count is a fallback figure; without it the page still shows the rows read.
      logEvent("warn", {
        operation: "ecosystem.seekerRowCount",
        status: "skipped",
        error: e instanceof Error ? e.name : "Unknown error",
      });
      return { profiles: rows.length, accounts: 0, orgs: 0 };
    }
  }
  return { profiles: profiles.size, accounts: accounts.size, orgs: orgs.size };
}

/** Applications sent to the page as a sample; the totals still count all of them. */
const APPLICATION_SAMPLE_SIZE = 500;
/** Applications newer than this many days count as "this week". */
const WEEK_DAYS = 7;
/** Applications up to this many days old count as "this month". */
const MONTH_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Reads jobs, then the applications for those jobs. */
async function readJobsAndApplications(cfg: RegionConfig, district: string, unmapped: Set<string>) {
  const jobs = await readJobs(cfg, district, unmapped);
  const jobIds = new Set(jobs.map((j) => j.id).filter(Boolean));
  const apps = await readApplications(cfg, district, jobIds, unmapped);
  return { jobs, apps };
}

/**
 * Loads the Ecosystem View for one district of a region.
 *
 * @throws {Error} When the region is unknown.
 * @throws {UpstreamError} When a sheet cannot be read.
 */
export async function loadEcosystem(state: string, district: string): Promise<EcoPayload> {
  const cfg = REGION_CONFIGS[state];
  if (!cfg) throw new Error(`Unknown region state: ${state}`);
  // Separate sets keep the unmapped list in jobs, applications, seekers order.
  const jobsUnmapped = new Set<string>();
  const seekersUnmapped = new Set<string>();
  const [{ jobs, apps }, seekerCounts] = await Promise.all([
    readJobsAndApplications(cfg, district, jobsUnmapped),
    readSeekerCounts(cfg, district, seekersUnmapped),
  ]);

  const now = Date.now();
  const buckets = { week: 0, month: 0, older: 0 };
  for (const a of apps) {
    const t = new Date(a.applied_date).getTime();
    if (!Number.isFinite(t)) {
      buckets.older++;
      continue;
    }
    const days = (now - t) / MS_PER_DAY;
    if (days < WEEK_DAYS) buckets.week++;
    else if (days <= MONTH_DAYS) buckets.month++;
    else buckets.older++;
  }

  return {
    jobs,
    applications: {
      total: apps.length,
      buckets,
      sample: apps.slice(0, APPLICATION_SAMPLE_SIZE),
    },
    seekerCounts,
    lastSyncedAt: new Date().toISOString(),
    unmapped: [...jobsUnmapped, ...seekersUnmapped],
  };
}
