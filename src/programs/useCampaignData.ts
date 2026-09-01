import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchProgramRows } from "@/lib/connections.functions";
import type { CallRow } from "./data";
import type { ProgramConfig } from "./registry";

export function useCampaignData(config: ProgramConfig): {
  rows: CallRow[];
  isLoading: boolean;
  source: "sheets" | "empty";
  connectionCount: number;
} {
  const fn = useServerFn(fetchProgramRows);
  const query = useQuery({
    queryKey: ["program-rows", config.id],
    queryFn: () => fn({ data: { program: config.id } }),
    staleTime: 60_000,
  });
  if (query.data) {
    return {
      rows: query.data.rows as CallRow[],
      isLoading: false,
      source: query.data.source,
      connectionCount: query.data.connectionCount,
    };
  }
  return {
    rows: [],
    isLoading: query.isLoading,
    source: "empty",
    connectionCount: 0,
  };
}
