import { useMemo } from "react";
import { MetricCard } from "@/components/metrics/MetricCard";
import type { JobPost } from "./mockData";
import { GapTable } from "./GapTable";
import { mockPrevious, mockTrend } from "./ecosystemHelpers";

export function SeekersTab({
  jobs,
  counts,
}: {
  jobs: JobPost[];
  counts: { profiles: number; accounts: number; orgs: number };
}) {
  const profilesPrev = useMemo(() => mockPrevious(counts.profiles, 0.86), [counts.profiles]);
  const usersPrev = useMemo(() => mockPrevious(counts.accounts, 0.9), [counts.accounts]);
  const orgsPrev = useMemo(() => mockPrevious(counts.orgs, 0.83), [counts.orgs]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Total Profiles"
          value={counts.profiles}
          sub="seeker profiles created"
          previous={profilesPrev}
          trend={mockTrend(counts.profiles, profilesPrev)}
        />
        <MetricCard
          label="Total Accounts"
          value={counts.accounts}
          sub="unique user accounts"
          previous={usersPrev}
          trend={mockTrend(counts.accounts, usersPrev)}
        />
        <MetricCard
          label="Total Orgs"
          value={counts.orgs}
          sub="affiliated institutions"
          previous={orgsPrev}
          trend={mockTrend(counts.orgs, orgsPrev)}
        />
      </div>
      <GapTable jobs={jobs} />
    </div>
  );
}
