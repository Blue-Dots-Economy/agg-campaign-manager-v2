import { useMemo } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  useProgramAggregates,
  useKkbDropAnalysis,
  useDkbDropAnalysis,
  useFunnelDurations,
  useKkbCallOutcomes,
} from "@/programs/useProgramAggregates";
import type { ProgramConfig } from "@/programs/registry";
import { KpiCard } from "@/components/KpiCard";
import {
  KkbOverviewMetrics,
  DkbOverviewMetrics,
  type KkbMetrics,
  type DkbMetrics,
} from "@/components/metrics/program-overviews";
import { Panel } from "@/components/Panel";
import { NoDataState, LoadingState } from "@/components/EmptyState";
import { DropAnalysisHeatmap } from "@/components/metrics/DropAnalysisHeatmap";
import { NorthStarMetrics } from "@/components/metrics/NorthStarMetrics";
import { NorthStarTrend } from "@/components/metrics/NorthStarTrend";
import { fetchFunnelCallIds } from "@/lib/snapshot.functions";
import { fetchAllReviewedCallIds } from "@/lib/review.functions";
import { useAuth } from "@/auth/context";
import type { OverviewFilterValue } from "@/components/metrics/OverviewFilters";
import { numericMetrics } from "@/components/metrics/metric-values";
import {
  intentBuckets,
  previousPeriodFilters,
  rollupPerDay,
} from "@/components/metrics/program-analytics";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const PIE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-muted-foreground)",
];

const tooltipStyle = {
  contentStyle: {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 12,
  },
} as const;

export interface ProgramAnalyticsProps {
  config: ProgramConfig;
  filters: OverviewFilterValue;
  onClearFilters?: () => void;
  /** Exact campaign_type value — scopes the whole view to one campaign. */
  campaign?: string | null;
  /** Replace previous-period baseline with a state-average baseline. */
  comparison?: {
    mode: "state-average";
    region: string | null; // 'GZB' | 'KA' | null = all
    label: string; // e.g. "vs GZB avg"
  };
}

