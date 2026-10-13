import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Info, Building2, Network, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CoordinatorRow, OrgRow } from "@/lib/my-dots-region";
import {
  ACTIVITY_FORMULA,
  ActivityCell,
  HeaderBand,
  StatCard,
  NeedsAttention,
  ParticipantTable,
  SAMPLE_NOTE,
  SectionLabel,
  SortBtn,
  StatusCards,
  sortRows,
  useRollup,
  useSort,
} from "./shared";

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
