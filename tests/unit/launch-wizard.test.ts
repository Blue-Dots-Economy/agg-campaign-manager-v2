import { describe, expect, test } from "bun:test";
import {
  buildCampaignType,
  canAdvance,
  concurrencyInputMax,
  dayLabels,
  exceedsAvailable,
  formatBatchValidationError,
  startedBatchStatus,
  toLaunchContacts,
  type StepGateInput,
  type ValidationReport,
} from "@/lib/launch/wizard";

describe("buildCampaignType", () => {
  const base = {
    program: "seekers",
    region: "GZB",
    campaignDay: "Day 3",
    source: "upload" as const,
    cohortIntent: "drive" as const,
  };

  test("joins program, language and day for an upload", () => {
    expect(buildCampaignType(base)).toBe("SEEKERS_Hindi_Day3");
    expect(buildCampaignType({ ...base, region: "KA", program: "providers" })).toBe(
      "PROVIDERS_Kannada_Day3",
    );
  });

  test("adds the cohort intent tag", () => {
    expect(buildCampaignType({ ...base, source: "cohort" })).toBe(
      "SEEKERS_Hindi_DriveApplications_Day3",
    );
    expect(buildCampaignType({ ...base, source: "cohort", cohortIntent: "fill" })).toBe(
      "SEEKERS_Hindi_FillInfo_Day3",
    );
  });

  test("uses the raw region for unknown regions and an empty part when none", () => {
    expect(buildCampaignType({ ...base, region: "MH" })).toBe("SEEKERS_MH_Day3");
    expect(buildCampaignType({ ...base, region: "" })).toBe("SEEKERS__Day3");
  });

  test("takes the first number in the day and falls back to day 1", () => {
    expect(buildCampaignType({ ...base, campaignDay: "Day 12 retry 2" })).toBe(
      "SEEKERS_Hindi_Day12",
    );
    expect(buildCampaignType({ ...base, campaignDay: "" })).toBe("SEEKERS_Hindi_Day1");
    expect(buildCampaignType({ ...base, campaignDay: "first" })).toBe("SEEKERS_Hindi_Day1");
  });
});

describe("dayLabels", () => {
  test("lists days in week order without changing the input", () => {
    const days = [7, 3, 1];
    expect(dayLabels(days)).toBe("Mon, Wed, Sun");
    expect(days).toEqual([7, 3, 1]);
  });

  test("returns a dash when no day is picked", () => {
    expect(dayLabels([])).toBe("—");
  });

  test("leaves an empty name for days outside 1–7", () => {
    expect(dayLabels([0, 2])).toBe(", Tue");
    expect(dayLabels([9])).toBe("—");
  });
});

describe("toLaunchContacts", () => {
  const cohort = [
    { contact_name: "Asha", contact_phone: "9876543210", country_code: "91", seeker_id: "s1" },
  ];
  const rows = [
    {
      name: "Ravi",
      phone: "9123456780",
      cc: "91",
      extras: { city: "Noida", contact_name: "override" },
      rowIndex: 2,
    },
  ];

  test("tags cohort contacts with the region", () => {
    expect(toLaunchContacts("cohort", cohort, rows, "GZB")).toEqual([
      {
        contact_name: "Asha",
        contact_phone: "9876543210",
        country_code: "91",
        seeker_id: "s1",
        _region: "GZB",
      },
    ]);
  });

  test("maps valid upload rows with extras after the fixed columns", () => {
    expect(toLaunchContacts("upload", cohort, rows, "KA")).toEqual([
      {
        contact_name: "override",
        contact_phone: "9123456780",
        country_code: "91",
        city: "Noida",
        _region: "KA",
      },
    ]);
  });

  test("returns no contacts when there is no report", () => {
    expect(toLaunchContacts("upload", cohort, undefined, "KA")).toEqual([]);
  });
});

describe("concurrency limits", () => {
  test("exceedsAvailable ignores an unknown (infinite) availability", () => {
    expect(exceedsAvailable(6, 5)).toBe(true);
    expect(exceedsAvailable(5, 5)).toBe(false);
    expect(exceedsAvailable(500, Infinity)).toBe(false);
  });

  test("concurrencyInputMax stays between 1 and 100", () => {
    expect(concurrencyInputMax(Infinity)).toBe(100);
    expect(concurrencyInputMax(250)).toBe(100);
    expect(concurrencyInputMax(7)).toBe(7);
    expect(concurrencyInputMax(0)).toBe(1);
  });
});

