import { describe, expect, test } from "bun:test";
import { actionAllowed, userState, type UserAction, type UserState } from "../../src/auth/user-state";

describe("user state", () => {
  test("follows active, role and rejected_at", () => {
    expect(userState({ active: true, role: "user", rejectedAt: null })).toBe("active");
    expect(userState({ active: false, role: null, rejectedAt: null })).toBe("pending");
    expect(userState({ active: false, role: null, rejectedAt: "2026-10-01T00:00:00Z" })).toBe("rejected");
    expect(userState({ active: false, role: "user", rejectedAt: null })).toBe("deactivated");
  });
});

describe("what an admin may do", () => {
  // The §3.4 table, row by row.
  const table: Record<UserAction, UserState[]> = {
    approve: ["pending", "rejected"],
    reject: ["pending", "rejected"],
    activate: ["deactivated"],
    deactivate: ["active"],
    edit: ["active", "deactivated"],
  };
  const states: UserState[] = ["active", "pending", "rejected", "deactivated"];

  for (const [action, allowed] of Object.entries(table) as [UserAction, UserState[]][]) {
    test(`${action} is allowed only on ${allowed.join(", ")}`, () => {
      for (const s of states) expect([s, actionAllowed(s, action)]).toEqual([s, allowed.includes(s)]);
    });
  }
});
