// Region-scoped "My Purple Dots" rollup — PREVIEW SAMPLE DATA.
// One participant array is the single source of truth; every number the view
// shows is derived from it. Nothing here carries a person's name or PII.

export type ParticipantType = "seeker" | "provider";
export type Lifecycle = "new" | "active" | "at-risk" | "inactive";
export type Period = 7 | 30 | 90;

export interface ScopedParticipant {
  id: string;
  type: ParticipantType;
  orgId: string;
  district: string;
  coordinatorCode: string;
  joinedDaysAgo: number;
  lastEngagedDaysAgo: number | null; // null = never engaged
  profileCompletion: number; // 0-100
}

export interface ScopedParticipantRow extends ScopedParticipant {
  lifecycle: Lifecycle;
}

export type StatusCounts = Record<Lifecycle, number>;

export interface CoordinatorRow {
  code: string;
  orgId: string;
  total: number;
  status: StatusCounts;
  newInPeriod: number;
  avgCompletion: number;
  belowThreshold: number;
  activePct: number;
  inactivePct: number;
  /** round(0.5 * (100 - inactivePct) + 0.5 * avgCompletion) */
  activityScore: number;
  participants: ScopedParticipantRow[];
}

export interface OrgRow {
  id: string;
  name: string;
  kind: "College" | "Association";
  total: number;
  status: StatusCounts;
  newInPeriod: number;
  avgCompletion: number;
  belowThreshold: number;
  activePct: number;
  inactivePct: number;
  /** round(0.5 * (100 - inactivePct) + 0.5 * avgCompletion) */
  activityScore: number;
  coordinators: CoordinatorRow[];
}

export interface DistrictRow {
  name: string;
  state: string;
  total: number;
  status: StatusCounts;
  newInPeriod: number;
  avgCompletion: number;
  belowThreshold: number;
  activePct: number;
  inactivePct: number;
  /** round(0.5 * (100 - inactivePct) + 0.5 * avgCompletion) */
  activityScore: number;
  organisationCount: number;
  coordinatorCount: number;
  orgs: OrgRow[];
}

/** `region` is a legacy alias for `district` (the district named by `opts.region`),
 *  kept so existing callers render unchanged. */
export type RollupScope =
  | { kind: "national" }
  | { kind: "district"; district: string }
  | { kind: "region" }
  | { kind: "org"; orgId: string }
  | { kind: "coordinator"; code: string };

export interface RegionRollup {
  region: string;
  scope: RollupScope;
  period: Period;
  type: "all" | ParticipantType;
  isSample: true;
  total: number;
  status: StatusCounts;
  /** Mean completion over ALL in-scope participants (never a mean of district/org means). */
  avgCompletion: number;
  /** Same formula as orgs/coordinators, computed from all in-scope participants. */
  activityScore: number;
  needsAttention: {
    inactiveSharePct: number;
    coordinatorsWithZeroNewOnboards: number;
    profilesBelowThreshold: number;
  };
  organisationCount: number;
  coordinatorCount: number;
  districtCount: number;
  /** Every district in scope, each with its orgs nested (national → district → org → coordinator). */
  districts: DistrictRow[];
  /** Flat list of in-scope orgs (same objects as nested under `districts`). */
  orgs: OrgRow[];
}

export const PROFILE_COMPLETION_THRESHOLD = 60;

export function deriveLifecycle(p: ScopedParticipant): Lifecycle {
  if (p.joinedDaysAgo <= 7) return "new";
  const d = p.lastEngagedDaysAgo;
  if (d === null || d > 90) return "inactive";
  if (d <= 30) return "active";
  return "at-risk";
}

// ---------- sample generation (deterministic) ----------

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

interface OrgSpec {
  id: string;
  district: string;
  name: string;
  kind: "College" | "Association";
  /** 0..1 — higher = more recently engaged, more complete profiles */
  health: number;
  coordinators: {
    code: string;
    size: number;
    recentOnboards: boolean;
    /** Only one participant in the last 90 days; the rest joined earlier. */
    sparse?: boolean;
  }[];
}

interface DistrictSpec {
  name: string;
  state: string;
  seed: number;
  seekerStart: number;
  providerStart: number;
  /** ID prefix for participants, e.g. BST → BST-S-0400 */
  prefix: string;
}

