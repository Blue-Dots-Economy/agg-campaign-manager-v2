import { describe, expect, test } from "bun:test";
import type { CallRow } from "../../src/programs/data";
import {
  byCampaignDay,
  callOutcomeBreakdown,
  computeKpis,
  dropReasonBreakdown,
  intentDistribution,
  intentDistributionDkb,
  jobStatusBreakdown,
  phasesReachedBreakdown,
  regionSplit,
} from "../../src/programs/metrics";
import { providers, seekers } from "../../src/programs/registry";

function row(overrides: Partial<CallRow> = {}): CallRow {
  return {
    campaign_day: "Day 1",
    campaign_date: "2026-01-01",
    campaign_type: "outbound",
    language: "hi",
    call_id: "c1",
    phone: "",
    call_duration_seconds: 0,
    call_datetime_ist: "",
    call_outcome: "",
    call_answered: false,
    call_engaged: false,
    applied_to_job: false,
    applications_count: 0,
    jobs_shown: false,
    primary_topic: "",
    call_language: "",
    call_recording_url: "",
    final_summary: "",
    call_transcript: "",
    tried_to_apply: false,
    drop_reason: "",
    city_campaign: "",
    seeker_name: "",
    user_intent: "",
    jobs_recommended: [],
    jobs_applied: [],
    jobs_failed_to_apply: [],
    "Intent Score": 0,
    "Intent Score Reasoning": "",
    ...overrides,
  };
}

const dkb = (raw: Record<string, string>, overrides: Partial<CallRow> = {}) =>
  row({ raw, ...overrides });

describe("computeKpis", () => {
  test("seekers KPIs count answered, engaged, applications and high intent", () => {
    const rows = [
      row({ call_answered: true, call_engaged: true, applied_to_job: true, "Intent Score": 5 }),
      row({ call_answered: true, "Intent Score": 4 }),
      row(),
    ];
    expect(computeKpis(seekers, rows)).toEqual({
      total_calls: 3,
      answered_pct: 67,
      engaged_pct: 33,
      applications: 1,
      high_intent: 1,
    });
  });

  test("seekers KPIs are zero for no rows", () => {
    expect(computeKpis(seekers, [])).toEqual({
      total_calls: 0,
      answered_pct: 0,
      engaged_pct: 0,
      applications: 0,
      high_intent: 0,
    });
  });

  test("providers KPIs read the raw sheet columns", () => {
    const rows = [
      dkb({
        call_status: " Answered - human",
        job_status: "Active",
        new_job_posted: "YES",
        talent_insights_shown: "yes",
        intent_score: "7",
      }),
      dkb({ call_status: "completed", job_status: "closed", intent_score: "abc" }),
      dkb({ call_status: "no answer", job_status: "unverified", intent_score: "4" }),
      row(),
    ];
    expect(computeKpis(providers, rows)).toEqual({
      total_calls: 4,
      answered_pct: 50,
      jobs_verified: 2,
      new_jobs_posted: 1,
      high_intent: 1,
      talent_insights_shown: 1,
    });
  });
});

describe("byCampaignDay", () => {
  test("groups seekers rows by day, sorted by day number", () => {
    const rows = [
      row({ campaign_day: "Day 10", campaign_date: "d10", call_answered: true }),
      row({ campaign_day: "Day 2", campaign_date: "d2", applied_to_job: true, "Intent Score": 6 }),
      row({ campaign_day: "Day 2", call_engaged: true, call_answered: true }),
    ];
    expect(byCampaignDay(seekers, rows)).toEqual([
      {
        day: "Day 2",
        date: "d2",
        type: "outbound",
        language: "hi",
        rows: 2,
        answered: 1,
        engaged: 1,
        converted: 1,
        new_jobs: 0,
        answered_pct: 50,
        high_intent: 1,
      },
      {
        day: "Day 10",
        date: "d10",
        type: "outbound",
        language: "hi",
        rows: 1,
        answered: 1,
        engaged: 0,
        converted: 0,
        new_jobs: 0,
        answered_pct: 100,
        high_intent: 0,
      },
    ]);
  });

  test("providers days count new jobs from the raw columns", () => {
    const rows = [
      dkb({ call_status: "answered", new_job_posted: "yes", intent_score: "5" }),
      dkb({ call_status: "busy" }),
    ];
    const [day] = byCampaignDay(providers, rows);
    expect(day).toMatchObject({
      rows: 2,
      answered: 1,
      converted: 1,
      new_jobs: 1,
      answered_pct: 50,
      high_intent: 1,
    });
  });

  test("returns no days for no rows", () => {
    expect(byCampaignDay(seekers, [])).toEqual([]);
  });
});

