// Which authentication flow this setup uses, chosen once per setup.

export const AUTH_PROVIDERS = ["none", "keycloak"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

type Env = Record<string, string | undefined>;

export function authProvider(env: Env = process.env): AuthProvider {
  const raw = env.AUTH_PROVIDER?.trim().toLowerCase() ?? "";
  if (raw === "") return "none";
  if ((AUTH_PROVIDERS as readonly string[]).includes(raw)) return raw as AuthProvider;
  throw new Error(`AUTH_PROVIDER must be "none" or "keycloak", got "${env.AUTH_PROVIDER}"`);
}

// The app's own origin. Checked when used, not at startup, so the image still
// boots without settings (the CI smoke test relies on that).
export function appOrigin(env: Env = process.env): string {
  const raw = env.APP_BASE_URL?.trim();
  if (!raw) throw new Error("APP_BASE_URL is not set");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`APP_BASE_URL is not a valid URL: "${raw}"`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`APP_BASE_URL must be an http(s) URL: "${raw}"`);
  }
  return url.origin;
}

// Run once at server start, so a wrong setting stops the app instead of
// surfacing at someone's first login.
export function assertAuthConfig(env: Env = process.env): void {
  authProvider(env);
  if (env.APP_BASE_URL?.trim()) appOrigin(env);
}
