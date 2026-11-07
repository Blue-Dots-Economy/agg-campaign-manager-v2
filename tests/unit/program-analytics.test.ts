import { describe, expect, test } from "bun:test";
import type { CampaignRollup } from "../../src/lib/snapshot.functions";
import type { OverviewFilterValue } from "../../src/components/metrics/OverviewFilters";
import {
  intentBuckets,
  previousPeriodFilters,
  rollupPerDay,
} from "../../src/components/metrics/program-analytics";

const filters = (dateFrom: string | null, dateTo: string | null): OverviewFilterValue => ({
  state: "KA",
  dateFrom,
  dateTo,
  campaignType: "all",
  channel: "outbound",
});

describe("previousPeriodFilters", () => {
  test("returns the same-length period ending the day before", () => {
    expect(previousPeriodFilters(filters("2026-03-08", "2026-03-14"))).toEqual({
      state: "KA",
      dateFrom: "2026-03-01",
      dateTo: "2026-03-07",
      campaignType: "all",
      channel: "outbound",
    });
  });

  test("uses one day for a single-day range and crosses month ends", () => {
    expect(previousPeriodFilters(filters("2026-03-01", "2026-03-01"))).toMatchObject({
      dateFrom: "2026-02-28",
      dateTo: "2026-02-28",
    });
  });

  test("treats a reversed range as one day", () => {
    expect(previousPeriodFilters(filters("2026-03-10", "2026-03-01"))).toMatchObject({
      dateFrom: "2026-03-09",
      dateTo: "2026-03-09",
    });
  });

  test("returns null without a full range", () => {
    expect(previousPeriodFilters(filters(null, "2026-03-01"))).toBeNull();
    expect(previousPeriodFilters(filters("2026-03-01", null))).toBeNull();
  });
});

describe("rollupPerDay", () => {
  const rollup = (o: Partial<CampaignRollup>): CampaignRollup => ({
    day: "Day 1",
    date: "",
    type: "t",
    language: "hi",
    rows: 1,
    answered: 1,
    engaged: 1,
    converted: 1,
    new_jobs: 1,
    answered_pct: 100,
    high_intent: 1,
    ...o,
  });

  test("sums runs on the same date and sorts by date", () => {
    const out = rollupPerDay([
      rollup({ date: "2026-01-02", rows: 5 }),
      rollup({ date: "2026-01-01" }),
      rollup({ date: "2026-01-02", rows: 2, type: "other" }),
    ]);
    expect(out.map((d) => [d.label, d.rows, d.answered])).toEqual([
      ["2026-01-01", 1, 1],
      ["2026-01-02", 7, 2],
    ]);
  });

  test("falls back to the day label without a date", () => {
    const out = rollupPerDay([rollup({ day: "Day 2" }), rollup({ day: "Day 2" })]);
    expect(out).toEqual([
      {
        day: "Day 2",
        date: "",
        label: "Day 2",
        rows: 2,
        answered: 2,
        engaged: 2,
        converted: 2,
        new_jobs: 2,
        high_intent: 2,
      },
    ]);
  });

  test("returns nothing for no runs", () => {
    expect(rollupPerDay([])).toEqual([]);
  });
});

describe("intentBuckets", () => {
  test("puts scores into low, medium and high bands", () => {
    expect(
      intentBuckets([
        { score: "1", count: 2 },
        { score: "4", count: 3 },
        { score: 5, count: 4 },
        { score: "7", count: 1 },
        { score: "8", count: 6 },
        { score: "10", count: 1 },
      ]),
    ).toEqual([
      { range: "Low (1–4)", count: 5 },
      { range: "Medium (5–7)", count: 5 },
      { range: "High (8–10)", count: 7 },
    ]);
  });

  test("ignores zero, negative, out-of-range and non-numeric scores", () => {
    const out = intentBuckets([
      { score: "0", count: 9 },
      { score: "-1", count: 9 },
      { score: "11", count: 9 },
      { score: "n/a", count: 9 },
    ]);
    expect(out.every((b) => b.count === 0)).toBe(true);
  });
});
