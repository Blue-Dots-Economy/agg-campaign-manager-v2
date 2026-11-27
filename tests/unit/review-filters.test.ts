import { describe, expect, test } from "bun:test";
import type { JobReviewStatus, ReviewCall } from "../../src/lib/review-ui";
import {
  DEFAULT_FILTERS,
  bulkReviewQueue,
  dayNum,
  distinct,
  durationBucket,
  filterReviewCalls,
  initialFilters,
  parseIst,
  reviewFilterOptions,
  reviewableCalls,
  searchTokens,
  type ReviewFilters,
} from "../../src/lib/review-filters";

const call = (o: ReviewCall): ReviewCall => ({
  call_outcome: "Completed",
  campaign_day: "Day 1",
  call_duration_seconds: "60",
  ...o,
});

const filters = (o: Partial<ReviewFilters> = {}): ReviewFilters => ({
  ...DEFAULT_FILTERS,
  tab: "all",
  ...o,
});

describe("parseIst", () => {
  test("reads IST call times with or without the suffix", () => {
    const t = Date.parse("2026-01-05T10:00:00+05:30");
    expect(parseIst("2026-01-05 10:00:00 IST")).toBe(t);
    expect(parseIst("2026-01-05 10:00:00ist")).toBe(t);
    expect(parseIst(" 2026-01-05T10:00:00 IST  ")).toBe(t);
    expect(parseIst("2026-01-05 10:00:00")).toBe(t);
  });

  test("returns 0 for empty or unreadable values", () => {
    expect(parseIst("")).toBe(0);
    expect(parseIst(undefined)).toBe(0);
    expect(parseIst("garbage")).toBe(0);
    expect(parseIst("IST")).toBe(0);
  });

  test("handles long runs of spaces quickly", () => {
    const start = performance.now();
    expect(parseIst(`${" ".repeat(50_000)}x`)).toBe(0);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe("dayNum", () => {
  test("reads the trailing number", () => {
    expect(dayNum("Day 12")).toBe(12);
    expect(dayNum("Day 12  ")).toBe(12);
    expect(dayNum("Day 007")).toBe(7);
    expect(dayNum("x 3 4")).toBe(4);
  });

  test("returns 0 without a trailing number", () => {
    expect(dayNum("Day")).toBe(0);
    expect(dayNum("Day 1a")).toBe(0);
    expect(dayNum("")).toBe(0);
    expect(dayNum(undefined)).toBe(0);
  });
});

describe("small helpers", () => {
  test("distinct keeps first-seen non-blank values", () => {
    expect(distinct(["b", "a", "b", " ", "", undefined, "a"])).toEqual(["b", "a"]);
  });

  test("durationBucket", () => {
    expect(durationBucket(29, "< 30s")).toBe(true);
    expect(durationBucket(30, "< 30s")).toBe(false);
    expect(durationBucket(30, "30s – 1m")).toBe(true);
    expect(durationBucket(119, "1 – 2m")).toBe(true);
    expect(durationBucket(299, "2 – 5m")).toBe(true);
    expect(durationBucket(300, "> 5m")).toBe(true);
    expect(durationBucket(5, "All")).toBe(true);
    expect(durationBucket(5, "unknown")).toBe(true);
  });

  test("searchTokens splits on spaces, commas, semicolons and new lines", () => {
    expect(searchTokens(" A1, b2;c3\nD4\t ")).toEqual(["a1", "b2", "c3", "d4"]);
    expect(searchTokens("")).toEqual([]);
  });
});

describe("initialFilters", () => {
  test("uses the defaults without stored filters", () => {
    expect(initialFilters(null, null)).toEqual(DEFAULT_FILTERS);
  });

  test("applies stored filters over the defaults", () => {
    expect(initialFilters('{"day":"Day 2","tab":"reviewed"}', null)).toEqual({
      ...DEFAULT_FILTERS,
      day: "Day 2",
      tab: "reviewed",
    });
  });

  test("ignores unreadable or wrongly shaped stored filters", () => {
    expect(initialFilters("{bad", null)).toEqual(DEFAULT_FILTERS);
    expect(initialFilters('{"tab":"nope"}', null)).toEqual(DEFAULT_FILTERS);
  });

  test("prefilled ids become a search across every tab", () => {
    expect(initialFilters('{"day":"Day 2"}', "c1 c2")).toEqual({
      ...DEFAULT_FILTERS,
      day: "Day 2",
      search: "c1 c2",
      tab: "all",
    });
  });
});

describe("reviewFilterOptions and reviewableCalls", () => {
  const calls = [
    call({ campaign_day: "Day 2", language: "hi", call_outcome: "No Answer" }),
    call({ campaign_day: "Day 10", language: "en" }),
    call({ campaign_day: "Day 2", language: "hi", call_outcome: "Early Disconnect" }),
  ];

  test("lists distinct days latest first and other values sorted", () => {
    const o = reviewFilterOptions(calls);
    expect(o.days).toEqual(["Day 10", "Day 2"]);
    expect(o.langs).toEqual(["en", "hi"]);
    expect(o.cities).toEqual([]);
  });

  test("keeps completed calls and early disconnects", () => {
    expect(reviewableCalls(calls).map((c) => c.call_outcome)).toEqual([
      "Completed",
      "Early Disconnect",
    ]);
  });
});

describe("filterReviewCalls", () => {
  const status = (reviewed: string[]) =>
    new Map<string, JobReviewStatus>(
      reviewed.map((id) => [id, { unique_reviewers: 1, is_reviewed: true, you_reviewed: false }]),
    );

  const calls = [
    call({ call_id: "a", campaign_day: "Day 1", intent_score: "7", channel: "inbound" }),
    call({ call_id: "b", campaign_day: "Day 3", intent_score: "2", call_duration_seconds: "10" }),
    call({ call_id: "c", campaign_day: "Day 3", call_duration_seconds: "200" }),
  ];

  test("orders by day, then longest call", () => {
    expect(filterReviewCalls(calls, filters(), null, "seekers").map((c) => c.call_id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  test("filters by intent and leaves out calls without a score", () => {
    const ids = (f: Partial<ReviewFilters>) =>
      filterReviewCalls(calls, filters(f), null, "seekers").map((c) => c.call_id);
    expect(ids({ intent: "High Intent Score" })).toEqual(["a"]);
    expect(ids({ intent: "Low Intent Score" })).toEqual(["b"]);
  });

  test("filters by channel for seekers only, treating a blank channel as outbound", () => {
    const ids = (dataset: string) =>
      filterReviewCalls(calls, filters({ channel: "Outbound" }), null, dataset).map(
        (c) => c.call_id,
      );
    expect(ids("seekers")).toEqual(["c", "b"]);
    expect(ids("providers")).toEqual(["c", "b", "a"]);
  });

  test("review tabs need statuses; a search ignores the tab", () => {
    const ids = (f: Partial<ReviewFilters>, map: Map<string, JobReviewStatus> | null) =>
      filterReviewCalls(calls, filters(f), map, "seekers").map((c) => c.call_id);
    expect(ids({ tab: "pending" }, null)).toEqual([]);
    expect(ids({ tab: "pending" }, status(["b"]))).toEqual(["c", "a"]);
    expect(ids({ tab: "reviewed" }, status(["b"]))).toEqual(["b"]);
    expect(ids({ tab: "reviewed", search: "a, c" }, null)).toEqual(["c", "a"]);
  });

  test("filters by duration bucket and exact values", () => {
    const ids = (f: Partial<ReviewFilters>) =>
      filterReviewCalls(calls, filters(f), null, "seekers").map((c) => c.call_id);
    expect(ids({ duration: "< 30s" })).toEqual(["b"]);
    expect(ids({ day: "Day 1" })).toEqual(["a"]);
  });
});

describe("bulkReviewQueue", () => {
  test("lists unreviewed calls newest first, falling back to the job id", () => {
    const calls = [
      call({ call_id: "old", call_datetime_ist: "2026-01-01 10:00:00 IST" }),
      call({ job_id: "j-new", call_datetime_ist: "2026-01-03 10:00:00 IST" }),
      call({ call_id: "done", call_datetime_ist: "2026-01-04 10:00:00 IST" }),
      call({}),
    ];
    const map = new Map<string, JobReviewStatus>([
      ["done", { unique_reviewers: 1, is_reviewed: true, you_reviewed: true }],
    ]);
    expect(bulkReviewQueue(calls, map)).toEqual(["j-new", "old"]);
  });

  test("is empty for no calls", () => {
    expect(bulkReviewQueue([], null)).toEqual([]);
  });
});
