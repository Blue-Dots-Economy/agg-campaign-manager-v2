import { describe, expect, test } from "bun:test";
import { isOneOf } from "../../src/lib/guards";
import { isProgramId } from "../../src/programs/registry";

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

describe("isProgramId", () => {
  test("accepts the known programs only", () => {
    expect(isProgramId("seekers")).toBe(true);
    expect(isProgramId("providers")).toBe(true);
    expect(isProgramId("Seekers")).toBe(false);
    expect(isProgramId("")).toBe(false);
  });
});
