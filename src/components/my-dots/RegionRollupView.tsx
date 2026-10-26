import { Building2, Network, Users } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderBand, StatCard, NeedsAttention, SectionLabel, StatusCards, useRollup } from "./shared";
import { OrgTable } from "./OrgTable";

export function RegionRollupView() {
  const { rollup, type, period, setPeriod, refreshing, refresh } = useRollup({ kind: "region" });

  const avgPerCoord = rollup.coordinatorCount ? Math.round(rollup.total / rollup.coordinatorCount) : 0;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <HeaderBand
          badge={rollup.region}
          type={type}
          period={period}
          setPeriod={setPeriod}
          total={rollup.total}
          sentence={`Lifecycle and profile health across ${rollup.region}.`}
          refreshing={refreshing}
          onRefresh={refresh}
        />
        <StatusCards status={rollup.status} />
        <NeedsAttention rollup={rollup} period={period} />

        <div>
          <SectionLabel>Network</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard Icon={Building2} title="Partner organisations" value={rollup.organisationCount} sub="Colleges and associations" />
            <StatCard Icon={Network} title="Coordinators" value={rollup.coordinatorCount} sub="Across all organisations" />
            <StatCard Icon={Users} title="Avg Purple Dots / Coordinator" value={avgPerCoord} sub="Managed each" />
          </div>
        </div>

        <OrgTable orgs={rollup.orgs} />
      </div>
    </TooltipProvider>
  );
}