describe("phasesReachedBreakdown", () => {
  test("normalises phase labels and counts the rest as not reached", () => {
    const rows = [
      dkb({ phases_reached: "phase  2" }),
      dkb({ phases_reached: "PHASE 2" }),
      dkb({ phases_reached: "Phase 4" }),
      dkb({ phases_reached: "Phase 5" }),
      dkb({}),
      row(),
    ];
    expect(phasesReachedBreakdown(rows)).toEqual([
      { phase: "Phase 1", count: 0 },
      { phase: "Phase 2", count: 2 },
      { phase: "Phase 3", count: 0 },
      { phase: "Phase 4", count: 1 },
      { phase: "Not reached", count: 3 },
    ]);
  });
});

describe("jobStatusBreakdown", () => {
  test("matches known statuses case-insensitively, adds unknown ones, empty is not called", () => {
    const rows = [
      dkb({ job_status: "active" }),
      dkb({ job_status: "WRONG NUMBER" }),
      dkb({ job_status: "Paused" }),
      dkb({}),
    ];
    expect(jobStatusBreakdown(rows)).toEqual([
      { status: "Unverified", count: 0 },
      { status: "Active", count: 1 },
      { status: "Closed", count: 0 },
      { status: "Not Called", count: 1 },
      { status: "Wrong Number", count: 1 },
      { status: "Paused", count: 1 },
    ]);
  });
});

describe("callOutcomeBreakdown", () => {
  test("prefers the raw column, falls back to call_outcome, skips empty", () => {
    const rows = [
      dkb({ call_outcome: "completed" }),
      dkb({}, { call_outcome: "No Answer" }),
      dkb({ call_outcome: "Voicemail" }),
      row(),
    ];
    expect(callOutcomeBreakdown(rows)).toEqual([
      { outcome: "Early Disconnect", count: 0 },
      { outcome: "No Answer", count: 1 },
      { outcome: "Completed", count: 1 },
      { outcome: "Callback Requested", count: 0 },
      { outcome: "Failure", count: 0 },
      { outcome: "Voicemail", count: 1 },
    ]);
  });
});

describe("intentDistributionDkb", () => {
  test("rounds and clamps scores to 0..10 and skips non-numbers", () => {
    const rows = [
      dkb({ intent_score: "4.6" }),
      dkb({ intent_score: "12" }),
      dkb({ intent_score: "-3" }),
      dkb({ intent_score: "x" }),
      row(),
    ];
    const counts = Object.fromEntries(intentDistributionDkb(rows).map((b) => [b.score, b.count]));
    expect(counts).toEqual({
      "0": 2,
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 1,
      "6": 0,
      "7": 0,
      "8": 0,
      "9": 0,
      "10": 1,
    });
  });
});

describe("dropReasonBreakdown", () => {
  test("counts configured reasons and puts unknown ones under other", () => {
    const rows = [
      row({ drop_reason: "early_hangup" }),
      row({ drop_reason: "mystery" }),
      row({ drop_reason: "other" }),
      row(),
    ];
    expect(dropReasonBreakdown(seekers, rows)).toEqual([
      { reason: "early_hangup", count: 1 },
      { reason: "user_declined", count: 0 },
      { reason: "no_matching_jobs", count: 0 },
      { reason: "apply_failed", count: 0 },
      { reason: "profile_loop", count: 0 },
      { reason: "other", count: 2 },
    ]);
  });
});

describe("intentDistribution", () => {
  test("buckets 0..10 and keeps out-of-range scores as extra buckets", () => {
    const rows = [
      row({ "Intent Score": 3 }),
      row({ "Intent Score": 3 }),
      row({ "Intent Score": 11 }),
    ];
    const result = intentDistribution(rows);
    expect(result).toHaveLength(12);
    expect(result.find((b) => b.score === "3")?.count).toBe(2);
    expect(result.find((b) => b.score === "11")?.count).toBe(1);
    expect(result.find((b) => b.score === "0")?.count).toBe(0);
  });
});

describe("regionSplit", () => {
  test("counts by trimmed city, empty as Unknown, sorted by name", () => {
    const rows = [
      row({ city_campaign: " Hubli " }),
      row({ city_campaign: "Belgavi" }),
      row({ city_campaign: "Hubli" }),
      row(),
    ];
    expect(regionSplit(rows)).toEqual([
      { region: "Belgavi", count: 1 },
      { region: "Hubli", count: 2 },
      { region: "Unknown", count: 1 },
    ]);
  });
});
