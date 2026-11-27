import { describe, expect, test } from "bun:test";
import { AGENTS_UNAVAILABLE, emptyUsage } from "../../src/lib/concurrency.functions";

describe("emptyUsage", () => {
  test("reports the whole cap as available with the given reason", () => {
    expect(emptyUsage(20, AGENTS_UNAVAILABLE)).toEqual({
      cap: 20,
      used: 0,
      available: 20,
      batches: [],
      error: AGENTS_UNAVAILABLE,
    });
  });

  test("the database failure message holds no query details", () => {
    expect(AGENTS_UNAVAILABLE).not.toMatch(/select|params|program_agents/i);
  });
});
