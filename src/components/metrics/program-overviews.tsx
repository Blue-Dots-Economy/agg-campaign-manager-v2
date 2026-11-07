import { useState } from "react";
import { cn } from "@/lib/utils";
import { MetricSection, SplitBar } from "@/components/metrics/primitives";
import { MetricCard } from "@/components/metrics/MetricCard";
import {
  VerticalFunnel,
  type VerticalFunnelStage,
  type FunnelColor,
} from "@/components/metrics/VerticalFunnel";
import { CallOutcomeBreakdown } from "@/components/metrics/CallOutcomeBreakdown";
import {
  isNotDialled,
  previousValue,
  safeDiv,
  series,
  type CallOutcomeCount,
} from "@/components/metrics/overview-helpers";

export interface DailyPoint {
  day: string;
  rows: number;
  answered: number;
  engaged: number;
  converted: number;
  new_jobs: number;
  high_intent: number;
}

export interface KkbMetrics {
  totalCalls: number;
  answeredCalls: number;
  unansweredCalls: number;
  productiveCalls: number;
  avgDuration: number;
  engagedCalls: number;
  jobsShownCalls: number;
  highIntentCalls: number;
  applicationsSubmitted: number;
  applicationsBlocked: number;
  applicationsTotal: number;
  hasInterviewData: boolean;
  interviewCount: number;
  seekers: number;
  answeredSeekers: number;
  triedSeekers: number;
  appliedSeekers: number;
  failedSeekers: number;
  didNotApply: number;
  totalApplications: number;
  engagedSeekers: number;
  jobsShownSeekers: number;
  highIntentSeekers: number;
  applicationsSeekers: number;
  profileCapturedCalls: number;
  profileCapturedSeekers: number;
  needsCapturedCalls: number;
  needsCapturedSeekers: number;
  providersFoundCalls: number;
  providersFoundSeekers: number;
  providersConnectedCalls: number;
  providersConnectedSeekers: number;
}

export interface DkbProviderFunnelStage {
  key: string;
  label: string;
  providers: number;
  openings: number;
  calls: number;
}

export interface DkbMetrics {
  totalCalls: number;
  answeredCalls: number;
  unansweredCalls: number;
  productiveCalls: number;
  avgDuration: number;
  totalOpenings: number;
  activeOpenings: number;
  closedOpenings: number;
  unresolvedOpenings: number;
  newOpenings: number;
  companiesCalled: number;
  jobsActive: number;
  jobsClosed: number;
  companiesUnresolved: number;
  newJobsDiscussed: number;
  newJobsPosted: number;
  providerFunnel?: DkbProviderFunnelStage[];
}

