import { describe, expect, test } from "bun:test";
import { parseCampaignsView, readSavedCampaignsView } from "@/lib/campaigns/view-preference";

describe("parseCampaignsView", () => {
  test("accepts the two known layouts", () => {
    expect(parseCampaignsView("list")).toBe("list");
    expect(parseCampaignsView("calendar")).toBe("calendar");
  });

  test("returns null for missing or unknown values", () => {
    expect(parseCampaignsView(null)).toBeNull();
    expect(parseCampaignsView("")).toBeNull();
    expect(parseCampaignsView("List")).toBeNull();
  });
});

describe("readSavedCampaignsView", () => {
  test("returns null outside a browser", () => {
    expect(readSavedCampaignsView()).toBeNull();
  });
});
