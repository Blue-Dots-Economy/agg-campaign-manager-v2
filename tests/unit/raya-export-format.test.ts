import { describe, expect, test } from "bun:test";
import {
  asArr,
  asStr,
  campaignTypeFor,
  computeIntent,
  datePart,
  detectRegionForContact,
  detectRegionFromText,
  fmtDateOnly,
  fmtDateTimeIstFromApi,
  fmtInt,
  fmtPhone,
  jsonStringOrEmptyArray,
  nextCampaignDayLabel,
  nonEmpty,
  normalize,
  parseSheetId,
  rayaOutcomeOrDerive,
  stripIst,
  yesNo,
} from "../../src/lib/raya-export-format";

const SHEET_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz_-0123";

describe("parseSheetId", () => {
  test("reads the id from a sheet URL", () => {
    expect(parseSheetId(` https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0 `)).toBe(
      SHEET_ID,
    );
  });
  test("accepts a bare id of 20 or more characters", () => {
    expect(parseSheetId(SHEET_ID)).toBe(SHEET_ID);
  });
  test("returns empty for blank, short or foreign input", () => {
    expect(parseSheetId("   ")).toBe("");
    expect(parseSheetId("short-id")).toBe("");
    expect(parseSheetId("https://example.com/not a sheet")).toBe("");
  });
});

describe("normalize", () => {
  test("lowercases, trims and turns spaces and dashes into underscores", () => {
    expect(normalize("  Call Duration-Seconds ")).toBe("call_duration_seconds");
    expect(normalize("a -- b")).toBe("a_b");
  });
});

describe("asStr", () => {
  test("maps null and undefined to empty", () => {
    expect(asStr(null)).toBe("");
    expect(asStr(undefined)).toBe("");
  });
  test("stringifies objects and arrays as JSON", () => {
    expect(asStr({ a: 1 })).toBe('{"a":1}');
    expect(asStr([1, "x"])).toBe('[1,"x"]');
  });
  test("keeps scalars as text", () => {
    expect(asStr(42)).toBe("42");
    expect(asStr(false)).toBe("false");
    expect(asStr("hi")).toBe("hi");
  });
});

describe("asArr", () => {
  test("returns arrays as they are", () => {
    expect(asArr([1, 2])).toEqual([1, 2]);
  });
  test("parses a JSON array string", () => {
    expect(asArr('[{"id":1}]')).toEqual([{ id: 1 }]);
  });
  test("returns empty for anything else", () => {
    expect(asArr(null)).toEqual([]);
    expect(asArr("")).toEqual([]);
    expect(asArr("not json")).toEqual([]);
    expect(asArr('{"a":1}')).toEqual([]);
    expect(asArr(5)).toEqual([]);
    expect(asArr({ a: 1 })).toEqual([]);
  });
});

describe("jsonStringOrEmptyArray", () => {
  test("uses [] for empty values", () => {
    expect(jsonStringOrEmptyArray(null)).toBe("[]");
    expect(jsonStringOrEmptyArray("")).toBe("[]");
    expect(jsonStringOrEmptyArray("   ")).toBe("[]");
  });
  test("keeps strings and stringifies other values", () => {
    expect(jsonStringOrEmptyArray(" text ")).toBe("text");
    expect(jsonStringOrEmptyArray([{ role: "agent" }])).toBe('[{"role":"agent"}]');
  });
});

describe("nonEmpty", () => {
  test("is false for empty values", () => {
    for (const v of [null, undefined, "", "  ", [], {}]) expect(nonEmpty(v)).toBe(false);
  });
  test("is true for content", () => {
    for (const v of ["x", 0, [1], { a: 1 }]) expect(nonEmpty(v)).toBe(true);
  });
});

