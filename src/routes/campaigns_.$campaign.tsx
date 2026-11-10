import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import type { ChannelValue } from "@/components/metrics/OverviewFilters";
import { useProgram } from "@/programs/context";
import { useCampaignList } from "@/programs/useProgramAggregates";
import { ProgramAnalytics } from "@/components/metrics/ProgramAnalytics";
import { CampaignVerdict } from "@/components/campaigns/CampaignVerdict";
import { CampaignSuccess } from "@/components/campaigns/CampaignSuccess";
import { CampaignVerdictDkb } from "@/components/campaigns/CampaignVerdictDkb";
import { CampaignSuccessDkb } from "@/components/campaigns/CampaignSuccessDkb";
import { humanizeCampaignType } from "@/lib/campaign-name";
import { formatCampaignDate } from "@/lib/campaigns/list";
import {
  CampaignSearchSchema,
  campaignOptionValue,
  findCampaign,
  parseCampaignOption,
  sortCampaignsNewestFirst,
} from "@/lib/campaigns/detail";
import { LoadingState, NoDataState } from "@/components/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/campaigns_/$campaign")({
  validateSearch: (s: Record<string, unknown>) => CampaignSearchSchema.parse(s),
  component: CampaignReviewDetail,
});

function CampaignReviewDetail() {
  const { campaign: rawCampaign } = Route.useParams();
  const { date, channel } = Route.useSearch();
  const channelFilter: ChannelValue = channel ?? "all";
  const navigate = useNavigate();
  const { config } = useProgram();
  const { data: campaigns, isLoading } = useCampaignList(config, { channel: channelFilter });

  const sorted = useMemo(() => sortCampaignsNewestFirst(campaigns ?? []), [campaigns]);
  const current = findCampaign(sorted, rawCampaign, date);

  if (isLoading && !campaigns) return <LoadingState />;

  if (!current) {
    return (
      <div className="space-y-4">
        <Link
          to="/campaigns"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All campaigns
        </Link>
        <NoDataState reason="no_results" />
      </div>
    );
  }

  const region = current.region ?? null;
  const scopeDate = current.campaignDate ?? null;
  const detailFilters = { dateFrom: scopeDate, dateTo: scopeDate, channel: channelFilter };
  const dateLabel = formatCampaignDate(current.campaignDate);
  const label = region ?? "all";
  const currentComposite = campaignOptionValue(current);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/campaigns"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All campaigns
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1 truncate">
            {humanizeCampaignType(current.campaignType)}
          </h1>
          <div className="text-sm text-muted-foreground mt-0.5">
            {dateLabel}
            {region ? ` · ${region}` : ""}
          </div>
        </div>
        <div className="w-72 max-w-full">
          <Select
            value={currentComposite}
            onValueChange={(v) => {
              const picked = parseCampaignOption(v);
              navigate({
                to: "/campaigns/$campaign",
                params: { campaign: picked.campaignType },
                search: { date: picked.date, channel: channel ?? undefined },
              });
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Switch campaign" />
              <ChevronDown className="h-4 w-4 opacity-50" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {sorted.map((c) => (
                <SelectItem
                  key={`${c.campaignType}__${c.campaignDate ?? "nodate"}`}
                  value={campaignOptionValue(c)}
                >
                  {humanizeCampaignType(c.campaignType)}
                  {c.campaignDate ? ` · ${c.campaignDate}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {config.id === "seekers" && (
        <>
          <CampaignSuccess
            campaign={current.campaignType}
            language={current.language ?? null}
            region={region}
            campaignDate={current.campaignDate ?? null}
            filters={detailFilters}
          />
          <CampaignVerdict
            campaign={current.campaignType}
            region={region}
            filters={detailFilters}
          />
        </>
      )}

      {config.id === "providers" && (
        <>
          <CampaignSuccessDkb
            campaign={current.campaignType}
            language={current.language ?? null}
            region={region}
            campaignDate={current.campaignDate ?? null}
            filters={detailFilters}
          />
          <CampaignVerdictDkb
            campaign={current.campaignType}
            region={region}
            filters={detailFilters}
          />
        </>
      )}

      <ProgramAnalytics
        config={config}
        filters={{
          state: "all",
          dateFrom: scopeDate,
          dateTo: scopeDate,
          campaignType: "all",
          channel: channelFilter,
        }}
        campaign={current.campaignType}
        comparison={{ mode: "state-average", region, label }}
      />
    </div>
  );
}
