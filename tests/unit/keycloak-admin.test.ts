import { describe, expect, test } from "bun:test";
import { keycloakConfig } from "../../src/server/auth/config.server";
import { decideAccount, KeycloakAdmin, KeycloakHttpError, type KeycloakUser } from "../../src/server/auth/keycloak-admin.server";

const cfg = keycloakConfig({
  KEYCLOAK_BASE_URL: "http://keycloak:8080",
  KEYCLOAK_INTERNAL_BASE_URL: "http://sd-keycloak:8080",
  KEYCLOAK_REALM: "bluedots",
  KEYCLOAK_CLIENT_ID: "campaign-manager",
  KEYCLOAK_CLIENT_SECRET: "s3cret",
});

const kcUser = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "kc-1",
  username: "priya@example.org",
  email: "priya@example.org",
  emailVerified: true,
  enabled: true,
  createdTimestamp: 1_790_000_000_000,
  attributes: { phoneNumber: ["+919876543210"] },
  ...over,
});

// A fake Keycloak: answers in order from `script`, records every request.
function fakeKeycloak(script: Array<(url: string, init: RequestInit) => Response>) {
  const seen: { url: string; method: string; auth?: string; body?: string }[] = [];
  let tokens = 0;
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    if (url.endsWith("/protocol/openid-connect/token")) {
      tokens++;
      return new Response(JSON.stringify({ access_token: `t${tokens}`, expires_in: 300 }), { status: 200 });
    }
    const headers = (init.headers ?? {}) as Record<string, string>;
    seen.push({ url, method: init.method ?? "GET", auth: headers.authorization, body: init.body as string });
    const next = script.shift();
    if (!next) throw new Error(`unexpected request ${url}`);
    return next(url, init);
  }) as unknown as typeof fetch;
  return { fetchFn, seen, tokens: () => tokens };
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });

describe("which Keycloak account to use", () => {
  const u = (over: Partial<KeycloakUser> = {}): KeycloakUser => ({
    id: "kc-1", username: "x", email: "x@y.z", emailVerified: true, enabled: true, createdTimestamp: null, phoneNumber: null, ...over,
  });

  test("none: create one", () => expect(decideAccount(null)).toEqual({ kind: "create" }));
  test("verified and enabled: reuse it", () => expect(decideAccount(u())).toEqual({ kind: "reuse" }));
  test("unverified: refused", () => expect(decideAccount(u({ emailVerified: false }))).toEqual({ kind: "refuse", reason: "unverified" }));
  test("disabled: refused, even if verified", () =>
    expect(decideAccount(u({ enabled: false }))).toEqual({ kind: "refuse", reason: "disabled" }));
});

