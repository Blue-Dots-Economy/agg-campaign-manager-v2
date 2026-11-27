import { describe, expect, test } from "bun:test";
import { intFromEnv } from "../../src/server/http/env-number.server";

describe("intFromEnv", () => {
  test("uses the default when the variable is unset or blank", () => {
    expect(intFromEnv({}, "X_MS", 500, 1)).toBe(500);
    expect(intFromEnv({ X_MS: "  " }, "X_MS", 500, 1)).toBe(500);
  });
  test("reads a whole number", () => {
    expect(intFromEnv({ X_MS: " 2500 " }, "X_MS", 500, 1)).toBe(2500);
    expect(intFromEnv({ X_RETRIES: "0" }, "X_RETRIES", 3, 0)).toBe(0);
  });
  test("refuses text, fractions and values below the minimum", () => {
    expect(() => intFromEnv({ X_MS: "abc" }, "X_MS", 500, 1)).toThrow(
      "X_MS must be a whole number of at least 1",
    );
    expect(() => intFromEnv({ X_MS: "1.5" }, "X_MS", 500, 1)).toThrow("X_MS");
    expect(() => intFromEnv({ X_MS: "0" }, "X_MS", 500, 1)).toThrow("X_MS");
  });
});
