// Numeric view of the snapshot metrics record that the dashboards read by field name.

/** Metric values by name; a missing name means the snapshot did not report that metric. */
export type MetricValues = Partial<Record<string, number>>;

/** Keeps the finite numeric values of a snapshot metrics record and drops everything else. */
export function numericMetrics(raw: Readonly<Record<string, unknown>> | undefined): MetricValues {
  const out: MetricValues = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}
