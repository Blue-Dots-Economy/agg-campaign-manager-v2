import { useMemo } from "react";
import { Check, X, Minus } from "lucide-react";
import { useProgram } from "@/programs/context";
import {
  useProgramAggregates,
  useCampaignList,
  type OverviewFilters,
} from "@/programs/useProgramAggregates";
import type { KkbMetrics } from "@/components/metrics/program-overviews";
import { humanizeCampaignType } from "@/lib/campaign-name";

interface Props {
  campaign: string;
  language: string | null;
  region: string | null;
  campaignDate: string | null;
  filters?: Pick<OverviewFilters, "dateFrom" | "dateTo" | "channel">;
}


function score(m: Partial<KkbMetrics> | undefined | null): number | null {
  if (!m) return null;
  const answered = m.answeredCalls ?? 0;
  const total = m.totalCalls ?? 0;
  if (answered <= 0 || total <= 0) return null;
  const apps = m.applicationsTotal ?? 0;
  const hi = m.highIntentCalls ?? 0;
  const eng = m.engagedCalls ?? 0;
  return (
    0.5 * (apps / answered) +
    0.2 * (hi / answered) +
    0.2 * (eng / answered) +
    0.1 * (answered / total)
  );
}

function attemptRate(m: Partial<KkbMetrics> | undefined | null): number | null {
  if (!m) return null;
  const answered = m.answeredCalls ?? 0;
  if (answered <= 0) return null;
  return (m.applicationsTotal ?? 0) / answered;
}

export function CampaignSuccess({
  campaign,
  language,
  region,
  campaignDate,
  filters,
}: Props) {
  const { config } = useProgram();
  const dateFrom = filters?.dateFrom ?? null;
  const dateTo = filters?.dateTo ?? null;
  const channel = filters?.channel ?? "all";

  const thisAgg = useProgramAggregates(config, {
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
  const list = useCampaignList(config, { channel });

  const prevEntry = useMemo(() => {
    const items = list.data ?? [];
    if (!language || !campaignDate) return null;
    const sameLang = items
      .filter((c) => (c.language ?? null) === language && !!c.campaignDate)
      .slice()
      .sort((a, b) => (a.campaignDate ?? "").localeCompare(b.campaignDate ?? ""));
    const earlier = sameLang.filter((c) => (c.campaignDate ?? "") < campaignDate);
    if (earlier.length === 0) return null;
    return earlier[earlier.length - 1];
  }, [list.data, language, campaignDate]);

  const prevAgg = useProgramAggregates(config, {
    state: "all",
    dateFrom: prevEntry?.campaignDate ?? null,
    dateTo: prevEntry?.campaignDate ?? null,
    campaignType: "all",
    campaign: prevEntry?.campaignType ?? null,
    channel,
  });


  const thisM = thisAgg.data?.metrics as Partial<KkbMetrics> | undefined;
  const regionM = regionAgg.data?.metrics as Partial<KkbMetrics> | undefined;
  const prevM = prevEntry ? (prevAgg.data?.metrics as Partial<KkbMetrics> | undefined) : undefined;

  if (!region) return null;
  if (!thisM || !thisM.totalCalls) return null;

  const thisScore = score(thisM);
  const regionScore = score(regionM);
  const prevScore = prevEntry ? score(prevM) : null;

  const thisAttempt = attemptRate(thisM) ?? 0;
  const regionAttempt = attemptRate(regionM) ?? 0;
  const applicationsTotal = thisM.applicationsTotal ?? 0;
  const submitted = thisM.applicationsSubmitted ?? 0;
  const blocked = thisM.applicationsBlocked ?? 0;

  const c1Applicable = prevEntry != null && prevScore != null;
  const c1Pass = c1Applicable && (thisScore ?? 0) > (prevScore ?? 0);
  const c2Applicable = regionScore != null && thisScore != null;
  const c2Pass = c2Applicable && (thisScore ?? 0) > (regionScore ?? 0);
  const c3Pass = thisAttempt >= regionAttempt && applicationsTotal >= 10;

  const passCount = (c1Pass ? 1 : 0) + (c2Pass ? 1 : 0) + (c3Pass ? 1 : 0);
  const applicableCount = (c1Applicable ? 1 : 0) + (c2Applicable ? 1 : 0) + 1;

  const yes =
    c3Pass && (c1Applicable ? c1Pass || c2Pass : c2Pass);

  const tone = yes
    ? "border-emerald-500/40 bg-emerald-500/5"
    : "border-rose-500/40 bg-rose-500/5";
  const verdictColor = yes
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-rose-700 dark:text-rose-300";

  const c1Detail = !c1Applicable
    ? "No earlier campaign to compare"
    : c1Pass
      ? `Beat the previous campaign (${humanizeCampaignType(prevEntry!.campaignType)})`
      : `Below the previous campaign (${humanizeCampaignType(prevEntry!.campaignType)})`;
  const c2Detail = c2Pass
    ? `Above the ${region} average`
    : `Below the ${region} average`;
  const c3Detail = c3Pass
    ? `Significant applications (${applicationsTotal.toLocaleString()} attempts · ${submitted.toLocaleString()} submitted + ${blocked.toLocaleString()} blocked)`
    : `Few applications (${applicationsTotal.toLocaleString()} attempts · ${submitted.toLocaleString()} submitted + ${blocked.toLocaleString()} blocked)`;

  return (
    <div className={`rounded-lg border ${tone} p-5`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        Is this campaign successful?
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-3xl font-semibold ${verdictColor}`}>
          {yes ? "Yes" : "No"}
        </span>
        <span className="text-sm text-muted-foreground">
          · {passCount} of {applicableCount} met
        </span>
      </div>
      <ul className="mt-4 space-y-2">
        <CriterionRow status={c1Applicable ? (c1Pass ? "pass" : "fail") : "na"} text={c1Detail} />
        <CriterionRow status={c2Applicable ? (c2Pass ? "pass" : "fail") : "na"} text={c2Detail} />
        <CriterionRow status={c3Pass ? "pass" : "fail"} text={c3Detail} />
      </ul>
    </div>
  );
}

function CriterionRow({
  status,
  text,
}: {
  status: "pass" | "fail" | "na";
  text: string;
}) {
  const Icon = status === "pass" ? Check : status === "fail" ? X : Minus;
  const color =
    status === "pass"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "fail"
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground";
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
      <span className="text-foreground">{text}</span>
    </li>
  );
}
