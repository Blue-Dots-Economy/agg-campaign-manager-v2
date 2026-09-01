import { useMemo } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useProgram } from "@/programs/context";
import { useProgramAggregates, type OverviewFilters } from "@/programs/useProgramAggregates";
import { useDkbCampaignInsights } from "@/programs/useDkbCampaignInsights";
import type { DkbMetrics } from "@/components/metrics/program-overviews";

type Metrics = Partial<DkbMetrics> & Record<string, number | undefined>;

interface MetricSpec {
  key: string;
  label: string;
  compute: (m: Metrics) => number | null;
  format: (v: number) => string;
}

const SPECS: MetricSpec[] = [
  {
    key: "pickup",
    label: "Pickup rate",
    compute: (m) => rate(m.answeredCalls, m.totalCalls),
    format: pct,
  },
  {
    key: "productive",
    label: "Productive rate",
    compute: (m) => rate(m.productiveCalls, m.totalCalls),
    format: pct,
  },
  {
    key: "active_provider",
    label: "Active-provider rate",
    compute: (m) => rate(m.jobsActive, m.companiesCalled),
    format: pct,
  },
  {
    key: "new_jobs",
    label: "New-jobs-posted rate",
    compute: (m) => rate(m.newJobsPosted, m.companiesCalled),
    format: pct,
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
  deltaPct: number;
}

interface Props {
  campaign: string;
  region: string | null;
  filters?: Pick<OverviewFilters, "dateFrom" | "dateTo" | "channel">;
}

export function CampaignVerdictDkb({ campaign, region, filters }: Props) {
  const { config } = useProgram();
  const dateFrom = filters?.dateFrom ?? null;
  const dateTo = filters?.dateTo ?? null;
  const channel = filters?.channel ?? "all";

  const baselineState = region ?? "all";
  const regionLabel = region ?? "program";
  const scopeWord = region ? "region" : "program";

  const campaignAgg = useProgramAggregates(config, {
    state: "all",
    dateFrom,
    dateTo,
    campaignType: "all",
    campaign,
    channel,
  });
  const regionAgg = useProgramAggregates(config, {
    state: baselineState,
    dateFrom,
    dateTo,
    campaignType: "all",
    channel,
  });

  const causes = useDkbCampaignInsights(campaign, { dateFrom, dateTo });

  const { worked, didnt, phaseShare, sampleCalls } = useMemo(() => {
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
      sampleCalls: causes.data?.sampleCalls ?? 0,
    };
  }, [campaignAgg.data, regionAgg.data, causes.data]);

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

  const whyFor = (_f: Finding, side: "worked" | "didnt"): string | null => {
    if (side === "didnt") {
      const p = worstPhaseGap();
      if (!p) return null;
      return `${Math.round(p.camp)}% dropped at ${p.label} vs ${Math.round(p.reg)}% in ${scopeWord}.`;
    }
    const p = bestPhaseGap();
    if (!p) return null;
    return `only ${Math.round(p.camp)}% dropped at ${p.label} vs ${Math.round(p.reg)}% in ${scopeWord}.`;
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
        Based on {sampleCalls.toLocaleString()} calls · compared to {regionLabel} average.
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
