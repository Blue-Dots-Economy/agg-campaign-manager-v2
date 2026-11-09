import { describe, expect, test } from "bun:test";
import {
  bulkProgress,
  findCall,
  nextAfterSubmit,
  nonBlankId,
  parseBulkQueue,
  parseIssueList,
  parseTurnFlags,
  praise,
  readBulkQueueOrEmpty,
  ratingLabel,
  reviewPrefill,
  safeRecordingUrl,
  submitHint,
  toggleIssue,
} from "@/lib/review/review-form";

describe("praise", () => {
  test("ends the batch when there is no next call", () => {
    expect(praise(10, false, 12)).toBe("Batch complete — you reviewed all 12. Incredible work.");
  });

  test("celebrates every 25th and every 10th review", () => {
    expect(praise(50, true, 99)).toBe("50 reviews this session — you're crushing it!");
    expect(praise(20, true, 99)).toBe("20 in a row — you're on fire!");
  });

  test("rotates encouragements otherwise", () => {
    expect(praise(0, true, 5)).toBe("Nice work!");
    expect(praise(1, true, 5)).toBe("Another one down!");
    expect(praise(7, true, 5)).toBe("Another one down!");
  });
});

describe("ratingLabel", () => {
  test("names each rating", () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => ratingLabel(n))).toEqual([
      "Not rated",
      "Very poor",
      "Poor",
      "Okay",
      "Good",
      "Excellent",
    ]);
  });
});

describe("toggleIssue", () => {
  test("adds and removes an issue", () => {
    expect(toggleIssue([], "Flow Broken")).toEqual(["Flow Broken"]);
    expect(toggleIssue(["Flow Broken", "API Failing"], "Flow Broken")).toEqual(["API Failing"]);
  });

  test("'No Issues' replaces every other issue and toggles off", () => {
    expect(toggleIssue(["Flow Broken"], "No Issues")).toEqual(["No Issues"]);
    expect(toggleIssue(["No Issues"], "No Issues")).toEqual([]);
  });

  test("any other issue clears 'No Issues'", () => {
    expect(toggleIssue(["No Issues"], "Hallucinating")).toEqual(["Hallucinating"]);
  });
});

describe("parseIssueList and parseTurnFlags", () => {
  test("splits and trims a stored issue list", () => {
    expect(parseIssueList(" Flow Broken, ,API Failing ")).toEqual(["Flow Broken", "API Failing"]);
    expect(parseIssueList("")).toEqual([]);
  });

  test("reads stored flags and drops malformed entries", () => {
    expect(parseTurnFlags('[{"turn":2,"note":"late"},{"turn":"3"},null]')).toEqual([
      { turn: 2, note: "late" },
    ]);
    expect(parseTurnFlags("[]")).toEqual([]);
  });

  test("returns null for broken JSON or a non-array", () => {
    expect(parseTurnFlags("{")).toBeNull();
    expect(parseTurnFlags('{"turn":1}')).toBeNull();
  });
});

describe("reviewPrefill", () => {
  const base = {
    reviewer_email: "Asha@Example.org",
    overall_rating: 4,
    quantitative_issues: "Flow Broken, API Failing",
    reviewer_notes: "ok",
    turn_flags: '[{"turn":1,"note":"slow"}]',
  };

  test("uses the reviewer's own review, matching email without case", () => {
    expect(reviewPrefill([{ ...base, reviewer_email: "x@y.z" }, base], "asha@example.org")).toEqual(
      {
        issues: ["Flow Broken", "API Failing"],
        flags: [{ turn: 1, note: "slow" }],
        notes: "ok",
        rating: 4,
      },
    );
  });

  test("leaves issues and flags unset when they were empty or unreadable", () => {
    expect(
      reviewPrefill(
        [
          {
            ...base,
            quantitative_issues: null,
            turn_flags: "oops",
            reviewer_notes: null,
            overall_rating: null,
          },
        ],
        "asha@example.org",
      ),
    ).toEqual({ issues: undefined, flags: undefined, notes: "", rating: 0 });
  });

  test("returns null when the reviewer has no review", () => {
    expect(reviewPrefill([base], "ravi@example.org")).toBeNull();
    expect(reviewPrefill([], "")).toBeNull();
  });
});

