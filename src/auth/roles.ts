// Shared by server checks and UI page hiding.

/** Every role a user can have. */
export const ROLES = ["admin", "jfc", "coordinator", "user", "owner", "ecosystem"] as const;
/** A user role. */
export type Role = (typeof ROLES)[number];

/** Narrows a value, such as a database column, to a known role. */
export function isRole(v: unknown): v is Role {
  return ROLES.some((r) => r === v);
}

// Route prefixes each role may open. "*" = everything.
export const ROLE_ROUTES: Record<Role, string[]> = {
  admin: ["*"],
  jfc: [
    "/user-level-analysis",
    "/",
    "/campaigns",
    "/review",
    "/launch",
    "/ecosystem-view",
    "/campaign-requests",
    "/request-campaign",
  ],
  coordinator: ["/user-level-analysis", "/", "/campaigns", "/review", "/request-campaign"],
  owner: ["/user-level-analysis", "/"],
  ecosystem: ["/ecosystem-view", "/user-level-analysis", "/"],
  user: ["/user-level-analysis", "/", "/campaigns", "/review"],
};

/** Page each role lands on after signing in. */
export const DEFAULT_LANDING: Record<Role, string> = {
  admin: "/user-level-analysis",
  jfc: "/",
  coordinator: "/user-level-analysis",
  owner: "/user-level-analysis",
  ecosystem: "/ecosystem-view",
  user: "/",
};

/** Pages every signed-in user may open, whatever the role. */
export const ACCOUNT_ROUTES = ["/change-password"];

/** Returns the landing page for a role, or the login page when signed out. */
export function landingFor(role: Role | undefined): string {
  return role ? (DEFAULT_LANDING[role] ?? "/user-level-analysis") : "/login";
}

// "/" must match exactly (it's Campaign Overview), everything else is a prefix match.
export function canAccess(role: Role | undefined, pathname: string): boolean {
  if (!role) return false;
  if (ACCOUNT_ROUTES.includes(pathname)) return true;
  const allowed = ROLE_ROUTES[role] ?? [];
  if (allowed.includes("*")) return true;
  return allowed.some((r) =>
    r === "/" ? pathname === "/" : pathname === r || pathname.startsWith(r + "/"),
  );
}

// May change shared data: the UP seekers CSV and North Star targets.
export const EDITOR_ROLES: Role[] = ["admin", "jfc"];

/** True when the role may change shared data. */
export function canEditShared(role: Role | undefined): boolean {
  return !!role && EDITOR_ROLES.includes(role);
}

// Roles per server function, from the pages that call it.
const pagesOf = (...routes: string[]): Role[] =>
  ROLES.filter((role) => routes.some((r) => canAccess(role, r)));

/** Roles allowed to call each group of server functions. */
export const FN_ROLES = {
  dashboard: [...ROLES],
  campaigns: pagesOf("/campaigns", "/review"),
  requestCampaign: pagesOf("/request-campaign"),
  launch: pagesOf("/launch", "/campaign-requests"),
  admin: pagesOf("/settings"),
  editors: EDITOR_ROLES,
} satisfies Record<string, Role[]>;
