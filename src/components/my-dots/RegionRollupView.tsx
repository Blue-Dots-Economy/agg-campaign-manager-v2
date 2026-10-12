import { Fragment, useMemo, useState } from "react";
import {
  UserPlus,
  Users,
  AlertTriangle,
  PauseCircle,
  RefreshCw,
  Network,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Info,
  UserCircle2,
  FlaskConical,
} from "lucide-react";
import { Panel } from "@/components/Panel";
import { MetricCard } from "@/components/metrics/MetricCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  getRegionRollup,
  PROFILE_COMPLETION_THRESHOLD,
  type CoordinatorRow,
  type Lifecycle,
  type OrgRow,
  type Period,
  type ParticipantType,
} from "@/lib/my-dots-region";

const REGION = "Basti";
const SAMPLE_NOTE = "Preview — sample data until the database is connected.";

const STATUS: { key: Lifecycle; label: string; desc: string; Icon: typeof Users; tint: string }[] = [
  { key: "new", label: "New", desc: "Joined in the last 7 days", Icon: UserPlus, tint: "var(--brand)" },
  { key: "active", label: "Active", desc: "Engaged within 30 days", Icon: Users, tint: "var(--chart-2, var(--brand))" },
  { key: "at-risk", label: "At Risk", desc: "Last engaged 31–90 days ago", Icon: AlertTriangle, tint: "var(--chart-4, var(--muted-foreground))" },
  { key: "inactive", label: "Inactive", desc: "No engagement in 90+ days, or never", Icon: PauseCircle, tint: "var(--destructive)" },
];

const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  new: "New",
  active: "Active",
  "at-risk": "At Risk",
  inactive: "Inactive",
};

const PERIOD_LABEL: Record<Period, string> = { 7: "This week", 30: "30 days", 90: "90 days" };

type SortKey = "name" | "total" | "active" | "inactive" | "newInPeriod" | "avgCompletion";

function SampleBanner() {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-foreground"
      style={{
        borderColor: "color-mix(in oklab, var(--brand) 40%, transparent)",
        background: "color-mix(in oklab, var(--brand) 10%, transparent)",
      }}
    >
      <FlaskConical className="h-4 w-4 text-brand" />
      {SAMPLE_NOTE}
    </div>
  );
}

function sortRows<T extends { total: number; status: Record<Lifecycle, number>; newInPeriod: number; avgCompletion: number }>(
  rows: T[],
  key: SortKey,
  dir: 1 | -1,
  name: (r: T) => string,
): T[] {
  const val = (r: T): number | string => {
    switch (key) {
      case "name": return name(r);
      case "active": return r.status.active;
      case "inactive": return r.status.inactive;
      default: return r[key];
    }
  };
  return [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
    return ((va as number) - (vb as number)) * dir;
  });
}

