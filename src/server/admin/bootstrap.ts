// Creates the first admin after migrations, from BOOTSTRAP_ADMIN_EMAIL, so a new
// deployment can be signed in to without running the admin command. Does nothing
// once an active admin who can sign in exists (one linked to Keycloak), or when the
// setting is empty. An unlinked admin doesn't count: logins never link an admin by
// email, so they can't sign in until someone links them. Follows the admin
// command's rules (promote on, never --verify-email) and throws when they say
// stop, so the migrate step fails instead of leaving nobody able to sign in.
import { and, eq, isNotNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { appUsers } from "../db/schema";
import { keycloakConfig } from "../auth/config.server";
import { KeycloakAdmin } from "../auth/keycloak-admin.server";
import { applyPlan, lookUp } from "./apply";
import { planAdminCommand, type StopReason } from "./plan";

const OPERATOR = "bootstrap";

// Worded for a deploy log; the admin command's own messages refer to its flags.
const STOPPED: Record<StopReason, string> = {
  options: "invalid options.",
  disabled: "its Keycloak account is disabled. Enable it in Keycloak, then deploy again.",
  "linked-elsewhere":
    "its Keycloak account is already linked to another Campaign Manager user. Clear that link, then deploy again.",
  unverified:
    "its Keycloak account exists but the email is not verified. Check whose account it is; if it is theirs, " +
    "verify the email in Keycloak, then deploy again.",
};

export async function bootstrapAdmin(
  db: NodePgDatabase,
  env: Record<string, string | undefined> = process.env,
  makeKeycloak: () => KeycloakAdmin = () => new KeycloakAdmin(keycloakConfig(env)),
): Promise<string> {
  const raw = env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  if (!raw) return "BOOTSTRAP_ADMIN_EMAIL is not set; no admin created.";
  const parsed = z.string().toLowerCase().email().safeParse(raw);
  if (!parsed.success) throw new Error(`BOOTSTRAP_ADMIN_EMAIL is not a valid email: "${raw}"`);
  const email = parsed.data;

  const [admin] = await db
    .select({ email: appUsers.email })
    .from(appUsers)
    .where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true), isNotNull(appUsers.keycloakSub)))
    .limit(1);
  if (admin) return `An active admin who can sign in exists (${admin.email}); no admin created.`;

  const keycloak = makeKeycloak();
  const { existing, account, linkedToOther } = await lookUp(db, keycloak, email);
  const plan = planAdminCommand(existing, account, linkedToOther, { promote: true, relink: false, verifyEmail: false });
  if (plan.reason) throw new Error(`Admin bootstrap stopped for ${email}: ${STOPPED[plan.reason]}`);
  await applyPlan(db, keycloak, email, existing, plan, OPERATOR);
  return `Admin bootstrap for ${email}: ${plan.notes.join(" ")}`;
}
