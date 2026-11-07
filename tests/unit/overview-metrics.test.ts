import { describe, expect, test } from "bun:test";
import { dkbMetricsFrom, kkbMetricsFrom } from "../../src/components/metrics/overview-metrics";

describe("kkbMetricsFrom", () => {
  test("reads reported metrics and uses 0 for missing ones", () => {
    const m = kkbMetricsFrom({ totalCalls: 120, answeredSeekers: 40, unrelated: 9 });
    expect(m.totalCalls).toBe(120);
    expect(m.answeredSeekers).toBe(40);
    expect(m.providersConnectedSeekers).toBe(0);
    expect(Object.keys(m)).not.toContain("unrelated");
  });

  test("is all zeros for an empty snapshot", () => {
    expect(Object.values(kkbMetricsFrom({})).every((v) => v === 0)).toBe(true);
  });
});

describe("dkbMetricsFrom", () => {
  test("reads reported metrics and keeps the provider funnel", () => {
    const funnel = [{ key: "called", label: "Called", providers: 3, openings: 5, calls: 7 }];
    const m = dkbMetricsFrom({ companiesCalled: 12, jobsActive: 4 }, funnel);
    expect(m.companiesCalled).toBe(12);
    expect(m.jobsActive).toBe(4);
    expect(m.newJobsPosted).toBe(0);
    expect(m.providerFunnel).toEqual(funnel);
  });

  test("has no funnel when the snapshot has none", () => {
    expect(dkbMetricsFrom({}, undefined).providerFunnel).toBeUndefined();
  });
});
