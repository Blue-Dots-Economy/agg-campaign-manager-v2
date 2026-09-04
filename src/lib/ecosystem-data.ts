// Facilitation Centre data module.
// All numbers live here behind typed accessors so this can be swapped to a
// live backend later without touching the UI.

export interface EcosystemRegion {
  state: string;
  district: string;
}

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

const TOTALS: EcosystemTotals = {
  totalSeekers: 5550,
  totalProviders: 47,
  totalConnections: 342,
  seekersInitiated: 210,
  providersInitiated: 28,
  seekerDemandGap: 6903,
  providerSupplyGap: 78,
};

const PROVIDER_CATEGORIES: ProviderCategoryRow[] = [
  { category: "Assistive Devices", providers: 9, capacity: 450, matching: 3889, connections: 47 },
  { category: "Training & Skill Building", providers: 12, capacity: 1200, matching: 2742, connections: 128 },
  { category: "Health & Rehab", providers: 18, capacity: 1800, matching: 2080, connections: 95 },
  { category: "Government Schemes & Certification", providers: 5, capacity: 600, matching: 1480, connections: 52 },
  { category: "Employment Opportunities", providers: 3, capacity: 150, matching: 912, connections: 20 },
];

const SEEKER_NEEDS: SeekerNeedRow[] = [
  { area: "Financial Aid", aggregators: 6, reach: 1800, matching: 2180, connections: 52 },
  { area: "Skill Training", aggregators: 9, reach: 1600, matching: 1450, connections: 128 },
  { area: "Assistive Devices", aggregators: 7, reach: 1100, matching: 980, connections: 47 },
  { area: "Employment", aggregators: 4, reach: 700, matching: 620, connections: 20 },
  { area: "Rehabilitation", aggregators: 8, reach: 500, matching: 320, connections: 95 },
  { area: "Multiple Needs", aggregators: 5, reach: 900, matching: 1240, connections: 0 },
];

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

export function getEcosystemTotals(_region: EcosystemRegion): EcosystemTotals {
  return { ...TOTALS };
}

export function getProviderCategories(_region: EcosystemRegion): ProviderCategoryRow[] {
  return PROVIDER_CATEGORIES.map((r) => ({ ...r }));
}

export function getSeekerNeeds(_region: EcosystemRegion): SeekerNeedRow[] {
  return SEEKER_NEEDS.map((r) => ({ ...r }));
}

export function getProvidersForCategory(
  _region: EcosystemRegion,
  category: string,
): OrgRow[] {
  const row = PROVIDER_CATEGORIES.find((r) => r.category === category);
  if (!row) return [];
  const names =
    PROVIDER_ORG_NAMES[category] ??
    Array.from({ length: Math.max(1, row.providers) }, (_, i) => `${category} Provider ${i + 1}`);
  const list = names.slice(0, Math.max(1, row.providers));
  const cap = splitEvenly(row.capacity, list.length);
  const match = splitEvenly(row.matching, list.length);
  const conn = splitEvenly(row.connections, list.length);
  return list.map((org, i) => ({
    org,
    email: maskedEmail(org.split(" ")[0], org.split(" ")[1] ?? "org"),
    phone: maskedPhone(i + category.length),
    capacity: cap[i] ?? 0,
    matching: match[i] ?? 0,
    connections: conn[i] ?? 0,
  }));
}

export function getAggregatorsForNeed(
  _region: EcosystemRegion,
  area: string,
): AggregatorRow[] {
  const row = SEEKER_NEEDS.find((r) => r.area === area);
  if (!row) return [];
  const names =
    AGGREGATOR_ORG_NAMES[area] ??
    Array.from({ length: Math.max(1, row.aggregators) }, (_, i) => `${area} Aggregator ${i + 1}`);
  const list = names.slice(0, Math.max(1, row.aggregators));
  const reach = splitEvenly(row.reach, list.length);
  const match = splitEvenly(row.matching, list.length);
  const conn = splitEvenly(row.connections, list.length);
  return list.map((org, i) => ({
    org,
    email: maskedEmail(org.split(" ")[0], org.split(" ")[1] ?? "org"),
    phone: maskedPhone(i + area.length),
    reach: reach[i] ?? 0,
    matching: match[i] ?? 0,
    connections: conn[i] ?? 0,
  }));
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

const ONBOARDING_HEALTH: OnboardingHealth = {
  totalRegistered: 24,
  verified: 18,
  unverified: 6,
};

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

export function getOnboardingHealth(_region: EcosystemRegion): OnboardingHealth {
  return { ...ONBOARDING_HEALTH };
}

export function getRegistrationLinks(_region: EcosystemRegion): RegistrationLink[] {
  return REGISTRATION_LINKS.map((l) => ({ ...l }));
}

export function getFlaggedProfiles(_region: EcosystemRegion): FlaggedProfile[] {
  return FLAGGED_PROFILES.map((p) => ({ ...p }));
}