describe("canAdvance", () => {
  const report: ValidationReport = {
    total: 3,
    valid: 2,
    invalid: 1,
    missingCols: [],
    problems: [{ row: 3, reason: "missing contact_name" }],
    validRows: [],
  };
  const gate: StepGateInput = {
    step: 0,
    program: "seekers",
    agentId: "a1",
    source: "upload",
    cohortCount: 0,
    report: null,
    proceedInvalid: false,
    schedule: { startTime: "09:00", endTime: "18:00", days: [1] },
    concurrency: 5,
    maxRetries: 2,
    retryAfterHrs: 24,
    available: Infinity,
  };

  test("program and agent steps need a choice", () => {
    expect(canAdvance(gate)).toBe(true);
    expect(canAdvance({ ...gate, program: "" })).toBe(false);
    expect(canAdvance({ ...gate, step: 1 })).toBe(true);
    expect(canAdvance({ ...gate, step: 1, agentId: "" })).toBe(false);
  });

  test("audience step needs a clean report, an explicit skip, or a non-empty cohort", () => {
    const s = { ...gate, step: 2 };
    expect(canAdvance(s)).toBe(false);
    expect(canAdvance({ ...s, report })).toBe(false);
    expect(canAdvance({ ...s, report, proceedInvalid: true })).toBe(true);
    expect(canAdvance({ ...s, report: { ...report, invalid: 0 } })).toBe(true);
    expect(
      canAdvance({
        ...s,
        report: { ...report, missingCols: ["contact_phone"] },
        proceedInvalid: true,
      }),
    ).toBe(false);
    expect(canAdvance({ ...s, source: "cohort", cohortCount: 0 })).toBe(false);
    expect(canAdvance({ ...s, source: "cohort", cohortCount: 4 })).toBe(true);
  });

  test("schedule step needs a forward window and at least one day", () => {
    const s = { ...gate, step: 3 };
    expect(canAdvance(s)).toBe(true);
    expect(
      canAdvance({ ...s, schedule: { startTime: "18:00", endTime: "18:00", days: [1] } }),
    ).toBe(false);
    expect(canAdvance({ ...s, schedule: { startTime: "09:00", endTime: "18:00", days: [] } })).toBe(
      false,
    );
  });

  test("concurrency step checks ranges and free capacity", () => {
    const s = { ...gate, step: 4 };
    expect(canAdvance(s)).toBe(true);
    expect(canAdvance({ ...s, concurrency: 0 })).toBe(false);
    expect(canAdvance({ ...s, maxRetries: -1 })).toBe(false);
    expect(canAdvance({ ...s, maxRetries: 0 })).toBe(true);
    expect(canAdvance({ ...s, retryAfterHrs: 0 })).toBe(false);
    expect(canAdvance({ ...s, available: 4 })).toBe(false);
    expect(canAdvance({ ...s, available: 5 })).toBe(true);
  });

  test("review and launch steps always allow moving on", () => {
    expect(canAdvance({ ...gate, step: 5, agentId: "" })).toBe(true);
    expect(canAdvance({ ...gate, step: 6 })).toBe(true);
  });
});

describe("formatBatchValidationError", () => {
  test("adds counts and up to five failing rows", () => {
    const errors = Array.from({ length: 7 }, (_, i) => ({
      row: i + 2,
      field: "contact_phone",
      message: "bad",
    }));
    expect(
      formatBatchValidationError({
        message: "Validation failed",
        invalidRows: 7,
        totalRows: 9,
        errors,
      }),
    ).toBe(
      [
        "Validation failed (7 invalid of 9)",
        "row 2 · contact_phone: bad",
        "row 3 · contact_phone: bad",
        "row 4 · contact_phone: bad",
        "row 5 · contact_phone: bad",
        "row 6 · contact_phone: bad",
        "…and 2 more",
      ].join("\n"),
    );
  });

  test("fills unknown values with '?' and leaves out missing parts", () => {
    expect(
      formatBatchValidationError({ message: "Nope", invalidRows: 1, errors: [{}, { field: "x" }] }),
    ).toBe("Nope (1 invalid of ?)\nrow ?\nrow ? · x");
  });

  test("returns only the message when there are no counts or rows", () => {
    expect(formatBatchValidationError({ message: "Nope", invalidRows: "3", errors: [] })).toBe(
      "Nope",
    );
    expect(formatBatchValidationError({ message: "Nope" })).toBe("Nope");
  });
});

describe("startedBatchStatus", () => {
  test("reads the top-level or nested batch status", () => {
    expect(startedBatchStatus({ status: "running" })).toBe("running");
    expect(startedBatchStatus({ batch: { status: "queued" } })).toBe("queued");
    expect(startedBatchStatus({ status: 3 })).toBe("3");
  });

  test("falls back to 'started'", () => {
    expect(startedBatchStatus({})).toBe("started");
    expect(startedBatchStatus(null)).toBe("started");
    expect(startedBatchStatus("ok")).toBe("started");
    expect(startedBatchStatus({ status: null, batch: null })).toBe("started");
  });
});