const DISTRICTS: DistrictSpec[] = [
  { name: "Basti", state: "Uttar Pradesh", seed: 0xb4571, seekerStart: 400, providerStart: 30, prefix: "BST" },
  { name: "Gorakhpur", state: "Uttar Pradesh", seed: 0x60a4f, seekerStart: 100, providerStart: 10, prefix: "GKP" },
  { name: "Madurai", state: "Tamil Nadu", seed: 0x3ad41, seekerStart: 100, providerStart: 10, prefix: "MDU" },
  { name: "Nagpur", state: "Maharashtra", seed: 0x9a6f2, seekerStart: 100, providerStart: 10, prefix: "NGP" },
  { name: "Bahraich", state: "Uttar Pradesh", seed: 0xb4a1c, seekerStart: 100, providerStart: 10, prefix: "BRH" },
];

const ORGS: OrgSpec[] = [
  {
    id: "ORG-BDSS",
    district: "Basti",
    name: "Basti Divyang Seva Samiti",
    kind: "Association",
    health: 0.85,
    coordinators: [
      { code: "BST-C01", size: 28, recentOnboards: true },
      { code: "BST-C02", size: 24, recentOnboards: true },
      { code: "BST-C03", size: 22, recentOnboards: true },
    ],
  },
  {
    id: "ORG-GPB",
    district: "Basti",
    name: "Govt. Polytechnic Basti",
    kind: "College",
    health: 0.6,
    coordinators: [
      { code: "BST-C04", size: 26, recentOnboards: true },
      { code: "BST-C05", size: 20, recentOnboards: true },
      { code: "BST-C06", size: 18, recentOnboards: true },
    ],
  },
  {
    id: "ORG-ALIMCO",
    district: "Basti",
    name: "ALIMCO Regional Centre",
    kind: "Association",
    health: 0.25,
    coordinators: [
      { code: "BST-C07", size: 22, recentOnboards: false },
      { code: "BST-C08", size: 18, recentOnboards: true },
    ],
  },
  {
    id: "ORG-SKVI",
    district: "Basti",
    name: "Sant Kabir Vocational Institute",
    kind: "College",
    health: 0.5,
    coordinators: [
      { code: "BST-C09", size: 22, recentOnboards: true },
      { code: "BST-C10", size: 20, recentOnboards: true },
      { code: "BST-C11", size: 20, recentOnboards: true },
    ],
  },

  // --- Gorakhpur: large and healthy ---
  {
    id: "ORG-GKP-DRC", district: "Gorakhpur", name: "District Disability Rehabilitation Centre Gorakhpur", kind: "Association", health: 0.9,
    coordinators: [
      { code: "GKP-C01", size: 30, recentOnboards: true },
      { code: "GKP-C02", size: 28, recentOnboards: true },
      { code: "GKP-C03", size: 26, recentOnboards: true },
    ],
  },
  {
    id: "ORG-GKP-ITI", district: "Gorakhpur", name: "Govt. ITI Gorakhpur", kind: "College", health: 0.8,
    coordinators: [
      { code: "GKP-C04", size: 32, recentOnboards: true },
      { code: "GKP-C05", size: 24, recentOnboards: true },
    ],
  },
  {
    id: "ORG-GKP-SMS", district: "Gorakhpur", name: "Saksham Gorakhpur", kind: "Association", health: 0.75,
    coordinators: [
      { code: "GKP-C06", size: 34, recentOnboards: true },
      { code: "GKP-C07", size: 30, recentOnboards: true },
    ],
  },
  // --- Madurai: mid-sized, middling ---
  {
    id: "ORG-MDU-AVI", district: "Madurai", name: "Amar Seva Vocational Institute Madurai", kind: "College", health: 0.55,
    coordinators: [
      { code: "MDU-C01", size: 24, recentOnboards: true },
      { code: "MDU-C02", size: 22, recentOnboards: true },
    ],
  },
  {
    id: "ORG-MDU-DPA", district: "Madurai", name: "Madurai Differently Abled Association", kind: "Association", health: 0.45,
    coordinators: [
      { code: "MDU-C03", size: 20, recentOnboards: true },
      { code: "MDU-C04", size: 18, recentOnboards: false },
    ],
  },
  // --- Nagpur: decent engagement, almost no new onboards ---
  {
    id: "ORG-NGP-NCS", district: "Nagpur", name: "Nagpur Composite Regional Centre", kind: "Association", health: 0.6,
    coordinators: [
      { code: "NGP-C01", size: 30, recentOnboards: false },
      { code: "NGP-C02", size: 28, recentOnboards: false },
    ],
  },
  {
    id: "ORG-NGP-GPN", district: "Nagpur", name: "Govt. Polytechnic Nagpur", kind: "College", health: 0.55,
    coordinators: [
      { code: "NGP-C03", size: 26, recentOnboards: false },
      { code: "NGP-C04", size: 24, recentOnboards: true, sparse: true },
    ],
  },
  // --- Bahraich: small and struggling ---
  {
    id: "ORG-BRH-VSS", district: "Bahraich", name: "Viklang Sahayata Samiti Bahraich", kind: "Association", health: 0.15,
    coordinators: [
      { code: "BRH-C01", size: 22, recentOnboards: true },
      { code: "BRH-C02", size: 18, recentOnboards: false },
    ],
  },
  {
    id: "ORG-BRH-ITI", district: "Bahraich", name: "Govt. ITI Bahraich", kind: "College", health: 0.2,
    coordinators: [{ code: "BRH-C03", size: 16, recentOnboards: false }],
  },
];

