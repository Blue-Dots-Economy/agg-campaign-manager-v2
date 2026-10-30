// Matches a verified Keycloak identity to an app user. Pure, so every rule can be
// tested; the database side is in keycloak-link.server.ts.

export interface LinkCandidate {
  id: string;
  email: string;
  keycloakSub: string | null;
  active: boolean;
  role: string | null;
  rejectedAt: string | null;
}

export interface VerifiedIdentity {
  sub: string;
  email: string;
}

export type RefusalReason = "pending" | "denied" | "conflict" | "admin-unlinked";

export type LinkDecision =
  | { kind: "login"; userId: string; set: { keycloakSub?: string; email?: string } }
  | { kind: "refused"; reason: RefusalReason; userId?: string; set?: { keycloakSub?: string } }
  | { kind: "create-pending" };

function refusalFor(u: LinkCandidate): RefusalReason | null {
  if (u.rejectedAt) return "denied";
  if (!u.active) return u.role ? "denied" : "pending";
  return null;
}

// bySub: the user already linked to this Keycloak account. byEmail: the user with
// this verified email. Either may be null, and they may be the same user.
export function decideLink(
  bySub: LinkCandidate | null,
  byEmail: LinkCandidate | null,
  id: VerifiedIdentity,
): LinkDecision {
  if (bySub) {
    const refused = refusalFor(bySub);
    if (refused) return { kind: "refused", reason: refused, userId: bySub.id };
    if (bySub.email === id.email) return { kind: "login", userId: bySub.id, set: {} };
    // Their email changed in Keycloak: follow it, unless another user has it.
    if (byEmail && byEmail.id !== bySub.id) return { kind: "refused", reason: "conflict", userId: bySub.id };
    return { kind: "login", userId: bySub.id, set: { email: id.email } };
  }

  if (byEmail) {
    // Linked to a different Keycloak account, for example one that was deleted
    // and recreated. Only an admin can say which one is right.
    if (byEmail.keycloakSub && byEmail.keycloakSub !== id.sub) {
      return { kind: "refused", reason: "conflict", userId: byEmail.id };
    }
    // An admin is never linked by a matching email, so a Keycloak account someone
    // else registered with that email can't become an admin. The admin bootstrap
    // or another admin's "Set up login" links them by Keycloak id instead.
    if (!byEmail.keycloakSub && byEmail.role === "admin") {
      return { kind: "refused", reason: refusalFor(byEmail) ?? "admin-unlinked", userId: byEmail.id };
    }
    const set = { keycloakSub: id.sub };
    const refused = refusalFor(byEmail);
    if (refused) return { kind: "refused", reason: refused, userId: byEmail.id, set };
    return { kind: "login", userId: byEmail.id, set };
  }

  return { kind: "create-pending" };
}
