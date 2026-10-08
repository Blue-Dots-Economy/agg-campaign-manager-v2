// MIGRATOR_DATABASE_URL=... bun run db:migrate
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

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
  const url = process.env.MIGRATOR_DATABASE_URL;
  if (!url) {
    console.error("MIGRATOR_DATABASE_URL is not set");
    process.exit(1);
  }
  await runMigrations(url);
  console.log("migrations applied");
}
