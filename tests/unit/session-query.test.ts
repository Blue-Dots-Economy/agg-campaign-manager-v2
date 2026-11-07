import { describe, expect, test } from "bun:test";
import {
  SESSION_QUERY_KEY,
  isNotSessionQuery,
  loadSessionOrNull,
} from "../../src/auth/session-query";

describe("loadSessionOrNull", () => {
  test("returns the loaded session", async () => {
    const session = { email: "a@x.in", role: "admin" };
    expect(await loadSessionOrNull(async () => session)).toEqual(session);
  });

  test("returns null when the load fails", async () => {
    expect(
      await loadSessionOrNull(async () => {
        throw new Error("401");
      }),
    ).toBeNull();
  });
});

describe("isNotSessionQuery", () => {
  test("keeps the session query and selects every other one", () => {
    expect(isNotSessionQuery({ queryKey: SESSION_QUERY_KEY })).toBe(false);
    expect(isNotSessionQuery({ queryKey: ["program-aggregates", "seekers"] })).toBe(true);
    expect(isNotSessionQuery({ queryKey: [] })).toBe(true);
  });
});
