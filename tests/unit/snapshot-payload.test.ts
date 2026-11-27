import { describe, expect, test } from "bun:test";
import {
  all,
  campaignArgs,
  dropArgs,
  emptyAggregates,
  emptyPayload,
  failedPayload,
  AGGREGATES_UNAVAILABLE,
  funnelArgs,
  normalizeAggregates,
  normalizeCallOutcomes,
  normalizeCampaignDropCauses,
  normalizeCampaignList,
  normalizeDkbCampaignCauses,
  normalizeDropAnalysis,
  normalizeFilterOptions,
  normalizeFunnelCallIds,
  normalizeFunnelDurations,
  normalizeMetricGroups,
  normalizeMetricsRaw,
  toAggregatePayload,
} from "../../src/lib/snapshot-payload";

describe("filter arguments", () => {
  test("all maps empty and missing values to 'all'", () => {
    expect(all(undefined)).toBe("all");
    expect(all("")).toBe("all");
    expect(all("all")).toBe("all");
    expect(all("KA")).toBe("KA");
  });

  test("dropArgs fills defaults and keeps dates and campaign as given", () => {
    expect(dropArgs({})).toEqual({
      state: "all",
      dateFrom: undefined,
      dateTo: undefined,
      campaignType: "all",
      campaign: undefined,
      channel: "all",
    });
    expect(
      dropArgs({
        state: "GZB",
        dateFrom: "2026-01-01",
        dateTo: null,
        campaignType: "normal",
        campaign: "Day 3",
        channel: "inbound",
      }),
    ).toEqual({
      state: "GZB",
      dateFrom: "2026-01-01",
      dateTo: null,
      campaignType: "normal",
      campaign: "Day 3",
      channel: "inbound",
    });
  });

  test("funnelArgs adds the program to the drop filters", () => {
    expect(funnelArgs({ program: "seekers", state: "KA" })).toEqual({
      program: "seekers",
      ...dropArgs({ state: "KA" }),
    });
  });

  test("campaignArgs keeps the campaign and fills defaults", () => {
    expect(campaignArgs({ campaign: "Day 1" })).toEqual({
      campaign: "Day 1",
      state: "all",
      dateFrom: undefined,
      dateTo: undefined,
      channel: "all",
    });
  });
});

describe("normalizeAggregates", () => {
  test("returns empty aggregates for non-objects", () => {
    expect(normalizeAggregates(null)).toEqual(emptyAggregates());
    expect(normalizeAggregates("x")).toEqual(emptyAggregates());
  });

  test("mirrors total_rows and total_calls", () => {
    expect(normalizeAggregates({ kpis: { total_rows: 7 } }).kpis).toEqual({
      total_rows: 7,
      total_calls: 7,
    });
    expect(normalizeAggregates({ kpis: { total_calls: 4 } }).kpis).toEqual({
      total_rows: 4,
      total_calls: 4,
    });
    expect(normalizeAggregates({ kpis: { total_rows: 1, total_calls: 2 } }).kpis).toEqual({
      total_rows: 1,
      total_calls: 2,
    });
  });

  test("keeps arrays and replaces anything else with []", () => {
    const perDay = [{ day: "Day 1", rows: 3 }];
    const out = normalizeAggregates({ perDay, drops: "nope", regions: [{ region: "KA" }] });
    expect(out.perDay).toEqual([
      {
        day: "Day 1",
        date: "",
        type: "",
        language: "",
        rows: 3,
        answered: 0,
        engaged: 0,
        converted: 0,
        new_jobs: 0,
        answered_pct: 0,
        high_intent: 0,
      },
    ]);
    expect(out.drops).toEqual([]);
    expect(out.regions).toEqual([{ region: "KA", count: 0 }]);
  });

  test("drops list entries that are not objects and fills fields of the wrong type", () => {
    const out = normalizeAggregates({
      drops: [null, 3, { reason: 7, count: "2" }, { reason: "busy", count: 4 }],
    });
    expect(out.drops).toEqual([
      { reason: "", count: 0 },
      { reason: "busy", count: 4 },
    ]);
  });

  test("cleans drop analysis entries", () => {
    const out = normalizeAggregates({
      dropAnalysis: [
        null,
        { stage: "intro", reason: "busy", byRegion: { KA: 2, GZB: "x", MH: Infinity }, total: 5 },
        { stage: 3, byRegion: null, total: "7" },
      ],
    });
    expect(out.dropAnalysis).toEqual([
      { stage: "intro", reason: "busy", byRegion: { KA: 2 }, total: 5 },
      { stage: "3", reason: "", byRegion: {}, total: 0 },
    ]);
  });
});

