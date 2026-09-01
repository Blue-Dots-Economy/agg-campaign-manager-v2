import { useMemo, useState } from "react";
import { MetricCard } from "@/components/metrics/MetricCard";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { Application, JobPost } from "./mockData";
import { GapTable } from "./GapTable";
import { ApplicationsDrilldown } from "./ApplicationsDrilldown";
import { APP_AGE_LABEL, appAgeBucket, mockPrevious, mockTrend } from "./ecosystemHelpers";

export function JobsTab({
  jobs,
  applications,
  totalSeekers,
  totalApplications,
}: {
  jobs: JobPost[];
  applications: Application[];
  totalSeekers: number;
  totalApplications?: number;
}) {
  const applicationsCount = totalApplications ?? applications.length;
  const open = useMemo(() => jobs.filter((j) => j.status === "open"), [jobs]);
  const providers = useMemo(() => new Set(open.map((j) => j.posted_by)).size, [open]);
  const openings = useMemo(() => open.reduce((s, j) => s + j.current_openings, 0), [open]);

  const ageCounts = useMemo(() => {
    const c = { week: 0, month: 0, older: 0 };
    for (const a of applications) c[appAgeBucket(a.applied_date)]++;
    return c;
  }, [applications]);

  const [drillOpen, setDrillOpen] = useState(false);

  // TODO(ecosystem): mock previous/trend — replace with real period-over-period data in Phase 3
  const providersPrev = mockPrevious(providers, 0.88);
  const openingsPrev = mockPrevious(openings, 0.82);
  const applicationsPrev = mockPrevious(applicationsCount, 0.91);
  const seekersPrev = mockPrevious(totalSeekers, 0.85);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Job Providers"
          value={providers}
          sub="unique companies posting"
          previous={providersPrev}
          trend={mockTrend(providers, providersPrev)}
        />
        <MetricCard
          label="Job Openings"
          value={openings}
          sub="open positions across roles"
          previous={openingsPrev}
          trend={mockTrend(openings, openingsPrev)}
        />

        <HoverCard openDelay={150} closeDelay={100}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              onClick={() => setDrillOpen(true)}
              className="text-left rounded-xl cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Open applications breakdown"
            >
              <MetricCard
                label="Total Applications"
                value={applicationsCount}
                sub="applications received"
                previous={applicationsPrev}
                trend={mockTrend(applicationsCount, applicationsPrev)}
              />
            </button>
          </HoverCardTrigger>
          <HoverCardContent className="w-64" align="start">
            <p className="text-sm font-medium">Applications by age</p>
            <div className="mt-3 space-y-2">
              {(["week", "month", "older"] as const).map((k) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{APP_AGE_LABEL[k]}</span>
                  <span className="font-medium tabular-nums">{ageCounts[k]}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Click card to see all applications.</p>
          </HoverCardContent>
        </HoverCard>

        <MetricCard
          label="Job Seekers"
          value={totalSeekers}
          sub="registered seekers in region"
          previous={seekersPrev}
          trend={mockTrend(totalSeekers, seekersPrev)}
        />
      </div>
      <GapTable jobs={jobs} />

      <ApplicationsDrilldown
        open={drillOpen}
        onOpenChange={setDrillOpen}
        applications={applications}
      />
    </div>
  );
}
