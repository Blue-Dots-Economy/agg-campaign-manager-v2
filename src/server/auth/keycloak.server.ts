// OpenID Connect authorization code flow with PKCE, against Keycloak.
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import type { KeycloakConfig } from "./config.server";

export const OIDC_COOKIE = "cm_oidc";
export const OIDC_TTL_SECONDS = 10 * 60;
export const CALLBACK_PATH = "/auth/keycloak/callback";
// Token expiry, between our clock and Keycloak's.
const EXPIRY_TOLERANCE_SECONDS = 30;
// auth_time against the login start. Small on purpose: within it, a sign-in made
// by someone else on the same browser just before would still pass (see §3.1).
export const AUTH_TIME_ALLOWANCE_SECONDS = 10;

const b64url = (buf: Buffer) => buf.toString("base64url");
const randomToken = () => b64url(randomBytes(32));

export function pkceChallenge(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

const protocolUrl = (base: string, c: KeycloakConfig, endpoint: string) =>
  `${base}/realms/${encodeURIComponent(c.realm)}/protocol/openid-connect/${endpoint}`;

export interface LoginRequest {
  state: string;
  nonce: string;
  verifier: string;
  // Seconds since the epoch, by our clock. The token's auth_time must not be older.
  startedAt: number;
}

export function newLoginRequest(now = Date.now()): LoginRequest {
  return { state: randomToken(), nonce: randomToken(), verifier: randomToken(), startedAt: Math.floor(now / 1000) };
}

// prompt=login and max_age=0 make Keycloak ask for a code even when the browser
// already has a Keycloak session. The auth_time check enforces it on our side.
export function authorizeUrl(c: KeycloakConfig, appOrigin: string, req: LoginRequest): string {
  const url = new URL(protocolUrl(c.baseUrl, c, "auth"));
  url.search = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: appOrigin + CALLBACK_PATH,
    response_type: "code",
    scope: "openid email profile",
    state: req.state,
    nonce: req.nonce,
    code_challenge: pkceChallenge(req.verifier),
    code_challenge_method: "S256",
    prompt: "login",
    max_age: "0",
  }).toString();
  return url.toString();
}

// The login request rides in a short-lived signed cookie between the start route
// and the callback. Signed, so the start time can't be edited to skip the code;
// its own audience, so it never passes as a session.
const OIDC_AUDIENCE = "cm_oidc";

export async function sealLoginRequest(req: LoginRequest, secret: Uint8Array): Promise<string> {
  return new SignJWT({ ...req })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(OIDC_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${OIDC_TTL_SECONDS}s`)
    .sign(secret);
}

export async function openLoginRequest(token: string | undefined, secret: Uint8Array): Promise<LoginRequest | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], audience: OIDC_AUDIENCE });
    const { state, nonce, verifier, startedAt } = payload as Record<string, unknown>;
    if (typeof state !== "string" || typeof nonce !== "string" || typeof verifier !== "string") return null;
    if (typeof startedAt !== "number") return null;
    return { state, nonce, verifier, startedAt };
  } catch {
    return null;
  }
}

// Server-to-server, over the internal address. Returns the raw ID token.
export async function exchangeCode(
  c: KeycloakConfig,
  appOrigin: string,
  code: string,
  verifier: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchFn(protocolUrl(c.internalBaseUrl, c, "token"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: appOrigin + CALLBACK_PATH,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`Keycloak code exchange failed: HTTP ${res.status}`);
  const body = (await res.json()) as { id_token?: unknown };
  if (typeof body.id_token !== "string") throw new Error("Keycloak returned no ID token");
  return body.id_token;
}

export interface KeycloakIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

// Keycloak's public keys, fetched once and cached (jose refreshes them when it
// meets a key id it does not know, which covers key rotation).
const keySets = new Map<string, JWTVerifyGetKey>();
function remoteKeys(c: KeycloakConfig): JWTVerifyGetKey {
  const url = protocolUrl(c.internalBaseUrl, c, "certs");
  let keys = keySets.get(url);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(url));
    keySets.set(url, keys);
  }
  return keys;
}

// Checks signature, issuer, audience, client, type, expiry, nonce and that a code
// was entered for this login. The email checks are the caller's, so it can show a
// specific message.
export async function verifyIdToken(
  c: KeycloakConfig,
  idToken: string,
  req: Pick<LoginRequest, "nonce" | "startedAt">,
  keys: JWTVerifyGetKey = remoteKeys(c),
): Promise<KeycloakIdentity> {
  const { payload } = await jwtVerify(idToken, keys, {
    issuer: c.issuer,
    audience: c.clientId,
    clockTolerance: EXPIRY_TOLERANCE_SECONDS,
    algorithms: ["RS256", "RS384", "RS512", "PS256", "ES256", "ES384"],
  });
  if (payload.typ !== "ID") throw new Error("Not an ID token");
  if (payload.nonce !== req.nonce) throw new Error("ID token nonce does not match");
  if (payload.azp !== undefined && payload.azp !== c.clientId) throw new Error("ID token was issued to another client");
  if (typeof payload.auth_time !== "number") throw new Error("ID token has no auth_time");
  if (payload.auth_time < req.startedAt - AUTH_TIME_ALLOWANCE_SECONDS) {
    throw new Error("No code was entered for this login (auth_time is older than the login)");
  }
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("ID token has no subject");
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  return {
    sub: payload.sub,
    email: email || null,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : null,
  };
}

// "Not you? Sign out of Keycloak": ends the Keycloak session in this browser,
// which also signs that person out of other apps on the realm. Without an ID
// token hint, Keycloak asks the user to confirm, then returns to /login.
export function keycloakSignOutUrl(c: KeycloakConfig, appOrigin: string): string {
  const url = new URL(protocolUrl(c.baseUrl, c, "logout"));
  url.search = new URLSearchParams({ client_id: c.clientId, post_logout_redirect_uri: `${appOrigin}/login` }).toString();
  return url.toString();
}
