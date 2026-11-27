import { describe, expect, test } from "bun:test";
import { buildStatusMap, getReviewKey } from "../../src/lib/review-ui";

describe("getReviewKey", () => {
  test("prefers the call id and falls back to the job id", () => {
    expect(getReviewKey({ call_id: " c1 ", job_id: "j1" })).toBe("c1");
    expect(getReviewKey({ call_id: 42 })).toBe("42");
    expect(getReviewKey({ call_id: "  ", job_id: " j1" })).toBe("j1");
    expect(getReviewKey({ call_id: null, job_id: null })).toBe("");
  });
});

describe("buildStatusMap", () => {
  test("counts unique reviewers per key and marks my own reviews", () => {
    const map = buildStatusMap(
      [
        { call_id: "c1", job_id: null, reviewer_email: "A@x.in" },
        { call_id: "c1", job_id: null, reviewer_email: "a@x.in" },
        { call_id: "c1", job_id: null, reviewer_email: "b@x.in" },
        { call_id: null, job_id: "j1", reviewer_email: null },
        { call_id: null, job_id: null, reviewer_email: "a@x.in" },
      ],
      "A@X.IN",
    );
    expect(map.get("c1")).toEqual({ unique_reviewers: 2, is_reviewed: true, you_reviewed: true });
    expect(map.get("j1")).toEqual({ unique_reviewers: 1, is_reviewed: true, you_reviewed: false });
    expect(map.size).toBe(2);
  });

  test("never marks you_reviewed without my email", () => {
    const map = buildStatusMap([{ call_id: "c1", job_id: null, reviewer_email: null }]);
    expect(map.get("c1")?.you_reviewed).toBe(false);
  });

  test("returns an empty map for no rows", () => {
    expect(buildStatusMap([]).size).toBe(0);
  });
});
