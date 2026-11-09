import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  SESSION_QUERY_KEY,
  invalidateAllButSession,
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

describe("invalidateAllButSession", () => {
  test("marks every query stale except the session", async () => {
    const qc = new QueryClient();
    qc.setQueryData(SESSION_QUERY_KEY, { email: "a@x.in" });
    qc.setQueryData(["program-aggregates", "seekers"], { rows: 1 });

    await invalidateAllButSession(qc);

    expect(qc.getQueryState(SESSION_QUERY_KEY)?.isInvalidated).toBe(false);
    expect(qc.getQueryState(["program-aggregates", "seekers"])?.isInvalidated).toBe(true);
    expect(qc.getQueryData(SESSION_QUERY_KEY)).toEqual({ email: "a@x.in" });
  });
});
