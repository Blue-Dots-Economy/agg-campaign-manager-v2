// Campaign-run series and pooled conversion rates for the North Star trend chart.

/** One campaign data point as the overview passes it in. */
export interface NorthStarTrendPoint {
  label?: string;
  day?: string;
  date?: string;
  type?: string;
  language?: string;
  answered: number;
  high_intent: number;
  converted: number;
}

/** The three North Star conversion rates. */
export type NorthStarRateKey = "pickup_to_app" | "highintent_to_app" | "pickup_to_highintent";

/** One campaign run (date x type x language) with its counts and rates. */
export interface CampaignRun extends Record<NorthStarRateKey, number> {
  label: string;
  answered: number;
  high_intent: number;
  converted: number;
}

/** Pooled rate over several runs, with the sums and per-run parts for the tooltip. */
export interface PooledRate {
  rate: number;
  num: number;
  den: number;
  runs: number;
  parts: string[];
}

const pct = (n: number, d: number) => (d > 0 ? Number(((n / d) * 100).toFixed(1)) : 0);

/** Groups campaign points into one run per date, type and language, sorted by date. */
export function campaignRuns(campaigns: NorthStarTrendPoint[]): CampaignRun[] {
  const m = new Map<
    string,
    { date: string; label: string; answered: number; high_intent: number; converted: number }
  >();
  for (const p of campaigns) {
    const date = p.date || p.day || "";
    const bits = [p.type, p.language].filter(Boolean).join(" · ");
    const key = `${date}|${bits}`;
    const cur = m.get(key) ?? {
      date,
      label: bits ? `${date} ${bits}` : date || p.label || "—",
      answered: 0,
      high_intent: 0,
      converted: 0,
    };
    cur.answered += p.answered ?? 0;
    cur.high_intent += p.high_intent ?? 0;
    cur.converted += p.converted ?? 0;
    m.set(key, cur);
  }
  return [...m.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c) => ({
      label: c.label,
      answered: c.answered,
      high_intent: c.high_intent,
      converted: c.converted,
      pickup_to_app: pct(c.converted, c.answered),
      highintent_to_app: pct(c.converted, c.high_intent),
      pickup_to_highintent: pct(c.high_intent, c.answered),
    }));
}

/**
 * Pooled (weighted) rate over runs: sum of numerators over sum of denominators.
 * Runs with a zero denominator add nothing instead of counting as 0%.
 */
export function pooledRate(rows: CampaignRun[], key: NorthStarRateKey): PooledRate {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    if (key === "pickup_to_app") {
      num += r.converted;
      den += r.answered;
    } else if (key === "highintent_to_app") {
      num += r.converted;
      den += r.high_intent;
    } else {
      num += r.high_intent;
      den += r.answered;
    }
  }
  return {
    rate: den > 0 ? Number(((num / den) * 100).toFixed(1)) : 0,
    num,
    den,
    runs: rows.length,
    parts: rows.map((r) => {
      const n = key === "pickup_to_highintent" ? r.high_intent : r.converted;
      const d = key === "highintent_to_app" ? r.high_intent : r.answered;
      return `${r.label}: ${n}/${d}`;
    }),
  };
}
