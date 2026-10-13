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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { sortKey, sortDir, toggleSort } = useSort();
  const [drill, setDrill] = useState<{ org: OrgRow; coord: CoordinatorRow } | null>(null);

  const avgPerCoord = rollup.coordinatorCount ? Math.round(rollup.total / rollup.coordinatorCount) : 0;
  const orgs = sortRows(rollup.orgs, sortKey, sortDir);

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

        <div>
          <SectionLabel
            caption={`${rollup.organisationCount} organisations · ${rollup.coordinatorCount} coordinators · ranked by activity · expand to drill in`}
          >
            By organisation
          </SectionLabel>
          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="uppercase text-xs tracking-wider">Organisation / Coordinator</TableHead>
                  <TableHead className="text-right uppercase text-xs tracking-wider">Coords</TableHead>
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
                {orgs.map((o) => {
                  const open = expanded.has(o.id);
                  const coords = sortRows(o.coordinators, sortKey, sortDir);
                  return (
                    <Fragment key={o.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() =>
                          setExpanded((s) => {
                            const n = new Set(s);
                            if (n.has(o.id)) n.delete(o.id);
                            else n.add(o.id);
                            return n;
                          })
                        }
                      >
                        <TableCell>
                          <span className="inline-flex items-center gap-2 font-medium">
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {o.name}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{o.coordinators.length}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.newInPeriod}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.activePct}%</TableCell>
                        <TableCell className="text-right tabular-nums">{o.inactivePct}%</TableCell>
                        <TableCell><ActivityCell score={o.activityScore} /></TableCell>
                      </TableRow>
                      {open &&
                        coords.map((c) => (
                          <TableRow
                            key={c.code}
                            className="cursor-pointer bg-muted/30"
                            onClick={() => setDrill({ org: o, coord: c })}
                          >
                            <TableCell className="pl-12">
                              <span className="inline-flex items-center gap-2 font-mono text-sm">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden />
                                {c.code}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">—</TableCell>
                            <TableCell className="text-right tabular-nums">{c.total}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.newInPeriod}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.activePct}%</TableCell>
                            <TableCell className="text-right tabular-nums">{c.inactivePct}%</TableCell>
                            <TableCell><ActivityCell score={c.activityScore} /></TableCell>
                          </TableRow>
                        ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <Dialog open={!!drill} onOpenChange={(v) => !v && setDrill(null)}>
          <DialogContent className="max-w-2xl">
            {drill && (
              <>
                <DialogHeader>
                  <DialogTitle className="font-mono">{drill.coord.code}</DialogTitle>
                  <DialogDescription>
                    {drill.org.name} · {drill.coord.total} participants · {SAMPLE_NOTE}
                  </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto">
                  <ParticipantTable participants={drill.coord.participants} />
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
