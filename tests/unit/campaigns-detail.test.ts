import { describe, expect, test } from "bun:test";
import {
  CampaignSearchSchema,
  campaignOptionValue,
  findCampaign,
  parseCampaignOption,
  sortCampaignsNewestFirst,
} from "@/lib/campaigns/detail";

describe("CampaignSearchSchema", () => {
  test("keeps a date string and a known channel", () => {
    expect(CampaignSearchSchema.parse({ date: "2026-07-01", channel: "inbound" })).toEqual({
      date: "2026-07-01",
      channel: "inbound",
    });
    expect(CampaignSearchSchema.parse({ channel: "all" })).toEqual({ channel: "all" });
  });

  test("drops malformed values and unknown keys", () => {
    expect(CampaignSearchSchema.parse({ date: 20260701, channel: "email", extra: "x" })).toEqual({
      date: undefined,
      channel: undefined,
    });
    expect(CampaignSearchSchema.parse({})).toEqual({});
  });
});

describe("findCampaign", () => {
  const sorted = sortCampaignsNewestFirst([
    { campaignType: "KKB_Day1", campaignDate: "2026-07-01" },
    { campaignType: "KKB_Day1", campaignDate: "2026-07-05" },
    { campaignType: "KKB_Day2", campaignDate: null },
  ]);

  test("sorts newest first with undated campaigns last", () => {
    expect(sorted.map((c) => c.campaignDate)).toEqual(["2026-07-05", "2026-07-01", null]);
  });

  test("prefers the run on the given date", () => {
    expect(findCampaign(sorted, "KKB_Day1", "2026-07-01")?.campaignDate).toBe("2026-07-01");
  });

  test("falls back to the newest run when no date or no run on that date", () => {
    expect(findCampaign(sorted, "KKB_Day1", undefined)?.campaignDate).toBe("2026-07-05");
    expect(findCampaign(sorted, "KKB_Day1", "2026-01-01")?.campaignDate).toBe("2026-07-05");
  });

  test("returns undefined for an unknown campaign", () => {
    expect(findCampaign(sorted, "nope", undefined)).toBeUndefined();
    expect(findCampaign([], "KKB_Day1", undefined)).toBeUndefined();
  });
});

describe("campaign switcher values", () => {
  test("round-trips type and date", () => {
    const v = campaignOptionValue({ campaignType: "KKB_Day1", campaignDate: "2026-07-05" });
    expect(v).toBe("KKB_Day1 2026-07-05");
    expect(parseCampaignOption(v)).toEqual({ campaignType: "KKB_Day1", date: "2026-07-05" });
  });

  test("handles a campaign without a date", () => {
    const v = campaignOptionValue({ campaignType: "KKB_Day2", campaignDate: null });
    expect(v).toBe("KKB_Day2 ");
    expect(parseCampaignOption(v)).toEqual({ campaignType: "KKB_Day2", date: undefined });
    expect(parseCampaignOption("KKB_Day2")).toEqual({ campaignType: "KKB_Day2", date: undefined });
  });
});
