import { describe, expect, test } from "bun:test";
import { MAX_PROBLEMS_RETURNED, validateContactRows } from "../../src/lib/contact-validation";

describe("validateContactRows", () => {
  test("accepts valid rows and keeps other columns as extras", () => {
    const report = validateContactRows(
      [" Name ", "Phone", "City", ""],
      [["Asha", "+91 98765 43210", "Hubli", "x"]],
    );
    expect(report).toEqual({
      total: 1,
      valid: 1,
      invalid: 0,
      missingCols: [],
      problems: [],
      validRows: [
        { name: "Asha", phone: "9876543210", cc: "91", extras: { City: "Hubli" }, rowIndex: 2 },
      ],
    });
  });

  test("reads the country code column and strips it from the phone", () => {
    const report = validateContactRows(
      ["contact_name", "mobile", "cc"],
      [
        ["A", "1 9876543210", "+1"],
        ["B", "9876543211", ""],
      ],
    );
    expect(report.validRows.map((r) => [r.phone, r.cc])).toEqual([
      ["9876543210", "1"],
      ["9876543211", "91"],
    ]);
  });

  test("reports missing columns and checks no rows", () => {
    const report = validateContactRows(["city"], [["x"]]);
    expect(report.missingCols).toEqual(["contact_name", "contact_phone"]);
    expect(report.valid).toBe(0);
    expect(report.invalid).toBe(0);
    expect(report.total).toBe(1);
  });

  test("reports missing values, invalid phones and duplicates", () => {
    const report = validateContactRows(
      ["name", "phone"],
      [
        ["", "9876543210"],
        ["A", ""],
        ["B", "12345"],
        ["C", "5876543210"],
        ["D", "9876543210"],
        ["E", "09876543210"],
        ["F", "9876543210"],
      ],
    );
    expect(report.problems).toEqual([
      { row: 2, reason: "missing contact_name" },
      { row: 3, reason: "missing contact_phone", name: "A" },
      { row: 4, reason: "invalid phone: 12345", name: "B" },
      { row: 5, reason: "invalid phone: 5876543210", name: "C" },
      { row: 7, reason: "invalid phone: 09876543210", name: "E" },
      { row: 8, reason: "duplicate of row 6", phone: "9876543210", name: "F" },
    ]);
    expect(report.valid).toBe(1);
  });

  test("returns at most MAX_PROBLEMS_RETURNED problems but counts all", () => {
    const rows = Array.from({ length: MAX_PROBLEMS_RETURNED + 5 }, () => ["", "1"]);
    const report = validateContactRows(["name", "phone"], rows);
    expect(report.problems.length).toBe(MAX_PROBLEMS_RETURNED);
    expect(report.invalid).toBe(MAX_PROBLEMS_RETURNED + 5);
  });

  test("handles empty input", () => {
    expect(validateContactRows(["name", "phone"], []).total).toBe(0);
  });
});