describe("stripIst", () => {
  test("removes a trailing IST marker in any case", () => {
    expect(stripIst("2026-06-23 10:00:00 IST")).toBe("2026-06-23 10:00:00");
    expect(stripIst("2026-06-23 10:00:00 ist  ")).toBe("2026-06-23 10:00:00");
    expect(stripIst("10:00IST")).toBe("10:00");
  });
  test("removes only the last marker", () => {
    expect(stripIst("IST IST")).toBe("IST");
  });
  test("keeps IST that is not at the end", () => {
    expect(stripIst("IST 10:00")).toBe("IST 10:00");
    expect(stripIst("  plain  ")).toBe("plain");
  });
  test("handles long whitespace runs in linear time", () => {
    const input = `x${" ".repeat(50_000)}y`;
    const start = performance.now();
    expect(stripIst(input)).toBe(input);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe("datePart", () => {
  test("takes the leading date", () => {
    expect(datePart("2026-06-23 10:00:00 IST")).toBe("2026-06-23");
  });
  test("parses other date text", () => {
    expect(datePart("June 23, 2026 UTC")).toBe("2026-06-23");
  });
  test("returns empty for blank or invalid text", () => {
    expect(datePart("")).toBe("");
    expect(datePart("nope")).toBe("");
  });
});

describe("detectRegionFromText", () => {
  test("detects Karnataka", () => {
    expect(detectRegionFromText("KKB ka day 3")).toEqual({
      region: "KA",
      language: "Kannada",
      city: "Hubli-Dharwad",
    });
    expect(detectRegionFromText("Hubli batch")?.region).toBe("KA");
  });
  test("detects Ghaziabad", () => {
    expect(detectRegionFromText("gzb_day1")?.region).toBe("GZB");
    expect(detectRegionFromText("Uttar Pradesh")?.language).toBe("Hindi");
  });
  test("does not match ka inside a word", () => {
    expect(detectRegionFromText("kakinada")).toBeNull();
    expect(detectRegionFromText("")).toBeNull();
  });
});

describe("detectRegionForContact", () => {
  test("prefers the explicit region in agent args", () => {
    const contact = { agent_args: { _region: "GZB", city: "Hubli" } };
    expect(detectRegionForContact(contact, { batchName: "KA" }).region).toBe("GZB");
  });
  test("falls back to city, then batch, agent and program names", () => {
    expect(detectRegionForContact({ args: { city_campaign: "Hubli" } }, {}).region).toBe("KA");
    expect(detectRegionForContact({}, { agentName: "Ghaziabad agent" }).region).toBe("GZB");
  });
  test("returns blanks when nothing matches", () => {
    expect(detectRegionForContact(null, {})).toEqual({ region: "", language: "", city: "" });
  });
});

describe("cell formatters", () => {
  test("fmtPhone keeps the last 10 digits", () => {
    expect(fmtPhone("+91 98765-43210")).toBe("9876543210");
    expect(fmtPhone("12345")).toBe("12345");
    expect(fmtPhone(null)).toBe("");
  });
  test("fmtInt truncates and defaults to 0", () => {
    expect(fmtInt("42.9")).toBe("42");
    expect(fmtInt(-3.5)).toBe("-3");
    expect(fmtInt("abc")).toBe("0");
    expect(fmtInt(null)).toBe("0");
  });
  test("fmtDateTimeIstFromApi writes date and time", () => {
    expect(fmtDateTimeIstFromApi("2026-06-23 10:11:12 IST")).toBe("2026-06-23 10:11:12");
    expect(fmtDateTimeIstFromApi("2026-06-23T10:11:12.345Z")).toBe("2026-06-23 10:11:12");
    expect(fmtDateTimeIstFromApi("2026-06-23")).toBe("2026-06-23 00:00:00");
    expect(fmtDateTimeIstFromApi("garbage")).toBe("garbage");
    expect(fmtDateTimeIstFromApi(null)).toBe("");
  });
  test("fmtDateOnly writes the date", () => {
    expect(fmtDateOnly("2026-06-23T10:11:12Z")).toBe("2026-06-23");
    expect(fmtDateOnly("Jun 23 2026 12:00:00 +0000")).toBe("2026-06-23");
    // The first "T" is read as the ISO date/time separator, which breaks "UTC".
    expect(fmtDateOnly("June 23, 2026 UTC")).toBe("");
    expect(fmtDateOnly("garbage")).toBe("");
    expect(fmtDateOnly(null)).toBe("");
  });
});

describe("yesNo", () => {
  test("maps booleans and numbers", () => {
    expect(yesNo(true)).toBe("Yes");
    expect(yesNo(false, true)).toBe("No");
    expect(yesNo(2)).toBe("Yes");
    expect(yesNo(0, true)).toBe("No");
  });
  test("maps known words", () => {
    expect(yesNo(" Completed ")).toBe("Yes");
    expect(yesNo("null", true)).toBe("No");
  });
  test("uses the fallback for empty or unknown text", () => {
    expect(yesNo("", true)).toBe("Yes");
    expect(yesNo(undefined)).toBe("No");
    expect(yesNo("maybe", true)).toBe("Yes");
    expect(yesNo("maybe")).toBe("No");
  });
});

describe("rayaOutcomeOrDerive", () => {
  const base = {
    contactStatus: "Completed",
    durationSec: 90,
    applied: false,
    jobsShown: false,
    engaged: false,
  };
  test("passes Raya's outcome through", () => {
    expect(rayaOutcomeOrDerive("  Callback ", base)).toBe("Callback");
  });
  test("derives a bucket when Raya gave none", () => {
    expect(rayaOutcomeOrDerive("", { ...base, contactStatus: "Pending" })).toBe("Pending");
    expect(rayaOutcomeOrDerive("", { ...base, durationSec: 0 })).toBe("No Answer");
    expect(rayaOutcomeOrDerive("", { ...base, engaged: true })).toBe("Completed");
    expect(rayaOutcomeOrDerive("", base)).toBe("Early Disconnect");
  });
});

describe("computeIntent", () => {
  const none = { applied: false, triedToApply: false, jobsShown: false, userIntent: "" };
  test("scores duration bands", () => {
    expect(computeIntent({ ...none, durationSec: 29 }).score).toBe(0);
    expect(computeIntent({ ...none, durationSec: 30 }).score).toBe(1);
    expect(computeIntent({ ...none, durationSec: 60 }).score).toBe(2);
    expect(computeIntent({ ...none, durationSec: 120 }).score).toBe(3);
    expect(computeIntent({ ...none, durationSec: 180 }).score).toBe(4);
  });
  test("adds application and engagement points with the master reasoning text", () => {
    expect(
      computeIntent({
        durationSec: 200,
        applied: true,
        triedToApply: true,
        jobsShown: true,
        userIntent: "wants a job",
      }),
    ).toEqual({
      score: 10,
      reasoning: "Duration 200s (+4)|Application (+4)|Engagement (+2) → 10/10",
    });
    expect(computeIntent({ ...none, durationSec: 0, triedToApply: true }).score).toBe(2);
  });
});

describe("campaignTypeFor", () => {
  test("builds PROGRAM_language_DayN", () => {
    expect(campaignTypeFor("seekers", "Hindi", "Day 4")).toBe("SEEKERS_Hindi_Day4");
    expect(campaignTypeFor("providers", "", "first")).toBe("PROVIDERS__Day1");
  });
});

describe("nextCampaignDayLabel", () => {
  test("returns the day after the highest number", () => {
    expect(nextCampaignDayLabel(["Day 2", null, "day 10", "x"])).toBe("Day 11");
  });
  test("starts at Day 1", () => {
    expect(nextCampaignDayLabel([])).toBe("Day 1");
  });
});