// Each district has its own seed and counters, so adding/removing a district never
// shifts another district's numbers (Basti is byte-identical to the original 240).
function buildDistrict(d: DistrictSpec): ScopedParticipant[] {
  const rand = mulberry32(d.seed);
  const out: ScopedParticipant[] = [];
  let seekerN = d.seekerStart;
  let providerN = d.providerStart;
  for (const org of ORGS.filter((o) => o.district === d.name)) {
    for (const c of org.coordinators) {
      for (let i = 0; i < c.size; i++) {
        const type: ParticipantType = rand() < 0.82 ? "seeker" : "provider";
        // Coordinators without recent onboards never have anyone joined in the last 90 days.
        const minJoin = c.recentOnboards && (!c.sparse || i === 0) ? 1 : 95;
        const joinedDaysAgo = Math.floor(minJoin + Math.pow(rand(), 1.6) * (360 - minJoin));
        let lastEngagedDaysAgo: number | null;
        if (rand() < (1 - org.health) * 0.35) {
          lastEngagedDaysAgo = null;
        } else {
          const dd = Math.floor(1 + Math.pow(rand(), 1 + org.health * 4) * 150);
          lastEngagedDaysAgo = Math.min(joinedDaysAgo, dd);
        }
        const base = 25 + org.health * 55;
        const profileCompletion = Math.max(5, Math.min(100, Math.round(base + (rand() - 0.5) * 60)));
        const id =
          type === "seeker"
            ? `${d.prefix}-S-${String(seekerN++).padStart(4, "0")}`
            : `${d.prefix}-P-${String(providerN++).padStart(4, "0")}`;
        out.push({ id, type, orgId: org.id, district: d.name, coordinatorCode: c.code, joinedDaysAgo, lastEngagedDaysAgo, profileCompletion });
      }
    }
  }
  return out;
}

function buildSample(): ScopedParticipant[] {
  return DISTRICTS.flatMap(buildDistrict);
}

const SAMPLE: ScopedParticipant[] = buildSample();

// ---------- derivation ----------

function emptyStatus(): StatusCounts {
  return { new: 0, active: 0, "at-risk": 0, inactive: 0 };
}

function summarise(rows: ScopedParticipantRow[], period: Period) {
  const status = emptyStatus();
  let newInPeriod = 0;
  let sum = 0;
  let below = 0;
  for (const r of rows) {
    status[r.lifecycle]++;
    if (r.joinedDaysAgo <= period) newInPeriod++;
    sum += r.profileCompletion;
    if (r.profileCompletion < PROFILE_COMPLETION_THRESHOLD) below++;
  }
  const n = rows.length;
  const avgCompletion = n ? Math.round(sum / n) : 0;
  const inactivePct = n ? Math.round((status.inactive / n) * 100) : 0;
  const activePct = n ? Math.round((status.active / n) * 100) : 0;
  return {
    total: n,
    status,
    newInPeriod,
    avgCompletion,
    belowThreshold: below,
    activePct,
    inactivePct,
    // Activity score: deterministic composite, same formula for orgs and coordinators.
    activityScore: n ? Math.round(0.5 * (100 - inactivePct) + 0.5 * avgCompletion) : 0,
  };
}

export const DEFAULT_DISTRICT = "Basti";

/**
 * THE SWAP SEAM. This is the only function to replace when live data arrives.
 * The `RegionRollup` shape it returns is the contract the view renders from —
 * keep it stable and derive every figure from real participant rows.
 *
 * Every mean/ratio (avgCompletion, activePct, inactivePct, activityScore) is
 * computed by `summarise` over the participant rows of that level — never by
 * averaging the level below, which would weight small orgs/districts wrongly.
 */
