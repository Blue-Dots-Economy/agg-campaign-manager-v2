// Needs TEST_DATABASE_URL (the campaign_manager login), set up by the migrate step; skipped otherwise.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { bootstrapAdmin } from "../../src/server/admin/bootstrap";
import { keycloakConfig } from "../../src/server/auth/config.server";
import { KeycloakAdmin } from "../../src/server/auth/keycloak-admin.server";
import { runMigrations } from "../../src/server/db/migrate";

const URL = process.env.TEST_DATABASE_URL;
const EMAIL = "boss@bootstrap.test";
const env = { BOOTSTRAP_ADMIN_EMAIL: "Boss@Bootstrap.test" };
const cfg = keycloakConfig({
  KEYCLOAK_BASE_URL: "http://keycloak:8080",
  KEYCLOAK_REALM: "bluedots",
  KEYCLOAK_CLIENT_ID: "campaign-manager",
  KEYCLOAK_CLIENT_SECRET: "s3cret",
});

// A fake Keycloak: answers in order from `script`, records every request.
function fakeKeycloak(script: Array<() => Response>) {
  const seen: string[] = [];
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    if (url.endsWith("/protocol/openid-connect/token")) {
      return new Response(JSON.stringify({ access_token: "t", expires_in: 300 }), { status: 200 });
    }
    seen.push(`${init.method ?? "GET"} ${url}`);
    const next = script.shift();
    if (!next) throw new Error(`unexpected request ${url}`);
    return next();
  }) as unknown as typeof fetch;
  return { make: () => new KeycloakAdmin(cfg, fetchFn), seen };
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });
const account = (over: Record<string, unknown> = {}) => ({
  id: "kc-boss", username: EMAIL, email: EMAIL, emailVerified: true, enabled: true, ...over,
});

describe.skipIf(!URL)("admin bootstrap after migrations", () => {
  let owner: pg.Client;
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;
  // Active admins left by other tests; set aside so "no active admin" holds, then restored.
  let setAside: string[] = [];

  const row = async () =>
    (await owner.query("select role, active, keycloak_sub from app_users where email = $1", [EMAIL])).rows[0];
  const actions = async () =>
    (await owner.query("select action, keycloak_user_id, operator from admin_actions where email = $1 order by id", [EMAIL])).rows;

  beforeAll(async () => {
    await runMigrations(URL!);
    owner = new pg.Client({ connectionString: URL });
    await owner.connect();
    setAside = (
      await owner.query("update app_users set active = false where role = 'admin' and active and email <> $1 returning email", [EMAIL])
    ).rows.map((r) => r.email);
    pool = new pg.Pool({ connectionString: URL, max: 2 });
    db = drizzle(pool);
  });

  afterEach(async () => {
    await owner.query("delete from app_users where email like $1", ["%@bootstrap.test"]);
    await owner.query("delete from admin_actions where email like $1", ["%@bootstrap.test"]);
  });

  afterAll(async () => {
    await owner.query("update app_users set active = true where email = any($1)", [setAside]);
    await owner.end();
    await pool.end();
  });

  test("does nothing when the setting is empty", async () => {
    const kc = fakeKeycloak([]);
    expect(await bootstrapAdmin(db, {}, kc.make)).toMatch(/not set/);
    expect(kc.seen).toEqual([]);
    expect(await row()).toBeUndefined();
  });

  test("refuses an invalid email", async () => {
    await expect(bootstrapAdmin(db, { BOOTSTRAP_ADMIN_EMAIL: "not-an-email" }, fakeKeycloak([]).make)).rejects.toThrow(/not a valid email/);
  });

  test("creates the Keycloak account and the admin, then leaves them alone", async () => {
    const kc = fakeKeycloak([
      json([]),
      () => new Response(null, { status: 201, headers: { location: "http://keycloak:8080/admin/realms/bluedots/users/kc-new" } }),
    ]);
    expect(await bootstrapAdmin(db, env, kc.make)).toMatch(/boss@bootstrap\.test/);
    expect(kc.seen.map((s) => s.split(" ")[0])).toEqual(["GET", "POST"]);
    expect(await row()).toEqual({ role: "admin", active: true, keycloak_sub: "kc-new" });
    expect(await actions()).toEqual([{ action: "create_admin", keycloak_user_id: "kc-new", operator: "bootstrap" }]);

    // The next deploy finds an active admin and touches neither Keycloak nor the database.
    const again = fakeKeycloak([]);
    expect(await bootstrapAdmin(db, env, again.make)).toMatch(/active admin who can sign in exists/);
    expect(again.seen).toEqual([]);
    expect(await actions()).toHaveLength(1);
  });

  test("restores a deactivated admin with the same email, linking their verified account", async () => {
    await owner.query("insert into app_users (email, role, active) values ($1, 'admin', false)", [EMAIL]);
    const kc = fakeKeycloak([json([account()])]);
    await bootstrapAdmin(db, env, kc.make);
    expect(await row()).toEqual({ role: "admin", active: true, keycloak_sub: "kc-boss" });
    expect(await actions()).toEqual([{ action: "promote", keycloak_user_id: "kc-boss", operator: "bootstrap" }]);
  });

  test("links an active admin from before Keycloak login, by Keycloak id", async () => {
    await owner.query("insert into app_users (email, role, active) values ($1, 'admin', true)", [EMAIL]);
    const kc = fakeKeycloak([json([account()])]);
    await bootstrapAdmin(db, env, kc.make);
    expect(await row()).toEqual({ role: "admin", active: true, keycloak_sub: "kc-boss" });
    expect(await actions()).toEqual([{ action: "link", keycloak_user_id: "kc-boss", operator: "bootstrap" }]);
  });

  test("an unlinked admin can't sign in, so it doesn't stop the bootstrap", async () => {
    await owner.query("insert into app_users (email, role, active) values ('placeholder@bootstrap.test', 'admin', true)");
    const kc = fakeKeycloak([
      json([]),
      () => new Response(null, { status: 201, headers: { location: "http://keycloak:8080/admin/realms/bluedots/users/kc-new" } }),
    ]);
    expect(await bootstrapAdmin(db, env, kc.make)).toMatch(/boss@bootstrap\.test/);
    expect(await row()).toEqual({ role: "admin", active: true, keycloak_sub: "kc-new" });
  });

  test("stops on an unverified Keycloak account and changes nothing", async () => {
    const kc = fakeKeycloak([json([account({ emailVerified: false })])]);
    const err = await bootstrapAdmin(db, env, kc.make).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/stopped for boss@bootstrap\.test.*not verified.*verify the email in Keycloak/);
    // Worded for a deploy log, not the admin command.
    expect((err as Error).message).not.toMatch(/--verify-email|details above/);
    expect(await row()).toBeUndefined();
    expect(await actions()).toEqual([]);
  });
});