export function ProgramAnalytics({
  config,
  filters,
  onClearFilters,
  campaign,
  comparison,
}: ProgramAnalyticsProps) {
  const isDkb = config.id === "providers";
  const navigate = useNavigate();
  const scopedFilters = campaign ? { ...filters, campaign } : filters;
  const query = useProgramAggregates(config, scopedFilters);
  const dropAnalysisQuery = useKkbDropAnalysis(isDkb ? undefined : scopedFilters);
  const dkbDropAnalysisQuery = useDkbDropAnalysis(isDkb ? scopedFilters : undefined);
  const durationsQuery = useFunnelDurations(config, scopedFilters);
  const stageDurations = durationsQuery.data ?? {};
  const callOutcomes = useKkbCallOutcomes(scopedFilters, !isDkb);
  const data = query.data;

  // Previous-period baseline (default behavior, used only when no comparison override).
  const prevFilters = comparison ? null : previousPeriodFilters(filters);
  const prevQuery = useProgramAggregates(
    config,
    prevFilters ?? {
      state: filters.state,
      dateFrom: null,
      dateTo: null,
      campaignType: filters.campaignType,
      channel: filters.channel,
    },
  );

  // State-average baseline (Campaign Review).
  const stateAvgFilters = comparison
    ? {
        state: comparison.region ?? "all",
        dateFrom: null,
        dateTo: null,
        campaignType: "all",
        channel: filters.channel,
      }
    : { state: "all", dateFrom: null, dateTo: null, campaignType: "all", channel: filters.channel };
  const stateAvgQuery = useProgramAggregates(config, stateAvgFilters);

  const prevMetrics = comparison
    ? stateAvgQuery.data?.metrics
    : prevFilters
      ? prevQuery.data?.metrics
      : undefined;

  const perDay = data?.aggregates?.perDay;
  const perDayRollup = useMemo(() => rollupPerDay(perDay ?? []), [perDay]);

  const fetchIds = useServerFn(fetchFunnelCallIds);
  const fetchAllReviewed = useServerFn(fetchAllReviewedCallIds);
  const { session } = useAuth();

  if (query.isLoading && !data) return <LoadingState />;

  const hasActiveFilters =
    filters.state !== "all" ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo) ||
    (!isDkb && filters.campaignType !== "all");
  const isEmpty = !data || data.source === "empty" || data.totalRows === 0;
  if (isEmpty) {
    const reason = data?.emptyReason ?? (hasActiveFilters ? "no_results" : "no_connections");
    return (
      <NoDataState reason={reason} onClearFilters={hasActiveFilters ? onClearFilters : undefined} />
    );
  }

  const { kpis, intents, regions, phases, jobStatus, outcomes, dkbIntents } = data.aggregates;
  const metrics = data.metrics ?? {};
  const hasMetrics = Object.keys(metrics).length > 0;
  const prevKpis = comparison
    ? stateAvgQuery.data?.aggregates?.kpis
    : prevFilters
      ? prevQuery.data?.aggregates?.kpis
      : undefined;

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the snapshot metrics record holds the overview fields by name; the overview reads absent ones as missing
  const overviewMetrics = metrics as unknown as KkbMetrics & DkbMetrics;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- same record shape as overviewMetrics, for the comparison period
  const overviewPrevious = prevMetrics as unknown as (KkbMetrics & DkbMetrics) | undefined;
  const comparisonLabel = comparison ? `vs ${comparison.label} avg` : undefined;

  const handleStageClick = async (stage: string, action: "copy" | "review") => {
    if (action === "review" && (session?.email ?? "").toLowerCase() === "admin@bluedots.com") {
      toast.error("Reviewing is disabled for the shared admin account.", {
        description: "Sign in with your own email to review calls.",
      });
      return;
    }
    let ids: string[] = [];
    try {
      const res = await fetchIds({
        data: {
          program: config.id,
          state: filters.state,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          campaignType: filters.campaignType,
          campaign: campaign ?? null,
          stage,
          channel: filters.channel,
        },
      });
      ids = res?.ids ?? [];
    } catch {
      toast.error("Couldn't fetch call IDs");
      return;
    }
    if (!ids.length) {
      toast.message("No call IDs for this stage");
      return;
    }
    if (action === "review") {
      let queue = ids;
      try {
        const reviewed = await fetchAllReviewed({
          data: { program: config.id },
        });
        const done = new Set(reviewed);
        const remaining = ids.filter((id) => !done.has(id));
        if (remaining.length === 0) {
          toast.success(
            `All ${ids.length.toLocaleString()} call${ids.length === 1 ? "" : "s"} in this cohort have already been reviewed`,
          );
          return;
        }
        queue = remaining;
      } catch {
        /* if the lookup fails, fall back to the full cohort */
      }
      const skipped = ids.length - queue.length;
      try {
        window.sessionStorage.setItem("bulk_review_queue", JSON.stringify(queue));
      } catch {
        /* ignore */
      }
      toast.success(
        `Reviewing ${queue.length.toLocaleString()} call${queue.length === 1 ? "" : "s"}`,
        skipped > 0
          ? { description: `Resuming — ${skipped.toLocaleString()} already reviewed are skipped.` }
          : undefined,
      );
      const first = queue[0];
      if (!first) return;
      await navigate({ to: "/review/$callId", params: { callId: first }, search: { bulk: "1" } });
      return;
    }
    const ok = await copyText(ids.join(", "));
    if (ok) {
      toast.success(`Copied ${ids.length.toLocaleString()} call ID${ids.length === 1 ? "" : "s"}`, {
        description:
          "Paste into the Review hub search, or use “Review Calls” to open them directly.",
      });
    } else {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <div className="space-y-6">
      {campaign && config.id === "seekers" && (
        <div className="flex justify-end">
          <NorthStarMetrics program={config.id} m={numericMetrics(metrics)} />
        </div>
      )}
      {comparison && (
        <div className="text-xs text-muted-foreground">
          Compared to{" "}
          <span className="font-medium text-foreground">{comparison.label} average</span>
        </div>
      )}
      {hasMetrics ? (
        isDkb ? (
          <DkbOverviewMetrics
            m={overviewMetrics}
            previous={overviewPrevious}
            perDay={perDayRollup}
            comparisonLabel={comparisonLabel}
            onFunnelStageClick={handleStageClick}
            stageDurations={stageDurations}
          />
        ) : (
          <KkbOverviewMetrics
            m={overviewMetrics}
            previous={overviewPrevious}
            perDay={perDayRollup}
            comparisonLabel={comparisonLabel}
            onFunnelStageClick={handleStageClick}
            stageDurations={stageDurations}
            callOutcomes={callOutcomes.data ?? []}
          />
        )
      ) : (
        <div className={`grid gap-4 grid-cols-2 ${isDkb ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
          {config.kpis.map((def) => (
            <KpiCard
              key={def.key}
              def={def}
              value={kpis[def.key] ?? 0}
              previous={prevKpis ? (prevKpis[def.key] ?? null) : null}
            />
          ))}
        </div>
      )}

      {!isDkb && <NorthStarTrend program={config.id} campaigns={perDay ?? []} />}

      {isDkb ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel
              className="lg:col-span-2"
              title="Performance by day"
              description="Calls, answered and new jobs posted per campaign day"
            >
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart
                    data={perDayRollup}
                    margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-muted-foreground)"
                    />

                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="rows"
                      name="calls"
                      stroke="var(--color-chart-1)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="answered"
                      stroke="var(--color-chart-2)"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="new_jobs"
                      name="new jobs"
                      stroke="var(--color-chart-3)"
                      strokeWidth={2}
                      strokeDasharray="2 2"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Phases reached" description="How deep the conversation got">
              <div className="h-72">
                {phases.some((p) => p.count > 0) ? (
                  <ResponsiveContainer>
                    <BarChart
                      data={phases}
                      layout="vertical"
                      margin={{ top: 10, right: 16, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-border)"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11 }}
                        stroke="var(--color-muted-foreground)"
                      />
                      <YAxis
                        dataKey="phase"
                        type="category"
                        tick={{ fontSize: 11 }}
                        stroke="var(--color-muted-foreground)"
                        width={90}
                      />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="count" fill="var(--color-chart-2)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No phase data captured for this period yet.
                  </div>
                )}
              </div>
            </Panel>
          </div>

          <Panel
            title="Drop analysis — where providers drop off and why"
            description="Normalized drop reasons across each conversation phase. Click a row to see the raw reasons inside it."
          >
            <DropAnalysisHeatmap data={dkbDropAnalysisQuery.data} />
          </Panel>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Job status" description="Verification outcome per posting">
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={jobStatus}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {jobStatus.map((s, i) => (
                        <Cell key={s.status} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Call outcome" description="How calls ended">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={outcomes} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="outcome"
                      tick={{ fontSize: 10 }}
                      stroke="var(--color-muted-foreground)"
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Intent distribution" description="0–10 score from voice agent">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={dkbIntents} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="score"
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-muted-foreground)"
                    />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4">
            <Panel
              title="Campaign performance"
              description="Answered, engaged and converted by campaign day (% of total calls)"
            >
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart
                    data={perDayRollup.map((d) => ({
                      label: d.label,
                      answered: d.rows > 0 ? Math.round((d.answered / d.rows) * 1000) / 10 : 0,
                      engaged: d.rows > 0 ? Math.round((d.engaged / d.rows) * 1000) / 10 : 0,
                      converted: d.rows > 0 ? Math.round((d.converted / d.rows) * 1000) / 10 : 0,
                    }))}
                    margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-muted-foreground)"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-muted-foreground)"
                      unit="%"
                    />
                    <Tooltip {...tooltipStyle} formatter={(value: number) => [`${value}%`, ""]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="answered"
                      stroke="var(--color-chart-1)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="engaged"
                      stroke="var(--color-chart-2)"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="converted"
                      name={
                        config.successMetric === "applications"
                          ? "connections"
                          : config.successMetric
                      }
                      stroke="var(--color-chart-3)"
                      strokeWidth={2}
                      strokeDasharray="2 2"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel
              title="Drop analysis — where seekers drop off and why"
              description="Normalized drop reasons across each conversation phase. Click a row to see the raw reasons inside it."
            >
              <DropAnalysisHeatmap data={dropAnalysisQuery.data} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel
              className="lg:col-span-2"
              title="Intent score distribution"
              description="Engaged callers only (score 1–10), bucketed"
            >
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart
                    data={intentBuckets(intents)}
                    margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="range"
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-muted-foreground)"
                    />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Region split">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart
                    data={regions}
                    layout="vertical"
                    margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-muted-foreground)"
                    />
                    <YAxis
                      dataKey="region"
                      type="category"
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-muted-foreground)"
                    />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" fill="var(--color-chart-2)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