describe("Keycloak admin client", () => {
  test("looks up by exact email on the internal address, with the service account token", async () => {
    const kc = fakeKeycloak([json([kcUser()])]);
    const admin = new KeycloakAdmin(cfg, kc.fetchFn);
    const found = await admin.findByEmail("priya@example.org");
    expect(found).toMatchObject({ id: "kc-1", emailVerified: true, enabled: true, phoneNumber: "+919876543210" });
    const url = new URL(kc.seen[0].url);
    expect(url.origin + url.pathname).toBe("http://sd-keycloak:8080/admin/realms/bluedots/users");
    expect(url.searchParams.get("exact")).toBe("true");
    expect(url.searchParams.get("email")).toBe("priya@example.org");
    expect(kc.seen[0].auth).toBe("Bearer t1");
  });

  test("ignores a near match that Keycloak might return", async () => {
    const kc = fakeKeycloak([json([kcUser({ email: "apriya@example.org" })])]);
    expect(await new KeycloakAdmin(cfg, kc.fetchFn).findByEmail("priya@example.org")).toBeNull();
  });

  test("keeps the token until shortly before it expires, and refreshes once on 401", async () => {
    let clock = 0;
    const kc = fakeKeycloak([json([]), json([]), () => new Response("", { status: 401 }), json([]), json([])]);
    const admin = new KeycloakAdmin(cfg, kc.fetchFn, () => clock);
    await admin.findByEmail("a@b.c");
    await admin.findByEmail("a@b.c");
    expect(kc.tokens()).toBe(1);
    await admin.findByEmail("a@b.c"); // 401, then a fresh token
    expect(kc.tokens()).toBe(2);
    clock = 300_000; // past expires_in - 30s
    await admin.findByEmail("a@b.c");
    expect(kc.tokens()).toBe(3);
  });

  test("creates a verified, enabled user and reads the id from Location", async () => {
    const kc = fakeKeycloak([
      () => new Response(null, { status: 201, headers: { location: "http://sd-keycloak:8080/admin/realms/bluedots/users/new-id" } }),
    ]);
    expect(await new KeycloakAdmin(cfg, kc.fetchFn).create("priya@example.org", "Priya")).toEqual({ id: "new-id" });
    expect(JSON.parse(kc.seen[0].body!)).toEqual({
      username: "priya@example.org", email: "priya@example.org", emailVerified: true, enabled: true, firstName: "Priya",
    });
  });

  test("ensureAccount: no account yet, creates it", async () => {
    const kc = fakeKeycloak([json([]), () => new Response(null, { status: 201, headers: { location: ".../users/new-id" } })]);
    expect(await new KeycloakAdmin(cfg, kc.fetchFn).ensureAccount("priya@example.org", null)).toEqual({
      kind: "ok", id: "new-id", created: true,
    });
  });

  test("ensureAccount: reuses a verified account and changes nothing in it", async () => {
    const kc = fakeKeycloak([json([kcUser()])]);
    expect(await new KeycloakAdmin(cfg, kc.fetchFn).ensureAccount("priya@example.org", null)).toEqual({
      kind: "ok", id: "kc-1", created: false,
    });
    expect(kc.seen.map((s) => s.method)).toEqual(["GET"]);
  });

  test("ensureAccount: refuses an unverified or disabled account", async () => {
    const unverified = fakeKeycloak([json([kcUser({ emailVerified: false })])]);
    expect(await new KeycloakAdmin(cfg, unverified.fetchFn).ensureAccount("priya@example.org", null)).toEqual({
      kind: "refused", reason: "unverified",
    });
    const disabled = fakeKeycloak([json([kcUser({ enabled: false })])]);
    expect(await new KeycloakAdmin(cfg, disabled.fetchFn).ensureAccount("priya@example.org", null)).toEqual({
      kind: "refused", reason: "disabled",
    });
  });

  test("ensureAccount: created a moment ago by someone else, looks again and reuses it", async () => {
    const kc = fakeKeycloak([json([]), () => new Response("", { status: 409 }), json([kcUser()])]);
    expect(await new KeycloakAdmin(cfg, kc.fetchFn).ensureAccount("priya@example.org", null)).toEqual({
      kind: "ok", id: "kc-1", created: false,
    });
  });

  test("ensureAccount: username taken by an account with another email", async () => {
    const kc = fakeKeycloak([json([]), () => new Response("", { status: 409 }), json([])]);
    expect(await new KeycloakAdmin(cfg, kc.fetchFn).ensureAccount("priya@example.org", null)).toEqual({
      kind: "refused", reason: "username-taken",
    });
  });

  test("markEmailVerified sends the full user back with only emailVerified changed", async () => {
    const full = kcUser({ emailVerified: false, firstName: "Priya" });
    const kc = fakeKeycloak([json(full), () => new Response(null, { status: 204 })]);
    await new KeycloakAdmin(cfg, kc.fetchFn).markEmailVerified("kc-1");
    expect(kc.seen[1].method).toBe("PUT");
    expect(JSON.parse(kc.seen[1].body!)).toEqual({ ...full, emailVerified: true });
  });

  test("a Keycloak error is reported, not hidden", async () => {
    const kc = fakeKeycloak([() => new Response("", { status: 503 })]);
    await expect(new KeycloakAdmin(cfg, kc.fetchFn).findByEmail("a@b.c")).rejects.toThrow(/HTTP 503/);
  });

  // The admin screen tells "not allowed" apart from "can't be reached".
  test("marks refusals of Campaign Manager's own access as denied", async () => {
    const err = (p: Promise<unknown>) => p.catch((e: unknown) => e as KeycloakHttpError);
    const missingRole = await err(new KeycloakAdmin(cfg, fakeKeycloak([() => new Response("", { status: 403 })]).fetchFn).findByEmail("a@b.c"));
    expect(missingRole).toMatchObject({ status: 403, denied: true });

    const badSecret = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    expect(await err(new KeycloakAdmin(cfg, badSecret).findByEmail("a@b.c"))).toMatchObject({ status: 401, denied: true });

    const down = await err(new KeycloakAdmin(cfg, fakeKeycloak([() => new Response("", { status: 503 })]).fetchFn).findByEmail("a@b.c"));
    expect(down).toBeInstanceOf(KeycloakHttpError);
    expect(down).toMatchObject({ status: 503, denied: false });
  });
});
