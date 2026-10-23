import { describe, expect, test } from "bun:test";
import { planAdminCommand, planChangesAnything, type ExistingUser } from "../../src/server/admin/plan";

const none = { setPassword: false, relink: false, promote: false };
const user = (over: Partial<ExistingUser> = {}): ExistingUser => ({
  role: "user",
  active: true,
  rejectedAt: null,
  keycloakSub: null,
  ...over,
});

describe("admin command plan", () => {
  test("a new email becomes an active admin", () => {
    const p = planAdminCommand(null, none);
    expect(p.create).toBe(true);
    expect(p.makeAdmin).toBe(true);
    expect(p.setPassword).toBe(false);
  });

  test("a new admin with --set-password gets a temporary password", () => {
    expect(planAdminCommand(null, { ...none, setPassword: true }).setPassword).toBe(true);
  });

  test("an existing non-admin keeps their role without --promote", () => {
    const p = planAdminCommand(user(), none);
    expect(p.makeAdmin).toBe(false);
    expect(planChangesAnything(p)).toBe(false);
  });

  test("--promote makes an existing non-admin, pending or rejected user an active admin", () => {
    for (const u of [user(), user({ role: null, active: false }), user({ role: null, active: false, rejectedAt: "2026-10-01" })]) {
      expect(planAdminCommand(u, { ...none, promote: true }).makeAdmin).toBe(true);
    }
  });

  test("an active admin is left as is", () => {
    const p = planAdminCommand(user({ role: "admin" }), { ...none, promote: true });
    expect(p.makeAdmin).toBe(false);
  });

  test("--set-password works on any existing user, without changing the role", () => {
    const p = planAdminCommand(user({ role: "coordinator" }), { ...none, setPassword: true });
    expect(p.setPassword).toBe(true);
    expect(p.makeAdmin).toBe(false);
  });

  test("--relink clears an existing link and does nothing for an unlinked user", () => {
    expect(planAdminCommand(user({ role: "admin", keycloakSub: "abc" }), { ...none, relink: true }).relink).toBe(true);
    expect(planAdminCommand(user({ role: "admin" }), { ...none, relink: true }).relink).toBe(false);
  });

  test("--relink is ignored for a new user", () => {
    expect(planAdminCommand(null, { ...none, relink: true }).relink).toBe(false);
  });
});