export function RegionRollupView() {
  const [type, setType] = useState<"all" | ParticipantType>("all");
  const [period, setPeriod] = useState<Period>(30);
  const [nonce, setNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [drill, setDrill] = useState<{ org: OrgRow; coord: CoordinatorRow } | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rollup = useMemo(() => getRegionRollup({ region: REGION, period, type }), [period, type, nonce]);

  const typeLabel = type === "all" ? "All participants" : type === "seeker" ? "Seekers" : "Providers";
  const na = rollup.needsAttention;

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? 1 : -1);
    }
  };

  const orgs = sortRows(rollup.orgs, sortKey, sortDir, (o) => o.name);

  const refresh = () => {
    setRefreshing(true);
    setNonce((n) => n + 1);
    setTimeout(() => setRefreshing(false), 300);
  };

  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-foreground" : "opacity-50"}`} />
      </button>
    </TableHead>
  );

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">My Purple Dots</h1>
              <Badge variant="secondary">{rollup.region}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Region rollup across organisations and coordinators</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              value={type}
              onValueChange={(v) => v && setType(v as typeof type)}
            >
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              <ToggleGroupItem value="seeker">Seeker</ToggleGroupItem>
              <ToggleGroupItem value="provider">Provider</ToggleGroupItem>
            </ToggleGroup>
            <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v) as Period)}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">This week</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button className="gap-2" disabled>
                    <UserPlus className="h-4 w-4" />
                    Add Participants
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Available once the database is connected</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <SampleBanner />

        {/* Summary strip */}
        <div className="rounded-xl border border-border bg-card p-5 flex flex-wrap items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-brand-soft flex items-center justify-center text-brand">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{typeLabel}</div>
            <div className="text-lg font-semibold">{typeLabel} · {rollup.total.toLocaleString()} total</div>
          </div>
          <div className="hidden sm:block h-10 w-px bg-border" />
          <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
            Lifecycle and profile health across {rollup.region} · {PERIOD_LABEL[period]}
          </p>
          <Button variant="outline" className="gap-2" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STATUS.map(({ key, label, desc, Icon, tint }) => (
            <div
              key={key}
              className="rounded-xl border border-border bg-card p-5"
              style={{ background: `color-mix(in oklab, ${tint} 6%, var(--card))` }}
            >
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center"
                style={{ background: `color-mix(in oklab, ${tint} 16%, transparent)`, color: tint }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-5 text-4xl font-bold tracking-tight tabular-nums">
                {rollup.status[key].toLocaleString()}
              </div>
              <div className="mt-2 text-base font-semibold">{label}</div>
              <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
            </div>
          ))}
        </div>

        {/* Needs attention */}
        <div>
          <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-3">Needs attention</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard label="Inactive share" value={`${na.inactiveSharePct}%`} sub={`${rollup.status.inactive} of ${rollup.total} participants`} />
            <MetricCard
              label="Coordinators with zero new onboards"
              value={na.coordinatorsWithZeroNewOnboards}
              sub={`No one joined in the last ${PERIOD_LABEL[period].toLowerCase()}`}
            />
            <MetricCard
              label={`Profiles below ${PROFILE_COMPLETION_THRESHOLD}% complete`}
              value={na.profilesBelowThreshold}
              sub={`${rollup.total ? Math.round((na.profilesBelowThreshold / rollup.total) * 100) : 0}% of participants`}
            />
          </div>
        </div>

        {/* Metric group */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard label="Organisations in region" value={rollup.organisationCount} sub="Colleges and associations" />
          <MetricCard label="Coordinators in region" value={rollup.coordinatorCount} sub="Identified by code only" />
        </div>

        {/* Org table */}
        <Panel title="By organisation" description="Expand an organisation to see its coordinators; open a coordinator to see their group.">
          <div className="mb-3"><SampleBanner /></div>
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead k="name">Organisation / coordinator</SortHead>
                <SortHead k="total" className="text-right">Total</SortHead>
                <SortHead k="newInPeriod" className="text-right">New ({PERIOD_LABEL[period]})</SortHead>
                <SortHead k="active" className="text-right">Active</SortHead>
                <SortHead k="inactive" className="text-right">Inactive</SortHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1">
                    <button type="button" onClick={() => toggleSort("avgCompletion")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Avg profile
                      <ArrowUpDown className={`h-3 w-3 ${sortKey === "avgCompletion" ? "text-foreground" : "opacity-50"}`} />
                    </button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-5 w-5" aria-label="Profile completion thresholds">
                          <Info className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Average profile completion. Profiles below {PROFILE_COMPLETION_THRESHOLD}% are counted under Needs attention; 100% means every field is filled.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((o) => {
                const open = expanded.has(o.id);
                const coords = sortRows(o.coordinators, sortKey, sortDir, (c) => c.code);
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
                          {o.name}
                          <Badge variant="outline" className="font-normal">{o.kind}</Badge>
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{o.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.newInPeriod}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.status.active}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.status.inactive}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.avgCompletion}%</TableCell>
                    </TableRow>
                    {open &&
                      coords.map((c) => (
                        <TableRow key={c.code} className="cursor-pointer bg-muted/30" onClick={() => setDrill({ org: o, coord: c })}>
                          <TableCell className="pl-10 font-mono text-sm">
                            {c.code}
                            {c.newInPeriod === 0 && (
                              <Badge variant="destructive" className="ml-2 font-sans font-normal">No new onboards</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{c.total}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.newInPeriod}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.status.active}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.status.inactive}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.avgCompletion}%</TableCell>
                        </TableRow>
                      ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Panel>

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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Participant</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Joined</TableHead>
                        <TableHead className="text-right">Last engaged</TableHead>
                        <TableHead className="text-right">Profile</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drill.coord.participants.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            <span className="inline-flex items-center gap-2 font-mono text-sm">
                              <UserCircle2 className="h-5 w-5 text-muted-foreground" aria-hidden />
                              {p.id}
                            </span>
                          </TableCell>
                          <TableCell className="capitalize">{p.type}</TableCell>
                          <TableCell><Badge variant="outline">{LIFECYCLE_LABEL[p.lifecycle]}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{p.joinedDaysAgo}d ago</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.lastEngagedDaysAgo === null ? "Never" : `${p.lastEngagedDaysAgo}d ago`}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${p.profileCompletion < PROFILE_COMPLETION_THRESHOLD ? "text-destructive" : ""}`}
                          >
                            {p.profileCompletion}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
