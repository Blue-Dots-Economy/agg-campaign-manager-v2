import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import {
  appAgeBucket,
  applicationBucket,
  classifyAssociation,
  classifyInstitutionType,
  fmtDate,
  fmtInt,
  fmtSalary,
  gapLevel,
  jobFreshness,
  maskEmail,
  maskName,
  maskPhone,
  mockPrevious,
  mockTrend,
  nz,
  relativeAge,
  roleCategory,
  syncedAgo,
} from "../../src/components/ecosystem/ecosystemHelpers";

describe("formatters", () => {
  test("fmtInt formats finite numbers and dashes the rest", () => {
    expect(fmtInt(1234567)).toBe("12,34,567");
    expect(fmtInt(0)).toBe("0");
    expect(fmtInt(Number.NaN)).toBe("—");
    expect(fmtInt(null)).toBe("—");
    expect(fmtInt(undefined)).toBe("—");
  });

  test("fmtSalary shows a monthly amount only when positive", () => {
    expect(fmtSalary(15000)).toBe("₹15,000/month");
    expect(fmtSalary(0)).toBe("—");
    expect(fmtSalary(null)).toBe("—");
  });

  test("fmtDate formats valid dates and dashes invalid or empty ones", () => {
    expect(fmtDate("2026-03-05T10:00:00")).toBe("05 Mar 2026");
    expect(fmtDate("not a date")).toBe("—");
    expect(fmtDate("")).toBe("—");
    expect(fmtDate(null)).toBe("—");
  });

  test("nz dashes empty or blank strings", () => {
    expect(nz("x")).toBe("x");
    expect(nz("  ")).toBe("—");
    expect(nz(null)).toBe("—");
  });
});

describe("masking", () => {
  test("maskName keeps the first and last letter of each word", () => {
    expect(maskName("Ravi Kumar")).toBe("R**i K***r");
    expect(maskName("Al")).toBe("A*");
    expect(maskName("A")).toBe("A*");
    expect(maskName("Abc")).toBe("A*c");
    expect(maskName("  Om  Sai ")).toBe("O* S*i");
    expect(maskName("")).toBe("—");
  });

  test("maskPhone keeps the last four digits", () => {
    expect(maskPhone("+91 98765-43210")).toBe("••••••••3210");
    expect(maskPhone("123")).toBe("•••");
    expect(maskPhone("")).toBe("—");
  });

  test("maskEmail keeps two letters of the user and the domain", () => {
    expect(maskEmail("ravi@example.com")).toBe("ra**@example.com");
    expect(maskEmail("ab@x.in")).toBe("a*@x.in");
    expect(maskEmail("a@x.in")).toBe("a*@x.in");
    expect(maskEmail("no-at-sign")).toBe("—");
    expect(maskEmail("")).toBe("—");
  });
});

