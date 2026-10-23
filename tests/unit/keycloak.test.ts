import { beforeAll, describe, expect, test } from "bun:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { keycloakConfig } from "../../src/server/auth/config.server";
import {
  AUTH_TIME_ALLOWANCE_SECONDS,
  authorizeUrl,
  exchangeCode,
  keycloakSignOutUrl,
  newLoginRequest,
  openLoginRequest,
  pkceChallenge,
  sealLoginRequest,
  verifyIdToken,
} from "../../src/server/auth/keycloak.server";

const cfg = keycloakConfig({
  KEYCLOAK_BASE_URL: "http://keycloak:8080",
  KEYCLOAK_INTERNAL_BASE_URL: "http://sd-keycloak:8080",
  KEYCLOAK_REALM: "bluedots",
  KEYCLOAK_CLIENT_ID: "campaign-manager",
  KEYCLOAK_CLIENT_SECRET: "s3cret",
});
const APP = "http://localhost:8088";
const SECRET = new TextEncoder().encode("test-secret-at-least-thirty-two-characters!");
const now = () => Math.floor(Date.now() / 1000);

let keys: JWTVerifyGetKey;
let privateKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" }] });
});

const idToken = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string } = {}) =>
  new SignJWT({
    typ: "ID",
    nonce: "n-1",
    auth_time: now(),
    email: "Priya@Example.org",
    email_verified: true,
    name: "Priya",
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setSubject("sub-123")
    .setIssuer(opts.iss ?? cfg.issuer)
    .setAudience(opts.aud ?? cfg.clientId)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m")
    .sign(privateKey);

const login = (startedAt = now()) => ({ nonce: "n-1", startedAt });

describe("PKCE", () => {
  test("S256 challenge matches the RFC 7636 example", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("login request", () => {
  test("the Keycloak URL uses the public address, PKCE, the callback, and always asks for a code", () => {
    const req = newLoginRequest();
    const url = new URL(authorizeUrl(cfg, APP, req));
    expect(url.origin + url.pathname).toBe("http://keycloak:8080/realms/bluedots/protocol/openid-connect/auth");
    expect(url.searchParams.get("client_id")).toBe("campaign-manager");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:8088/auth/keycloak/callback");
    expect(url.searchParams.get("code_challenge")).toBe(pkceChallenge(req.verifier));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(req.state);
    expect(url.searchParams.get("nonce")).toBe(req.nonce);
    expect(url.searchParams.get("prompt")).toBe("login");
    expect(url.searchParams.get("max_age")).toBe("0");
  });

  test("each request gets fresh random values and its start time", () => {
    const a = newLoginRequest(1_800_000_000_000);
    const b = newLoginRequest();
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.startedAt).toBe(1_800_000_000);
  });

  test("the sealed cookie round-trips, and a tampered or foreign one is rejected", async () => {
    const req = newLoginRequest();
    const sealed = await sealLoginRequest(req, SECRET);
    expect(await openLoginRequest(sealed, SECRET)).toEqual(req);
    expect(await openLoginRequest(sealed + "x", SECRET)).toBeNull();
    expect(await openLoginRequest(sealed, new TextEncoder().encode("another-secret-also-thirty-two-characters"))).toBeNull();
    expect(await openLoginRequest(undefined, SECRET)).toBeNull();
  });

  test("an edited start time breaks the signature", async () => {
    const sealed = await sealLoginRequest(newLoginRequest(), SECRET);
    const [h, p, s] = sealed.split(".");
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    const edited = Buffer.from(JSON.stringify({ ...payload, startedAt: 0 })).toString("base64url");
    expect(await openLoginRequest(`${h}.${edited}.${s}`, SECRET)).toBeNull();
  });

  test("a session token is not accepted as a login request", async () => {
    const session = await new SignJWT({ uid: "u-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("cm_session")
      .setExpirationTime("1h")
      .sign(SECRET);
    expect(await openLoginRequest(session, SECRET)).toBeNull();
  });
});

describe("code exchange", () => {
  test("posts the code and PKCE verifier to the internal address", async () => {
    let seen: { url: string; body: URLSearchParams } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, body: init.body as URLSearchParams };
      return new Response(JSON.stringify({ id_token: "abc" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await exchangeCode(cfg, APP, "code-1", "verifier-1", fakeFetch)).toBe("abc");
    expect(seen!.url).toBe("http://sd-keycloak:8080/realms/bluedots/protocol/openid-connect/token");
    expect(seen!.body.get("code_verifier")).toBe("verifier-1");
    expect(seen!.body.get("redirect_uri")).toBe("http://localhost:8088/auth/keycloak/callback");
  });

  test("fails when Keycloak refuses", async () => {
    const fakeFetch = (async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeCode(cfg, APP, "bad", "v", fakeFetch)).rejects.toThrow(/HTTP 400/);
  });
});

describe("ID token check", () => {
  test("a valid token gives the identity, with the email lowercased", async () => {
    const id = await verifyIdToken(cfg, await idToken({}), login(), keys);
    expect(id).toEqual({ sub: "sub-123", email: "priya@example.org", emailVerified: true, name: "Priya" });
  });

  test("reports an unverified or missing email instead of refusing", async () => {
    expect((await verifyIdToken(cfg, await idToken({ email_verified: false }), login(), keys)).emailVerified).toBe(false);
    expect((await verifyIdToken(cfg, await idToken({ email: undefined }), login(), keys)).email).toBeNull();
  });

  test("refuses the wrong nonce, issuer, audience, client, type or an expired token", async () => {
    await expect(verifyIdToken(cfg, await idToken({}), { ...login(), nonce: "other" }, keys)).rejects.toThrow(/nonce/);
    await expect(verifyIdToken(cfg, await idToken({}, { iss: "http://keycloak:8080/realms/other" }), login(), keys)).rejects.toThrow();
    await expect(verifyIdToken(cfg, await idToken({}, { aud: "signals-ui" }), login(), keys)).rejects.toThrow();
    await expect(verifyIdToken(cfg, await idToken({ azp: "signals-ui" }), login(), keys)).rejects.toThrow(/another client/);
    await expect(verifyIdToken(cfg, await idToken({ typ: "Bearer" }), login(), keys)).rejects.toThrow(/Not an ID token/);
    await expect(verifyIdToken(cfg, await idToken({}, { exp: "-2m" }), login(), keys)).rejects.toThrow();
  });

  test("refuses a token signed with another key", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ typ: "ID", nonce: "n-1", auth_time: now() })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setSubject("sub-123")
      .setIssuer(cfg.issuer)
      .setAudience(cfg.clientId)
      .setExpirationTime("5m")
      .sign(other.privateKey);
    await expect(verifyIdToken(cfg, forged, login(), keys)).rejects.toThrow();
  });
});

describe("a code at every sign-in", () => {
  test("refuses a token with no auth_time", async () => {
    await expect(verifyIdToken(cfg, await idToken({ auth_time: undefined }), login(), keys)).rejects.toThrow(/auth_time/);
  });

  test("refuses a silent sign-in from an older Keycloak session", async () => {
    const start = now();
    const old = await idToken({ auth_time: start - AUTH_TIME_ALLOWANCE_SECONDS - 1 });
    await expect(verifyIdToken(cfg, old, login(start), keys)).rejects.toThrow(/No code was entered/);
  });

  test("allows a small clock difference between the app and Keycloak", async () => {
    const start = now();
    const slightlyBehind = await idToken({ auth_time: start - AUTH_TIME_ALLOWANCE_SECONDS });
    expect((await verifyIdToken(cfg, slightlyBehind, login(start), keys)).sub).toBe("sub-123");
  });
});

describe("Not you? sign-out", () => {
  test("ends the Keycloak session on the public address and returns to /login", () => {
    const url = new URL(keycloakSignOutUrl(cfg, APP));
    expect(url.origin + url.pathname).toBe("http://keycloak:8080/realms/bluedots/protocol/openid-connect/logout");
    expect(url.searchParams.get("client_id")).toBe("campaign-manager");
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe("http://localhost:8088/login");
    expect(url.searchParams.has("id_token_hint")).toBe(false);
  });
});
