import { useMemo } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useProgram } from "@/programs/context";
import { useProgramAggregates, type OverviewFilters } from "@/programs/useProgramAggregates";
import { useCampaignInsights } from "@/programs/useCampaignInsights";
import type { ProgramMetricsRaw } from "@/lib/snapshot.functions";

type Metrics = ProgramMetricsRaw & Record<string, number | undefined>;

interface MetricSpec {
  key: string;
  label: string;
  compute: (m: Metrics) => number | null;
  format: (v: number) => string;
  /** Which side of the phaseShare gap makes sense for this metric.
   *  For rate-based drop metrics, we want the "highIntent" cause template. */
  useHighIntentCause?: boolean;
}

const SPECS: MetricSpec[] = [
  {
    key: "pickup",
    label: "Pickup rate",
    compute: (m) => rate(m.answeredCalls, m.totalCalls),
    format: pct,
  },
  {
    key: "engagement",
    label: "Engagement rate",
    compute: (m) => rate(m.engagedCalls, m.answeredCalls),
    format: pct,
  },
  {
    key: "productive",
    label: "Productive rate",
    compute: (m) => rate(m.productiveCalls, m.totalCalls),
    format: pct,
  },
  {
    key: "jobs_shown",
    label: "Jobs-shown rate",
    compute: (m) => rate(m.jobsShownCalls, m.answeredCalls),
    format: pct,
  },
  {
    key: "high_intent",
    label: "High-intent rate",
    compute: (m) => rate(m.highIntentCalls, m.answeredCalls),
    format: pct,
    useHighIntentCause: true,
  },
  {
    key: "application",
    label: "Application rate",
    compute: (m) => rate(m.appliedSeekers, m.answeredSeekers),
    format: pct,
    useHighIntentCause: true,
  },
  {
    key: "avg_duration",
    label: "Avg call duration",
    compute: (m) => (typeof m.avgDuration === "number" ? m.avgDuration : null),
    format: (v) => `${Math.round(v)}s`,
  },
];

function rate(num?: number, den?: number): number | null {
  if (!den || den <= 0) return null;
  return (num ?? 0) / den;
}
function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
function fmtDelta(deltaPct: number): string {
  const sign = deltaPct > 0 ? "+" : "";
  return `${sign}${Math.round(deltaPct * 100)}%`;
}

interface Finding {
  spec: MetricSpec;
  campaignVal: number;
  regionVal: number;
  deltaPct: number; // (campaign − region) / region
}

interface Props {
  campaign: string;
  region: string | null;
  filters?: Pick<OverviewFilters, "dateFrom" | "dateTo" | "channel">;
}

