// Shared by server checks and UI page hiding.

export const ROLES = ["admin", "jfc", "coordinator", "user", "owner", "ecosystem"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

// Route prefixes each role may open. "*" = everything.
export const ROLE_ROUTES: Record<Role, string[]> = {
  admin: ["*"],
  jfc: ["/user-level-analysis", "/", "/campaigns", "/review", "/launch", "/ecosystem-view", "/campaign-requests", "/request-campaign"],
  coordinator: ["/user-level-analysis", "/", "/campaigns", "/review", "/request-campaign"],
  owner: ["/user-level-analysis", "/"],
  ecosystem: ["/ecosystem-view", "/user-level-analysis", "/"],
  user: ["/user-level-analysis", "/", "/campaigns", "/review"],
};

export const DEFAULT_LANDING: Record<Role, string> = {
  admin: "/user-level-analysis",
  jfc: "/",
  coordinator: "/user-level-analysis",
  owner: "/user-level-analysis",
  ecosystem: "/ecosystem-view",
  user: "/",
};

export const ACCOUNT_ROUTES = ["/change-password"];

export function landingFor(role: Role | undefined): string {
  return role ? (DEFAULT_LANDING[role] ?? "/user-level-analysis") : "/login";
}

// "/" must match exactly (it's Campaign Overview), everything else is a prefix match.
export function canAccess(role: Role | undefined, pathname: string): boolean {
  if (!role) return false;
  if (ACCOUNT_ROUTES.includes(pathname)) return true;
  const allowed = ROLE_ROUTES[role] ?? [];
  if (allowed.includes("*")) return true;
  return allowed.some((r) => (r === "/" ? pathname === "/" : pathname === r || pathname.startsWith(r + "/")));
}

// May change shared data: the UP seekers CSV and North Star targets.
export const EDITOR_ROLES: Role[] = ["admin", "jfc"];

export function canEditShared(role: Role | undefined): boolean {
  return !!role && EDITOR_ROLES.includes(role);
}

// Roles per server function, from the pages that call it.
const pagesOf = (...routes: string[]): Role[] =>
  ROLES.filter((role) => routes.some((r) => canAccess(role, r)));

export const FN_ROLES = {
  dashboard: [...ROLES],
  campaigns: pagesOf("/campaigns", "/review"),
  requestCampaign: pagesOf("/request-campaign"),
  launch: pagesOf("/launch", "/campaign-requests"),
  admin: pagesOf("/settings"),
  editors: EDITOR_ROLES,
} satisfies Record<string, Role[]>;
