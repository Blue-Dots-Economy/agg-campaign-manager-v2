import { describe, expect, test } from "bun:test";
import { numericMetrics } from "../../src/components/metrics/metric-values";

describe("numericMetrics", () => {
  test("keeps finite numbers and drops other values", () => {
    expect(
      numericMetrics({
        totalCalls: 10,
        answeredCalls: 0,
        program: "seekers",
        providerFunnel: [{ key: "a" }],
        broken: Number.NaN,
        missing: undefined,
      }),
    ).toEqual({ totalCalls: 10, answeredCalls: 0 });
  });

  test("returns an empty record for no metrics", () => {
    expect(numericMetrics(undefined)).toEqual({});
    expect(numericMetrics({})).toEqual({});
  });
});