export function CampaignVerdict({ campaign, region, filters }: Props) {
  const { config } = useProgram();
  const dateFrom = filters?.dateFrom ?? null;
  const dateTo = filters?.dateTo ?? null;
  const channel = filters?.channel ?? "all";

  const campaignAgg = useProgramAggregates(config, {
    state: "all",
    dateFrom,
    dateTo,
    campaignType: "all",
    campaign,
    channel,
  });
  const regionAgg = useProgramAggregates(config, {
    state: region ?? "all",
    dateFrom,
    dateTo,
    campaignType: "all",
    channel,
  });
  const causes = useCampaignInsights(campaign, { dateFrom, dateTo });


  const { worked, didnt, phaseShare, hiTop, sampleCalls } = useMemo(() => {
    const cm = (campaignAgg.data?.metrics ?? {}) as Metrics;
    const rm = (regionAgg.data?.metrics ?? {}) as Metrics;
    const findings: Finding[] = [];
    for (const spec of SPECS) {
      const c = spec.compute(cm);
      const r = spec.compute(rm);
      if (c == null || r == null || r === 0) continue;
      const delta = (c - r) / r;
      if (Math.abs(delta) < 0.15) continue;
      findings.push({ spec, campaignVal: c, regionVal: r, deltaPct: delta });
    }
    const worked = findings
      .filter((f) => f.deltaPct > 0)
      .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
      .slice(0, 3);
    const didnt = findings
      .filter((f) => f.deltaPct < 0)
      .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
      .slice(0, 3);
    return {
      worked,
      didnt,
      phaseShare: causes.data?.phaseShare ?? [],
      hiTop: causes.data?.highIntentNonApply?.top ?? [],
      sampleCalls: causes.data?.sampleCalls ?? 0,
    };
  }, [campaignAgg.data, regionAgg.data, causes.data]);

  if (!region) return null;
  if (!campaignAgg.data || !regionAgg.data) return null;

  const worstPhaseGap = (): { label: string; camp: number; reg: number } | null => {
    let best: { label: string; camp: number; reg: number; gap: number } | null = null;
    for (const p of phaseShare) {
      const gap = p.campaignPct - p.regionPct;
      if (gap > 0 && (!best || gap > best.gap))
        best = { label: p.phaseLabel, camp: p.campaignPct, reg: p.regionPct, gap };
    }
    return best;
  };
  const bestPhaseGap = (): { label: string; camp: number; reg: number } | null => {
    let best: { label: string; camp: number; reg: number; gap: number } | null = null;
    for (const p of phaseShare) {
      const gap = p.regionPct - p.campaignPct;
      if (gap > 0 && (!best || gap > best.gap))
        best = { label: p.phaseLabel, camp: p.campaignPct, reg: p.regionPct, gap };
    }
    return best;
  };

  const whyFor = (f: Finding, side: "worked" | "didnt"): string | null => {
    if (side === "didnt" && f.spec.useHighIntentCause && hiTop.length > 0) {
      const t = hiTop[0];
      return `${Math.round(t.pct)}% of high-intent seekers dropped at ${t.phase} on '${t.reason}'.`;
    }
    if (side === "didnt") {
      const p = worstPhaseGap();
      if (!p) return null;
      return `${Math.round(p.camp)}% dropped at ${p.label} vs ${Math.round(p.reg)}% in region.`;
    }
    const p = bestPhaseGap();
    if (!p) return null;
    return `only ${Math.round(p.camp)}% dropped at ${p.label} vs ${Math.round(p.reg)}% in region.`;
  };

  return (
    <div className="space-y-2">
      <div className="grid gap-3 md:grid-cols-2">
        <VerdictCard
          side="worked"
          title="What worked well"
          findings={worked}
          whyFor={(f) => whyFor(f, "worked")}
        />
        <VerdictCard
          side="didnt"
          title="What didn't work"
          findings={didnt}
          whyFor={(f) => whyFor(f, "didnt")}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Based on {sampleCalls.toLocaleString()} calls · compared to {region} average.
      </p>
    </div>
  );
}

function VerdictCard({
  side,
  title,
  findings,
  whyFor,
}: {
  side: "worked" | "didnt";
  title: string;
  findings: Finding[];
  whyFor: (f: Finding) => string | null;
}) {
  const isGood = side === "worked";
  const tone = isGood
    ? "border-emerald-500/30 bg-emerald-500/5"
    : "border-rose-500/30 bg-rose-500/5";
  const iconColor = isGood ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  const chipTone = isGood
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  const Icon = isGood ? CheckCircle2 : AlertTriangle;

  return (
    <div className={`rounded-lg border ${tone} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">In line with region average.</p>
      ) : (
        <ul className="space-y-3">
          {findings.map((f) => {
            const why = whyFor(f);
            return (
              <li key={f.spec.key}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {f.spec.label}: {f.spec.format(f.campaignVal)}
                      <span className="text-muted-foreground font-normal">
                        {" "}vs {f.spec.format(f.regionVal)}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${chipTone}`}
                  >
                    {fmtDelta(f.deltaPct)}
                  </span>
                </div>
                {why && (
                  <div className="mt-0.5 text-xs text-muted-foreground">Why: {why}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
