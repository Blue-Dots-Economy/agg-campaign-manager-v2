import type { Role } from "@/auth/context";

// Route prefixes each role may open. "*" = everything.
// "jfc" is deprecated in favour of "wc" (Working Committee) and kept only so
// existing accounts keep working until their database rows are migrated.
// "wc" must carry the exact same access as the deprecated "jfc".
export const ROLE_ROUTES: Record<Role, string[]> = {
  admin: ["*"],
  jfc: ["/user-level-analysis", "/", "/campaigns", "/review", "/launch", "/ecosystem-view", "/campaign-requests", "/request-campaign"],
  wc: ["/user-level-analysis", "/", "/campaigns", "/review", "/launch", "/ecosystem-view", "/campaign-requests", "/request-campaign"],
  coordinator: ["/user-level-analysis", "/", "/campaigns", "/review", "/request-campaign"],
  owner: ["/user-level-analysis", "/"],
  ecosystem: ["/ecosystem-view", "/user-level-analysis", "/"],
  // Network Administrator: same pages as ecosystem; lands on the national My Purple Dots view.
  network_admin: ["/ecosystem-view", "/user-level-analysis", "/"],
  user: ["/user-level-analysis", "/", "/campaigns", "/review"],
};

export const DEFAULT_LANDING: Record<Role, string> = {
  admin: "/user-level-analysis",
  jfc: "/",
  coordinator: "/user-level-analysis",
  wc: "/",
  owner: "/user-level-analysis",
  ecosystem: "/ecosystem-view",
  network_admin: "/user-level-analysis",
  user: "/",
};

export function landingFor(role: Role | undefined): string {
  return role ? DEFAULT_LANDING[role] ?? "/user-level-analysis" : "/login";
}

// "/" must match exactly (it's Campaign Overview), everything else is a prefix match.
export function canAccess(role: Role | undefined, pathname: string): boolean {
  if (!role) return false;
  const allowed = ROLE_ROUTES[role] ?? [];
  if (allowed.includes("*")) return true;
  return allowed.some((r) =>
    r === "/" ? pathname === "/" : pathname === r || pathname.startsWith(r + "/")
  );
}
