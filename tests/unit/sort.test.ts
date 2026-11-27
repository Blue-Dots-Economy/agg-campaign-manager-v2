import { describe, expect, test } from "bun:test";
import { compareCodeUnits } from "../../src/lib/sort";

describe("compareCodeUnits", () => {
  test("sorts like Array.prototype.sort does by default", () => {
    const values = ["b", "B", "a", "_x", "10", "9", "é", "2026-11-01", "2026-10-25", ""];
    expect([...values].sort(compareCodeUnits)).toEqual([...values].sort());
  });

  test("returns 0 for equal strings", () => {
    expect(compareCodeUnits("same", "same")).toBe(0);
  });
});