describe("classification", () => {
  test("gapLevel maps the gap to a level", () => {
    expect(gapLevel(5)).toBe("Supply gap");
    expect(gapLevel(4)).toBe("Borderline");
    expect(gapLevel(2)).toBe("Borderline");
    expect(gapLevel(1.5)).toBe("Excellent");
    expect(gapLevel(1)).toBe("Balanced");
    expect(gapLevel(0)).toBe("Good supply");
    expect(gapLevel(-1)).toBe("Excellent");
  });

  test("classifyInstitutionType spots ITIs", () => {
    expect(classifyInstitutionType("Govt ITI Hubli")).toBe("ITI");
    expect(classifyInstitutionType("Industrial Training Centre")).toBe("ITI");
    expect(classifyInstitutionType("City College")).toBe("Non-ITI");
    expect(classifyInstitutionType("")).toBe("Unknown");
  });

  test("classifyAssociation spots government and private", () => {
    expect(classifyAssociation("Government ITI")).toBe("Govt");
    expect(classifyAssociation("ABC Pvt Ltd")).toBe("Pvt");
    expect(classifyAssociation("Private Institute")).toBe("Pvt");
    expect(classifyAssociation("Trust school")).toBe("Unknown");
    expect(classifyAssociation("")).toBe("Unknown");
  });

  test("applicationBucket groups counts", () => {
    expect(applicationBucket(0)).toBe("0");
    expect(applicationBucket(5)).toBe("1-5");
    expect(applicationBucket(6)).toBe("6-20");
    expect(applicationBucket(20)).toBe("6-20");
    expect(applicationBucket(21)).toBe("20+");
  });

  test("roleCategory matches the first rule in order", () => {
    expect(roleCategory("Data Entry Operator")).toBe("Office & Data");
    expect(roleCategory("Telecaller")).toBe("Sales & Telecalling");
    expect(roleCategory("Store Promoter")).toBe("Retail & Promotion");
    expect(roleCategory("Delivery Rider")).toBe("Logistics & Delivery");
    expect(roleCategory("Security Guard")).toBe("Services");
    expect(roleCategory("Welder")).toBe("Manufacturing & Trades");
    expect(roleCategory("Astronaut", "Space")).toBe("Other");
    expect(roleCategory("Associate", "warehouse")).toBe("Logistics & Delivery");
  });
});

describe("dates relative to now", () => {
  const NOW = new Date("2026-06-30T12:00:00Z");
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

  beforeEach(() => setSystemTime(NOW));
  afterEach(() => setSystemTime());

  test("jobFreshness", () => {
    expect(jobFreshness(daysAgo(13))).toBe("latest");
    expect(jobFreshness(daysAgo(14))).toBe("recent");
    expect(jobFreshness(daysAgo(28))).toBe("recent");
    expect(jobFreshness(daysAgo(29))).toBe("old");
    expect(jobFreshness("bad")).toBe("old");
  });

  test("appAgeBucket", () => {
    expect(appAgeBucket(daysAgo(6))).toBe("week");
    expect(appAgeBucket(daysAgo(7))).toBe("month");
    expect(appAgeBucket(daysAgo(30))).toBe("month");
    expect(appAgeBucket(daysAgo(31))).toBe("older");
  });

  test("relativeAge", () => {
    expect(relativeAge(daysAgo(0))).toBe("Today");
    expect(relativeAge(daysAgo(-2))).toBe("Today");
    expect(relativeAge(daysAgo(1))).toBe("1 day ago");
    expect(relativeAge(daysAgo(29))).toBe("29 days ago");
    expect(relativeAge(daysAgo(30))).toBe("1 month ago");
    expect(relativeAge(daysAgo(65))).toBe("2 months ago");
    expect(relativeAge("bad")).toBe("—");
  });
});

describe("mock trend", () => {
  test("mockPrevious scales and floors at zero", () => {
    expect(mockPrevious(100, 0.85)).toBe(85);
    expect(mockPrevious(-10, 1)).toBe(0);
  });

  test("mockTrend is deterministic and ends at the value", () => {
    const a = mockTrend(100, 80);
    expect(a).toHaveLength(7);
    expect(a.at(-1)).toBe(100);
    expect(mockTrend(100, 80)).toEqual(a);
    expect(mockTrend(10, 5, 3)).toHaveLength(3);
    expect(mockTrend(0, 0)).toEqual([]);
  });
});

describe("syncedAgo", () => {
  const now = Date.parse("2026-06-30T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  test("shows just now, minutes or hours", () => {
    expect(syncedAgo(ago(20_000), now)).toBe("just now");
    expect(syncedAgo(ago(5 * 60_000), now)).toBe("5m ago");
    expect(syncedAgo(ago(59 * 60_000), now)).toBe("59m ago");
    expect(syncedAgo(ago(90 * 60_000), now)).toBe("2h ago");
  });

  test("treats future times as just now", () => {
    expect(syncedAgo(ago(-60_000), now)).toBe("just now");
  });
});
