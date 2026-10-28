// Creates the first admin after migrations, from BOOTSTRAP_ADMIN_EMAIL, so a new
// deployment can be signed in to without running the admin command. Does nothing
// once any active admin exists, or when the setting is empty. Follows the admin
// command's rules (promote on, never --verify-email) and throws when they say
// stop, so the migrate step fails instead of leaving nobody able to sign in.
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { appUsers } from "../db/schema";
import { keycloakConfig } from "../auth/config.server";
import { KeycloakAdmin } from "../auth/keycloak-admin.server";
import { applyPlan, lookUp } from "./apply";
import { planAdminCommand } from "./plan";

const OPERATOR = "bootstrap";

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
    .where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true)))
    .limit(1);
  if (admin) return `An active admin exists (${admin.email}); no admin created.`;

  const keycloak = makeKeycloak();
  const { existing, account, linkedToOther } = await lookUp(db, keycloak, email);
  const plan = planAdminCommand(existing, account, linkedToOther, { promote: true, relink: false, verifyEmail: false });
  if (plan.error) {
    throw new Error(`Admin bootstrap stopped for ${email}: ${plan.error} Fix it in Keycloak or use the admin command.`);
  }
  await applyPlan(db, keycloak, email, existing, plan, OPERATOR);
  return `Admin bootstrap for ${email}: ${plan.notes.join(" ")}`;
}
