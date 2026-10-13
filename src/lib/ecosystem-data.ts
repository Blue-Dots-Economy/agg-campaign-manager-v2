// Facilitation Centre data module — SAMPLE DATA, district-aware.
// Every figure is generated per district (deterministic seed); "All districts"
// is built by summing the per-district ROWS, and any ratio/gap is computed from
// those summed rows — never by averaging districts.
// All numbers live here behind typed accessors so this can be swapped to a
// live backend later without touching the UI.

import { DISTRICT_LIST, getRegionRollup } from "./my-dots-region";

export const ALL_DISTRICTS = "all";

/** district === ALL_DISTRICTS means the national roll-up. */
export interface EcosystemRegion {
  state: string;
  district: string;
}

export { DISTRICT_LIST };

export interface EcosystemTotals {
  totalSeekers: number;
  totalProviders: number;
  totalConnections: number;
  seekersInitiated: number;
  providersInitiated: number;
  seekerDemandGap: number;
  providerSupplyGap: number;
}

export interface ProviderCategoryRow {
  category: string;
  providers: number;
  capacity: number;
  matching: number;
  connections: number;
}

export interface SeekerNeedRow {
  area: string;
  aggregators: number;
  reach: number;
  matching: number;
  connections: number;
}

export interface OrgRow {
  org: string;
  email: string;
  phone: string;
  capacity: number;
  matching: number;
  connections: number;
}

export interface AggregatorRow {
  org: string;
  email: string;
  phone: string;
  reach: number;
  matching: number;
  connections: number;
}

// Base shape (one "reference district"); each district scales and skews it.
const PROVIDER_BASE: ProviderCategoryRow[] = [
  { category: "Assistive Devices", providers: 3, capacity: 90, matching: 780, connections: 0 },
  { category: "Training & Skill Building", providers: 4, capacity: 240, matching: 550, connections: 0 },
  { category: "Health & Rehab", providers: 5, capacity: 360, matching: 420, connections: 0 },
  { category: "Government Schemes & Certification", providers: 2, capacity: 120, matching: 300, connections: 0 },
  { category: "Employment Opportunities", providers: 1, capacity: 30, matching: 180, connections: 0 },
];

