// Looks up and creates users in the realm, as the campaign-manager client's
// service account (realm-management: view-users, manage-users). It never edits,
// disables or deletes a Keycloak user, except markEmailVerified, which only the
// server admin command calls (--verify-email).
import type { KeycloakConfig } from "./config.server";

export interface KeycloakUser {
  id: string;
  username: string;
  email: string | null;
  emailVerified: boolean;
  enabled: boolean;
  createdTimestamp: number | null;
  phoneNumber: string | null;
}

export type AccountRefusal = "unverified" | "disabled" | "username-taken" | "linked-elsewhere";

export const ACCOUNT_MESSAGES: Record<AccountRefusal, string> = {
  unverified:
    "A Keycloak account with this email exists but its email is not verified. It can't be added until it is verified in Keycloak.",
  disabled: "This Keycloak account is disabled.",
  "username-taken": "Another Keycloak account already uses this email as its username. Sort it out in Keycloak first.",
  "linked-elsewhere": "This Keycloak account is already linked to another user.",
};

// A refused Keycloak call. `denied` marks refusals of Campaign Manager's own
// access (its service account can't sign in, or lacks a role), as opposed to
// Keycloak being down or failing.
export class KeycloakHttpError extends Error {
  constructor(
    what: string,
    readonly status: number,
    readonly denied = status === 401 || status === 403,
  ) {
    super(`${what}: HTTP ${status}`);
  }
}

// Reuse a verified, enabled account; create one if there is none.
export function decideAccount(existing: KeycloakUser | null): { kind: "reuse" } | { kind: "create" } | { kind: "refuse"; reason: AccountRefusal } {
  if (!existing) return { kind: "create" };
  if (!existing.enabled) return { kind: "refuse", reason: "disabled" };
  if (!existing.emailVerified) return { kind: "refuse", reason: "unverified" };
  return { kind: "reuse" };
}

export class KeycloakAdmin {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly c: KeycloakConfig,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private adminUrl(path: string): string {
    return `${this.c.internalBaseUrl}/admin/realms/${encodeURIComponent(this.c.realm)}${path}`;
  }

  // Client credentials token, kept until 30 seconds before it expires.
  private async accessToken(fresh = false): Promise<string> {
    if (!fresh && this.token && this.now() < this.token.expiresAt) return this.token.value;
    const res = await this.fetchFn(
      `${this.c.internalBaseUrl}/realms/${encodeURIComponent(this.c.realm)}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: this.c.clientId, client_secret: this.c.clientSecret }),
      },
    );
    // 401 is a wrong client secret, 400 a client without a service account.
    if (!res.ok) throw new KeycloakHttpError("Keycloak service account login failed", res.status, true);
    const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string") throw new Error("Keycloak returned no service account token");
    const ttl = typeof body.expires_in === "number" ? body.expires_in : 60;
    this.token = { value: body.access_token, expiresAt: this.now() + Math.max(ttl - 30, 0) * 1000 };
    return this.token.value;
  }

  // One retry with a fresh token if Keycloak refuses the cached one.
  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const send = async (fresh: boolean) =>
      this.fetchFn(this.adminUrl(path), {
        ...init,
        headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${await this.accessToken(fresh)}` },
      });
    const res = await send(false);
    return res.status === 401 ? send(true) : res;
  }

  // Exact match: a plain search would also match similar emails.
  async findByEmail(email: string): Promise<KeycloakUser | null> {
    const res = await this.call(`/users?${new URLSearchParams({ email, exact: "true" })}`);
    if (!res.ok) throw new KeycloakHttpError("Keycloak user lookup failed", res.status);
    const list = (await res.json()) as Record<string, unknown>[];
    const match = list.find((u) => typeof u.email === "string" && u.email.toLowerCase() === email.toLowerCase());
    return match ? toUser(match) : null;
  }

  // Created with the email verified (an admin vouches for it) and enabled. Returns
  // the new id, or "exists" if Keycloak says the username or email is taken.
  async create(email: string, name: string | null): Promise<{ id: string } | "exists"> {
    const res = await this.call("/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: email, email, emailVerified: true, enabled: true, ...(name ? { firstName: name } : {}) }),
    });
    if (res.status === 409) return "exists";
    if (res.status !== 201) throw new KeycloakHttpError("Keycloak user create failed", res.status);
    const id = res.headers.get("location")?.split("/").pop();
    if (!id) throw new Error("Keycloak did not return the new user's id");
    return { id };
  }

  // Server admin command only (--verify-email). Sends the full user back so no
  // other field changes.
  async markEmailVerified(id: string): Promise<void> {
    const get = await this.call(`/users/${encodeURIComponent(id)}`);
    if (!get.ok) throw new KeycloakHttpError("Keycloak user read failed", get.status);
    const user = (await get.json()) as Record<string, unknown>;
    const put = await this.call(`/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...user, emailVerified: true }),
    });
    if (!put.ok) throw new KeycloakHttpError("Keycloak user update failed", put.status);
  }

  // Finds or creates the account for an email, following §3.5's rules.
  async ensureAccount(email: string, name: string | null): Promise<{ kind: "ok"; id: string; created: boolean } | { kind: "refused"; reason: AccountRefusal }> {
    let existing = await this.findByEmail(email);
    let decision = decideAccount(existing);
    if (decision.kind === "create") {
      const made = await this.create(email, name);
      if (made !== "exists") return { kind: "ok", id: made.id, created: true };
      // Created a moment ago by someone else, or the username is taken by an
      // account with another email.
      existing = await this.findByEmail(email);
      if (!existing) return { kind: "refused", reason: "username-taken" };
      decision = decideAccount(existing);
    }
    if (decision.kind === "refuse") return { kind: "refused", reason: decision.reason };
    return { kind: "ok", id: existing!.id, created: false };
  }
}

function toUser(u: Record<string, unknown>): KeycloakUser {
  const attrs = (u.attributes ?? {}) as Record<string, unknown>;
  const phone = Array.isArray(attrs.phoneNumber) ? attrs.phoneNumber[0] : null;
  return {
    id: String(u.id),
    username: String(u.username ?? ""),
    email: typeof u.email === "string" ? u.email : null,
    emailVerified: u.emailVerified === true,
    enabled: u.enabled === true,
    createdTimestamp: typeof u.createdTimestamp === "number" ? u.createdTimestamp : null,
    phoneNumber: typeof phone === "string" ? phone : null,
  };
}

let shared: KeycloakAdmin | null = null;
export async function keycloakAdmin(): Promise<KeycloakAdmin> {
  if (!shared) {
    const { keycloakConfig } = await import("./config.server");
    shared = new KeycloakAdmin(keycloakConfig());
  }
  return shared;
}
