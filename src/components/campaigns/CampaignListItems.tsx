import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { humanizeCampaignType } from "@/lib/campaign-name";
import { formatCampaignDate, pct } from "@/lib/campaigns/list";
import { cn } from "@/lib/utils";

/** Call channel filter on the campaigns page. */
export type CampaignChannel = "all" | "outbound" | "inbound";

/** Fields a campaign card or row shows. */
export interface CampaignLike {
  campaignType: string;
  campaignDate: string | null;
  region: string | null;
  totalCalls: number;
  answered: number;
  engaged: number;
  converted: number;
}

/** Highlighted card for a recent campaign; opens the campaign page. */
export function CampaignCard({
  campaign,
  successLabel,
  channel,
  highlighted,
}: {
  campaign: CampaignLike;
  successLabel: string;
  channel: CampaignChannel;
  highlighted?: boolean;
}) {
  return (
    <Link
      to="/campaigns/$campaign"
      params={{ campaign: campaign.campaignType }}
      search={{
        date: campaign.campaignDate ?? undefined,
        channel: channel === "all" ? undefined : channel,
      }}
      className={cn(
        "group block rounded-xl border bg-card p-5 transition-colors hover:bg-muted/40",
        highlighted ? "border-primary border-2 shadow-sm" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">
              {humanizeCampaignType(campaign.campaignType)}
            </h3>
            {highlighted && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                New
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatCampaignDate(campaign.campaignDate)}
            {campaign.region ? ` · ${campaign.region}` : ""}
          </div>
        </div>
        <span
          className={cn(buttonVariants({ size: "sm" }), "shrink-0 gap-1.5 pointer-events-none")}
        >
          Review{" "}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
        <Metric label="Calls" value={campaign.totalCalls.toLocaleString()} />
        <Metric label="Answered" value={pct(campaign.answered, campaign.totalCalls)} />
        <Metric label="Engaged" value={campaign.engaged.toLocaleString()} />
        <Metric label={successLabel} value={campaign.converted.toLocaleString()} />
      </div>
    </Link>
  );
}
/** One campaign line in the paged list; opens the campaign page. */
export function CampaignRow({
  campaign,
  successLabel,
  channel,
}: {
  campaign: CampaignLike;
  successLabel: string;
  channel: CampaignChannel;
}) {
  return (
    <li>
      <Link
        to="/campaigns/$campaign"
        params={{ campaign: campaign.campaignType }}
        search={{
          date: campaign.campaignDate ?? undefined,
          channel: channel === "all" ? undefined : channel,
        }}
        className="group flex items-center gap-4 py-3 px-1 hover:bg-muted/40 rounded-md transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{humanizeCampaignType(campaign.campaignType)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatCampaignDate(campaign.campaignDate)}
            {campaign.region ? ` · ${campaign.region}` : ""}
          </div>
        </div>
        <div className="hidden sm:grid grid-cols-4 gap-6 text-xs text-right">
          <Metric label="Calls" value={campaign.totalCalls.toLocaleString()} align="right" />
          <Metric
            label="Answered"
            value={pct(campaign.answered, campaign.totalCalls)}
            align="right"
          />
          <Metric label="Engaged" value={campaign.engaged.toLocaleString()} align="right" />
          <Metric label={successLabel} value={campaign.converted.toLocaleString()} align="right" />
        </div>
        <span
          className={cn(
            buttonVariants({ size: "sm" }),
            "ml-2 shrink-0 gap-1.5 pointer-events-none",
          )}
        >
          Review{" "}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </li>
  );
}
function Metric({ label, value, align }: { label: string; value: string; align?: "right" }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