const SEEKER_BASE: SeekerNeedRow[] = [
  { area: "Financial Aid", aggregators: 2, reach: 360, matching: 440, connections: 0 },
  { area: "Skill Training", aggregators: 3, reach: 320, matching: 290, connections: 0 },
  { area: "Assistive Devices", aggregators: 2, reach: 220, matching: 200, connections: 0 },
  { area: "Employment", aggregators: 1, reach: 140, matching: 125, connections: 0 },
  { area: "Rehabilitation", aggregators: 2, reach: 100, matching: 65, connections: 0 },
  { area: "Multiple Needs", aggregators: 2, reach: 180, matching: 250, connections: 0 },
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DistrictEco {
  name: string;
  state: string;
  totalSeekers: number;
  seekersInitiated: number;
  providersInitiated: number;
  providers: ProviderCategoryRow[];
  needs: SeekerNeedRow[];
  health: OnboardingHealth;
}

// Size and health come from the My Purple Dots sample (participant count and
// activity score), so a district reads the same on both pages.
function buildDistricts(): DistrictEco[] {
  const nat = getRegionRollup({ region: "", period: 30, type: "all", scope: { kind: "national" } });
  const refSize = 240; // Basti = reference district
  return DISTRICT_LIST.map((d, di) => {
    const row = nat.districts.find((x) => x.name === d.name);
    const size = (row?.total ?? refSize) / refSize;
    const health = (row?.activityScore ?? 60) / 100;
    const rand = mulberry32(0xec0 + di * 7919);
    const jitter = () => 0.85 + rand() * 0.3;
    const providers = PROVIDER_BASE.map((r) => {
      const capacity = Math.round(r.capacity * size * (0.4 + health) * jitter());
      const matching = Math.round(r.matching * size * jitter());
      return {
        category: r.category,
        providers: Math.max(1, Math.round(r.providers * size * (0.5 + health))),
        capacity,
        matching,
        connections: Math.round(Math.min(capacity, matching) * health * health * 0.35 * jitter()),
      };
    });
    const needs = SEEKER_BASE.map((r) => {
      const reach = Math.round(r.reach * size * (0.4 + health) * jitter());
      const matching = Math.round(r.matching * size * jitter());
      return {
        area: r.area,
        aggregators: Math.max(1, Math.round(r.aggregators * size * (0.5 + health))),
        reach,
        matching,
        connections: Math.round(Math.min(reach, matching) * health * health * 0.35 * jitter()),
      };
    });
    const totalRegistered = Math.round(8 * size * jitter());
    const verified = Math.round(totalRegistered * Math.min(1, health + 0.05));
    return {
      name: d.name,
      state: d.state,
      totalSeekers: Math.round(1100 * size * jitter()),
      seekersInitiated: Math.round(60 * size * health * jitter()),
      providersInitiated: Math.round(8 * size * health * jitter()),
      providers,
      needs,
      health: { totalRegistered, verified, unverified: totalRegistered - verified },
    };
  });
}

const DISTRICT_ECO: DistrictEco[] = buildDistricts();

function inScope(region: EcosystemRegion): DistrictEco[] {
  if (!region.district || region.district === ALL_DISTRICTS) return DISTRICT_ECO;
  return DISTRICT_ECO.filter((d) => d.name === region.district);
}

function sumBy<T extends Record<string, unknown>>(rows: T[][], key: keyof T & string, numKeys: (keyof T & string)[]): T[] {
  const out = new Map<string, T>();
  for (const list of rows)
    for (const r of list) {
      const k = String(r[key]);
      const cur = out.get(k);
      if (!cur) out.set(k, { ...r });
      else for (const n of numKeys) (cur as Record<string, unknown>)[n] = (cur[n] as number) + (r[n] as number);
    }
  return [...out.values()];
}

function maskedEmail(name: string, domain: string): string {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  const d = domain.toLowerCase().replace(/[^a-z]/g, "");
  const mask = (s: string) =>
    s.length <= 2 ? s : `${s[0]}${"●".repeat(Math.max(1, Math.min(6, s.length - 2)))}${s[s.length - 1]}`;
  return `${mask(n || "org")}@${mask(d || "site")}.org`;
}

function maskedPhone(seed: number): string {
  const last = String(10 + (seed % 90));
  return `+91 9●●●●●●●${last}`;
}

const PROVIDER_ORG_NAMES: Record<string, string[]> = {
  "Assistive Devices": [
    "Bhagirathi Mobility Trust",
    "Sparsh Assistive Tech",
    "Aadhaar Devices Foundation",
    "Chetana Hearing Care",
    "Netra Vision Aids",
  ],
  "Training & Skill Building": [
    "Kaushal Vikas Kendra",
    "Enable Skills Academy",
    "Samarth Livelihoods",
    "Disha Training Institute",
    "Prayas Vocational Trust",
    "Udaan Learning Hub",
  ],
  "Health & Rehab": [
    "Arogya Rehab Centre",
    "Sanjeevani Therapy Clinic",
    "Nirmal Physio Services",
    "Jeevan Rehabilitation Trust",
    "Swasthya Care Network",
    "Anand Wellness Centre",
  ],
  "Government Schemes & Certification": [
    "District Social Welfare Office",
    "UDID Certification Camp",
    "Sugamya Bharat Cell",
    "State Pension Facilitation Desk",
  ],
  "Employment Opportunities": [
    "Sakshamx Employers Network",
    "Inclusive Hiring Collective",
    "Rozgar Placement Cell",
  ],
};

const AGGREGATOR_ORG_NAMES: Record<string, string[]> = {
  "Financial Aid": [
    "Sahayata Welfare Society",
    "Grameen Support Sangh",
    "Nidhi Aid Collective",
    "Aashray Foundation",
  ],
  "Skill Training": [
    "Yuva Shakti Network",
    "Pragati Community Group",
    "Sankalp Skill Sangathan",
    "Nayi Disha Collective",
    "Umeed Youth Forum",
  ],
  "Assistive Devices": [
    "Sahyog Disability Forum",
    "Sparsh Community Circle",
    "Ekta Care Network",
    "Drishti Support Group",
  ],
  Employment: [
    "Kaam Se Jodo Sangh",
    "Swavlamban Network",
    "Aajeevika Collective",
  ],
  Rehabilitation: [
    "Punarjeevan Support Group",
    "Sneha Care Circle",
    "Aarogya Sangam",
    "Navjeevan Forum",
  ],
  "Multiple Needs": [
    "Samagra Seva Sangh",
    "Sarvodaya Community Trust",
    "Milap Welfare Network",
    "Ekjut Collective",
  ],
};

function splitEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const rem = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rem ? 1 : 0));
}

