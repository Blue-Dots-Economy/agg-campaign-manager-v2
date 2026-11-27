import { describe, expect, test } from "bun:test";
import {
  formatSchedule,
  isRunningStatus,
  maskPhone,
  searchBatches,
  splitActiveBatches,
  statusBadgeClass,
} from "@/lib/campaigns/batches";

describe("statusBadgeClass", () => {
  test("colours each status group", () => {
    expect(statusBadgeClass("running")).toContain("emerald");
    expect(statusBadgeClass("in progress")).toContain("emerald");
    expect(statusBadgeClass("queued")).toContain("amber");
    expect(statusBadgeClass("paused")).toContain("orange");
    expect(statusBadgeClass("finished")).toContain("brand");
    expect(statusBadgeClass("failed")).toContain("rose");
  });

  test("falls back to muted for unknown or differently cased statuses", () => {
    expect(statusBadgeClass("")).toBe("bg-muted text-muted-foreground border-border");
    expect(statusBadgeClass("Running")).toBe("bg-muted text-muted-foreground border-border");
  });
});

describe("isRunningStatus", () => {
  test("matches only running statuses", () => {
    expect(isRunningStatus("live")).toBe(true);
    expect(isRunningStatus("scheduled")).toBe(false);
  });
});

describe("maskPhone", () => {
  test("keeps the last four digits", () => {
    expect(maskPhone("919876543210")).toBe("••••••••3210");
    expect(maskPhone("9876543210")).toBe("••••••3210");
  });

  test("masks short numbers and keeps four-digit ones", () => {
    expect(maskPhone("12345")).toBe("••••••2345");
    expect(maskPhone("1234")).toBe("1234");
    expect(maskPhone("")).toBe("—");
  });

  test("masks only digits in the leading part", () => {
    expect(maskPhone("+91-98765-43210")).toBe("+••-•••••••3210");
  });
});

describe("formatSchedule", () => {
  test("formats days, window and timezone", () => {
    expect(
      formatSchedule({
        days: [1, 2, 7],
        start_time: "09:00",
        end_time: "18:00",
        timezone: "Asia/Kolkata",
      }),
    ).toBe("Mon, Tue, Sun · 09:00–18:00 Asia/Kolkata");
  });

  test("uses placeholders for missing parts", () => {
    expect(formatSchedule({})).toBe("— · ?–?");
    expect(formatSchedule({ days: "Mon" })).toBe("— · ?–?");
    expect(formatSchedule(null)).toBe("—");
    expect(formatSchedule(undefined)).toBe("—");
    expect(formatSchedule("weekly")).toBe("— · ?–?");
  });

  test("names string day numbers and keeps unknown days as they are", () => {
    expect(formatSchedule({ days: ["3", 9, "x"] })).toBe("Wed, 9, x · ?–?");
    expect(formatSchedule({ days: [0] })).toBe("— · ?–?");
  });
});

describe("searchBatches and splitActiveBatches", () => {
  const batches = [
    { batchName: "KKB Day 1", agentName: "Asha", status: "running" },
    { batchName: "KKB Day 2", agentName: "Ravi", status: "completed" },
    { batchName: "DKB Day 1", agentName: "Asha", status: "not_started" },
    { batchName: "DKB Day 2", agentName: "Meena", status: "" },
  ];

  test("search matches batch or agent name, ignoring case and spaces", () => {
    expect(searchBatches(batches, "  asha ").map((b) => b.batchName)).toEqual([
      "KKB Day 1",
      "DKB Day 1",
    ]);
    expect(searchBatches(batches, "day 2").map((b) => b.agentName)).toEqual(["Ravi", "Meena"]);
    expect(searchBatches(batches, "")).toBe(batches);
    expect(searchBatches(batches, "zzz")).toEqual([]);
  });

  test("split keeps running and waiting batches active", () => {
    const { active, inactive } = splitActiveBatches(batches);
    expect(active.map((b) => b.status)).toEqual(["running", "not_started"]);
    expect(inactive.map((b) => b.status)).toEqual(["completed", ""]);
  });

  test("split of an empty list is empty", () => {
    expect(splitActiveBatches([])).toEqual({ active: [], inactive: [] });
  });
});
