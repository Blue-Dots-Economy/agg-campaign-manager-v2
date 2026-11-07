import { describe, expect, spyOn, test } from "bun:test";
import {
  AGENTS_READ_FAILED_MESSAGE,
  agentsReadFailed,
  GetBatchLiveDetailInput,
  ListProgramLiveBatchesInput,
} from "../../src/lib/raya-live.functions";

describe("ListProgramLiveBatchesInput", () => {
  test("accepts a registered program", () => {
    expect(ListProgramLiveBatchesInput.parse({ program: "seekers" })).toEqual({
      program: "seekers",
    });
  });
  test("refuses unknown or missing programs", () => {
    expect(ListProgramLiveBatchesInput.safeParse({ program: "nope" }).success).toBe(false);
    expect(ListProgramLiveBatchesInput.safeParse({ program: "toString" }).success).toBe(false);
    expect(ListProgramLiveBatchesInput.safeParse({}).success).toBe(false);
  });
});

describe("GetBatchLiveDetailInput", () => {
  test("accepts what the campaigns page sends", () => {
    const input = { batchId: "12", agentName: "A", batchName: "B" };
    expect(GetBatchLiveDetailInput.parse(input)).toEqual(input);
    expect(GetBatchLiveDetailInput.parse({ batchId: "12" })).toEqual({ batchId: "12" });
  });
  test("refuses a missing batch id or wrong types", () => {
    expect(GetBatchLiveDetailInput.safeParse({ batchId: "" }).error?.issues[0]?.message).toBe(
      "batchId required",
    );
    expect(GetBatchLiveDetailInput.safeParse({ batchId: 12 }).success).toBe(false);
  });
});

describe("agentsReadFailed", () => {
  test("returns a fixed message and logs no SQL or parameters", () => {
    const lines: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    try {
      const out = agentsReadFailed(
        new Error('Failed query: select "agent_id" from "program_agents" params: 9876543210'),
      );
      expect(out).toEqual({ ok: false, batches: [], error: AGENTS_READ_FAILED_MESSAGE });
    } finally {
      spy.mockRestore();
    }
    expect(lines.length).toBe(1);
    expect(lines[0]).not.toContain("9876543210");
    expect(lines[0]).not.toContain("select");
  });
});
