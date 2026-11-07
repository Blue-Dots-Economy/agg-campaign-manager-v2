import { describe, expect, test } from "bun:test";
import { isOneOf } from "../../src/lib/guards";

describe("isOneOf", () => {
  const VIEWS = ["balance", "table"] as const;

  test("accepts an allowed value", () => {
    expect(isOneOf(VIEWS, "table")).toBe(true);
  });

  test("rejects other values, including case variants and empty strings", () => {
    expect(isOneOf(VIEWS, "Table")).toBe(false);
    expect(isOneOf(VIEWS, "")).toBe(false);
  });

  test("rejects everything for an empty list", () => {
    expect(isOneOf([], "x")).toBe(false);
  });
});