export function getRegionRollup(opts: {
  region: string;
  period: Period;
  type: "all" | ParticipantType;
  /** Defaults to the district named by `region`. Scope is enforced here, before
   *  summarising: rows, districts, organisations and coordinators outside it
   *  never enter the result. */
  scope?: RollupScope;
}): RegionRollup {
  const scope: RollupScope = opts.scope ?? { kind: "region" };
  const scopedDistrict =
    scope.kind === "district" ? scope.district : scope.kind === "region" ? opts.region || DEFAULT_DISTRICT : null;

  const inScope = (p: ScopedParticipant) =>
    scope.kind === "national" ||
    ((scope.kind === "district" || scope.kind === "region") && p.district === scopedDistrict) ||
    (scope.kind === "org" && p.orgId === scope.orgId) ||
    (scope.kind === "coordinator" && p.coordinatorCode === scope.code);

  const rows: ScopedParticipantRow[] = SAMPLE.filter(
    (p) => inScope(p) && (opts.type === "all" || p.type === opts.type),
  ).map((p) => ({ ...p, lifecycle: deriveLifecycle(p) }));

  const scopedOrgs = ORGS.filter((o) =>
    scope.kind === "national"
      ? true
      : scope.kind === "district" || scope.kind === "region"
        ? o.district === scopedDistrict
        : scope.kind === "org"
          ? o.id === scope.orgId
          : o.coordinators.some((c) => c.code === scope.code),
  ).map((o) => ({
    ...o,
    coordinators:
      scope.kind === "coordinator" ? o.coordinators.filter((c) => c.code === scope.code) : o.coordinators,
  }));

  const orgs: OrgRow[] = scopedOrgs.map((o) => {
    const orgRows = rows.filter((r) => r.orgId === o.id);
    const coordinators: CoordinatorRow[] = o.coordinators.map((c) => {
      const cr = orgRows.filter((r) => r.coordinatorCode === c.code);
      return { code: c.code, orgId: o.id, ...summarise(cr, opts.period), participants: cr };
    });
    return { id: o.id, name: o.name, kind: o.kind, ...summarise(orgRows, opts.period), coordinators };
  });

  const districts: DistrictRow[] = DISTRICTS.filter((d) => scopedOrgs.some((o) => o.district === d.name)).map(
    (d) => {
      const dOrgIds = new Set(scopedOrgs.filter((o) => o.district === d.name).map((o) => o.id));
      const dOrgs = orgs.filter((o) => dOrgIds.has(o.id));
      const dRows = rows.filter((r) => r.district === d.name);
      return {
        name: d.name,
        state: d.state,
        ...summarise(dRows, opts.period),
        organisationCount: dOrgs.length,
        coordinatorCount: dOrgs.reduce((n, o) => n + o.coordinators.length, 0),
        orgs: dOrgs,
      };
    },
  );

  const all = summarise(rows, opts.period);
  const coords = orgs.flatMap((o) => o.coordinators);

  return {
    region: scope.kind === "national" ? "National" : (scopedDistrict ?? districts[0]?.name ?? opts.region),
    scope,
    period: opts.period,
    type: opts.type,
    isSample: true,
    total: all.total,
    status: all.status,
    avgCompletion: all.avgCompletion,
    activityScore: all.activityScore,
    needsAttention: {
      inactiveSharePct: all.inactivePct,
      coordinatorsWithZeroNewOnboards: coords.filter((c) => c.newInPeriod === 0).length,
      profilesBelowThreshold: all.belowThreshold,
    },
    organisationCount: orgs.length,
    coordinatorCount: coords.length,
    districtCount: districts.length,
    districts,
    orgs,
  };
}

/**
 * SWAP SEAM #2 — who is this actor scoped to? There is no user→organisation or
 * user→coordinator mapping in the database yet, so this returns fixed sample
 * scopes. Replace this one function body when that mapping exists.
 */
export function getScopeForActor(role: string | undefined, _email: string | undefined): RollupScope {
  if (role === "owner") return { kind: "org", orgId: "ORG-GPB" };
  if (role === "coordinator") return { kind: "coordinator", code: "BST-C07" };
  // Programme-wide roles see every district.
  if (role === "admin" || role === "ecosystem" || role === "network_admin") return { kind: "national" };
  // Working Committee (and deprecated JFC) are district-level; sample maps them to Basti.
  return { kind: "region" };
}
