// Server-only helpers for the Ecosystem View.
// Reads Google Sheets via the shared sheets.server reader and produces a
// compact, UI-shaped payload.
import { listSheetTabs, readSheet, getSheetRowCount } from "./sheets.server";
import { REGION_CONFIGS, type RegionConfig } from "./ecosystem-config";

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

export interface EcoApplication {
  id: string;
  seeker_role: string;
  location: string;
  job_id: string;
  applied_date: string;
}

export interface EcoPayload {
  jobs: EcoJob[];
  applications: {
    total: number;
    buckets: { week: number; month: number; older: number };
    sample: EcoApplication[]; // capped
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

function indexHeaders(headers: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    const k = normKey(h);
    if (!(k in idx)) idx[k] = i;
  });
  return idx;
}

function pick(
  idx: Record<string, number>,
  row: string[],
  aliases: string[],
): string {
  for (const a of aliases) {
    const k = normKey(a);
    if (k in idx) {
      const v = row[idx[k]];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        return String(v);
      }
    }
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
  if (s.includes("closed") || s.includes("archived") || s.includes("filled") || s.includes("cancel")) return "closed";
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

async function readJobs(cfg: RegionConfig, district: string, unmapped: Set<string>): Promise<EcoJob[]> {
  const tab = await resolveTabs(cfg.jobsSheet, cfg.jobsTab, (t) =>
    /open_?roles|jobs?_post|job_posts?/i.test(t),
  );
  const { headers, rows } = await readSheet(cfg.jobsSheet, tab);
  const idx = indexHeaders(headers);

  const REQUIRED = ["current_openings", "openings", "role", "title"];
  for (const r of REQUIRED) if (!(r in idx)) unmapped.add(`jobs:${r}`);

  const districtCi = ci(district);
  const mapped: EcoJob[] = rows.map((row, i) => {
    const openings =
      asNum(pick(idx, row, ["current_openings", "openings", "number_of_openings", "no_of_openings", "vacancies"]));
    const applications = asNum(pick(idx, row, ["applications", "no_of_applications", "total_applications"]));
    const partial = asNum(pick(idx, row, [
      "partial_fit_seeker_count",
      "partial_fit_seekers_count",
      "partial_fit_seekers",
      "partial_fit",
    ]));
    const right = asNum(pick(idx, row, [
      "right_fit_seekers_count",
      "right_fit_seeker_count",
      "right_fit_seekers",
      "right_fit",
      "direct_fit",
    ]));
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
      posted_by: pick(idx, row, ["organization_name", "organisation_name", "company", "company_name", "posted_by"]),
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
      contact_phone: pick(idx, row, ["contact_number_of_created_by_id", "contact_number", "contact_phone"]),
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
  const tab = await resolveTabs(cfg.jobsSheet, cfg.applicationsTab, (t) =>
    /application/i.test(t),
  );
  const { headers, rows } = await readSheet(cfg.jobsSheet, tab);
  const idx = indexHeaders(headers);
  if (!("applied_at" in idx) && !("applied_date" in idx) && !("created_at" in idx) && !("timestamp" in idx)) {
    unmapped.add("applications:applied_date");
  }

  const districtCi = ci(district);
  const mapped: EcoApplication[] = rows.map((row, i) => ({
    id: pick(idx, row, ["id"]) || `${cfg.state}-A-${i}`,
    seeker_role: pick(idx, row, ["seeker_role", "job_role", "role", "title"]) || "—",
    location: pick(idx, row, ["location", "user_district", "llm_location_district", "area"]),
    job_id: pick(idx, row, ["job_id"]),
    applied_date: pick(idx, row, ["applied_at", "applied_date", "application_date", "created_at", "timestamp"]),
  }));

  // Filter by district column if present; else by job_id membership.
  const districtCol = "user_district" in idx || "llm_location_district" in idx;
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
  if (!("user_id" in idx)) unmapped.add("seekers:user_id");

  const districtCi = ci(district);
  const districtColKey = "location_district" in idx ? "location_district" : "district" in idx ? "district" : null;

  const profiles = new Set<string>();
  const accounts = new Set<string>();
  const orgs = new Set<string>();
  let matched = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (districtColKey) {
      const v = row[idx[districtColKey]] ?? "";
      if (ci(String(v)) !== districtCi) continue;
    }
    matched++;
    const id = pick(idx, row, ["id"]) || `row-${i}`;
    profiles.add(id);
    const uid = pick(idx, row, ["user_id"]);
    if (uid) accounts.add(uid);
    const org = pick(idx, row, ["org_name", "organization_name", "organisation", "organization", "institution_name", "institution", "institute"]);
    if (org) orgs.add(org.trim());
  }
  // If district filter yielded nothing, fall back to region-wide row count.
  if (matched === 0) {
    try {
      const total = await getSheetRowCount(cfg.seekerSheet, tab);
      return { profiles: total, accounts: total, orgs: orgs.size };
    } catch {
      return { profiles: rows.length, accounts: 0, orgs: 0 };
    }
  }
  return { profiles: profiles.size, accounts: accounts.size, orgs: orgs.size };
}

export async function loadEcosystem(state: string, district: string): Promise<EcoPayload> {
  const cfg = REGION_CONFIGS[state];
  if (!cfg) throw new Error(`Unknown region state: ${state}`);
  const unmapped = new Set<string>();

  const jobs = await readJobs(cfg, district, unmapped);
  const jobIds = new Set(jobs.map((j) => j.id).filter(Boolean));

  const apps = await readApplications(cfg, district, jobIds, unmapped);
  const seekerCounts = await readSeekerCounts(cfg, district, unmapped);

  const now = Date.now();
  const buckets = { week: 0, month: 0, older: 0 };
  for (const a of apps) {
    const t = new Date(a.applied_date).getTime();
    if (!Number.isFinite(t)) { buckets.older++; continue; }
    const days = (now - t) / (1000 * 60 * 60 * 24);
    if (days < 7) buckets.week++;
    else if (days <= 30) buckets.month++;
    else buckets.older++;
  }

  return {
    jobs,
    applications: {
      total: apps.length,
      buckets,
      sample: apps.slice(0, 500),
    },
    seekerCounts,
    lastSyncedAt: new Date().toISOString(),
    unmapped: Array.from(unmapped),
  };
}
