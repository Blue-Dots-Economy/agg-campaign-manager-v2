import { describe, expect, test } from "bun:test";
import {
  colLetter,
  isRangeParseError,
  normalizeHeader,
  quoteTab,
} from "../../src/lib/sheet-ranges";

describe("colLetter", () => {
  test("maps zero-based indexes to column letters", () => {
    expect(colLetter(0)).toBe("A");
    expect(colLetter(25)).toBe("Z");
    expect(colLetter(26)).toBe("AA");
    expect(colLetter(701)).toBe("ZZ");
    expect(colLetter(702)).toBe("AAA");
  });
  test("returns empty for a negative index", () => {
    expect(colLetter(-1)).toBe("");
  });
});

describe("quoteTab", () => {
  test("leaves simple names bare", () => {
    expect(quoteTab("Sheet1")).toBe("Sheet1!");
  });
  test("quotes names with spaces or quotes", () => {
    expect(quoteTab("My Tab")).toBe("'My Tab'!");
    expect(quoteTab("Bob's")).toBe("'Bob''s'!");
  });
});

describe("normalizeHeader", () => {
  test("lowercases and joins words with underscores", () => {
    expect(normalizeHeader("  Call ID ")).toBe("call_id");
    expect(normalizeHeader("Reviewer-Email")).toBe("reviewer_email");
    expect(normalizeHeader("")).toBe("");
  });
});

describe("isRangeParseError", () => {
  test("matches Sheets range errors", () => {
    expect(isRangeParseError("Unable to parse range: 'Nope'!A1:ZZ1")).toBe(true);
    expect(isRangeParseError('{"status":"INVALID_ARGUMENT"}')).toBe(true);
  });
  test("does not match other errors", () => {
    expect(isRangeParseError("PERMISSION_DENIED")).toBe(false);
  });
});