export function KkbOverviewMetrics({
  m,
  previous,
  perDay,
  comparisonLabel,
  onFunnelStageClick,
  stageDurations,
  callOutcomes,
}: {
  m: KkbMetrics;
  previous?: KkbMetrics;
  perDay?: DailyPoint[];
  comparisonLabel?: string;
  onFunnelStageClick?: (key: string, action: "copy" | "review") => void;
  stageDurations?: Record<string, number>;
  callOutcomes?: CallOutcomeCount[];
}) {
  const appRate = m.answeredSeekers > 0 ? (m.appliedSeekers / m.answeredSeekers) * 100 : 0;
  const productivePct = m.totalCalls > 0 ? (m.productiveCalls / m.totalCalls) * 100 : 0;
  const prevAppRate =
    previous && previous.answeredSeekers > 0
      ? (previous.appliedSeekers / previous.answeredSeekers) * 100
      : null;
  const prevProductivePct =
    previous && previous.totalCalls > 0
      ? (previous.productiveCalls / previous.totalCalls) * 100
      : null;

  const [view, setView] = useState<"hybrid" | "calls" | "seekers">("hybrid");
  const callsByStage: Record<string, number> = {
    calls: m.totalCalls,
    picked: m.answeredCalls,
    engaged: m.engagedCalls,
    profile: m.profileCapturedCalls ?? 0,
    needs: m.needsCapturedCalls ?? 0,
    found: m.providersFoundCalls ?? 0,
    connected: m.providersConnectedCalls ?? 0,
  };
  const seekersByStage: Record<string, number> = {
    calls: m.seekers,
    picked: m.answeredSeekers,
    engaged: m.engagedSeekers,
    profile: m.profileCapturedSeekers ?? 0,
    needs: m.needsCapturedSeekers ?? 0,
    found: m.providersFoundSeekers ?? 0,
    connected: m.providersConnectedSeekers ?? 0,
  };
  const seekerStageKeys = new Set(["engaged", "profile", "needs", "found", "connected"]);
  const dimOf = (key: string): "calls" | "seekers" =>
    view === "calls"
      ? "calls"
      : view === "seekers"
        ? "seekers"
        : seekerStageKeys.has(key)
          ? "seekers"
          : "calls";
  const valOf = (key: string): number =>
    (dimOf(key) === "seekers" ? seekersByStage[key] : callsByStage[key]) ?? 0;
  const dropLabels: Record<string, string> = {
    calls: "no pickup",
    picked: "drop after pickup",
    engaged: "no profile captured",
    profile: "no needs captured",
    needs: "no providers found",
    found: "not connected",
  };
  const uploaded = (callOutcomes ?? []).reduce((s, o) => s + o.n, 0);
  const notDialled = (callOutcomes ?? [])
    .filter((o) => isNotDialled(o.outcome))
    .reduce((s, o) => s + o.n, 0);
  const topExtraSub =
    uploaded > 0 && notDialled > 0
      ? `of ${uploaded.toLocaleString("en-IN")} uploaded · ${notDialled.toLocaleString("en-IN")} not dialled`
      : undefined;

  const stageDefs: Array<{
    key: string;
    label: string;
    description: string;
    color: FunnelColor;
    extraSub?: string;
  }> = [
    {
      key: "calls",
      label: "Calls made",
      description: "All dialled attempts",
      color: "blue",
      extraSub: topExtraSub,
    },
    { key: "picked", label: "Picked up", description: "Seeker answered", color: "green" },
    { key: "engaged", label: "Engaged", description: "Real conversation", color: "green" },
    {
      key: "profile",
      label: "Profile captured",
      description: "Profile details recorded",
      color: "amber",
    },
    {
      key: "needs",
      label: "Needs captured",
      description: "Needs and challenges shared",
      color: "amber",
    },
    {
      key: "found",
      label: "Providers found",
      description: "Matching providers identified",
      color: "coral",
    },
    {
      key: "connected",
      label: "Providers connected",
      description: "Seeker connected to a provider",
      color: "purple",
    },
  ];
  const stages: VerticalFunnelStage[] = stageDefs.map((s, i) => {
    const value = valOf(s.key);
    const next = stageDefs[i + 1];
    const nextVal = next ? valOf(next.key) : null;
    const dropAnn =
      next && value > 0 && nextVal != null
        ? `-${Math.max(0, (1 - nextVal / value) * 100).toFixed(1)}% ${dropLabels[s.key] ?? "drop"}`
        : undefined;
    return {
      key: s.key,
      label: s.label,
      description: s.description,
      value,
      color: s.color,
      unit: dimOf(s.key) === "seekers" ? "seekers" : undefined,
      nextAnnotation: dropAnn,
      avgDurationSec: stageDurations?.[s.key],
      extraSub: s.extraSub,
    };
  });

  return (
    <div className="space-y-8">
      <MetricSection title="Outcome metrics" subtitle="Funnel from calls made to applications">
        <div className="mb-4 inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
          {(
            [
              ["hybrid", "Calls → Seekers"],
              ["calls", "Total calls"],
              ["seekers", "Unique seekers"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1.5 rounded transition-colors",
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid items-stretch gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <VerticalFunnel
              stages={stages}
              fill
              pickedUpKey="picked"
              onStageClick={onFunnelStageClick}
            />
          </div>

          <div className="grid gap-3 lg:col-span-2 lg:grid-cols-1">
            <SplitBar answered={m.answeredCalls} unanswered={m.unansweredCalls} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <MetricCard
                label="Productive conversations"
                value={productivePct}
                format="percent"
                sub={
                  previous
                    ? undefined
                    : `${m.productiveCalls.toLocaleString()} calls — answered + > 30s`
                }
                previous={prevProductivePct}
                comparisonLabel={comparisonLabel}
                trend={series(perDay, (p) => safeDiv(p.engaged, p.rows) * 100)}
              />
              <MetricCard
                label="High value"
                value={m.highIntentSeekers}
                sub={previous ? undefined : "Value score ≥ 5"}
                previous={previousValue(previous, "highIntentSeekers")}
                comparisonLabel={comparisonLabel}
                trend={series(perDay, (p) => p.high_intent)}
              />
              <MetricCard
                label="Connected"
                value={appRate}
                format="percent"
                sub={previous ? undefined : "Seekers connected to at least one provider"}
                previous={prevAppRate}
                comparisonLabel={comparisonLabel}
                trend={series(perDay, (p) => safeDiv(p.converted, p.answered) * 100)}
              />
            </div>
          </div>
        </div>
        {view === "calls" ? <CallOutcomeBreakdown outcomes={callOutcomes ?? []} /> : null}
      </MetricSection>
    </div>
  );
}

export function DkbOverviewMetrics({
  m,
  previous,
  perDay,
  comparisonLabel,
  onFunnelStageClick,
  stageDurations,
}: {
  m: DkbMetrics;
  previous?: DkbMetrics;
  perDay?: DailyPoint[];
  comparisonLabel?: string;
  onFunnelStageClick?: (key: string, action: "copy" | "review") => void;
  stageDurations?: Record<string, number>;
}) {
  const pickupPct = m.totalCalls > 0 ? (m.answeredCalls / m.totalCalls) * 100 : 0;
  const productiveDenom = m.totalCalls;
  const productivePct = productiveDenom > 0 ? (m.productiveCalls / productiveDenom) * 100 : 0;
  const prevProductivePct =
    previous && previous.totalCalls > 0
      ? (previous.productiveCalls / previous.totalCalls) * 100
      : null;
  const highIntentTotal = (perDay ?? []).reduce((sum, p) => sum + (p.high_intent ?? 0), 0);
  const prevHighIntent: number | null = null;

  const [dview, setDview] = useState<"providers" | "openings" | "calls">("providers");
  const funnelData = m.providerFunnel ?? [];
  const colors: FunnelColor[] = ["blue", "green", "green", "coral", "purple"];

  const primaryOf = (s: DkbProviderFunnelStage) =>
    dview === "openings" ? s.openings : dview === "calls" ? s.calls : s.providers;
  const secondaryOf = (s: DkbProviderFunnelStage) =>
    dview === "providers" ? s.openings : s.providers;
  const unitLabel = dview === "openings" ? "openings" : dview === "calls" ? "calls" : "providers";
  const secondaryLabel = dview === "providers" ? "openings" : "providers";
  const funnelStages: VerticalFunnelStage[] = funnelData.map((s, i) => {
    const prevStage = i > 0 ? funnelData[i - 1] : undefined;
    const first = funnelData[0];
    const base = first ? primaryOf(first) : 0;
    const ofBase = base > 0 ? (primaryOf(s) / base) * 100 : 0;
    const step =
      i === 0 || !prevStage
        ? 0
        : Math.max(0, (1 - primaryOf(s) / (primaryOf(prevStage) || 1)) * 100);
    return {
      key: s.key,
      label: s.label,
      value: primaryOf(s),
      unit: unitLabel,
      secondaryValue: secondaryOf(s),
      secondaryLabel,
      color: colors[i] ?? "blue",
      sub:
        i === 0
          ? `100% of called`
          : `${ofBase.toFixed(1)}% of called  ·  −${step.toFixed(1)}% step`,
      avgDurationSec: stageDurations?.[s.key],
    };
  });

  return (
    <div className="space-y-8">
      <MetricSection
        title="Outcome metrics"
        subtitle="Provider funnel — Called → Picked up → Engaged → Actively hiring"
      >
        <div className="mb-4 inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
          {(
            [
              ["providers", "Providers"],
              ["openings", "Openings"],
              ["calls", "Calls"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setDview(v)}
              className={cn(
                "px-3 py-1.5 rounded transition-colors",
                dview === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid items-stretch gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            {funnelStages.length > 0 ? (
              <VerticalFunnel
                stages={funnelStages}
                fill
                pickedUpKey="picked"
                onStageClick={onFunnelStageClick}
              />
            ) : (
              <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                No provider data available for the current filters.
              </div>
            )}
          </div>

          <div className="grid gap-3 lg:col-span-2 lg:grid-cols-1">
            <SplitBar answered={m.answeredCalls} unanswered={m.unansweredCalls} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <MetricCard
                label="Productive conversations"
                value={productivePct}
                format="percent"
                sub={
                  previous
                    ? undefined
                    : `${m.productiveCalls.toLocaleString()} calls — answered + > 30s`
                }
                previous={prevProductivePct}
                comparisonLabel={comparisonLabel}
                trend={series(perDay, (p) => safeDiv(p.engaged, p.rows) * 100)}
              />
              <MetricCard
                label="High intent providers"
                value={highIntentTotal}
                sub={previous ? undefined : "Intent score ≥ 5"}
                previous={prevHighIntent}
                comparisonLabel={comparisonLabel}
                trend={series(perDay, (p) => p.high_intent)}
              />
            </div>
          </div>
        </div>
      </MetricSection>

      <MetricSection title="Active hiring" subtitle="Vacancy-weighted (sum of num_vacancies_input)">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Active Openings"
            value={m.activeOpenings}
            sub="Vacancies currently hiring (post-campaign)"
            previous={previousValue(previous, "activeOpenings")}
            comparisonLabel={comparisonLabel}
          />
          <MetricCard
            label="Active Providers"
            value={m.jobsActive}
            sub="Companies actively hiring"
            previous={previousValue(previous, "jobsActive")}
            comparisonLabel={comparisonLabel}
          />
          <MetricCard
            label="New jobs posted"
            value={m.newJobsPosted}
            sub="Companies that posted new roles"
            previous={previousValue(previous, "newJobsPosted")}
            comparisonLabel={comparisonLabel}
          />
          <MetricCard
            label="New job openings"
            value={m.newOpenings}
            sub="New vacancies posted during calls"
            previous={previousValue(previous, "newOpenings")}
            comparisonLabel={comparisonLabel}
          />
        </div>
      </MetricSection>

      <MetricSection title="Call metrics" subtitle="Per call (raw rows)">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard
            label="Total calls"
            value={m.totalCalls}
            sub={previous ? undefined : "All dialled attempts"}
            previous={previousValue(previous, "totalCalls")}
            comparisonLabel={comparisonLabel}
            trend={series(perDay, (p) => p.rows)}
          />
          <MetricCard
            label="Answered"
            value={m.answeredCalls}
            sub={
              previous ? `${pickupPct.toFixed(1)}% pickup` : `${pickupPct.toFixed(1)}% pickup rate`
            }
            previous={previousValue(previous, "answeredCalls")}
            comparisonLabel={comparisonLabel}
            trend={series(perDay, (p) => p.answered)}
          />
          <MetricCard
            label="Unanswered"
            value={m.unansweredCalls}
            sub={previous ? undefined : "No pickup"}
            previous={previousValue(previous, "unansweredCalls")}
            comparisonLabel={comparisonLabel}
          />
          <MetricCard
            label="Productive conversations"
            value={productivePct}
            format="percent"
            sub={
              previous
                ? undefined
                : `${m.productiveCalls.toLocaleString()} calls — answered + > 30s`
            }
            previous={prevProductivePct}
            comparisonLabel={comparisonLabel}
            trend={series(perDay, (p) => safeDiv(p.engaged, p.rows) * 100)}
          />
          <MetricCard
            label="Avg call duration"
            value={`${m.avgDuration.toFixed(1)} sec`}
            sub={previous ? undefined : "Answered calls only"}
            previous={previousValue(previous, "avgDuration")}
            comparisonLabel={comparisonLabel}
          />
        </div>
      </MetricSection>
    </div>
  );
}
