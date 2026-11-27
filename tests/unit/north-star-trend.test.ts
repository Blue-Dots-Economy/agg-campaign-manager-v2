import { describe, expect, test } from "bun:test";
import { campaignRuns, pooledRate } from "../../src/components/metrics/north-star-trend";

describe("campaignRuns", () => {
  test("merges points of the same date, type and language and sorts by date", () => {
    const runs = campaignRuns([
      {
        date: "2026-02-02",
        type: "outbound",
        language: "hi",
        answered: 10,
        high_intent: 4,
        converted: 2,
      },
      { date: "2026-01-01", answered: 5, high_intent: 0, converted: 0 },
      {
        date: "2026-02-02",
        type: "outbound",
        language: "hi",
        answered: 10,
        high_intent: 1,
        converted: 1,
      },
    ]);
    expect(runs).toEqual([
      {
        label: "2026-01-01",
        answered: 5,
        high_intent: 0,
        converted: 0,
        pickup_to_app: 0,
        highintent_to_app: 0,
        pickup_to_highintent: 0,
      },
      {
        label: "2026-02-02 outbound · hi",
        answered: 20,
        high_intent: 5,
        converted: 3,
        pickup_to_app: 15,
        highintent_to_app: 60,
        pickup_to_highintent: 25,
      },
    ]);
  });

  test("falls back to day, then label, then a dash", () => {
    const base = { answered: 0, high_intent: 0, converted: 0 };
    expect(campaignRuns([{ ...base, day: "Day 3" }])[0]?.label).toBe("Day 3");
    expect(campaignRuns([{ ...base, label: "L" }])[0]?.label).toBe("L");
    expect(campaignRuns([base])[0]?.label).toBe("—");
  });

  test("returns no runs for no points", () => {
    expect(campaignRuns([])).toEqual([]);
  });
});

describe("pooledRate", () => {
  const runs = campaignRuns([
    { date: "a", answered: 10, high_intent: 5, converted: 1 },
    { date: "b", answered: 0, high_intent: 0, converted: 0 },
    { date: "c", answered: 30, high_intent: 5, converted: 3 },
  ]);

  test("pools numerators and denominators per rate", () => {
    expect(pooledRate(runs, "pickup_to_app")).toEqual({
      rate: 10,
      num: 4,
      den: 40,
      runs: 3,
      parts: ["a: 1/10", "b: 0/0", "c: 3/30"],
    });
    expect(pooledRate(runs, "highintent_to_app").rate).toBe(40);
    expect(pooledRate(runs, "pickup_to_highintent")).toMatchObject({ rate: 25, num: 10, den: 40 });
  });

  test("is zero with no denominator", () => {
    expect(pooledRate([], "pickup_to_app")).toEqual({
      rate: 0,
      num: 0,
      den: 0,
      runs: 0,
      parts: [],
    });
  });
});
