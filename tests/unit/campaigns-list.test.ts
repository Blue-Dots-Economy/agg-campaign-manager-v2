import { describe, expect, test } from "bun:test";
import {
  campaignKey,
  filterCampaigns,
  formatCampaignDate,
  paginate,
  parseCampaignDate,
  pct,
} from "@/lib/campaigns/list";

describe("parseCampaignDate and formatCampaignDate", () => {
  test("reads YYYY-MM-DD as a local date", () => {
    const d = parseCampaignDate("2026-03-09");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(9);
    expect(formatCampaignDate("2026-03-09")).toBe("Mar 9, 2026");
  });

  test("returns null or a dash for missing or malformed dates", () => {
    expect(parseCampaignDate(null)).toBeNull();
    expect(parseCampaignDate("")).toBeNull();
    expect(parseCampaignDate("2026-03")).toBeNull();
    expect(parseCampaignDate("09/03/2026")).toBeNull();
    expect(formatCampaignDate(null)).toBe("—");
  });
});

describe("pct", () => {
  test("rounds to one decimal", () => {
    expect(pct(1, 3)).toBe("33.3%");
    expect(pct(3, 3)).toBe("100%");
    expect(pct(0, 5)).toBe("0%");
  });

  test("returns a dash for a zero total", () => {
    expect(pct(4, 0)).toBe("—");
  });
});

describe("filterCampaigns", () => {
  const now = new Date(2026, 6, 15, 14, 30);
  const items = [
    { campaignType: "KKB_Hindi_Day1", campaignDate: "2026-07-10" },
    { campaignType: "KKB_Hindi_Day3", campaignDate: "2026-07-13" },
    { campaignType: "DKB_Kannada_Day2", campaignDate: "2026-07-15" },
    { campaignType: "KKB_Hindi_Day2", campaignDate: null },
    { campaignType: "KKB_Hindi_Day4", campaignDate: "2026-07-12" },
  ];

  test("sorts newest first and picks campaigns from the last two days", () => {
    const { recent, all } = filterCampaigns(items, "", now);
    expect(all.map((c) => c.campaignType)).toEqual([
      "DKB_Kannada_Day2",
      "KKB_Hindi_Day3",
      "KKB_Hindi_Day4",
      "KKB_Hindi_Day1",
      "KKB_Hindi_Day2",
    ]);
    expect(recent.map((c) => c.campaignType)).toEqual(["DKB_Kannada_Day2", "KKB_Hindi_Day3"]);
  });

  test("searches the raw and the readable campaign name", () => {
    expect(filterCampaigns(items, "kannada", now).all).toHaveLength(1);
    expect(filterCampaigns(items, "Hindi · Day 3", now).all.map((c) => c.campaignType)).toEqual([
      "KKB_Hindi_Day3",
    ]);
    expect(filterCampaigns(items, "kkb_hindi_day1", now).all).toHaveLength(1);
    expect(filterCampaigns(items, "nothing", now)).toEqual({ recent: [], all: [] });
  });

  test("does not change the input", () => {
    const copy = items.slice();
    filterCampaigns(items, "", now);
    expect(items).toEqual(copy);
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 25 }, (_, i) => i);

  test("returns the requested page", () => {
    expect(paginate(rows, 2, 12)).toEqual({
      pageRows: rows.slice(12, 24),
      page: 2,
      pageCount: 3,
    });
  });

  test("clamps to the last page and keeps one page for no rows", () => {
    expect(paginate(rows, 9, 12)).toEqual({ pageRows: [24], page: 3, pageCount: 3 });
    expect(paginate([], 1, 12)).toEqual({ pageRows: [], page: 1, pageCount: 1 });
  });
});

describe("campaignKey", () => {
  test("joins type and date", () => {
    expect(campaignKey({ campaignType: "A", campaignDate: "2026-01-01" })).toBe("A__2026-01-01");
    expect(campaignKey({ campaignType: "A", campaignDate: null })).toBe("A__nd");
  });
});
