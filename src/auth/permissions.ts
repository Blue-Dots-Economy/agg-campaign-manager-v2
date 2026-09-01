import type { Role } from "@/auth/context";

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
