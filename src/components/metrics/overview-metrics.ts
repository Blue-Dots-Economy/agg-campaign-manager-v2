// Metric shapes of the program overviews and their conversion from the snapshot's metric values.
import type { MetricValues } from "@/components/metrics/metric-values";

/** Seekers program metrics shown on the overview. */
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

/** One stage of the providers funnel. */
export interface DkbProviderFunnelStage {
  key: string;
  label: string;
  providers: number;
  openings: number;
  calls: number;
}

/** Providers program metrics shown on the overview. */
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

/** Seekers overview metrics from snapshot values; a metric the snapshot did not report shows as 0. */
export function kkbMetricsFrom(v: MetricValues): KkbMetrics {
  return {
    totalCalls: v.totalCalls ?? 0,
    answeredCalls: v.answeredCalls ?? 0,
    unansweredCalls: v.unansweredCalls ?? 0,
    productiveCalls: v.productiveCalls ?? 0,
    avgDuration: v.avgDuration ?? 0,
    engagedCalls: v.engagedCalls ?? 0,
    jobsShownCalls: v.jobsShownCalls ?? 0,
    highIntentCalls: v.highIntentCalls ?? 0,
    applicationsSubmitted: v.applicationsSubmitted ?? 0,
    applicationsBlocked: v.applicationsBlocked ?? 0,
    applicationsTotal: v.applicationsTotal ?? 0,
    interviewCount: v.interviewCount ?? 0,
    seekers: v.seekers ?? 0,
    answeredSeekers: v.answeredSeekers ?? 0,
    triedSeekers: v.triedSeekers ?? 0,
    appliedSeekers: v.appliedSeekers ?? 0,
    failedSeekers: v.failedSeekers ?? 0,
    didNotApply: v.didNotApply ?? 0,
    totalApplications: v.totalApplications ?? 0,
    engagedSeekers: v.engagedSeekers ?? 0,
    jobsShownSeekers: v.jobsShownSeekers ?? 0,
    highIntentSeekers: v.highIntentSeekers ?? 0,
    applicationsSeekers: v.applicationsSeekers ?? 0,
    profileCapturedCalls: v.profileCapturedCalls ?? 0,
    profileCapturedSeekers: v.profileCapturedSeekers ?? 0,
    needsCapturedCalls: v.needsCapturedCalls ?? 0,
    needsCapturedSeekers: v.needsCapturedSeekers ?? 0,
    providersFoundCalls: v.providersFoundCalls ?? 0,
    providersFoundSeekers: v.providersFoundSeekers ?? 0,
    providersConnectedCalls: v.providersConnectedCalls ?? 0,
    providersConnectedSeekers: v.providersConnectedSeekers ?? 0,
  };
}

/**
 * Providers overview metrics from snapshot values; a metric the snapshot did not report shows as 0.
 *
 * @param providerFunnel - The snapshot's provider funnel, which is not a numeric value.
 */
export function dkbMetricsFrom(
  v: MetricValues,
  providerFunnel: DkbProviderFunnelStage[] | undefined,
): DkbMetrics {
  return {
    totalCalls: v.totalCalls ?? 0,
    answeredCalls: v.answeredCalls ?? 0,
    unansweredCalls: v.unansweredCalls ?? 0,
    productiveCalls: v.productiveCalls ?? 0,
    avgDuration: v.avgDuration ?? 0,
    totalOpenings: v.totalOpenings ?? 0,
    activeOpenings: v.activeOpenings ?? 0,
    closedOpenings: v.closedOpenings ?? 0,
    unresolvedOpenings: v.unresolvedOpenings ?? 0,
    newOpenings: v.newOpenings ?? 0,
    companiesCalled: v.companiesCalled ?? 0,
    jobsActive: v.jobsActive ?? 0,
    jobsClosed: v.jobsClosed ?? 0,
    companiesUnresolved: v.companiesUnresolved ?? 0,
    newJobsDiscussed: v.newJobsDiscussed ?? 0,
    newJobsPosted: v.newJobsPosted ?? 0,
    providerFunnel,
  };
}