describe("normalizeMetricsRaw", () => {
  test("keeps finite numbers, numeric strings, program and the provider funnel", () => {
    expect(normalizeMetricsRaw(null)).toEqual({});
    expect(
      normalizeMetricsRaw({
        program: "seekers",
        a: 3,
        b: "4.5",
        c: "",
        d: "abc",
        e: NaN,
        f: { nested: 1 },
        providerFunnel: [null, { key: "k", label: 2, providers: "3", openings: null, calls: "x" }],
      }),
    ).toEqual({
      program: "seekers",
      a: 3,
      b: 4.5,
      providerFunnel: [{ key: "k", label: "2", providers: 3, openings: 0, calls: 0 }],
    });
  });

  test("ignores a provider funnel that is not an array", () => {
    expect(normalizeMetricsRaw({ providerFunnel: "x" })).toEqual({});
  });
});

describe("normalizeMetricGroups", () => {
  test("returns [] for non-arrays", () => {
    expect(normalizeMetricGroups({})).toEqual([]);
  });

  test("fills strings, defaults unknown accents to blue and drops non-objects", () => {
    expect(
      normalizeMetricGroups([
        null,
        {
          key: "g",
          title: "Group",
          subtitle: "",
          cards: [
            { key: "c", label: "L", value: 5, sub: null, accent: "red" },
            { key: "d", accent: "pink" },
            7,
          ],
        },
        { key: 1, subtitle: "S", cards: "x" },
      ]),
    ).toEqual([
      {
        key: "g",
        title: "Group",
        subtitle: undefined,
        cards: [
          { key: "c", label: "L", value: "5", sub: "", accent: "red" },
          { key: "d", label: "", value: "", sub: "", accent: "blue" },
        ],
      },
      { key: "1", title: "", subtitle: "S", cards: [] },
    ]);
  });
});

describe("emptyPayload", () => {
  test("chooses the empty reason from the connection count", () => {
    expect(emptyPayload(0, null).emptyReason).toBe("no_connections");
    expect(emptyPayload(2, null).emptyReason).toBe("no_snapshot");
    expect(emptyPayload(2, null, "boom", "no_results")).toMatchObject({
      emptyReason: "no_results",
      error: "boom",
      syncStatus: "idle",
      lastSyncedAt: null,
    });
  });
});

describe("toAggregatePayload", () => {
  test("is empty when there are no stored calls", () => {
    expect(
      toAggregatePayload({ connectionCount: 3, syncStatus: "ok" }, { calls: 0, lastCallAt: null }),
    ).toEqual(emptyPayload(3, { last_synced_at: null, status: "ok" }, undefined, "no_snapshot"));
    expect(toAggregatePayload(null, { calls: 0, lastCallAt: null }).emptyReason).toBe(
      "no_connections",
    );
  });

  test("uses the filtered KPI count, not the stored call count", () => {
    const out = toAggregatePayload(
      {
        connectionCount: 1,
        aggregates: { kpis: { total_rows: 12 }, perDay: [{ day: "Day 1" }] },
        metricGroups: [],
        metrics: { a: 1 },
      },
      { calls: 50, lastCallAt: "2026-11-01T00:00:00Z" },
    );
    expect(out).toMatchObject({
      source: "snapshot",
      hasSnapshot: true,
      totalRows: 12,
      snapshotRowCount: 50,
      connectionCount: 1,
      lastSyncedAt: "2026-11-01T00:00:00Z",
      syncStatus: "idle",
      metrics: { a: 1 },
      campaigns: [{ day: "Day 1" }],
      emptyReason: undefined,
    });
  });

  test("marks a filter that matches nothing as no_results", () => {
    const out = toAggregatePayload({ aggregates: {} }, { calls: 5, lastCallAt: null });
    expect(out.totalRows).toBe(0);
    expect(out.emptyReason).toBe("no_results");
  });
});

describe("normalizeDropAnalysis", () => {
  test("returns the empty payload for non-objects", () => {
    expect(normalizeDropAnalysis(null)).toEqual({
      stages: [],
      buckets: [],
      maxCell: 0,
      grandTotal: 0,
    });
  });

  test("cleans each bucket of the matrix", () => {
    const out = normalizeDropAnalysis({
      buckets: [
        {
          bucket: "Low",
          byStage: { intro: 2, jobs: "x" },
          total: 2,
          raw: [{ reason: "busy", count: 2 }, null],
        },
        "bad",
      ],
    });
    expect(out.buckets).toEqual([
      { bucket: "Low", byStage: { intro: 2 }, total: 2, raw: [{ reason: "busy", count: 2 }] },
    ]);
  });

  test("keeps arrays, coerces numbers and keeps safeguardingFlagged only when present", () => {
    const stages = [{ key: "a", label: "A" }];
    expect(
      normalizeDropAnalysis({ stages, buckets: "x", maxCell: "4", grandTotal: "nope" }),
    ).toEqual({ stages, buckets: [], maxCell: 4, grandTotal: 0, safeguardingFlagged: undefined });
    expect(normalizeDropAnalysis({ safeguardingFlagged: "2" }).safeguardingFlagged).toBe(2);
    expect(normalizeDropAnalysis({ safeguardingFlagged: "x" }).safeguardingFlagged).toBe(0);
  });
});

