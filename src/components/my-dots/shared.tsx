// Shared building blocks for the My Purple Dots persona views (region, owner, coordinator).
// Privacy: participants by ID only, coordinators by code only, organisations by institution name.
import { useMemo, useState } from "react";
import {
  UserPlus,
  Users,
  AlertTriangle,
  PauseCircle,
  RefreshCw,
  UserCircle2,
  FlaskConical,
  Sparkles,
  UserX,
  FileWarning,
  UserCog,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  type Lifecycle,
  type Period,
  type ParticipantType,
  type RegionRollup,
  type RollupScope,
  type ScopedParticipantRow,
  type StatusCounts,
} from "@/lib/my-dots-region";

export const REGION = "Basti";
export const SAMPLE_NOTE = "Preview — sample data until the database is connected.";
export const ACTIVITY_FORMULA =
  "Activity = round(0.5 × (100 − inactive %) + 0.5 × average profile completion). Same formula for organisations and coordinators.";

// Fixed semantic colours on purpose: these lifecycle states must not shift with the theme.
export const STATUS: {
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

export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  new: "New",
  active: "Active",
  "at-risk": "At Risk",
  inactive: "Inactive",
};

export const PERIOD_LABEL: Record<Period, string> = { 7: "This week", 30: "30 days", 90: "90 days" };

export type SortKey = "total" | "newInPeriod" | "activityScore";

export function sortRows<T extends Record<SortKey, number>>(rows: T[], key: SortKey, dir: 1 | -1): T[] {
  return [...rows].sort((a, b) => (a[key] - b[key]) * dir);
}

export function useSort(initial: SortKey = "activityScore") {
  const [sortKey, setSortKey] = useState<SortKey>(initial);
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(-1);
    }
  };
  return { sortKey, sortDir, toggleSort };
}

export function SortBtn({
  k,
  children,
  title,
  sortKey,
  onToggle,
}: {
  k: SortKey;
  children: React.ReactNode;
  title?: string;
  sortKey: SortKey;
  onToggle: (k: SortKey) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => onToggle(k)}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-foreground" : "opacity-50"}`} />
    </button>
  );
}

