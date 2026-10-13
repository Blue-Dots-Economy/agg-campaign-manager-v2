import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Info, Building2, Network, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RollupScope } from "@/lib/my-dots-region";
import {
  ACTIVITY_FORMULA,
  ActivityCell,
  HeaderBand,
  InfoCard,
  NeedsAttention,
  ParticipantRow,
  SectionLabel,
  SortBtn,
  StatusCards,
  sortRows,
  useRollup,
  useSort,
} from "./shared";

/** Organisation owner: one organisation, its coordinators, and their participants. */
export function OwnerRollupView({ scope }: { scope: Extract<RollupScope, { kind: "org" }> }) {
  const { rollup, type, period, setPeriod, refreshing, refresh } = useRollup(scope);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { sortKey, sortDir, toggleSort } = useSort();

  const org = rollup.orgs[0];
  const orgName = org?.name ?? "Organisation";
  const coords = sortRows(org?.coordinators ?? [], sortKey, sortDir);
  const avgPerCoord = rollup.coordinatorCount ? Math.round(rollup.total / rollup.coordinatorCount) : 0;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <HeaderBand
          badge={orgName}
          type={type}
          period={period}
          setPeriod={setPeriod}
          total={rollup.total}
          sentence={`Lifecycle and profile health across ${orgName}.`}
          refreshing={refreshing}
          onRefresh={refresh}
        />
        <StatusCards status={rollup.status} />
        <NeedsAttention rollup={rollup} period={period} />

        <div>
          <SectionLabel>Network</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoCard Icon={Building2} tile="bg-brand-soft text-brand" headline={orgName} sub={`${org?.kind ?? ""} · ${rollup.region}`} />
            <InfoCard Icon={Network} tile="bg-brand-soft text-brand" headline={`${rollup.coordinatorCount} Coordinators`} sub="In this organisation" />
            <InfoCard Icon={Users} tile="bg-brand-soft text-brand" headline={`${avgPerCoord} Avg Purple Dots / Coordinator`} sub="Managed each" />
          </div>
        </div>

        <div>
          <SectionLabel caption={`${rollup.coordinatorCount} coordinators · ranked by activity · expand to see participants`}>
            By coordinator
          </SectionLabel>
          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="uppercase text-xs tracking-wider">Coordinator / Participant</TableHead>
                  <TableHead className="text-right"><SortBtn k="total" sortKey={sortKey} onToggle={toggleSort}>Purple Dots</SortBtn></TableHead>
                  <TableHead className="text-right"><SortBtn k="newInPeriod" sortKey={sortKey} onToggle={toggleSort}>New</SortBtn></TableHead>
                  <TableHead className="text-right uppercase text-xs tracking-wider">Active %</TableHead>
                  <TableHead className="text-right uppercase text-xs tracking-wider">Inactive %</TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <SortBtn k="activityScore" title={ACTIVITY_FORMULA} sortKey={sortKey} onToggle={toggleSort}>Activity</SortBtn>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-5 w-5" aria-label="How activity is calculated">
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{ACTIVITY_FORMULA}</TooltipContent>
                      </Tooltip>
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coords.map((c) => {
                  const open = expanded.has(c.code);
                  return (
                    <Fragment key={c.code}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() =>
                          setExpanded((s) => {
                            const n = new Set(s);
                            if (n.has(c.code)) n.delete(c.code);
                            else n.add(c.code);
                            return n;
                          })
                        }
                      >
                        <TableCell>
                          <span className="inline-flex items-center gap-2 font-mono text-sm font-medium">
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {c.code}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.newInPeriod}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.activePct}%</TableCell>
                        <TableCell className="text-right tabular-nums">{c.inactivePct}%</TableCell>
                        <TableCell><ActivityCell score={c.activityScore} /></TableCell>
                      </TableRow>
                      {open && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={6} className="p-0">
                            <div className="px-4 py-2">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="pl-12">Participant</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Joined</TableHead>
                                    <TableHead className="text-right">Last engaged</TableHead>
                                    <TableHead className="text-right">Profile</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {c.participants.map((p) => (
                                    <ParticipantRow key={p.id} p={p} indent />
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
