import { describe, expect, test } from "bun:test";
import { handleCallback, type CallbackDeps } from "../../src/server/auth/callback.server";
import { keycloakConfig } from "../../src/server/auth/config.server";
import type { KeycloakIdentity } from "../../src/server/auth/keycloak.server";
import type { LinkResult } from "../../src/server/auth/keycloak-link.server";

const REQ = { state: "state-1", nonce: "n", verifier: "v", startedAt: 0 };
const IDENTITY: KeycloakIdentity = { sub: "sub-1", email: "priya@example.org", emailVerified: true, name: "Priya" };

// Fakes for everything outside the handler; each test overrides what it needs.
function deps(over: Partial<CallbackDeps> = {}) {
  const logged: string[] = [];
  const d: CallbackDeps = {
    config: () =>
      keycloakConfig({
        KEYCLOAK_BASE_URL: "http://keycloak:8080",
        KEYCLOAK_REALM: "bluedots",
        KEYCLOAK_CLIENT_ID: "campaign-manager",
        KEYCLOAK_CLIENT_SECRET: "s3cret",
      }),
    appOrigin: () => "http://localhost:8088",
    secretKey: () => new Uint8Array(32),
    openLoginRequest: async (token) => (token === "sealed" ? REQ : null),
    exchangeCode: async () => "id-token",
    verifyIdToken: async () => IDENTITY,
    link: async (): Promise<LinkResult> => ({ kind: "login", userId: "u-1", role: "admin" }),
    signSession: async (uid) => `session-for-${uid}`,
    readCookie: (request, name) =>
      request.headers.get("cookie")?.split("; ").find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1),
    cookieHeader: (name, value, maxAge) => `${name}=${value}; Max-Age=${maxAge}`,
    oidcCookie: "cm_oidc",
    sessionCookie: "cm_session",
    sessionTtlSeconds: 3600,
    log: (line) => logged.push(line),
    ...over,
  };
  return { d, logged };
}

const callback = (query: string) =>
  new Request(`http://localhost:8088/auth/keycloak/callback?${query}`, {
    headers: { cookie: "cm_oidc=sealed; cm_session=earlier-user" },
  });

// Where it redirects, and whether both cookies were cleared.
function outcome(res: Response) {
  const cookies = res.headers.getSetCookie();
  return {
    location: res.headers.get("location"),
    cleared: cookies.includes("cm_oidc=; Max-Age=0") && cookies.includes("cm_session=; Max-Age=0"),
  };
}

describe("Keycloak callback", () => {
  test("a good login starts a session and clears the login cookie", async () => {
    const res = await handleCallback(callback("state=state-1&code=c"), deps().d);
    expect(res.status).toBe(302);
    expect(res.headers.getSetCookie()).toEqual(["cm_oidc=; Max-Age=0", "cm_session=session-for-u-1; Max-Age=3600"]);
  });

  test("a state that doesn't match is refused, and both cookies are cleared", async () => {
    const res = await handleCallback(callback("state=other&code=c"), deps().d);
    expect(outcome(res)).toEqual({ location: "/login?error=expired", cleared: true });
  });

  test("Keycloak's ?error= is logged with its description and refused", async () => {
    const { d, logged } = deps();
    const res = await handleCallback(callback("error=access_denied&error_description=User%0Acancelled"), d);
    expect(outcome(res)).toEqual({ location: "/login?error=failed", cleared: true });
    expect(logged).toEqual(["[keycloak] login failed at Keycloak: access_denied: User cancelled"]);
  });

  test("an unverified email is refused", async () => {
    const res = await handleCallback(
      callback("state=state-1&code=c"),
      deps({ verifyIdToken: async () => ({ ...IDENTITY, emailVerified: false }) }).d,
    );
    expect(outcome(res)).toEqual({ location: "/login?error=unverified", cleared: true });
  });

  test("a refusal from linking is passed on", async () => {
    const res = await handleCallback(
      callback("state=state-1&code=c"),
      deps({ link: async () => ({ kind: "refused", reason: "pending" }) }).d,
    );
    expect(outcome(res)).toEqual({ location: "/login?error=pending", cleared: true });
  });

  test("an unexpected error goes back to login, clears both cookies and is logged", async () => {
    const { d, logged } = deps({
      link: async () => {
        throw new Error("database is down");
      },
    });
    const res = await handleCallback(callback("state=state-1&code=c"), d);
    expect(outcome(res)).toEqual({ location: "/login?error=failed", cleared: true });
    expect(logged).toEqual(["[keycloak] login failed: database is down"]);
  });

  test("a missing session secret is handled the same way", async () => {
    const { d } = deps({
      secretKey: () => {
        throw new Error("SESSION_SECRET must be set (at least 32 characters)");
      },
    });
    expect(outcome(await handleCallback(callback("state=state-1&code=c"), d))).toEqual({
      location: "/login?error=failed",
      cleared: true,
    });
  });
});