describe("submitHint", () => {
  test("explains the first missing piece", () => {
    expect(submitHint(true, 0, 0)).toBe(
      "The admin account can't submit reviews — sign in with your own email",
    );
    expect(submitHint(false, 0, 3)).toBe("Select at least one issue");
    expect(submitHint(false, 1, 0)).toBe("Add an overall rating to submit");
    expect(submitHint(false, 1, 3)).toBe("");
  });
});

describe("safeRecordingUrl", () => {
  test("allows only Raya recording URLs", () => {
    const ok = "https://api.getraya.app/call_recording/abc.mp3";
    expect(safeRecordingUrl(ok)).toBe(ok);
    expect(safeRecordingUrl("https://evil.example/call_recording/abc.mp3")).toBeUndefined();
    expect(safeRecordingUrl("")).toBeUndefined();
    expect(safeRecordingUrl(undefined)).toBeUndefined();
  });
});

describe("findCall and nonBlankId", () => {
  const calls = [
    { call_id: "c1", job_id: "j1" },
    { call_id: "", job_id: "j2" },
  ];

  test("matches the call id first, then the job id", () => {
    expect(findCall(calls, "c1")?.job_id).toBe("j1");
    expect(findCall(calls, "j2")?.job_id).toBe("j2");
    expect(findCall(calls, "zz")).toBeNull();
    expect(findCall(null, "c1")).toBeNull();
  });

  test("treats blank ids as missing", () => {
    expect(nonBlankId("c1")).toBe("c1");
    expect(nonBlankId(" c1 ")).toBe(" c1 ");
    expect(nonBlankId("  ")).toBeNull();
    expect(nonBlankId(undefined)).toBeNull();
  });
});

describe("bulk queue", () => {
  const queue = ["a", "b", "c", "d"];

  test("parses a stored list of ids", () => {
    expect(parseBulkQueue('["a","b"]')).toEqual(["a", "b"]);
    expect(parseBulkQueue(null)).toEqual([]);
    expect(parseBulkQueue("")).toEqual([]);
  });

  test("throws for a broken or wrongly shaped queue", () => {
    expect(() => parseBulkQueue("[")).toThrow();
    expect(() => parseBulkQueue('{"a":1}')).toThrow();
    expect(() => parseBulkQueue("[1,2]")).toThrow();
  });

  test("readBulkQueueOrEmpty returns the stored ids, or no ids when the queue is unreadable", () => {
    expect(readBulkQueueOrEmpty('["a","b"]')).toEqual(["a", "b"]);
    expect(readBulkQueueOrEmpty(null)).toEqual([]);
    expect(readBulkQueueOrEmpty("[")).toEqual([]);
    expect(readBulkQueueOrEmpty('{"a":1}')).toEqual([]);
    expect(readBulkQueueOrEmpty("[1,2]")).toEqual([]);
  });

  test("bulkProgress places the call and finds the next one", () => {
    expect(bulkProgress(queue, "b")).toEqual({ idx: 1, total: 4, next: "c", pct: 25 });
    expect(bulkProgress(queue, "d")).toEqual({ idx: 3, total: 4, next: null, pct: 75 });
    expect(bulkProgress(queue, "zz")).toEqual({ idx: 0, total: 4, next: "b", pct: 0 });
    expect(bulkProgress([], "a")).toEqual({ idx: 0, total: 0, next: null, pct: 0 });
  });

  test("nextAfterSubmit counts what is left after the next call", () => {
    expect(nextAfterSubmit(queue, "b")).toEqual({ next: "c", remaining: 2 });
    expect(nextAfterSubmit(queue, "d")).toEqual({ next: null, remaining: 0 });
    expect(nextAfterSubmit(queue, "zz")).toEqual({ next: null, remaining: 4 });
  });
});
