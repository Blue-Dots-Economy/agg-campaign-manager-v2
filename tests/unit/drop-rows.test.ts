import { describe, expect, test } from "bun:test";
import { regionsFromRows, type DropRow } from "../../src/components/metrics/drop-rows";

const row = (byRegion: Record<string, number>): DropRow => ({
  stage: "s",
  reason: "r",
  byRegion,
  total: 0,
});

describe("regionsFromRows", () => {
  test("lists every region in the rows once, sorted", () => {
    expect(regionsFromRows([row({ KA: 1, UP: 2 }), row({ GZB: 3, KA: 4 })])).toEqual([
      "GZB",
      "KA",
      "UP",
    ]);
  });

  test("returns only the selected region when one is given", () => {
    expect(regionsFromRows([row({ KA: 1 })], "UP")).toEqual(["UP"]);
  });

  test("returns no regions for no rows", () => {
    expect(regionsFromRows([])).toEqual([]);
  });
});
