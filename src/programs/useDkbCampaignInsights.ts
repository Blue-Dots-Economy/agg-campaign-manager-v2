import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchDkbCampaignCauses,
  type DkbCampaignCausesPayload,
} from "@/lib/snapshot.functions";

export interface DkbCampaignInsightsFilters {
  state?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export function useDkbCampaignInsights(
  campaign: string | null | undefined,
  filters?: DkbCampaignInsightsFilters,
) {
  const fn = useServerFn(fetchDkbCampaignCauses);
  const state = filters?.state ?? "all";
  const dateFrom = filters?.dateFrom ?? null;
  const dateTo = filters?.dateTo ?? null;
  return useQuery<DkbCampaignCausesPayload>({
    queryKey: ["dkb-campaign-causes", campaign, state, dateFrom, dateTo],
    queryFn: () =>
      fn({ data: { campaign: campaign as string, state, dateFrom, dateTo } }),
    enabled: !!campaign,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 1500,
  });
}
