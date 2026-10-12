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

export type RollupScope =
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
  needsAttention: {
    inactiveSharePct: number;
    coordinatorsWithZeroNewOnboards: number;
    profilesBelowThreshold: number;
  };
  organisationCount: number;
  coordinatorCount: number;
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
  name: string;
  kind: "College" | "Association";
  /** 0..1 — higher = more recently engaged, more complete profiles */
  health: number;
  coordinators: { code: string; size: number; recentOnboards: boolean }[];
}

const ORGS: OrgSpec[] = [
  {
    id: "ORG-BDSS",
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
    name: "Sant Kabir Vocational Institute",
    kind: "College",
    health: 0.5,
    coordinators: [
      { code: "BST-C09", size: 22, recentOnboards: true },
      { code: "BST-C10", size: 20, recentOnboards: true },
      { code: "BST-C11", size: 20, recentOnboards: true },
    ],
  },
];

function buildSample(): ScopedParticipant[] {
  const rand = mulberry32(0xb4571);
  const out: ScopedParticipant[] = [];
  let seekerN = 400;
  let providerN = 30;
  for (const org of ORGS) {
    for (const c of org.coordinators) {
      for (let i = 0; i < c.size; i++) {
        const type: ParticipantType = rand() < 0.82 ? "seeker" : "provider";
        // Coordinators without recent onboards never have anyone joined in the last 90 days.
        const minJoin = c.recentOnboards ? 1 : 95;
        const joinedDaysAgo = Math.floor(minJoin + Math.pow(rand(), 1.6) * (360 - minJoin));
        let lastEngagedDaysAgo: number | null;
        if (rand() < (1 - org.health) * 0.35) {
          lastEngagedDaysAgo = null;
        } else {
          // healthy orgs skew strongly to recent engagement
          const d = Math.floor(1 + Math.pow(rand(), 1 + org.health * 4) * 150);
          lastEngagedDaysAgo = Math.min(joinedDaysAgo, d);
        }
        const base = 25 + org.health * 55;
        const profileCompletion = Math.max(
          5,
          Math.min(100, Math.round(base + (rand() - 0.5) * 60)),
        );
        const id =
          type === "seeker"
            ? `BST-S-${String(seekerN++).padStart(4, "0")}`
            : `BST-P-${String(providerN++).padStart(4, "0")}`;
        out.push({
          id,
          type,
          orgId: org.id,
          coordinatorCode: c.code,
          joinedDaysAgo,
          lastEngagedDaysAgo,
          profileCompletion,
        });
      }
    }
  }
  return out;
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

/**
 * THE SWAP SEAM. This is the only function to replace when live data arrives.
 * The `RegionRollup` shape it returns is the contract the view renders from —
 * keep it stable and derive every figure from real participant rows.
 */
export function getRegionRollup(opts: {
  region: string;
  period: Period;
  type: "all" | ParticipantType;
  /** Defaults to the whole region. Scope is enforced here, before summarising:
   *  rows, organisations and coordinators outside it never enter the result. */
  scope?: RollupScope;
}): RegionRollup {
  const scope: RollupScope = opts.scope ?? { kind: "region" };
  const inScope = (p: ScopedParticipant) =>
    scope.kind === "region" ||
    (scope.kind === "org" && p.orgId === scope.orgId) ||
    (scope.kind === "coordinator" && p.coordinatorCode === scope.code);

  const rows: ScopedParticipantRow[] = SAMPLE.filter(
    (p) => inScope(p) && (opts.type === "all" || p.type === opts.type),
  ).map((p) => ({ ...p, lifecycle: deriveLifecycle(p) }));

  const scopedOrgs = ORGS.filter((o) =>
    scope.kind === "region"
      ? true
      : scope.kind === "org"
        ? o.id === scope.orgId
        : o.coordinators.some((c) => c.code === scope.code),
  ).map((o) => ({
    ...o,
    coordinators:
      scope.kind === "coordinator" ? o.coordinators.filter((c) => c.code === scope.code) : o.coordinators,
  }));

  const orgs: OrgRow[] = scopedOrgs.map((o) => {
    const coordinators: CoordinatorRow[] = o.coordinators.map((c) => {
      const cr = rows.filter((r) => r.coordinatorCode === c.code);
      return { code: c.code, orgId: o.id, ...summarise(cr, opts.period), participants: cr };
    });
    const orgRows = rows.filter((r) => r.orgId === o.id);
    return { id: o.id, name: o.name, kind: o.kind, ...summarise(orgRows, opts.period), coordinators };
  });

  const all = summarise(rows, opts.period);
  const coords = orgs.flatMap((o) => o.coordinators);

  return {
    region: opts.region,
    scope,
    period: opts.period,
    type: opts.type,
    isSample: true,
    total: all.total,
    status: all.status,
    needsAttention: {
      inactiveSharePct: all.total ? Math.round((all.status.inactive / all.total) * 100) : 0,
      coordinatorsWithZeroNewOnboards: coords.filter((c) => c.newInPeriod === 0).length,
      profilesBelowThreshold: all.belowThreshold,
    },
    organisationCount: orgs.length,
    coordinatorCount: coords.length,
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
  return { kind: "region" };
}
