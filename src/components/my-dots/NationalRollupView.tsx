import { Fragment, useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronRight, Info, MapPin, Network, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRegionRollup, type RollupScope } from "@/lib/my-dots-region";
import {
  ACTIVITY_FORMULA,
  ActivityCell,
  HeaderBand,
  NeedsAttention,
  REGION,
  SectionLabel,
  SortBtn,
  StatCard,
  StatusCards,
  activityTextClass,
  activityTintClass,
  sortRows,
  useRollup,
  useSort,
} from "./shared";
import { OrgTable } from "./OrgTable";

/** National → district → organisation → coordinator. Single-select district filter. */
export function NationalRollupView() {
  const [selected, setSelected] = useState<string | null>(null);
  const scope: RollupScope = selected ? { kind: "district", district: selected } : { kind: "national" };
  const { rollup, type, period, setPeriod, refreshing, refresh } = useRollup(scope);
  // Tiles always show every district, independent of the filter.
  const national = useMemo(
    () => getRegionRollup({ region: REGION, period, type, scope: { kind: "national" } }),
    [period, type, rollup],
  );
  const { sortKey, sortDir, toggleSort } = useSort();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const districts = sortRows(rollup.districts, sortKey, sortDir);
  const toggle = (name: string) => setSelected((s) => (s === name ? null : name));
  const avgPerDistrict = rollup.districtCount ? Math.round(rollup.total / rollup.districtCount) : 0;
  const avgPerCoord = rollup.coordinatorCount ? Math.round(rollup.total / rollup.coordinatorCount) : 0;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <HeaderBand
          badge={selected ?? "National"}
          type={type}
          period={period}
          setPeriod={setPeriod}
          total={rollup.total}
          sentence={
            selected
              ? `Lifecycle and profile health across ${selected}.`
              : `Lifecycle and profile health across ${rollup.districtCount} districts.`
          }
          refreshing={refreshing}
          onRefresh={refresh}
        />
        <StatusCards status={rollup.status} />
        <NeedsAttention rollup={rollup} period={period} />

        <div>
          <SectionLabel>Network</SectionLabel>
          {selected ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard Icon={Building2} title="Partner organisations" value={rollup.organisationCount} sub="Colleges and associations" />
              <StatCard Icon={Network} title="Coordinators" value={rollup.coordinatorCount} sub="Across all organisations" />
              <StatCard Icon={Users} title="Avg Purple Dots / Coordinator" value={avgPerCoord} sub="Managed each" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard Icon={MapPin} title="Districts" value={rollup.districtCount} sub="In the programme" />
              <StatCard Icon={Building2} title="Partner organisations" value={rollup.organisationCount} sub="Colleges and associations" />
              <StatCard Icon={Network} title="Coordinators" value={rollup.coordinatorCount} sub="Across all districts" />
              <StatCard Icon={Users} title="Avg Purple Dots / District" value={avgPerDistrict} sub="Per district" />
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SectionLabel caption="Click a district to filter the page">Districts</SectionLabel>
            <Button variant="ghost" size="sm" className="gap-1 h-7" onClick={() => setSelected(null)} disabled={!selected}>
              {selected && <X className="h-3.5 w-3.5" />}
              All districts
            </Button>
          </div>
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
            {national.districts.map((d) => {
              const active = selected === d.name;
              return (
                <button
                  key={d.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(d.name)}
                  className={`rounded-xl border p-3 text-left transition-colors ${activityTintClass(d.activityScore)} ${
                    active ? "border-brand ring-1 ring-brand" : "border-border hover:border-muted-foreground/40"
                  } ${selected && !active ? "opacity-60" : ""}`}
                >
                  <div className="font-medium text-foreground truncate">{d.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{d.state}</div>
                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <span className="text-sm tabular-nums text-foreground">{d.total.toLocaleString()}</span>
                    <span className={`text-sm font-semibold tabular-nums ${activityTextClass(d.activityScore)}`}>
                      {d.activityScore}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selected ? (
          <OrgTable key={selected} orgs={rollup.orgs} title={`By organisation · ${selected}`} />
        ) : (
          <div>
            <SectionLabel
              caption={`${rollup.districtCount} districts · ${rollup.organisationCount} organisations · ${rollup.coordinatorCount} coordinators · ranked by activity · expand to drill in`}
            >
              By district
            </SectionLabel>
            <div className="rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="uppercase text-xs tracking-wider">District</TableHead>
                    <TableHead className="uppercase text-xs tracking-wider">State</TableHead>
                    <TableHead className="text-right uppercase text-xs tracking-wider">Orgs</TableHead>
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
                  {districts.map((d) => {
                    const open = expanded.has(d.name);
                    return (
                      <Fragment key={d.name}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() =>
                            setExpanded((s) => {
                              const n = new Set(s);
                              if (n.has(d.name)) n.delete(d.name);
                              else n.add(d.name);
                              return n;
                            })
                          }
                        >
                          <TableCell>
                            <span className="inline-flex items-center gap-2 font-medium">
                              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              {d.name}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{d.state}</TableCell>
                          <TableCell className="text-right tabular-nums">{d.organisationCount}</TableCell>
                          <TableCell className="text-right tabular-nums">{d.total}</TableCell>
                          <TableCell className="text-right tabular-nums">{d.newInPeriod}</TableCell>
                          <TableCell className="text-right tabular-nums">{d.activePct}%</TableCell>
                          <TableCell className="text-right tabular-nums">{d.inactivePct}%</TableCell>
                          <TableCell><ActivityCell score={d.activityScore} /></TableCell>
                        </TableRow>
                        {open &&
                          sortRows(d.orgs, sortKey, sortDir).map((o) => (
                            <TableRow
                              key={o.id}
                              className="cursor-pointer bg-muted/30"
                              title={`Open ${d.name} to drill into coordinators`}
                              onClick={() => setSelected(d.name)}
                            >
                              <TableCell className="pl-12">
                                <span className="inline-flex items-center gap-2 text-sm">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  {o.name}
                                </span>
                              </TableCell>
                              <TableCell className="text-muted-foreground">—</TableCell>
                              <TableCell className="text-right text-muted-foreground">—</TableCell>
                              <TableCell className="text-right tabular-nums">{o.total}</TableCell>
                              <TableCell className="text-right tabular-nums">{o.newInPeriod}</TableCell>
                              <TableCell className="text-right tabular-nums">{o.activePct}%</TableCell>
                              <TableCell className="text-right tabular-nums">{o.inactivePct}%</TableCell>
                              <TableCell><ActivityCell score={o.activityScore} /></TableCell>
                            </TableRow>
                          ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