/** Type/period/refresh state + the single rollup call, shared by every persona view. */
export function useRollup(scope: RollupScope) {
  const [type, setType] = useState<"all" | ParticipantType>("all");
  const [period, setPeriod] = useState<Period>(30);
  const [nonce, setNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const scopeKey = JSON.stringify(scope);
  const rollup = useMemo(
    () => getRegionRollup({ region: REGION, period, type, scope }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period, type, nonce, scopeKey],
  );
  const refresh = () => {
    setRefreshing(true);
    setNonce((n) => n + 1);
    setTimeout(() => setRefreshing(false), 300);
  };
  return { rollup, type, setType, period, setPeriod, refreshing, refresh };
}

export function eyebrowFor(type: "all" | ParticipantType) {
  return type === "provider" ? "PROVIDERS" : type === "seeker" ? "SEEKERS" : "SEEKERS & PROVIDERS";
}

export function activityBarClass(score: number) {
  if (score >= 60) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-rose-500";
}

export function ActivityCell({ score }: { score: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${activityBarClass(score)}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="tabular-nums w-7 text-right font-medium">{score}</span>
    </div>
  );
}

export function SectionLabel({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
      <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{children}</div>
      {caption && <div className="text-xs text-muted-foreground">{caption}</div>}
    </div>
  );
}

export function InfoCard({ Icon, tile, headline, sub }: { Icon: typeof Users; tile: string; headline: string; sub: string }) {
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

export function SampleBanner() {
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

export function TitleRow({ badge }: { badge: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-bold tracking-tight">My Purple Dots</h1>
        <Badge variant="secondary">{badge}</Badge>
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
  );
}

export function ControlsAndHeader({
  type,
  setType,
  period,
  setPeriod,
  total,
  sentence,
  refreshing,
  onRefresh,
}: {
  type: "all" | ParticipantType;
  setType: (t: "all" | ParticipantType) => void;
  period: Period;
  setPeriod: (p: Period) => void;
  total: number;
  sentence: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
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
          <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{eyebrowFor(type)}</div>
          <div className="text-2xl font-bold tabular-nums">{total.toLocaleString()}</div>
        </div>
        <div className="hidden sm:block h-10 w-px bg-border" />
        <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">{sentence}</p>
        <Button variant="outline" className="gap-2" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
    </div>
  );
}

export function StatusCards({ status }: { status: StatusCounts }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {STATUS.map(({ key, label, desc, Icon, num, card, tile }) => (
        <div key={key} className={`rounded-xl border p-5 ${card}`}>
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tile}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className={`mt-4 text-5xl font-bold tracking-tight tabular-nums ${num}`}>
            {status[key].toLocaleString()}
          </div>
          <div className="mt-2 text-base font-semibold text-foreground">{label}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">{desc}</div>
        </div>
      ))}
    </div>
  );
}

/** mode "group": counts coordinators with zero onboards. mode "self": one coordinator's own onboards. */
export function NeedsAttention({
  rollup,
  period,
  mode = "group",
}: {
  rollup: RegionRollup;
  period: Period;
  mode?: "group" | "self";
}) {
  const na = rollup.needsAttention;
  const coords = rollup.orgs.flatMap((o) => o.coordinators);
  const zeroCodes = coords.filter((c) => c.newInPeriod === 0).map((c) => c.code);
  const selfNew = coords.reduce((a, c) => a + c.newInPeriod, 0);
  const periodText = PERIOD_LABEL[period].toLowerCase();
  return (
    <div>
      <SectionLabel>Needs attention</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard
          Icon={UserX}
          tile="bg-rose-500/15 text-rose-600 dark:text-rose-400"
          headline={`${na.inactiveSharePct}% inactive`}
          sub={`${rollup.status.inactive} of ${rollup.total} with no activity for over 90 days`}
        />
        {mode === "group" ? (
          <InfoCard
            Icon={UserCog}
            tile="bg-amber-500/15 text-amber-600 dark:text-amber-400"
            headline={`${na.coordinatorsWithZeroNewOnboards} coordinator${na.coordinatorsWithZeroNewOnboards === 1 ? "" : "s"} · 0 new onboards`}
            sub={zeroCodes.length ? `${zeroCodes.join(", ")} · ${periodText}` : `Everyone onboarded someone · ${periodText}`}
          />
        ) : (
          <InfoCard
            Icon={UserCog}
            tile="bg-amber-500/15 text-amber-600 dark:text-amber-400"
            headline={`${selfNew} new onboard${selfNew === 1 ? "" : "s"}`}
            sub={selfNew === 0 ? `No one joined your caseload · ${periodText}` : `Joined your caseload · ${periodText}`}
          />
        )}
        <InfoCard
          Icon={FileWarning}
          tile="bg-amber-500/15 text-amber-600 dark:text-amber-400"
          headline={`${na.profilesBelowThreshold} profiles below ${PROFILE_COMPLETION_THRESHOLD}%`}
          sub={`${rollup.total ? Math.round((na.profilesBelowThreshold / rollup.total) * 100) : 0}% of participants need profile completion`}
        />
      </div>
    </div>
  );
}

/** Individual participants by ID with a neutral avatar. Never renders names or contact details. */
export function ParticipantTable({ participants }: { participants: ScopedParticipantRow[] }) {
  return (
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
        {participants.map((p) => (
          <ParticipantRow key={p.id} p={p} />
        ))}
      </TableBody>
    </Table>
  );
}

export function ParticipantRow({ p, indent = false }: { p: ScopedParticipantRow; indent?: boolean }) {
  return (
    <TableRow>
      <TableCell className={indent ? "pl-12" : undefined}>
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
  );
}