describe("normalizeCampaignList", () => {
  test("maps each object and drops the rest", () => {
    expect(normalizeCampaignList({})).toEqual([]);
    expect(
      normalizeCampaignList([
        null,
        { campaignType: "Day 1", campaignDate: "", region: "KA", totalCalls: "9", answered: "x" },
      ]),
    ).toEqual([
      {
        campaignType: "Day 1",
        campaignDate: null,
        language: null,
        region: "KA",
        totalCalls: 9,
        answered: 0,
        engaged: 0,
        highIntent: 0,
        converted: 0,
      },
    ]);
  });
});

describe("campaign causes", () => {
  test("normalizeCampaignDropCauses fills defaults", () => {
    expect(normalizeCampaignDropCauses(null)).toEqual({
      sampleCalls: 0,
      region: null,
      highIntentNonApply: { segment: 0, top: [] },
      phaseShare: [],
    });
    const top = [{ phase: "p", reason: "r", count: 1, pct: 10 }];
    expect(
      normalizeCampaignDropCauses({
        sampleCalls: "3",
        region: "KA",
        highIntentNonApply: { segment: 2, top },
        phaseShare: null,
      }),
    ).toEqual({
      sampleCalls: 3,
      region: "KA",
      highIntentNonApply: { segment: 2, top },
      phaseShare: [],
    });
  });

  test("normalizeDkbCampaignCauses fills defaults", () => {
    expect(normalizeDkbCampaignCauses(undefined)).toEqual({
      sampleCalls: 0,
      region: null,
      phaseShare: [],
    });
    const phaseShare = [{ phaseKey: "a", phaseLabel: "A", campaignPct: 1, regionPct: 2 }];
    expect(normalizeDkbCampaignCauses({ sampleCalls: 4, phaseShare })).toEqual({
      sampleCalls: 4,
      region: null,
      phaseShare,
    });
  });
});

describe("funnel results", () => {
  test("normalizeFunnelCallIds stringifies ids and falls back to their count", () => {
    expect(normalizeFunnelCallIds(null)).toEqual({ count: 0, ids: [] });
    expect(normalizeFunnelCallIds({ ids: [1, "b"] })).toEqual({ count: 2, ids: ["1", "b"] });
    expect(normalizeFunnelCallIds({ count: 10, ids: ["a"] })).toEqual({ count: 10, ids: ["a"] });
    expect(normalizeFunnelCallIds({ count: "x", ids: ["a"] })).toEqual({ count: 1, ids: ["a"] });
  });

  test("normalizeFunnelDurations keeps finite numbers", () => {
    expect(normalizeFunnelDurations(null)).toEqual({});
    expect(normalizeFunnelDurations({ a: 1, b: "2", c: "x", d: null })).toEqual({
      a: 1,
      b: 2,
      d: 0,
    });
  });
});

describe("normalizeCallOutcomes", () => {
  test("sorts by count, highest first, and fills defaults", () => {
    expect(normalizeCallOutcomes("x")).toEqual([]);
    expect(normalizeCallOutcomes([{ outcome: "a", n: 1 }, { n: "5" }, { outcome: "c" }])).toEqual([
      { outcome: "Unknown", n: 5 },
      { outcome: "a", n: 1 },
      { outcome: "c", n: 0 },
    ]);
  });
});

describe("normalizeFilterOptions", () => {
  test("keeps non-blank strings only", () => {
    expect(normalizeFilterOptions(null)).toEqual({ cities: [], campaignTypes: [], channels: [] });
    expect(
      normalizeFilterOptions({ cities: ["KA", " ", 3, ""], campaignTypes: "x", channels: ["in"] }),
    ).toEqual({ cities: ["KA"], campaignTypes: [], channels: ["in"] });
  });
});

describe("failedPayload", () => {
  test("returns an empty payload with a generic message, never the cause text", () => {
    const p = failedPayload();
    expect(p.source).toBe("empty");
    expect(p.totalRows).toBe(0);
    expect(p.error).toBe(AGGREGATES_UNAVAILABLE);
    expect(JSON.stringify(p)).not.toContain("password");
  });
});
