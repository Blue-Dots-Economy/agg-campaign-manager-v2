import { describe, expect, spyOn, test } from "bun:test";
import { AGENTS_READ_FAILED_MESSAGE, agentsReadFailed } from "../../src/lib/raya-live.server";

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
