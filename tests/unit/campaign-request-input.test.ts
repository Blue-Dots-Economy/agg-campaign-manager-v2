import { describe, expect, test } from "bun:test";
import {
  campaignRequestListSchema,
  campaignRequestPatchSchema,
  campaignRequestSchema,
  campaignRequestStatusSchema,
} from "../../src/lib/campaign-request-input";
import { MAX_CONTACTS_PER_BATCH } from "../../src/server/validation";

const request = {
  program: "seekers",
  agent_id: "agent-1",
  agent_name: "Asha",
  batch_name: "GZB Day 1",
  campaign_day: "Day 1",
  campaign_date: "2026-11-07",
  campaign_type: "normal",
  region: "GZB",
  language: "Hindi",
  city_campaign: "Ghaziabad",
  channel: "outbound",
  source: "cohort",
  cohort_intent: "drive",
  cohort_filters: { profileStatuses: ["Pending"] },
  contacts: [
    { contact_name: "A", contact_phone: "9999999999", country_code: "91", _region: "GZB" },
  ],
  schedule: { timezone: "Asia/Kolkata", start_time: "10:00", end_time: "18:00", days: ["mon"] },
  concurrency: null,
  max_retries: null,
  retry_after_hrs: null,
  selected_statuses: ["Pending"],
  note: null,
};

describe("campaignRequestSchema", () => {
  test("accepts the request the request page sends", () => {
    expect<unknown>(campaignRequestSchema.parse(request)).toEqual(request);
  });

  test("accepts the launch page request without optional fields", () => {
    const { note: _note, agent_name: _name, ...rest } = request;
    expect(campaignRequestSchema.safeParse({ ...rest, concurrency: 5 }).success).toBe(true);
  });

  test("refuses a missing agent, no contacts, an unknown program and too many contacts", () => {
    expect(campaignRequestSchema.safeParse({ ...request, agent_id: " " }).success).toBe(false);
    expect(campaignRequestSchema.safeParse({ ...request, contacts: [] }).success).toBe(false);
    expect(campaignRequestSchema.safeParse({ ...request, program: "kkb" }).success).toBe(false);
    const contacts = Array.from({ length: MAX_CONTACTS_PER_BATCH + 1 }, () => ({ a: "1" }));
    expect(campaignRequestSchema.safeParse({ ...request, contacts }).success).toBe(false);
  });

  test("drops keys the caller may not set", () => {
    const out = campaignRequestSchema.parse({ ...request, status: "approved", requested_by: "x" });
    expect(out).not.toHaveProperty("status");
    expect(out).not.toHaveProperty("requested_by");
  });
});

describe("campaignRequestPatchSchema", () => {
  const patch = {
    schedule: { timezone: "Asia/Kolkata", start_time: "09:00", end_time: "17:00", days: [] },
    concurrency: 4,
    max_retries: 2,
    retry_after_hrs: 6,
    selected_statuses: ["Pending", "Failed"],
    batch_name: "Renamed",
    campaign_day: "Day 2",
    campaign_date: "2026-11-08",
  };

  test("keeps the eight editable fields", () => {
    expect(campaignRequestPatchSchema.parse(patch)).toEqual(patch);
  });

  test("accepts a partial patch, as the review page sends", () => {
    const { batch_name: _b, campaign_day: _d, campaign_date: _c, ...partial } = patch;
    expect(campaignRequestPatchSchema.parse(partial)).toEqual(partial);
    expect(campaignRequestPatchSchema.parse({})).toEqual({});
  });

  test("drops fields a reviewer may not change", () => {
    const out = campaignRequestPatchSchema.parse({
      ...patch,
      status: "approved",
      program: "providers",
      contacts: [],
      requested_by: "someone@example.com",
      reviewer_email: "x@example.com",
      updated_at: "2020-01-01",
    });
    expect(out).toEqual(patch);
  });

  test("refuses wrong types", () => {
    expect(campaignRequestPatchSchema.safeParse({ concurrency: "4" }).success).toBe(false);
    expect(campaignRequestPatchSchema.safeParse({ concurrency: -1 }).success).toBe(false);
    expect(campaignRequestPatchSchema.safeParse({ batch_name: null }).success).toBe(false);
    expect(campaignRequestPatchSchema.safeParse({ selected_statuses: "Pending" }).success).toBe(
      false,
    );
    expect(campaignRequestPatchSchema.safeParse({ schedule: [] }).success).toBe(false);
  });
});

describe("campaignRequestListSchema", () => {
  test("accepts no filter, a status and a program", () => {
    expect(campaignRequestListSchema.parse(undefined)).toEqual({});
    expect(campaignRequestListSchema.parse({})).toEqual({});
    expect(campaignRequestListSchema.parse({ status: "pending", program: "seekers" })).toEqual({
      status: "pending",
      program: "seekers",
    });
  });

  test("refuses an unknown status", () => {
    expect(campaignRequestListSchema.safeParse({ status: "all" }).success).toBe(false);
  });
});

describe("campaignRequestStatusSchema", () => {
  test("needs a uuid and a known status", () => {
    const id = "6f1c1f9e-2a6b-4c1e-9a7e-1d2c3b4a5f60";
    expect(campaignRequestStatusSchema.safeParse({ id, status: "approved" }).success).toBe(true);
    expect(campaignRequestStatusSchema.safeParse({ id: "1", status: "approved" }).success).toBe(
      false,
    );
    expect(campaignRequestStatusSchema.safeParse({ id, status: "launched" }).success).toBe(false);
  });
});
