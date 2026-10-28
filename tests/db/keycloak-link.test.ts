// Needs TEST_DATABASE_URL (the campaign_manager login), set up by the migrate step; skipped otherwise.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { runMigrations } from "../../src/server/db/migrate";
import { linkKeycloakIdentity } from "../../src/server/auth/keycloak-link.server";

const URL = process.env.TEST_DATABASE_URL;
const DOMAIN = "@kc-link.test";

describe.skipIf(!URL)("linking a Keycloak identity in the database", () => {
  let owner: pg.Client;
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;
  const link = { linkKeycloakIdentity: (id: { sub: string; email: string }, name: string | null) => linkKeycloakIdentity(id, name, db) };

  const row = async (email: string) =>
    (await owner.query("select role, active, keycloak_sub, rejected_at, last_login_at from app_users where email = $1", [email]))
      .rows[0];

  beforeAll(async () => {
    await runMigrations(URL!);
    owner = new pg.Client({ connectionString: URL });
    await owner.connect();
    await cleanup();
    await owner.query(
      `insert into app_users (email, role, active) values
         ('known${DOMAIN}', 'coordinator', true),
         ('gone${DOMAIN}', 'user', false)`,
    );
    pool = new pg.Pool({ connectionString: URL, max: 2 });
    db = drizzle(pool);
  });

  async function cleanup() {
    await owner.query("delete from app_users where email like $1", ["%" + DOMAIN]);
  }

  afterAll(async () => {
    await cleanup();
    await owner.end();
    await pool.end();
  });

  test("a known user is linked on first login and gets their role", async () => {
    const r = await link.linkKeycloakIdentity({ sub: "sub-known", email: `known${DOMAIN}` }, "Known");
    expect(r).toMatchObject({ kind: "login", role: "coordinator" });
    const u = await row(`known${DOMAIN}`);
    expect(u.keycloak_sub).toBe("sub-known");
    expect(u.last_login_at).not.toBeNull();
  });

  test("an unknown person is stored as pending, inactive and without a role", async () => {
    const r = await link.linkKeycloakIdentity({ sub: "sub-new", email: `new${DOMAIN}` }, "New Person");
    expect(r).toEqual({ kind: "refused", reason: "pending" });
    expect(await row(`new${DOMAIN}`)).toMatchObject({ role: null, active: false, keycloak_sub: "sub-new" });
  });

  test("logging in again while pending changes nothing", async () => {
    const r = await link.linkKeycloakIdentity({ sub: "sub-new", email: `new${DOMAIN}` }, "New Person");
    expect(r).toEqual({ kind: "refused", reason: "pending" });
    expect((await owner.query("select count(*)::int as n from app_users where email = $1", [`new${DOMAIN}`])).rows[0].n).toBe(1);
  });

  test("two first logins at once store one pending user, without an error", async () => {
    const who = { sub: "sub-twice", email: `twice${DOMAIN}` };
    const results = await Promise.all([link.linkKeycloakIdentity(who, null), link.linkKeycloakIdentity(who, null)]);
    expect(results).toEqual([
      { kind: "refused", reason: "pending" },
      { kind: "refused", reason: "pending" },
    ]);
    expect((await owner.query("select count(*)::int as n from app_users where email = $1", [who.email])).rows[0].n).toBe(1);
  });

  test("a rejected user stays refused, not pending again", async () => {
    await owner.query("update app_users set rejected_at = now() where email = $1", [`new${DOMAIN}`]);
    const r = await link.linkKeycloakIdentity({ sub: "sub-new", email: `new${DOMAIN}` }, "New Person");
    expect(r).toEqual({ kind: "refused", reason: "denied" });
  });

  test("a deactivated user is refused", async () => {
    const r = await link.linkKeycloakIdentity({ sub: "sub-gone", email: `gone${DOMAIN}` }, null);
    expect(r).toEqual({ kind: "refused", reason: "denied" });
  });

  test("a recreated Keycloak account for a linked email is a conflict", async () => {
    const r = await link.linkKeycloakIdentity({ sub: "sub-recreated", email: `known${DOMAIN}` }, null);
    expect(r).toEqual({ kind: "refused", reason: "conflict" });
  });
});
