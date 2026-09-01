import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchCampaignDropCauses,
  type CampaignDropCausesPayload,
} from "@/lib/snapshot.functions";

export interface CampaignInsightsFilters {
  state?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export function useCampaignInsights(
  campaign: string | null | undefined,
  filters?: CampaignInsightsFilters,
) {
  const fn = useServerFn(fetchCampaignDropCauses);
  const state = filters?.state ?? "all";
  const dateFrom = filters?.dateFrom ?? null;
  const dateTo = filters?.dateTo ?? null;
  return useQuery<CampaignDropCausesPayload>({
    queryKey: ["campaign-causes", campaign, state, dateFrom, dateTo],
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
