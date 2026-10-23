// Decides what the admin command changes. No database or Keycloak access, so it
// can be tested on its own.

export interface ExistingUser {
  role: string | null;
  active: boolean;
  rejectedAt: string | null;
  keycloakSub: string | null;
}

export interface KeycloakAccount {
  id: string;
  emailVerified: boolean;
  enabled: boolean;
}

export interface AdminOptions {
  promote: boolean;
  relink: boolean;
  verifyEmail: boolean;
}

export interface AdminPlan {
  // Set when the command must stop; nothing is changed.
  error: string | null;
  notes: string[];
  createKeycloak: boolean;
  verifyEmail: boolean;
  // Keycloak account id to link the app user to (existing one), if any.
  linkTo: string | null;
  createAdmin: boolean;
  promote: boolean;
  relink: boolean;
}

// existing: the app user with this email. account: the Keycloak account with this
// email. accountLinkedToOther: that account is linked to a different app user.
export function planAdminCommand(
  existing: ExistingUser | null,
  account: KeycloakAccount | null,
  accountLinkedToOther: boolean,
  o: AdminOptions,
): AdminPlan {
  const plan: AdminPlan = {
    error: null, notes: [], createKeycloak: false, verifyEmail: false, linkTo: null, createAdmin: false, promote: false, relink: false,
  };
  const stop = (error: string): AdminPlan => ({ ...plan, error });

  if (o.verifyEmail && o.relink) return stop("--verify-email can't be used with --relink, which only clears a link.");

  // Whether this run links a Keycloak account: a new admin, or promoting a user with no link.
  let needsAccount = false;
  if (!existing) {
    plan.createAdmin = true;
    needsAccount = true;
    plan.notes.push("Create the user as an active admin.");
  } else if (existing.role === "admin" && existing.active) {
    plan.notes.push("Already an active admin.");
  } else if (o.promote) {
    plan.promote = true;
    needsAccount = !existing.keycloakSub;
    plan.notes.push(`Make an active admin (was ${describe(existing)}).`);
  } else {
    plan.notes.push(`Role unchanged: ${describe(existing)}. Add --promote to make them an admin.`);
  }

  if (needsAccount) {
    if (!account) {
      plan.createKeycloak = true;
      plan.notes.push("Create a Keycloak account with this email, marked verified, and link it.");
    } else {
      if (!account.enabled) return stop("The Keycloak account with this email is disabled. Enable it in Keycloak first.");
      if (accountLinkedToOther) return stop("The Keycloak account with this email is already linked to another user.");
      if (!account.emailVerified) {
        if (!o.verifyEmail) {
          return stop(
            "The Keycloak account with this email exists but its email is not verified. Check whose account it is " +
              "(details above); only if it belongs to this person, re-run with --verify-email.",
          );
        }
        plan.verifyEmail = true;
        plan.notes.push("Mark the existing Keycloak account's email as verified (you vouch for it).");
      }
      plan.linkTo = account.id;
      plan.notes.push("Link the existing Keycloak account.");
    }
  } else if (o.verifyEmail) {
    plan.notes.push("--verify-email ignored: this run links no Keycloak account.");
  }

  if (o.relink) {
    if (existing?.keycloakSub) {
      plan.relink = true;
      plan.notes.push("Clear the Keycloak link. The next login links again by verified email.");
    } else {
      plan.notes.push("--relink ignored: not linked to Keycloak.");
    }
  }

  if (!planChangesAnything(plan)) plan.notes.push("Nothing to change.");
  return plan;
}

export function planChangesAnything(p: AdminPlan): boolean {
  return p.createKeycloak || p.verifyEmail || p.createAdmin || p.promote || p.relink;
}

function describe(u: ExistingUser): string {
  if (u.rejectedAt) return "rejected";
  if (!u.role) return "pending, no role";
  return u.active ? u.role : `${u.role}, deactivated`;
}
