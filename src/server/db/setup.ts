// One-time database setup, run by the migrate step when ADMIN_DATABASE_URL (a
// superuser) is set. Creates what the app's login can't create itself: the login,
// the database and its schemas. The login, its password and the database name come
// from DATABASE_URL. Each part is created only if missing, so it is safe to re-run;
// an existing login keeps its password.
import pg from "pg";

function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${encodeURIComponent(database)}`;
  return u.toString();
}

async function asAdmin<T>(url: string, run: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export async function setUpDatabase(adminUrl: string, appUrl: string): Promise<void> {
  const app = new URL(appUrl);
  const login = decodeURIComponent(app.username);
  const password = decodeURIComponent(app.password);
  const database = decodeURIComponent(app.pathname.replace(/^\//, ""));
  if (!login || !password || !database) throw new Error("DATABASE_URL needs a login, a password and a database name");

  await asAdmin(adminUrl, async (c) => {
    const role = c.escapeIdentifier(login);
    const hasRole = await c.query("select 1 from pg_roles where rolname = $1", [login]);
    if (!hasRole.rowCount) await c.query(`create role ${role} login password ${c.escapeLiteral(password)}`);
    const hasDb = await c.query("select 1 from pg_database where datname = $1", [database]);
    if (!hasDb.rowCount) await c.query(`create database ${c.escapeIdentifier(database)} owner ${role}`);
    await c.query(`revoke all on database ${c.escapeIdentifier(database)} from public`);
  });

  await asAdmin(withDatabase(adminUrl, database), async (c) => {
    const role = c.escapeIdentifier(login);
    await c.query(`alter schema public owner to ${role}`);
    await c.query("revoke create on schema public from public");
    // Written by the pipeline repo.
    await c.query(`create schema if not exists platform authorization ${role}`);
    // Kept out of public. Optional: some managed databases don't allow it here.
    await c.query("create schema if not exists extensions");
    try {
      await c.query("create extension if not exists pg_stat_statements with schema extensions");
    } catch (e) {
      console.warn(`pg_stat_statements not installed: ${(e as Error).message}`);
    }
  });
}
