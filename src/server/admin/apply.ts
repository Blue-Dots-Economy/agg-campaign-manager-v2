// Looks up an email and carries out an admin plan. Shared by the admin command
// and the admin bootstrap that runs after migrations.
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { adminActions, appUsers } from "../db/schema";
import type { KeycloakAdmin, KeycloakUser } from "../auth/keycloak-admin.server";
import type { AdminPlan } from "./plan";

export type AppUser = typeof appUsers.$inferSelect;

export interface Lookup {
  existing: AppUser | null;
  account: KeycloakUser | null;
  // The Keycloak account is linked to a different app user.
  linkedToOther: boolean;
}

export async function lookUp(db: NodePgDatabase, keycloak: KeycloakAdmin, email: string): Promise<Lookup> {
  const [existing] = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1);
  const account = await keycloak.findByEmail(email);
  let linkedToOther = false;
  if (account) {
    const [owner] = await db.select({ email: appUsers.email }).from(appUsers).where(eq(appUsers.keycloakSub, account.id)).limit(1);
    linkedToOther = !!owner && owner.email !== email;
  }
  return { existing: existing ?? null, account, linkedToOther };
}

// Throws if Keycloak or the database refuses; changes already made stay recorded.
export async function applyPlan(
  db: NodePgDatabase,
  keycloak: KeycloakAdmin,
  email: string,
  existing: AppUser | null,
  plan: AdminPlan,
  operator: string,
): Promise<void> {
  const record = (action: "create_admin" | "promote" | "relink" | "verify_email", keycloakUserId: string | null) =>
    db.insert(adminActions).values({ action, email, keycloakUserId, operator });
  const now = new Date().toISOString();

  let keycloakSub = plan.linkTo;
  if (plan.createKeycloak) {
    const made = await keycloak.create(email, existing?.name ?? null);
    if (made === "exists") throw new Error("A Keycloak account with this email or username appeared just now. Run it again.");
    keycloakSub = made.id;
  }
  if (plan.verifyEmail && plan.linkTo) {
    await keycloak.markEmailVerified(plan.linkTo);
    // Saved straight away, so a later failure can't leave this change unrecorded.
    await record("verify_email", plan.linkTo);
  }

  if (plan.createAdmin) {
    await db.insert(appUsers).values({ email, role: "admin", active: true, keycloakSub });
    await record("create_admin", keycloakSub);
  } else if (plan.promote) {
    await db
      .update(appUsers)
      .set({ role: "admin", active: true, rejectedAt: null, ...(keycloakSub ? { keycloakSub } : {}), updatedAt: now })
      .where(eq(appUsers.email, email));
    await record("promote", keycloakSub ?? existing?.keycloakSub ?? null);
  }
  if (plan.relink) {
    await db.update(appUsers).set({ keycloakSub: null, updatedAt: now }).where(eq(appUsers.email, email));
    await record("relink", existing?.keycloakSub ?? null);
  }
}
