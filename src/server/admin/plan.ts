// Decides what the admin command changes. No database access, so it can be tested on its own.

export interface ExistingUser {
  role: string | null;
  active: boolean;
  rejectedAt: string | null;
  keycloakSub: string | null;
}

export interface AdminOptions {
  setPassword: boolean;
  relink: boolean;
  promote: boolean;
}

export interface AdminPlan {
  create: boolean;
  makeAdmin: boolean;
  setPassword: boolean;
  relink: boolean;
  notes: string[];
}

export function planAdminCommand(existing: ExistingUser | null, o: AdminOptions): AdminPlan {
  const notes: string[] = [];

  if (!existing) {
    notes.push("Create the user as an active admin.");
    if (o.setPassword) notes.push("Set a temporary password, shown once.");
    else notes.push("No password set. In the basic flow, add --set-password so they can log in.");
    if (o.relink) notes.push("--relink ignored: a new user has no Keycloak link.");
    return { create: true, makeAdmin: true, setPassword: o.setPassword, relink: false, notes };
  }

  const isActiveAdmin = existing.role === "admin" && existing.active;
  let makeAdmin = false;
  if (isActiveAdmin) {
    notes.push("Already an active admin.");
  } else if (o.promote) {
    makeAdmin = true;
    notes.push(`Make an active admin (was ${describe(existing)}).`);
  } else {
    notes.push(`Role unchanged: ${describe(existing)}. Add --promote to make them an admin.`);
  }

  if (o.setPassword) notes.push("Set a temporary password, shown once, and clear any lockout.");

  let relink = false;
  if (o.relink) {
    if (existing.keycloakSub) {
      relink = true;
      notes.push("Clear the Keycloak link. The next Keycloak login links again by verified email.");
    } else {
      notes.push("--relink ignored: not linked to Keycloak.");
    }
  }

  if (!makeAdmin && !o.setPassword && !relink) notes.push("Nothing to change.");
  return { create: false, makeAdmin, setPassword: o.setPassword, relink, notes };
}

export function planChangesAnything(p: AdminPlan): boolean {
  return p.create || p.makeAdmin || p.setPassword || p.relink;
}

function describe(u: ExistingUser): string {
  if (u.rejectedAt) return "rejected";
  if (!u.role) return "pending, no role";
  return u.active ? u.role : `${u.role}, inactive`;
}
