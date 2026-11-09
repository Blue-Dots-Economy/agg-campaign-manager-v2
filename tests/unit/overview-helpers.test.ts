import { describe, expect, test } from "bun:test";
import {
  isNotDialled,
  previousRate,
  previousValue,
  safeDiv,
  series,
  splitOutcomes,
} from "../../src/components/metrics/overview-helpers";

describe("number helpers", () => {
  test("safeDiv returns 0 for a non-positive divisor", () => {
    expect(safeDiv(1, 4)).toBe(0.25);
    expect(safeDiv(1, 0)).toBe(0);
    expect(safeDiv(1, -2)).toBe(0);
  });

  test("series drops non-finite values", () => {
    expect(series([{ a: 1 }, { a: Number.NaN }, { a: 3 }], (p) => p.a)).toEqual([1, 3]);
    expect(series(undefined, () => 1)).toEqual([]);
  });

  test("previousValue reads finite numbers only", () => {
    const prev = { a: 2, b: Number.POSITIVE_INFINITY, c: "x" };
    expect(previousValue(prev, "a")).toBe(2);
    expect(previousValue(prev, "b")).toBeNull();
    expect(previousValue(prev, "c")).toBeNull();
    expect(previousValue<{ a: number }>(undefined, "a")).toBeNull();
  });
});

describe("call outcomes", () => {
  test("isNotDialled matches pending and not dialled", () => {
    expect(isNotDialled(" Pending ")).toBe(true);
    expect(isNotDialled("Not dialled - DND")).toBe(true);
    expect(isNotDialled("Completed")).toBe(false);
  });

  test("splitOutcomes sorts by count and separates not dialled rows", () => {
    expect(
      splitOutcomes([
        { outcome: "No Answer", n: 3 },
        { outcome: "Pending", n: 5 },
        { outcome: "Completed", n: 7 },
      ]),
    ).toEqual({
      total: 15,
      dialled: [
        { outcome: "Completed", n: 7 },
        { outcome: "No Answer", n: 3 },
      ],
      skipped: [{ outcome: "Pending", n: 5 }],
    });
    expect(splitOutcomes([])).toEqual({ total: 0, dialled: [], skipped: [] });
  });
});

describe("previousRate", () => {
  test("is the percentage when both values are reported and the base is positive", () => {
    expect(previousRate({ a: 1, b: 4 }, "a", "b")).toBe(25);
  });

  test("is null when a value is missing, the base is 0, or there is no previous period", () => {
    expect(previousRate<{ a?: number; b?: number }>({ b: 4 }, "a", "b")).toBeNull();
    expect(previousRate({ a: 1, b: 0 }, "a", "b")).toBeNull();
    expect(previousRate<{ a: number; b: number }>(undefined, "a", "b")).toBeNull();
  });
});
