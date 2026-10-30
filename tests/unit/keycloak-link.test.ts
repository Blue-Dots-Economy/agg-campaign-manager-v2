import { describe, expect, test } from "bun:test";
import { decideLink, type LinkCandidate } from "../../src/server/auth/keycloak-link";

const id = { sub: "sub-1", email: "priya@example.org" };
const user = (over: Partial<LinkCandidate> = {}): LinkCandidate => ({
  id: "u-1",
  email: "priya@example.org",
  keycloakSub: null,
  active: true,
  role: "coordinator",
  rejectedAt: null,
  ...over,
});

describe("linking a Keycloak identity", () => {
  test("first login: an unlinked user with the verified email gets linked and logs in", () => {
    expect(decideLink(null, user(), id)).toEqual({ kind: "login", userId: "u-1", set: { keycloakSub: "sub-1" } });
  });

  test("later logins match by the Keycloak id", () => {
    const linked = user({ keycloakSub: "sub-1" });
    expect(decideLink(linked, linked, id)).toEqual({ kind: "login", userId: "u-1", set: {} });
  });

  test("an email changed in Keycloak is followed", () => {
    const linked = user({ keycloakSub: "sub-1", email: "old@example.org" });
    expect(decideLink(linked, null, id)).toEqual({ kind: "login", userId: "u-1", set: { email: "priya@example.org" } });
  });

  test("an email changed to one another user has is a conflict", () => {
    const linked = user({ keycloakSub: "sub-1", email: "old@example.org" });
    const other = user({ id: "u-2" });
    expect(decideLink(linked, other, id)).toMatchObject({ kind: "refused", reason: "conflict" });
  });

  test("an email linked to a different Keycloak account is a conflict", () => {
    expect(decideLink(null, user({ keycloakSub: "sub-OLD" }), id)).toMatchObject({ kind: "refused", reason: "conflict" });
  });

  test("an unknown person becomes a pending user", () => {
    expect(decideLink(null, null, id)).toEqual({ kind: "create-pending" });
  });

  test("pending users stay pending, and get linked on the way", () => {
    expect(decideLink(null, user({ active: false, role: null }), id)).toEqual({
      kind: "refused",
      reason: "pending",
      userId: "u-1",
      set: { keycloakSub: "sub-1" },
    });
  });

  test("rejected and deactivated users are refused", () => {
    const rejected = user({ keycloakSub: "sub-1", active: false, role: null, rejectedAt: "2026-10-01T00:00:00Z" });
    expect(decideLink(rejected, rejected, id)).toMatchObject({ kind: "refused", reason: "denied" });
    const deactivated = user({ keycloakSub: "sub-1", active: false });
    expect(decideLink(deactivated, deactivated, id)).toMatchObject({ kind: "refused", reason: "denied" });
  });

  test("an admin is never linked by email", () => {
    const admin = user({ role: "admin" });
    expect(decideLink(null, admin, id)).toEqual({ kind: "refused", reason: "admin-unlinked", userId: "u-1" });
    // Once linked by Keycloak id (bootstrap or Set up login), they log in as usual.
    const linked = user({ role: "admin", keycloakSub: "sub-1" });
    expect(decideLink(linked, linked, id)).toEqual({ kind: "login", userId: "u-1", set: {} });
    // A deactivated admin is still told they have no access.
    expect(decideLink(null, user({ role: "admin", active: false }), id)).toMatchObject({ reason: "denied" });
  });

  test("a refused user's email is not changed", () => {
    const deactivated = user({ keycloakSub: "sub-1", active: false, email: "old@example.org" });
    expect(decideLink(deactivated, null, id)).toEqual({ kind: "refused", reason: "denied", userId: "u-1" });
  });
});
