// The Keycloak callback, apart from the route so it can be tested with fakes.
// Every check runs before a session is started. Any refusal or failure, expected
// or not, clears both cookies and goes back to /login with a reason the login
// screen turns into a message, so a failed login never leaves an earlier user
// signed in.
import { isRole, landingFor } from "@/auth/roles";
import type { KeycloakConfig } from "./config.server";
import type { KeycloakIdentity, LoginRequest } from "./keycloak.server";
import type { LinkResult } from "./keycloak-link.server";

export interface CallbackDeps {
  config: () => KeycloakConfig;
  appOrigin: () => string;
  secretKey: () => Uint8Array;
  openLoginRequest: (token: string | undefined, secret: Uint8Array) => Promise<LoginRequest | null>;
  exchangeCode: (c: KeycloakConfig, appOrigin: string, code: string, verifier: string) => Promise<string>;
  verifyIdToken: (c: KeycloakConfig, idToken: string, req: LoginRequest) => Promise<KeycloakIdentity>;
  link: (id: { sub: string; email: string }, name: string | null) => Promise<LinkResult>;
  signSession: (userId: string) => Promise<string>;
  readCookie: (request: Request, name: string) => string | undefined;
  cookieHeader: (name: string, value: string, maxAgeSeconds: number) => string;
  oidcCookie: string;
  sessionCookie: string;
  sessionTtlSeconds: number;
  log?: (line: string) => void;
}

// Keycloak's error code and description, on one line and cut short, for the log.
export function oauthErrorText(code: string | null, description: string | null): string {
  const text = [code, description].filter(Boolean).join(": ");
  return text.replace(/[\r\n]+/g, " ").slice(0, 300);
}

export async function handleCallback(request: Request, d: CallbackDeps): Promise<Response> {
  const log = d.log ?? ((line: string) => console.error(line));
  const backToLogin = (reason: string) =>
    new Response(null, {
      status: 302,
      headers: new Headers([
        ["location", `/login?error=${encodeURIComponent(reason)}`],
        ["set-cookie", d.cookieHeader(d.oidcCookie, "", 0)],
        ["set-cookie", d.cookieHeader(d.sessionCookie, "", 0)],
      ]),
    });

  try {
    const url = new URL(request.url);
    // Keycloak reports a cancelled or failed login with ?error=.
    const error = url.searchParams.get("error");
    if (error) {
      log(`[keycloak] login failed at Keycloak: ${oauthErrorText(error, url.searchParams.get("error_description"))}`);
      return backToLogin("failed");
    }
    const req = await d.openLoginRequest(d.readCookie(request, d.oidcCookie), d.secretKey());
    if (!req || url.searchParams.get("state") !== req.state) return backToLogin("expired");
    const code = url.searchParams.get("code");
    if (!code) return backToLogin("failed");

    const cfg = d.config();
    let identity: KeycloakIdentity;
    try {
      identity = await d.verifyIdToken(cfg, await d.exchangeCode(cfg, d.appOrigin(), code, req.verifier), req);
    } catch (e) {
      log(`[keycloak] login refused: ${e instanceof Error ? e.message : String(e)}`);
      return backToLogin("failed");
    }
    if (!identity.email || !identity.emailVerified) return backToLogin("unverified");

    const result = await d.link({ sub: identity.sub, email: identity.email }, identity.name);
    if (result.kind === "refused") return backToLogin(result.reason);

    const headers = new Headers({ location: landingFor(isRole(result.role) ? result.role : undefined) });
    headers.append("set-cookie", d.cookieHeader(d.oidcCookie, "", 0));
    headers.append("set-cookie", d.cookieHeader(d.sessionCookie, await d.signSession(result.userId), d.sessionTtlSeconds));
    return new Response(null, { status: 302, headers });
  } catch (e) {
    log(`[keycloak] login failed: ${e instanceof Error ? e.message : String(e)}`);
    return backToLogin("failed");
  }
}
