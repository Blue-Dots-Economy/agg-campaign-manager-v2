import { describe, expect, test } from "bun:test";
import {
  dropBreakdown,
  dropValue,
  regionsFromRows,
  type DropRow,
} from "../../src/components/metrics/drop-rows";

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

describe("dropBreakdown", () => {
  const rows: DropRow[] = [
    { stage: "Greeting", reason: "early_hangup", byRegion: { KA: 3, UP: 1 }, total: 4 },
    { stage: "Pitch", reason: "early_hangup", byRegion: { KA: 2 }, total: 2 },
    { stage: "Pitch", reason: "declined", byRegion: { UP: 9 }, total: 9 },
    { stage: "Apply", reason: "empty", byRegion: {}, total: 0 },
  ];

  test("sums reasons across regions, largest first, without a stage breakdown", () => {
    const r = dropBreakdown(rows, undefined, null);
    expect(r.grandTotal).toBe(15);
    expect(r.reasonTotals).toEqual([
      { key: "declined", byRegion: { UP: 9 }, total: 9 },
      { key: "early_hangup", byRegion: { KA: 5, UP: 1 }, total: 6 },
    ]);
    expect(r.stageBreakdown).toEqual([]);
  });

  test("counts only the selected region and skips rows with nothing there", () => {
    const r = dropBreakdown(rows, "KA", undefined);
    expect(r.grandTotal).toBe(5);
    expect(r.reasonTotals).toEqual([{ key: "early_hangup", byRegion: { KA: 5, UP: 1 }, total: 6 }]);
  });

  test("breaks the selected reason down by stage in row order", () => {
    const r = dropBreakdown(rows, "UP", "early_hangup");
    expect(r.stageBreakdown).toEqual([
      { key: "Greeting", byRegion: { KA: 3, UP: 1 }, total: 4 },
      { key: "Pitch", byRegion: { KA: 2 }, total: 2 },
    ]);
  });

  test("returns zeros for no rows", () => {
    expect(dropBreakdown([], undefined, "x")).toEqual({
      reasonTotals: [],
      grandTotal: 0,
      stageBreakdown: [],
    });
  });
});

describe("dropValue", () => {
  test("uses the region count or the total", () => {
    const r = { byRegion: { KA: 2 }, total: 7 };
    expect(dropValue(r)).toBe(7);
    expect(dropValue(r, "KA")).toBe(2);
    expect(dropValue(r, "UP")).toBe(0);
  });
});
