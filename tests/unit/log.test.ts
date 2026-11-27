import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { logEvent } from "../../src/server/log.server";

const spies: { mockRestore(): void }[] = [];
afterEach(() => {
  for (const s of spies.splice(0)) s.mockRestore();
});

function capture(method: "info" | "warn" | "error") {
  const lines: string[] = [];
  const spy = spyOn(console, method).mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  spies.push(spy);
  return lines;
}

describe("logEvent", () => {
  test("writes one JSON line with the operation and status", () => {
    const lines = capture("info");
    logEvent("info", {
      operation: "raya.createBatch",
      status: "success",
      latency_ms: 12,
      contact_count: 3,
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      level: "info",
      operation: "raya.createBatch",
      status: "success",
      latency_ms: 12,
      contact_count: 3,
    });
  });

  test("uses the console method for the level", () => {
    const warn = capture("warn");
    const error = capture("error");
    logEvent("warn", { operation: "a", status: "skipped" });
    logEvent("error", { operation: "b", status: "failure", error: "boom" });
    expect(warn).toHaveLength(1);
    expect(error).toHaveLength(1);
    expect(JSON.parse(error[0] ?? "").error).toBe("boom");
  });

  test("turns an Error in the error field into its message and type", () => {
    const lines = capture("error");
    logEvent("error", { operation: "c", status: "failure", error: new TypeError("bad input") });
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      error: "bad input",
      error_type: "TypeError",
    });
  });
});
