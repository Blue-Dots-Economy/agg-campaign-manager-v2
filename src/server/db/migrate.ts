// Reads DATABASE_URL (or the old name, MIGRATOR_DATABASE_URL). With
// ADMIN_DATABASE_URL (a superuser) it first creates the login, database and
// schemas if missing; leave it unset where they already exist. Then it creates
// the first admin from BOOTSTRAP_ADMIN_EMAIL, if there is no active admin.
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { bootstrapAdmin } from "../admin/bootstrap";
import { setUpDatabase } from "./setup";

export const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));

export async function runMigrations(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.MIGRATOR_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  try {
    const adminUrl = process.env.ADMIN_DATABASE_URL?.trim();
    if (adminUrl) {
      await setUpDatabase(adminUrl, url);
      console.log("database set up");
    }
    await runMigrations(url);
    console.log("migrations applied");
    const pool = new pg.Pool({ connectionString: url, max: 1 });
    try {
      console.log(await bootstrapAdmin(drizzle(pool)));
    } finally {
      await pool.end();
    }
  } catch (e) {
    // Drizzle wraps database errors; the cause says what actually went wrong.
    const cause = (e as Error).cause;
    console.error((e as Error).message + (cause instanceof Error ? `\n${cause.message}` : ""));
    process.exit(1);
  }
}