export function getProviderCategories(region: EcosystemRegion): ProviderCategoryRow[] {
  return sumBy(inScope(region).map((d) => d.providers), "category", ["providers", "capacity", "matching", "connections"]);
}

export function getSeekerNeeds(region: EcosystemRegion): SeekerNeedRow[] {
  return sumBy(inScope(region).map((d) => d.needs), "area", ["aggregators", "reach", "matching", "connections"]);
}

/** Totals are sums of the in-scope rows; gaps are computed from the summed rows. */
export function getEcosystemTotals(region: EcosystemRegion): EcosystemTotals {
  const ds = inScope(region);
  const prov = getProviderCategories(region);
  const need = getSeekerNeeds(region);
  return {
    totalSeekers: ds.reduce((a, d) => a + d.totalSeekers, 0),
    totalProviders: prov.reduce((a, r) => a + r.providers, 0),
    totalConnections: prov.reduce((a, r) => a + r.connections, 0),
    seekersInitiated: ds.reduce((a, d) => a + d.seekersInitiated, 0),
    providersInitiated: ds.reduce((a, d) => a + d.providersInitiated, 0),
    seekerDemandGap: need.reduce((a, r) => a + demandSupplyGap(r.matching, r.reach), 0),
    providerSupplyGap: prov.reduce((a, r) => a + demandSupplyGap(r.matching, r.capacity), 0),
  };
}

// Organisation rows are generated per district (names carry the district), and
// the national list is their concatenation — so drill-downs sum to the gap row.
export function getProvidersForCategory(region: EcosystemRegion, category: string): OrgRow[] {
  return inScope(region).flatMap((d, di) => {
    const row = d.providers.find((r) => r.category === category);
    if (!row) return [];
    const base = PROVIDER_ORG_NAMES[category] ?? [];
    const list = Array.from({ length: row.providers }, (_, i) =>
      `${base[(i + di) % Math.max(1, base.length)] ?? `${category} Provider ${i + 1}`}${i >= base.length ? ` ${Math.floor(i / Math.max(1, base.length)) + 1}` : ""}, ${d.name}`,
    );
    const cap = splitEvenly(row.capacity, list.length);
    const match = splitEvenly(row.matching, list.length);
    const conn = splitEvenly(row.connections, list.length);
    return list.map((org, i) => ({
      org,
      email: maskedEmail(org.split(" ")[0], org.split(" ")[1] ?? "org"),
      phone: maskedPhone(i + category.length + di),
      capacity: cap[i] ?? 0,
      matching: match[i] ?? 0,
      connections: conn[i] ?? 0,
    }));
  });
}

export function getAggregatorsForNeed(region: EcosystemRegion, area: string): AggregatorRow[] {
  return inScope(region).flatMap((d, di) => {
    const row = d.needs.find((r) => r.area === area);
    if (!row) return [];
    const base = AGGREGATOR_ORG_NAMES[area] ?? [];
    const list = Array.from({ length: row.aggregators }, (_, i) =>
      `${base[(i + di) % Math.max(1, base.length)] ?? `${area} Aggregator ${i + 1}`}${i >= base.length ? ` ${Math.floor(i / Math.max(1, base.length)) + 1}` : ""}, ${d.name}`,
    );
    const reach = splitEvenly(row.reach, list.length);
    const match = splitEvenly(row.matching, list.length);
    const conn = splitEvenly(row.connections, list.length);
    return list.map((org, i) => ({
      org,
      email: maskedEmail(org.split(" ")[0], org.split(" ")[1] ?? "org"),
      phone: maskedPhone(i + area.length + di),
      reach: reach[i] ?? 0,
      matching: match[i] ?? 0,
      connections: conn[i] ?? 0,
    }));
  });
}

/* ---------- gap helpers ---------- */

export type GapLevelLabel = "High" | "Medium" | "Low";

export function gapLevel(gap: number, base: number): GapLevelLabel {
  if (base <= 0 || gap <= 0) return "Low";
  const ratio = gap / base;
  if (ratio >= 0.5) return "High";
  if (ratio >= 0.2) return "Medium";
  return "Low";
}

