// URL search params and campaign selection for the single campaign page.
import { z } from "zod";

/** Search params of the campaign page; unknown or malformed values are dropped. */
export const CampaignSearchSchema = z.object({
  date: z.string().optional().catch(undefined),
  channel: z.enum(["all", "outbound", "inbound"]).optional().catch(undefined),
});

/** Validated search params of the campaign page. */
export type CampaignSearch = z.infer<typeof CampaignSearchSchema>;

interface CampaignRef {
  campaignType: string;
  campaignDate: string | null;
}

/** Sorts campaigns newest first without changing the input. */
export function sortCampaignsNewestFirst<T extends CampaignRef>(campaigns: readonly T[]): T[] {
  return campaigns
    .slice()
    .sort((a, b) => (b.campaignDate ?? "").localeCompare(a.campaignDate ?? ""));
}

/**
 * Finds the campaign named in the URL: the run on `date` when given, else the first match.
 *
 * @param sorted - Campaigns, newest first.
 */
export function findCampaign<T extends CampaignRef>(
  sorted: readonly T[],
  campaignType: string,
  date: string | undefined,
): T | undefined {
  return (
    sorted.find(
      (c) => c.campaignType === campaignType && (date ? c.campaignDate === date : true),
    ) ?? sorted.find((c) => c.campaignType === campaignType)
  );
}

/** Value of a campaign in the switcher: type and date separated by one space. */
export function campaignOptionValue(c: CampaignRef): string {
  return `${c.campaignType} ${c.campaignDate ?? ""}`;
}

/** Reads a switcher value back into a campaign type and an optional date. */
export function parseCampaignOption(value: string): { campaignType: string; date?: string } {
  const idx = value.indexOf(" ");
  const campaignType = idx === -1 ? value : value.slice(0, idx);
  const date = idx === -1 ? "" : value.slice(idx + 1);
  return { campaignType, date: date || undefined };
}
