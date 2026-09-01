import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RegionSelector, type RegionValue } from "@/components/ecosystem/RegionSelector";
import { JobsTab } from "@/components/ecosystem/JobsTab";
import { SeekersTab } from "@/components/ecosystem/SeekersTab";
import { REGION_TREE } from "@/lib/ecosystem-config";
import { fetchEcosystemData } from "@/lib/ecosystem.functions";
import { relativeAge } from "@/components/ecosystem/ecosystemHelpers";

export const Route = createFileRoute("/ecosystem-view")({
  component: EcosystemView,
  head: () => ({
    meta: [
      { title: "Ecosystem View · Rozgar Hub" },
      { name: "description", content: "Unified job provider, seeker, and institution view by district." },
      { property: "og:title", content: "Ecosystem View · Rozgar Hub" },
      { property: "og:description", content: "Unified job provider, seeker, and institution view by district." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function EcosystemView() {
  const [region, setRegion] = useState<RegionValue>({
    state: REGION_TREE[0].state,
    district: REGION_TREE[0].districts[0],
  });

  const fetchFn = useServerFn(fetchEcosystemData);
  const qc = useQueryClient();
  const queryKey = ["ecosystem", region.state, region.district] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => fetchFn({ data: region }),
    staleTime: 5 * 60 * 1000,
  });

  const data = query.data;

  const jobs = data?.jobs ?? [];
  const applications = useMemo(() => data?.applications.sample ?? [], [data]);
  const seekerCounts = data?.seekerCounts ?? { profiles: 0, accounts: 0, orgs: 0 };
  const totalApplications = data?.applications.total ?? applications.length;

  return (
    <Tabs defaultValue="jobs" className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap items-center gap-2">
          <RegionSelector value={region} onChange={setRegion} />
          <TabsList>
            <TabsTrigger value="jobs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Jobs</TabsTrigger>
            <TabsTrigger value="seekers" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Seekers</TabsTrigger>
          </TabsList>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
            {query.isFetching
              ? "Syncing…"
              : data?.lastSyncedAt
                ? `Synced ${relativeAge(data.lastSyncedAt)}`
                : "Not synced"}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            disabled={query.isFetching}
            onClick={() => qc.invalidateQueries({ queryKey })}
          >
            {query.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Sync Now
          </Button>
        </div>
      </div>

      {query.isError ? (
        <div className="rounded-xl border bg-card p-6 flex flex-col items-center gap-3">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-muted-foreground text-center">
            {(query.error as Error)?.message ?? "Failed to load ecosystem data."}
          </p>
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : query.isLoading || !data ? (
        <div className="rounded-xl border bg-card p-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading ecosystem data…
        </div>
      ) : (
        <>
          <TabsContent value="jobs" className="space-y-6 mt-0">
            <JobsTab
              jobs={jobs}
              applications={applications}
              totalSeekers={seekerCounts.profiles}
              totalApplications={totalApplications}
            />
          </TabsContent>
          <TabsContent value="seekers" className="space-y-6 mt-0">
            <SeekersTab jobs={jobs} counts={seekerCounts} />
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}
