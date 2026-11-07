import { describe, expect, test } from "bun:test";
import {
  buildLiveDetail,
  contactDuration,
  contactStatus,
  extractStatusCounts,
  normalizeStatus,
  pickNum,
  sortLiveBatches,
  toLiveBatch,
  type LiveBatch,
} from "../../src/lib/raya-live-batches";

describe("small readers", () => {
  test("normalizeStatus lowercases and trims", () => {
    expect(normalizeStatus(" Running ")).toBe("running");
    expect(normalizeStatus(undefined)).toBe("");
  });
  test("pickNum takes the first numeric key", () => {
    expect(pickNum({ a: "x", b: "7", c: 3 }, "a", "b", "c")).toBe(7);
    expect(pickNum({ a: Infinity, b: 2 }, "a", "b")).toBe(2);
    expect(pickNum({ a: "" }, "a")).toBe(0);
    expect(pickNum(null, "a")).toBe(0);
  });
  test("contactStatus and contactDuration read alternate keys", () => {
    expect(contactStatus({ call_status: " Completed " })).toBe("Completed");
    expect(contactStatus(null)).toBe("");
    expect(contactDuration({ duration_seconds: "42" })).toBe(42);
    expect(contactDuration({ duration: "n/a" })).toBe(0);
    expect(contactDuration({})).toBe(0);
  });
});

describe("extractStatusCounts", () => {
  test("reads counts and derives dialed from the total", () => {
    expect(
      extractStatusCounts({
        total_contacts: 10,
        status_counts: { Pending: 4, "In Progress": 1, Completed: 3, Unanswered: 1, failed: 1 },
      }),
    ).toEqual({
      total: 10,
      pending: 4,
      inProgress: 1,
      completed: 3,
      unanswered: 1,
      failed: 1,
      pickedUp: 3,
      dialed: 6,
    });
  });
  test("sums the outcomes when there is no total", () => {
    const counts = extractStatusCounts({ counts: { calling: 1, completed: 2, Answered: 1 } });
    expect(counts.total).toBe(0);
    expect(counts.dialed).toBe(3);
    expect(counts.pickedUp).toBe(1);
  });
  test("handles a missing item", () => {
    expect(extractStatusCounts(undefined).total).toBe(0);
  });
});

describe("toLiveBatch", () => {
  test("maps a Raya batch", () => {
    const item = {
      batch_id: 12,
      batch_name: "Day 1",
      status: "Running",
      max_concurrency: "4",
      max_retries: 2,
      retry_after_hrs: "3",
      schedule: { days: [1] },
      created_at: "2026-06-01T00:00:00Z",
      startedAt: "2026-06-01T01:00:00Z",
      total: 5,
    };
    const b = toLiveBatch(item, "ag1", "Agent");
    expect(b).toMatchObject({
      batchId: "12",
      batchName: "Day 1",
      agentId: "ag1",
      agentName: "Agent",
      status: "running",
      concurrency: 4,
      maxRetries: 2,
      retryAfterHrs: null,
      total: 5,
      schedule: { days: [1] },
      createdAt: "2026-06-01T00:00:00Z",
      startedAt: "2026-06-01T01:00:00Z",
    });
    expect(b.raw).toBe(item);
  });
  test("uses placeholders for missing fields", () => {
    expect(toLiveBatch({}, "a", "n")).toMatchObject({
      batchId: "",
      batchName: "—",
      status: "",
      concurrency: 0,
      schedule: null,
      createdAt: null,
    });
  });
});

describe("sortLiveBatches", () => {
  const batch = (batchId: string, status: string, createdAt: string | null) =>
    ({ ...toLiveBatch({}, "a", "a"), batchId, status, createdAt }) satisfies LiveBatch;
  test("orders running first, then by newest", () => {
    const sorted = sortLiveBatches([
      batch("done", "completed", "2026-06-05"),
      batch("old-run", "running", "2026-06-01"),
      batch("odd", "weird", null),
      batch("new-run", "live", "2026-06-03"),
      batch("sched", "scheduled", null),
    ]);
    expect(sorted.map((b) => b.batchId)).toEqual(["new-run", "old-run", "sched", "done", "odd"]);
  });
});

describe("buildLiveDetail", () => {
  const contacts = [
    { contact_name: "A", contact_phone: "1", status: "Pending", updated_at: "2026-06-01" },
    { name: "B", phone: "2", status: "Completed", duration: 30, updated_at: "2026-06-03" },
    { status: "In Progress", last_call_at: "2026-06-02" },
    { status: "no answer", call_duration: 0 },
    { status: "error" },
  ];
  test("counts statuses and lists recent contacts newest first", () => {
    const d = buildLiveDetail({ batchId: "b1", batchName: "Given" }, contacts, null, 0);
    expect(d).toMatchObject({
      batchId: "b1",
      batchName: "Given",
      agentName: "—",
      status: "",
      total: 5,
      pending: 1,
      inProgress: 1,
      completed: 1,
      unanswered: 1,
      failed: 1,
      pickedUp: 1,
      dialed: 4,
      concurrency: 0,
      maxRetries: null,
      schedule: null,
    });
    expect(d.recent.map((r) => r.name)).toEqual(["B", "—", "A", "—", "—"]);
    expect(d.recent[0]).toEqual({
      name: "B",
      phone: "2",
      status: "Completed",
      duration: 30,
      updatedAt: "2026-06-03",
    });
  });
  test("prefers batch metadata and the reported total", () => {
    const meta = {
      name: "Meta",
      agent_name: "Ag",
      status: "Paused",
      max_retries: 1,
      concurrency: 3,
    };
    const d = buildLiveDetail({ batchId: "b1", batchName: "Given" }, [], meta, 40);
    expect(d).toMatchObject({
      batchName: "Meta",
      agentName: "Ag",
      status: "paused",
      total: 40,
      dialed: 40,
      maxRetries: 1,
      concurrency: 3,
      recent: [],
    });
  });
});
