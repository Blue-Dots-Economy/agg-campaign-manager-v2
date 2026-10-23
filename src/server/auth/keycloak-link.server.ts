// Database side of matching a Keycloak identity to an app user.
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.server";
import { appUsers } from "../db/schema";
import { decideLink, type LinkCandidate, type LinkDecision, type RefusalReason, type VerifiedIdentity } from "./keycloak-link";

export type LinkResult = { kind: "login"; userId: string; role: string } | { kind: "refused"; reason: RefusalReason };

const candidateFields = {
  id: appUsers.id,
  email: appUsers.email,
  keycloakSub: appUsers.keycloakSub,
  active: appUsers.active,
  role: appUsers.role,
  rejectedAt: appUsers.rejectedAt,
};

type Db = Pick<ReturnType<typeof getDb>, "select" | "insert" | "update">;

async function findBy(db: Db, column: typeof appUsers.keycloakSub | typeof appUsers.email, value: string): Promise<LinkCandidate | null> {
  const [row] = await db.select(candidateFields).from(appUsers).where(eq(column, value)).limit(1);
  return row ?? null;
}

async function decide(db: Db, id: VerifiedIdentity): Promise<LinkDecision> {
  return decideLink(await findBy(db, appUsers.keycloakSub, id.sub), await findBy(db, appUsers.email, id.email), id);
}

export async function linkKeycloakIdentity(id: VerifiedIdentity, name: string | null, db: Db = getDb()): Promise<LinkResult> {
  let decision = await decide(db, id);

  if (decision.kind === "create-pending") {
    // Waits, inactive and without a role, until an admin approves or rejects it.
    // Two first logins at once: the second insert hits a unique key (email or
    // keycloak_sub) and does nothing; both then read the row and decide again.
    await db
      .insert(appUsers)
      .values({ email: id.email, name, role: null, active: false, keycloakSub: id.sub })
      .onConflictDoNothing();
    decision = await decide(db, id);
    if (decision.kind === "create-pending") return { kind: "refused", reason: "conflict" };
  }

  const now = new Date().toISOString();
  try {
    if (decision.kind === "refused") {
      if (decision.set && decision.userId) {
        await db.update(appUsers).set({ ...decision.set, updatedAt: now }).where(eq(appUsers.id, decision.userId));
      }
      return { kind: "refused", reason: decision.reason };
    }
    const [row] = await db
      .update(appUsers)
      .set({ ...decision.set, lastLoginAt: now, updatedAt: now })
      .where(eq(appUsers.id, decision.userId))
      .returning({ role: appUsers.role });
    if (!row?.role) return { kind: "refused", reason: "pending" };
    return { kind: "login", userId: decision.userId, role: row.role };
  } catch {
    // Unique keycloak_sub or email taken by a concurrent change: an admin sorts it out.
    return { kind: "refused", reason: "conflict" };
  }
}
