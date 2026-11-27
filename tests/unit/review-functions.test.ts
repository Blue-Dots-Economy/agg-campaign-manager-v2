import { describe, expect, test } from "bun:test";
import { UpstreamError } from "../../src/lib/errors";
import { sheetAppendFailure } from "../../src/lib/review.functions";

describe("sheetAppendFailure", () => {
  test("keeps the error name and the HTTP status, not the message", () => {
    const e = new UpstreamError("Sheets said: row 9876543210 is invalid", {
      service: "sheets",
      status: 400,
      body: { error: "9876543210" },
    });
    const fields = sheetAppendFailure(e);
    expect(fields).toEqual({
      operation: "review.sheetAppend",
      status: "failure",
      error_type: "UpstreamError",
      http_status: 400,
    });
    expect(JSON.stringify(fields)).not.toContain("9876543210");
  });

  test("has no HTTP status for other errors", () => {
    expect(sheetAppendFailure(new TypeError("fetch failed 98765"))).toEqual({
      operation: "review.sheetAppend",
      status: "failure",
      error_type: "TypeError",
      http_status: undefined,
    });
  });

  test("names a non-Error throw as unknown", () => {
    expect(sheetAppendFailure("boom").error_type).toBe("unknown");
  });
});
