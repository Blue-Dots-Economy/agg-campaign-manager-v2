import { Fragment, useMemo, useState } from "react";
import {
  UserPlus,
  Users,
  AlertTriangle,
  PauseCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Info,
  UserCircle2,
  FlaskConical,
  Sparkles,
  Building2,
  UserX,
  FileWarning,
  Network,
  UserCog,
} from "lucide-react";
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
const ACTIVITY_FORMULA =
  "Activity = round(0.5 × (100 − inactive %) + 0.5 × average profile completion). Same formula for organisations and coordinators.";

// Fixed semantic colours on purpose: these lifecycle states must not shift with the theme.
const STATUS: {
  key: Lifecycle;
  label: string;
  desc: string;
  Icon: typeof Users;
  num: string;
  card: string;
  tile: string;
}[] = [
  { key: "new", label: "New", desc: "Joined within the last 7 days", Icon: Sparkles,
    num: "text-emerald-600 dark:text-emerald-400", card: "bg-emerald-500/5 border-emerald-500/20", tile: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { key: "active", label: "Active", desc: "Engaged in the last 30 days", Icon: Users,
    num: "text-blue-600 dark:text-blue-400", card: "bg-blue-500/5 border-blue-500/20", tile: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { key: "at-risk", label: "At Risk", desc: "No engagement for 31–90 days", Icon: AlertTriangle,
    num: "text-amber-600 dark:text-amber-400", card: "bg-amber-500/5 border-amber-500/20", tile: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { key: "inactive", label: "Inactive", desc: "No activity for over 90 days, or never", Icon: PauseCircle,
    num: "text-rose-600 dark:text-rose-400", card: "bg-rose-500/5 border-rose-500/20", tile: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
];

const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  new: "New",
  active: "Active",
  "at-risk": "At Risk",
  inactive: "Inactive",
};

const PERIOD_LABEL: Record<Period, string> = { 7: "This week", 30: "30 days", 90: "90 days" };

type SortKey = "total" | "newInPeriod" | "activityScore";

function sortRows<T extends Record<SortKey, number>>(rows: T[], key: SortKey, dir: 1 | -1): T[] {
  return [...rows].sort((a, b) => (a[key] - b[key]) * dir);
}

function activityBarClass(score: number) {
  if (score >= 60) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-rose-500";
}

function ActivityCell({ score }: { score: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${activityBarClass(score)}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="tabular-nums w-7 text-right font-medium">{score}</span>
    </div>
  );
}

function SectionLabel({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
      <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{children}</div>
      {caption && <div className="text-xs text-muted-foreground">{caption}</div>}
    </div>
  );
}

function InfoCard({ Icon, tile, headline, sub }: { Icon: typeof Users; tile: string; headline: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-start gap-4">
      <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${tile}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-base font-semibold text-foreground">{headline}</div>
        <div className="mt-1 text-sm text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

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

export function RegionRollupView() {
  const [type, setType] = useState<"all" | ParticipantType>("all");
  const [period, setPeriod] = useState<Period>(30);
  const [nonce, setNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("activityScore");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [drill, setDrill] = useState<{ org: OrgRow; coord: CoordinatorRow } | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rollup = useMemo(() => getRegionRollup({ region: REGION, period, type }), [period, type, nonce]);

  const eyebrow = type === "provider" ? "PROVIDERS" : type === "seeker" ? "SEEKERS" : "SEEKERS & PROVIDERS";
  const na = rollup.needsAttention;
  const zeroCodes = rollup.orgs
    .flatMap((o) => o.coordinators)
    .filter((c) => c.newInPeriod === 0)
    .map((c) => c.code);
  const avgPerCoord = rollup.coordinatorCount ? Math.round(rollup.total / rollup.coordinatorCount) : 0;

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(-1);
    }
  };

  const orgs = sortRows(rollup.orgs, sortKey, sortDir);

  const refresh = () => {
    setRefreshing(true);
    setNonce((n) => n + 1);
    setTimeout(() => setRefreshing(false), 300);
  };

  const SortBtn = ({ k, children, title }: { k: SortKey; children: React.ReactNode; title?: string }) => (
    <button
      type="button"
      title={title}
      onClick={() => toggleSort(k)}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-foreground" : "opacity-50"}`} />
    </button>
  );

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Title */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">My Purple Dots</h1>
            <Badge variant="secondary">{rollup.region}</Badge>
          </div>
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

        <SampleBanner />

        {/* Controls row + header band */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={type}
              onValueChange={(v) => v && setType(v as typeof type)}
            >
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              <ToggleGroupItem value="seeker">Seeker</ToggleGroupItem>
              <ToggleGroupItem value="provider">Provider</ToggleGroupItem>
            </ToggleGroup>
            <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v) as Period)}>
              <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">This week</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 flex flex-wrap items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-brand-soft flex items-center justify-center text-brand">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{eyebrow}</div>
              <div className="text-2xl font-bold tabular-nums">{rollup.total.toLocaleString()}</div>
            </div>
            <div className="hidden sm:block h-10 w-px bg-border" />
            <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
              Lifecycle and profile health across {rollup.region}.
            </p>
            <Button variant="outline" className="gap-2" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STATUS.map(({ key, label, desc, Icon, num, card, tile }) => (
            <div key={key} className={`rounded-xl border p-5 ${card}`}>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tile}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className={`mt-4 text-5xl font-bold tracking-tight tabular-nums ${num}`}>
                {rollup.status[key].toLocaleString()}
              </div>
              <div className="mt-2 text-base font-semibold text-foreground">{label}</div>
              <div className="mt-0.5 text-sm text-muted-foreground">{desc}</div>
            </div>
          ))}
        </div>

        {/* Needs attention */}
        <div>
          <SectionLabel>Needs attention</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoCard
              Icon={UserX}
              tile="bg-rose-500/15 text-rose-600 dark:text-rose-400"
              headline={`${na.inactiveSharePct}% inactive`}
              sub={`${rollup.status.inactive} of ${rollup.total} with no activity for over 90 days`}
            />
            <InfoCard
              Icon={UserCog}
              tile="bg-amber-500/15 text-amber-600 dark:text-amber-400"
              headline={`${na.coordinatorsWithZeroNewOnboards} coordinator${na.coordinatorsWithZeroNewOnboards === 1 ? "" : "s"} · 0 new onboards`}
              sub={zeroCodes.length ? `${zeroCodes.join(", ")} · ${PERIOD_LABEL[period].toLowerCase()}` : `Everyone onboarded someone · ${PERIOD_LABEL[period].toLowerCase()}`}
            />
            <InfoCard
              Icon={FileWarning}
              tile="bg-amber-500/15 text-amber-600 dark:text-amber-400"
              headline={`${na.profilesBelowThreshold} profiles below ${PROFILE_COMPLETION_THRESHOLD}%`}
              sub={`${rollup.total ? Math.round((na.profilesBelowThreshold / rollup.total) * 100) : 0}% of participants need profile completion`}
            />
          </div>
        </div>

        {/* Network */}
        <div>
          <SectionLabel>Network</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoCard Icon={Building2} tile="bg-brand-soft text-brand" headline={`${rollup.organisationCount} Partner organisations`} sub="Colleges and associations" />
            <InfoCard Icon={Network} tile="bg-brand-soft text-brand" headline={`${rollup.coordinatorCount} Coordinators`} sub="Across all organisations" />
            <InfoCard Icon={Users} tile="bg-brand-soft text-brand" headline={`${avgPerCoord} Avg Purple Dots / Coordinator`} sub="Managed each" />
          </div>
        </div>

        {/* By organisation */}
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
                  <TableHead className="text-right"><SortBtn k="total">Purple Dots</SortBtn></TableHead>
                  <TableHead className="text-right"><SortBtn k="newInPeriod">New</SortBtn></TableHead>
                  <TableHead className="text-right uppercase text-xs tracking-wider">Active %</TableHead>
                  <TableHead className="text-right uppercase text-xs tracking-wider">Inactive %</TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <SortBtn k="activityScore" title={ACTIVITY_FORMULA}>Activity</SortBtn>
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
