// Creates or recovers an admin when nobody can log in to do it in the app.
//   bun run admin -- --email=ops@example.org [--set-password] [--relink] [--promote] [--apply]
// Reads DATABASE_URL. Without --apply it only reports what it would change.
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { z } from "zod";
import { appUsers } from "../db/schema";
import { hashPassword, temporaryPassword } from "../auth/password.server";
import { planAdminCommand, planChangesAnything } from "./plan";

const USAGE =
  "Usage: bun run admin -- --email=<address> [--set-password] [--relink] [--promote] [--apply]";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      "set-password": { type: "boolean", default: false },
      relink: { type: "boolean", default: false },
      promote: { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
    },
    strict: true,
  });
  const parsed = z.string().trim().toLowerCase().email().safeParse(values.email ?? "");
  if (!parsed.success) fail(`A valid --email is required.\n${USAGE}`);
  const email = parsed.data;
  const options = { setPassword: values["set-password"], relink: values.relink, promote: values.promote };

  // A temporary password must only ever reach a person, never a log.
  if (options.setPassword && values.apply && !process.stdout.isTTY) {
    fail("--set-password with --apply needs an interactive terminal, so the password is not written to a log.");
  }

  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);

  try {
    const [existing] = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1);
    const plan = planAdminCommand(existing ?? null, options);

    console.log(`${values.apply ? "Changes" : "Dry run, no changes"} for ${email}:`);
    for (const note of plan.notes) console.log(`  - ${note}`);
    if (!values.apply || !planChangesAnything(plan)) {
      if (!values.apply && planChangesAnything(plan)) console.log("Re-run with --apply to make these changes.");
      return;
    }

    const now = new Date().toISOString();
    const password = plan.setPassword ? temporaryPassword() : null;
    const passwordFields = password
      ? { passwordHash: await hashPassword(password), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null, lastFailedLoginAt: null }
      : {};

    if (plan.create) {
      await db.insert(appUsers).values({ email, role: "admin", active: true, ...passwordFields });
    } else {
      await db
        .update(appUsers)
        .set({
          ...(plan.makeAdmin ? { role: "admin", active: true, rejectedAt: null } : {}),
          ...(plan.relink ? { keycloakSub: null } : {}),
          ...passwordFields,
          updatedAt: now,
        })
        .where(eq(appUsers.email, email));
    }

    const changed = [plan.create && "created", !plan.create && plan.makeAdmin && "promoted", plan.setPassword && "password", plan.relink && "relinked"]
      .filter(Boolean)
      .join(",");
    console.log(`[admin-command] ${now} email=${email} changes=${changed}`);
    if (password) console.log(`Temporary password (shown once, must be changed at first login): ${password}`);
  } finally {
    await pool.end();
  }
}

await main();