export function recommendedActions(
  kind: "provider" | "seeker",
  actionLevel: GapLevelLabel,
  dsLevel: GapLevelLabel,
): string[] {
  const out: string[] = [];
  if (actionLevel === "High" && dsLevel !== "High") out.push("Trigger action gap call");
  if (dsLevel === "High" || dsLevel === "Medium") {
    if (kind === "provider") {
      out.push("Look for more providers", "Increase capacity with providers");
    } else {
      out.push("Direct campaign to add new seekers", "Add seekers via aggregators");
    }
  }
  return out;
}

export const actionGap = (matching: number, connections: number) =>
  Math.max(0, matching - connections);

export const demandSupplyGap = (matching: number, supply: number) =>
  Math.max(0, matching - supply);

/* ---------- onboarding ---------- */

export interface RegistrationLink {
  id: string;
  name: string;
  description: string;
  slug: string;
  domain: "Seeker" | "Provider";
  active: boolean;
  registrations: number;
  verified: number;
  lastUsed: string;
}

export interface FlaggedProfile {
  id: string;
  name: string;
  type: "Seeker" | "Provider";
  issue: string;
  uploadDate: string;
  daysFlagged: number;
}

export interface OnboardingHealth {
  totalRegistered: number;
  verified: number;
  unverified: number;
}


const REGISTRATION_LINKS: RegistrationLink[] = [
  {
    id: "lnk-1",
    name: "Lucknow field drive — Apr 2026",
    description: "Door-to-door outreach by the field team across Lucknow district",
    slug: "lucknow-field-apr26",
    domain: "Seeker",
    active: true,
    registrations: 412,
    verified: 389,
    lastUsed: "Last used 2 hours ago",
  },
  {
    id: "lnk-2",
    name: "WhatsApp broadcast — Lucknow",
    description: "Shared via community WhatsApp groups in Lucknow",
    slug: "wa-lucknow-seekers",
    domain: "Seeker",
    active: true,
    registrations: 231,
    verified: 198,
    lastUsed: "Last used 1 day ago",
  },
  {
    id: "lnk-3",
    name: "Provider onboarding — Lucknow",
    description: "Direct outreach to service providers in Lucknow",
    slug: "provider-lkw-rehab",
    domain: "Provider",
    active: true,
    registrations: 87,
    verified: 74,
    lastUsed: "Last used 3 days ago",
  },
];

const FLAGGED_PROFILES: FlaggedProfile[] = [
  {
    id: "flg-1",
    name: "Raj Rehabilitation Centre",
    type: "Provider",
    issue: "Missing: service category",
    uploadDate: "10 Mar 2026",
    daysFlagged: 21,
  },
  {
    id: "flg-2",
    name: "Sharma Assistive Devices",
    type: "Provider",
    issue: "Missing: mobile number",
    uploadDate: "05 Mar 2026",
    daysFlagged: 26,
  },
  {
    id: "flg-3",
    name: "Kiran Vision Care",
    type: "Provider",
    issue: "Format error: email",
    uploadDate: "01 Mar 2026",
    daysFlagged: 30,
  },
];

export function getOnboardingHealth(region: EcosystemRegion): OnboardingHealth {
  const ds = inScope(region);
  return {
    totalRegistered: ds.reduce((a, d) => a + d.health.totalRegistered, 0),
    verified: ds.reduce((a, d) => a + d.health.verified, 0),
    unverified: ds.reduce((a, d) => a + d.health.unverified, 0),
  };
}

// Example links/flags are templates, re-labelled per district with district-scaled counts.
export function getRegistrationLinks(region: EcosystemRegion): RegistrationLink[] {
  return inScope(region).flatMap((d) => {
    const scale = d.totalSeekers / 1100;
    return REGISTRATION_LINKS.map((l) => ({
      ...l,
      id: `${l.id}-${d.name}`,
      name: l.name.replace(/Lucknow/g, d.name),
      description: l.description.replace(/Lucknow/g, d.name),
      slug: l.slug.replace(/lucknow|lkw/g, d.name.toLowerCase()),
      registrations: Math.round(l.registrations * scale),
      verified: Math.round(l.verified * scale),
    }));
  });
}

export function getFlaggedProfiles(region: EcosystemRegion): FlaggedProfile[] {
  return inScope(region).flatMap((d, di) =>
    FLAGGED_PROFILES.slice(0, Math.max(1, Math.min(3, d.health.unverified))).map((p) => ({
      ...p,
      id: `${p.id}-${d.name}`,
      name: `${p.name}, ${d.name}`,
      daysFlagged: p.daysFlagged + di,
    })),
  );
}
