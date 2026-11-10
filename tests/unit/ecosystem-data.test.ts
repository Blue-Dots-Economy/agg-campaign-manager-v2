import { describe, expect, test } from "bun:test";
import {
  actionGap,
  demandSupplyGap,
  gapLevel,
  matchesGapLevel,
  providerGapRows,
  recommendedActions,
  seekerGapRows,
} from "../../src/lib/ecosystem-data";

describe("gap basics", () => {
  test("gaps never go below zero", () => {
    expect(actionGap(10, 4)).toBe(6);
    expect(actionGap(4, 10)).toBe(0);
    expect(demandSupplyGap(10, 3)).toBe(7);
    expect(demandSupplyGap(3, 10)).toBe(0);
  });

  test("gapLevel uses the gap share of the base", () => {
    expect(gapLevel(5, 10)).toBe("High");
    expect(gapLevel(2, 10)).toBe("Medium");
    expect(gapLevel(1, 10)).toBe("Low");
    expect(gapLevel(0, 10)).toBe("Low");
    expect(gapLevel(5, 0)).toBe("Low");
  });

  test("recommendedActions by kind and levels", () => {
    expect(recommendedActions("provider", "High", "Low")).toEqual(["Trigger action gap call"]);
    expect(recommendedActions("provider", "High", "High")).toEqual([
      "Look for more providers",
      "Increase capacity with providers",
    ]);
    expect(recommendedActions("seeker", "Low", "Medium")).toEqual([
      "Direct campaign to add new seekers",
      "Add seekers via aggregators",
    ]);
    expect(recommendedActions("seeker", "Low", "Low")).toEqual([]);
  });
});

describe("gap rows", () => {
  test("providerGapRows uses capacity as supply and keeps the row fields", () => {
    const [row] = providerGapRows([
      { category: "Skilling", providers: 2, capacity: 4, matching: 10, connections: 2 },
    ]);
    expect(row).toEqual({
      category: "Skilling",
      providers: 2,
      capacity: 4,
      matching: 10,
      connections: 2,
      ag: 8,
      ds: 6,
      agL: "High",
      dsL: "High",
      actions: ["Look for more providers", "Increase capacity with providers"],
    });
  });

  test("seekerGapRows uses reach as supply", () => {
    const [row] = seekerGapRows([{ org: "A", reach: 9, matching: 10, connections: 8 }]);
    expect(row).toMatchObject({ ag: 2, ds: 1, agL: "Medium", dsL: "Low", actions: [] });
  });

  test("matchesGapLevel checks either level", () => {
    expect(matchesGapLevel({ agL: "High", dsL: "Low" }, "All")).toBe(true);
    expect(matchesGapLevel({ agL: "High", dsL: "Low" }, "Low")).toBe(true);
    expect(matchesGapLevel({ agL: "High", dsL: "Low" }, "Medium")).toBe(false);
  });
});
