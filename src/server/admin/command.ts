// Creates or recovers an admin when nobody can log in to do it in the app.
//   bun run admin -- --email=<address> [--promote] [--relink] [--verify-email] [--apply --by=<name>]
// Reads DATABASE_URL and the Keycloak settings. Without --apply it only reports
// what it would change. Every applied change is saved in admin_actions.
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { z } from "zod";
import { adminActions, appUsers } from "../db/schema";
import { keycloakConfig } from "../auth/config.server";
import { KeycloakAdmin, type KeycloakUser } from "../auth/keycloak-admin.server";
import { planAdminCommand, planChangesAnything } from "./plan";

const USAGE =
  "Usage: bun run admin -- --email=<address> [--promote] [--relink] [--verify-email] [--apply --by=<your name>]";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function showAccount(a: KeycloakUser): void {
  console.log("Keycloak account with this email:");
  console.log(`  Username:     ${a.username}`);
  console.log(`  Email:        ${a.email ?? "-"} (${a.emailVerified ? "verified" : "NOT verified"})`);
  console.log(`  Phone number: ${a.phoneNumber ?? "-"}`);
  console.log(`  Created:      ${a.createdTimestamp ? new Date(a.createdTimestamp).toISOString() : "-"}`);
  console.log(`  Enabled:      ${a.enabled ? "yes" : "NO"}`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      promote: { type: "boolean", default: false },
      relink: { type: "boolean", default: false },
      "verify-email": { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
      by: { type: "string" },
    },
    strict: true,
  });
  const parsed = z.string().trim().toLowerCase().email().safeParse(values.email ?? "");
  if (!parsed.success) fail(`A valid --email is required.\n${USAGE}`);
  const email = parsed.data;
  const operator = values.by?.trim() ?? "";
  if (values.apply && !operator) fail(`--apply needs --by=<your name>, saved with the change.\n${USAGE}`);
  // The retype check must reach a person: no flag skips it.
  if (values["verify-email"] && values.apply && !(process.stdin.isTTY && process.stdout.isTTY)) {
    fail("--verify-email with --apply needs an interactive terminal, so the email can be typed again. Nothing was changed.");
  }

  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not set");
  const keycloak = new KeycloakAdmin(keycloakConfig());
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);
  const record = (action: "create_admin" | "promote" | "relink" | "verify_email", keycloakUserId: string | null) =>
    db.insert(adminActions).values({ action, email, keycloakUserId, operator });

  try {
    const [existing] = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1);
    const account = await keycloak.findByEmail(email);
    let linkedToOther = false;
    if (account) {
      showAccount(account);
      const [owner] = await db.select({ email: appUsers.email }).from(appUsers).where(eq(appUsers.keycloakSub, account.id)).limit(1);
      linkedToOther = !!owner && owner.email !== email;
    } else {
      console.log("No Keycloak account with this email.");
    }

    const plan = planAdminCommand(existing ?? null, account, linkedToOther, {
      promote: values.promote,
      relink: values.relink,
      verifyEmail: values["verify-email"],
    });
    console.log(`${values.apply ? "Changes" : "Dry run, no changes"} for ${email}:`);
    for (const note of plan.notes) console.log(`  - ${note}`);
    if (plan.error) fail(`Stopped: ${plan.error}`);
    if (!planChangesAnything(plan)) return;
    if (!values.apply) {
      console.log("Re-run with --apply --by=<your name> to make these changes.");
      return;
    }

    if (plan.verifyEmail) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const typed = (await rl.question("You are vouching that this Keycloak account belongs to this person. Type the email again to confirm: ")).trim();
      rl.close();
      if (typed.toLowerCase() !== email) fail("The email did not match. Nothing was changed.");
    }

    const now = new Date().toISOString();
    let keycloakSub = plan.linkTo;
    if (plan.createKeycloak) {
      const made = await keycloak.create(email, existing?.name ?? null);
      if (made === "exists") fail("A Keycloak account with this email or username appeared just now. Run the command again.");
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
    console.log(`Done. Saved in admin_actions by "${operator}". ${email} can sign in with Keycloak.`);
  } finally {
    await pool.end();
  }
}

await main();
