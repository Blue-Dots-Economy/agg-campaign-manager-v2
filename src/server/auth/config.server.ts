// Login goes through Keycloak. These settings are checked once at startup, so a
// wrong setting stops the app instead of surfacing at someone's first login.

type Env = Record<string, string | undefined>;

// The app's own origin, without a path or trailing slash.
export function appOrigin(env: Env = process.env): string {
  const raw = env.APP_BASE_URL?.trim();
  if (!raw) throw new Error("APP_BASE_URL is not set");
  return httpUrl("APP_BASE_URL", raw, true);
}

export interface KeycloakConfig {
  // Public address, used for browser redirects and to build the expected issuer.
  baseUrl: string;
  // In-cluster address, used only by the server: code exchange, public keys, admin API.
  internalBaseUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
}

const REQUIRED = ["KEYCLOAK_BASE_URL", "KEYCLOAK_REALM", "KEYCLOAK_CLIENT_ID", "KEYCLOAK_CLIENT_SECRET"] as const;

export function keycloakConfig(env: Env = process.env): KeycloakConfig {
  const missing = REQUIRED.filter((k) => !env[k]?.trim());
  if (missing.length) throw new Error(`Keycloak login needs ${missing.join(", ")}`);
  const baseUrl = httpUrl("KEYCLOAK_BASE_URL", env.KEYCLOAK_BASE_URL!);
  const internal = env.KEYCLOAK_INTERNAL_BASE_URL?.trim();
  const realm = env.KEYCLOAK_REALM!.trim();
  return {
    baseUrl,
    internalBaseUrl: internal ? httpUrl("KEYCLOAK_INTERNAL_BASE_URL", internal) : baseUrl,
    realm,
    clientId: env.KEYCLOAK_CLIENT_ID!.trim(),
    clientSecret: env.KEYCLOAK_CLIENT_SECRET!.trim(),
    issuer: `${baseUrl}/realms/${realm}`,
  };
}

// No trailing slash, so paths can be appended. originOnly drops any path.
function httpUrl(name: string, raw: string, originOnly = false): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`${name} is not a valid URL: "${raw}"`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`${name} must be an http(s) URL`);
  return originOnly ? url.origin : url.href.replace(/\/+$/, "");
}

export function assertAuthConfig(env: Env = process.env): void {
  appOrigin(env);
  keycloakConfig(env);
  // Checked here too, so a bad value stops the server instead of the first login.
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (at least 32 characters)");
}
