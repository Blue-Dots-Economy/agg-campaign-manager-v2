import { describe, expect, test } from "bun:test";
import { planAdminCommand, planChangesAnything, type ExistingUser, type KeycloakAccount } from "../../src/server/admin/plan";

const none = { promote: false, relink: false, verifyEmail: false };
const kc = (over: Partial<KeycloakAccount> = {}): KeycloakAccount => ({ id: "kc-1", emailVerified: true, enabled: true, ...over });
const user = (over: Partial<ExistingUser> = {}): ExistingUser => ({
  role: "user", active: true, rejectedAt: null, keycloakSub: null, ...over,
});

describe("admin command plan", () => {
  test("new setup: creates the Keycloak account and the admin", () => {
    const p = planAdminCommand(null, null, false, none);
    expect(p).toMatchObject({ error: null, createKeycloak: true, createAdmin: true, linkTo: null });
  });

  test("reuses a verified, enabled Keycloak account", () => {
    const p = planAdminCommand(null, kc(), false, none);
    expect(p).toMatchObject({ error: null, createKeycloak: false, linkTo: "kc-1", createAdmin: true, verifyEmail: false });
  });

  test("stops on an unverified account unless --verify-email", () => {
    const stopped = planAdminCommand(null, kc({ emailVerified: false }), false, none);
    expect(stopped).toMatchObject({ reason: "unverified" });
    expect(stopped.error).toMatch(/not verified.*--verify-email/);
    const p = planAdminCommand(null, kc({ emailVerified: false }), false, { ...none, verifyEmail: true });
    expect(p).toMatchObject({ error: null, verifyEmail: true, linkTo: "kc-1", createAdmin: true });
  });

  test("refuses a disabled account, even with --verify-email", () => {
    const p = planAdminCommand(null, kc({ enabled: false }), false, { ...none, verifyEmail: true });
    expect(p).toMatchObject({ reason: "disabled" });
    expect(p.error).toMatch(/disabled/);
  });

  test("refuses an account linked to another user", () => {
    expect(planAdminCommand(null, kc(), true, none)).toMatchObject({ reason: "linked-elsewhere", error: expect.stringMatching(/linked to another user/) });
  });

  test("an existing user needs --promote", () => {
    const p = planAdminCommand(user(), kc(), false, none);
    expect(planChangesAnything(p)).toBe(false);
    expect(p.notes.join(" ")).toMatch(/--promote/);
  });

  test("--promote on a pending user without a link also links Keycloak", () => {
    const p = planAdminCommand(user({ role: null, active: false }), kc(), false, { ...none, promote: true });
    expect(p).toMatchObject({ error: null, promote: true, linkTo: "kc-1" });
  });

  test("--promote on a linked user doesn't touch Keycloak", () => {
    const p = planAdminCommand(user({ keycloakSub: "kc-1", active: false }), kc({ emailVerified: false }), false, { ...none, promote: true });
    expect(p).toMatchObject({ error: null, promote: true, linkTo: null, verifyEmail: false });
  });

  test("--relink clears a link, and can't be combined with --verify-email", () => {
    expect(planAdminCommand(user({ keycloakSub: "kc-1" }), kc(), false, { ...none, relink: true })).toMatchObject({ relink: true });
    expect(planAdminCommand(user({ keycloakSub: "kc-1" }), kc(), false, { ...none, relink: true, verifyEmail: true }).error).toMatch(
      /--relink/,
    );
  });

  test("an active admin is left as is", () => {
    const p = planAdminCommand(user({ role: "admin", keycloakSub: "kc-1" }), kc(), false, { ...none, promote: true });
    expect(planChangesAnything(p)).toBe(false);
  });
});
