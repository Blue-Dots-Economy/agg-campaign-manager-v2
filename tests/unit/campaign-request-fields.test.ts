import { describe, expect, test } from "bun:test";
import {
  batchContacts,
  cohortFiltersLine,
  scheduleFromJson,
  selectedStatusesFromJson,
} from "../../src/lib/campaign-request-fields";

describe("scheduleFromJson", () => {
  test("reads a stored schedule", () => {
    expect(
      scheduleFromJson({ timezone: "UTC", start_time: "10:00", end_time: "12:00", days: [6, 7] }),
    ).toEqual({ timezone: "UTC", startTime: "10:00", endTime: "12:00", days: [6, 7] });
  });

  test("falls back per missing or empty field", () => {
    expect(scheduleFromJson({ start_time: "", days: [] })).toEqual({
      timezone: "Asia/Kolkata",
      startTime: "09:00",
      endTime: "18:00",
      days: [1, 2, 3, 4, 5],
    });
  });

  test("falls back entirely for no schedule or a wrong shape", () => {
    const fallback = scheduleFromJson(null);
    expect(fallback.days).toEqual([1, 2, 3, 4, 5]);
    expect(scheduleFromJson("x")).toEqual(fallback);
    expect(scheduleFromJson([1])).toEqual(fallback);
  });
});

describe("cohortFiltersLine", () => {
  test("prefers profile statuses, then the confidence band", () => {
    expect(cohortFiltersLine({ profileStatuses: ["Active", "At Risk"] })).toBe("Active, At Risk");
    expect(cohortFiltersLine({ profileStatuses: [], confidenceBand: "low" })).toBe(
      "Confidence: low",
    );
  });

  test("returns null without filters", () => {
    expect(cohortFiltersLine(null)).toBeNull();
    expect(cohortFiltersLine({})).toBeNull();
    expect(cohortFiltersLine("drive")).toBeNull();
  });
});

describe("selectedStatusesFromJson", () => {
  test("reads stored statuses, including an empty list", () => {
    expect(selectedStatusesFromJson(["Pending", "Failed"])).toEqual(["Pending", "Failed"]);
    expect(selectedStatusesFromJson([])).toEqual([]);
  });

  test("falls back to Pending when none are stored", () => {
    expect(selectedStatusesFromJson(null)).toEqual(["Pending"]);
  });
});

describe("batchContacts", () => {
  test("accepts contacts with name, phone and country code, keeping extra fields", () => {
    const contacts = [
      { contact_name: "A", contact_phone: "9999999999", country_code: "91", city: "Hubli" },
    ];
    expect(batchContacts(contacts)).toEqual(contacts);
    expect(batchContacts([])).toEqual([]);
  });

  test("returns null for contacts in another shape", () => {
    expect(batchContacts([{ contact_name: "A" }])).toBeNull();
    expect(batchContacts(null)).toBeNull();
    expect(batchContacts({})).toBeNull();
  });
});
