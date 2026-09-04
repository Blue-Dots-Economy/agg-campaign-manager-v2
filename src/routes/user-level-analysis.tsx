import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  UserPlus,
  AlertTriangle,
  PauseCircle,
  Copy,
  CheckCircle2,
  Send,
  TrendingUp,
  Activity,
  RefreshCw,
  Languages,
  Moon,
  Search,
  ChevronDown,
  Upload,
  RotateCcw,
  Info,
  CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  loadSeekers,
  loadSeekersAsync,
  saveUploadedCsv,
  resetToBundled,
  PROFILE_FIELD_LABELS,
  type Seeker,
  type CsvMeta,
} from "@/lib/upSeekersCsv";

export const Route = createFileRoute("/user-level-analysis")({
  component: UserLevelAnalysis,
});

const STATUS_STYLES: Record<Seeker["status"], string> = {
  New: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  Active: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  "At Risk": "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Inactive: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
};

// Parses "M/D/YYYY" or "MM/DD/YYYY" strings from the CSV into a Date at midnight.
function parseCreatedOn(s: string): Date | null {
  if (!s) return null;
  const parts = s.trim().split("/");
  if (parts.length !== 3) return null;
  const [m, d, y] = parts.map((p) => parseInt(p, 10));
  if (!m || !d || !y) return null;
  return new Date(y, m - 1, d);
}

function MetricTile({
  label,
  value,
  description,
  Icon,
}: {
  label: string;
  value: string;
  description: string;
  Icon: typeof Users;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg border bg-muted/40 flex items-center justify-center text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-sm font-medium leading-tight">{label}</div>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </div>
  );
}

function UserLevelAnalysis() {
  const initial = useMemo(() => loadSeekers(), []);
  const [seekers, setSeekers] = useState<Seeker[]>(initial.seekers);
  const [meta, setMeta] = useState<CsvMeta>(initial.meta);
  const [isFetching, setIsFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [profileFilter, setProfileFilter] = useState<string[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [appliedRange, setAppliedRange] = useState<DateRange | undefined>(undefined);
  const [selected, setSelected] = useState<Seeker | null>(null);
  const [profileInfoOpen, setProfileInfoOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Hydrate from IndexedDB after mount (SSR-safe)
  useEffect(() => {
    loadSeekersAsync().then(({ seekers: s, meta: m }) => {
      setSeekers(s);
      setMeta(m);
    });
  }, []);

  const refetch = async () => {
    setIsFetching(true);
    const { seekers: s, meta: m } = await loadSeekersAsync();
    setSeekers(s);
    setMeta(m);
    setTimeout(() => setIsFetching(false), 300);
  };

  const handleUploadClick = () => fileRef.current?.click();

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const { seekers: s, meta: m, persisted } = await saveUploadedCsv(file.name, text);
      setSeekers(s);
      setMeta(m);
      if (!persisted) {
        alert(
          `Loaded ${s.length} rows from "${file.name}", but it couldn't be saved to browser storage. It will remain active until you reload the page.`,
        );
      }
    } catch (err) {
      alert("Failed to parse CSV: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleReset = async () => {
    const { seekers: s, meta: m } = await resetToBundled();
    setSeekers(s);
    setMeta(m);
  };




  const dateScopedSeekers = useMemo(() => {
    const hasJoined = Boolean(dateRange?.from || dateRange?.to);
    const hasApplied = Boolean(appliedRange?.from || appliedRange?.to);
    if (!hasJoined && !hasApplied) return seekers;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const appliedFrom = appliedRange?.from ? new Date(appliedRange.from) : null;
    if (appliedFrom) appliedFrom.setHours(0, 0, 0, 0);
    const appliedTo = appliedRange?.to ? new Date(appliedRange.to) : appliedFrom;
    if (appliedTo) appliedTo.setHours(23, 59, 59, 999);

    return seekers.filter((s) => {
      if (hasJoined) {
        const d = parseCreatedOn(s.createdOn);
        if (!d) return false;
        if (dateRange?.from) {
          const from = new Date(dateRange.from);
          from.setHours(0, 0, 0, 0);
          if (d < from) return false;
        }
        if (dateRange?.to) {
          const to = new Date(dateRange.to);
          to.setHours(23, 59, 59, 999);
          if (d > to) return false;
        }
      }
      if (hasApplied) {
        if (s.lastAppliedAge === null) return false;
        const appliedDate = new Date(today);
        appliedDate.setDate(appliedDate.getDate() - s.lastAppliedAge);
        if (appliedFrom && appliedDate < appliedFrom) return false;
        if (appliedTo && appliedDate > appliedTo) return false;
      }
      return true;
    });
  }, [seekers, dateRange, appliedRange]);

  const stats = useMemo(() => {
    const total = dateScopedSeekers.length;
    const byStatus = { New: 0, Active: 0, "At Risk": 0, Inactive: 0 } as Record<Seeker["status"], number>;
    const signalByStatus = {
      New: { Strong: 0, Moderate: 0, Weak: 0 },
      Active: { Strong: 0, Moderate: 0, Weak: 0 },
      "At Risk": { Strong: 0, Moderate: 0, Weak: 0 },
      Inactive: { Strong: 0, Moderate: 0, Weak: 0 },
    } as Record<Seeker["status"], Record<"Strong" | "Moderate" | "Weak", number>>;
    let complete = 0;
    let withApps = 0;
    let totalApps = 0;
    let totalCompletion = 0;
    const profilesPerUser = new Map<string, number>();
    const usersWithApps = new Set<string>();
    let newLast7 = 0;
    let total0 = 0;
    let totalGt0 = 0;
    let shortlisted0 = 0;
    let shortlistedGt0 = 0;
    let rejected0 = 0;
    let rejectedGt0 = 0;
    let pending0 = 0;
    let pendingGt0 = 0;
    const fieldPassCounts = new Array(PROFILE_FIELD_LABELS.length).fill(0) as number[];
    let emailCount = 0;
    let phoneCount = 0;
    const signalCounts = { Strong: 0, Moderate: 0, Weak: 0 } as Record<"Strong" | "Moderate" | "Weak", number>;

    for (const s of dateScopedSeekers) {
      byStatus[s.status]++;
      signalByStatus[s.status][s.profileSignal]++;
      if (s.profileStatus === "Complete") complete++;
      signalCounts[s.profileSignal]++;
      if (s.applications > 0) withApps++;
      totalApps += s.applications;
      totalCompletion += s.profileCompletion;
      s.profileFieldChecks.forEach((c, i) => {
        if (c.passed) fieldPassCounts[i]++;
      });
      if (s.emailPresent) emailCount++;
      if (s.phonePresent) phoneCount++;

      if (s.userId) {
        profilesPerUser.set(s.userId, (profilesPerUser.get(s.userId) ?? 0) + 1);
        if (s.applications > 0) usersWithApps.add(s.userId);
      }
      if (s.profileAge !== null && s.profileAge <= 7) newLast7++;
      const pending = Math.max(0, s.applications - s.shortlisted - s.rejected);
      if (s.applications === 0) total0++; else totalGt0++;
      if (s.shortlisted === 0) shortlisted0++; else shortlistedGt0++;
      if (s.rejected === 0) rejected0++; else rejectedGt0++;
      if (pending === 0) pending0++; else pendingGt0++;
    }

    const uniqueUsers = profilesPerUser.size;
    let usersMulti = 0;
    for (const count of profilesPerUser.values()) if (count > 1) usersMulti++;
    return {
      total,
      byStatus,
      signalByStatus,
      complete,
      completePct: total ? Math.round((complete / total) * 100) : 0,
      signalCounts,
      withApps,
      pctProfilesWithApps: total ? Math.round((withApps / total) * 100) : 0,
      uniqueUsers,
      usersMultiProfileCount: usersMulti,
      pctUsersMultiProfile: uniqueUsers ? Math.round((usersMulti / uniqueUsers) * 100) : 0,
      usersWithAppsCount: usersWithApps.size,
      pctUsersWithApps: uniqueUsers ? Math.round((usersWithApps.size / uniqueUsers) * 100) : 0,
      avgAppsPerSeeker: total ? (totalApps / total).toFixed(2) : "0",
      avgCompletion: total ? Math.round((complete / total) * 100) : 0,
      fieldCompletion: PROFILE_FIELD_LABELS.map((label, i) => ({
        label,
        count: fieldPassCounts[i],
        pct: total ? Math.round((fieldPassCounts[i] / total) * 100) : 0,
      })),
      emailPct: total ? Math.round((emailCount / total) * 100) : 0,
      emailCount,
      phonePct: total ? Math.round((phoneCount / total) * 100) : 0,
      phoneCount,


      newLast7,
      appliedCounts: {
        total0,
        totalGt0,
        shortlisted0,
        shortlistedGt0,
        rejected0,
        rejectedGt0,
        pending0,
        pendingGt0,
      },
    };
  }, [dateScopedSeekers]);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const signalTokens = new Set(["strong", "moderate", "weak"]);
    const selectedSignals = new Set(
      profileFilter.filter((f) => signalTokens.has(f)),
    );
    const wantedFields = profileFilter.filter((f) => !signalTokens.has(f));
    return dateScopedSeekers.filter((s) => {
      if (statusFilter !== "all" && s.status.toLowerCase().replace(" ", "-") !== statusFilter) return false;
      if (selectedSignals.size > 0 || wantedFields.length > 0) {
        const sigMatch =
          selectedSignals.size > 0 && selectedSignals.has(s.profileSignal.toLowerCase());
        let fieldMatch = false;
        if (wantedFields.length > 0) {
          const missing = new Set(
            s.profileFieldChecks.filter((f) => !f.passed).map((f) => f.label),
          );
          fieldMatch = wantedFields.some((f) => missing.has(f));
        }
        if (!sigMatch && !fieldMatch) return false;
      }
      if (appliedFilters.length > 0) {
        const pending = Math.max(0, s.applications - s.shortlisted - s.rejected);
        const matches =
          (appliedFilters.includes("total-0") && s.applications === 0) ||
          (appliedFilters.includes("total-gt0") && s.applications > 0) ||
          (appliedFilters.includes("shortlisted-0") && s.shortlisted === 0) ||
          (appliedFilters.includes("shortlisted-gt0") && s.shortlisted > 0) ||
          (appliedFilters.includes("rejected-0") && s.rejected === 0) ||
          (appliedFilters.includes("rejected-gt0") && s.rejected > 0) ||
          (appliedFilters.includes("pending-0") && pending === 0) ||
          (appliedFilters.includes("pending-gt0") && pending > 0);
        if (!matches) return false;
      }
      if (q && !(s.id.toLowerCase().includes(q) || s.userId.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [dateScopedSeekers, search, statusFilter, profileFilter, appliedFilters]);


  const lifecycle = [
    {
      label: "New",
      value: stats.byStatus.New,
      description: "Profile age ≤ 7 days",
      icon: UserPlus,
      accent: "from-emerald-50 to-white",
      iconBg: "bg-card border border-emerald-500/30",
      iconColor: "text-emerald-600",
      valueColor: "text-emerald-600",
    },
    {
      label: "Active",
      value: stats.byStatus.Active,
      description: "Last connection requested ≤ 30 days",
      icon: Users,
      accent: "from-blue-50 to-white",
      iconBg: "bg-card border border-blue-500/30",
      iconColor: "text-blue-600",
      valueColor: "text-blue-600",
    },
    {
      label: "At Risk",
      value: stats.byStatus["At Risk"],
      description: "Profile > 7d, last connection requested 31–90d",
      icon: AlertTriangle,
      accent: "from-amber-50 to-white",
      iconBg: "bg-card border border-amber-500/30",
      iconColor: "text-amber-500",
      valueColor: "text-amber-600",
    },
    {
      label: "Inactive",
      value: stats.byStatus.Inactive,
      description: "Last connection requested > 90 days or never",
      icon: PauseCircle,
      accent: "from-rose-50 to-white",
      iconBg: "bg-card border border-rose-500/30",
      iconColor: "text-rose-500",
      valueColor: "text-rose-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Purpledots</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Activity &amp; Status of the Purpledots
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChosen}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[260px] justify-start text-left font-normal",
                  !dateRange?.from && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      Joined: {format(dateRange.from, "LLL d, y")} – {format(dateRange.to, "LLL d, y")}
                    </>
                  ) : (
                    <>Joined: {format(dateRange.from, "LLL d, y")}</>
                  )
                ) : (
                  <span>Joined: Any date</span>
                )}
                {dateRange?.from && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDateRange(undefined);
                    }}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[260px] justify-start text-left font-normal",
                  !appliedRange?.from && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {appliedRange?.from ? (
                  appliedRange.to ? (
                    <>
                      Applied: {format(appliedRange.from, "LLL d, y")} – {format(appliedRange.to, "LLL d, y")}
                    </>
                  ) : (
                    <>Applied: {format(appliedRange.from, "LLL d, y")}</>
                  )
                ) : (
                  <span>Applied: Any date</span>
                )}
                {appliedRange?.from && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAppliedRange(undefined);
                    }}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={appliedRange}
                onSelect={setAppliedRange}
                numberOfMonths={2}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Sync data
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                Source: <span className="font-medium text-foreground">{meta.name}</span>
                <div>{meta.rows.toLocaleString()} rows</div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                UP Job Seekers (reload)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleUploadClick()}>
                <Upload className="h-4 w-4 mr-2" />
                Upload new CSV…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleReset()}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset to bundled CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>KA Job Seekers</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add Participants
          </Button>
          <Button variant="outline" className="gap-2">
            <Languages className="h-4 w-4" />
            English
          </Button>
          <Button variant="outline" size="icon">
            <Moon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Radius metrics banner */}
      <div className="rounded-xl border bg-card p-5 flex flex-col sm:flex-row items-start sm:items-center gap-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 flex-1">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-violet-500/15 flex items-center justify-center text-violet-600 dark:text-violet-400">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Avg Search Radius</div>
              <div className="text-xl font-semibold text-muted-foreground">Coming soon</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Avg Connection Radius</div>
              <div className="text-xl font-semibold text-muted-foreground">Coming soon</div>
            </div>
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Lifecycle cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {lifecycle.map((c) => {
          const Icon = c.icon;
          const breakdown = stats.signalByStatus[c.label as Seeker["status"]];
          const pct = (n: number) => (c.value ? Math.round((n / c.value) * 100) : 0);
          return (
            <div key={c.label} className={`rounded-xl border p-5 bg-gradient-to-br ${c.accent}`}>
              <div className={`h-10 w-10 rounded-lg ${c.iconBg} flex items-center justify-center ${c.iconColor}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className={`mt-6 text-5xl font-bold ${c.valueColor}`}>{c.value.toLocaleString()}</div>
              <div className="mt-3 text-base font-semibold">{c.label}</div>
              <div className="mt-1 text-sm text-muted-foreground">{c.description}</div>
              <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                <div>
                  Strong {breakdown.Strong.toLocaleString()} ({pct(breakdown.Strong)}%)
                </div>
                <div>
                  Moderate {breakdown.Moderate.toLocaleString()} ({pct(breakdown.Moderate)}%)
                </div>
                <div>
                  Weak {breakdown.Weak.toLocaleString()} ({pct(breakdown.Weak)}%)
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Profiles & Users metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-3">Profiles</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricTile label="Profiles Registered" value={stats.total.toLocaleString()} description="All seeker records" Icon={Copy} />
            <MetricTile
              label="Profiles Complete"
              value={stats.complete.toLocaleString()}
              description={`Strong Signal · ${stats.signalCounts.Strong.toLocaleString()} profiles (${stats.completePct}% of all profiles)`}
              Icon={CheckCircle2}
            />
            <MetricTile
              label="Connections requested"
              value={stats.withApps.toLocaleString()}
              description={`${stats.pctProfilesWithApps}% of all profiles`}
              Icon={Send}
            />
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-3">
            Users
            <span className="ml-2 text-muted-foreground font-normal normal-case">
              {stats.uniqueUsers.toLocaleString()} unique users
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricTile label="Total Seekers" value={stats.uniqueUsers.toLocaleString()} description="Unique user IDs" Icon={Users} />
            <MetricTile
              label="Users > 1 Profile"
              value={stats.usersMultiProfileCount.toLocaleString()}
              description={`${stats.pctUsersMultiProfile}% of all users`}
              Icon={TrendingUp}
            />
            <MetricTile
              label="Users with ≥1 Connection Requested"
              value={stats.usersWithAppsCount.toLocaleString()}
              description={`${stats.pctUsersWithApps}% of all users`}
              Icon={Activity}
            />
          </div>
        </div>
      </div>

      {/* Participant table */}
      <div className="rounded-xl border bg-card">
        <div className="p-4 flex items-center gap-3 border-b">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Profile ID or User ID..."
              className="pl-9 bg-muted/40 border-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-[210px] justify-between font-normal">
                <span className="truncate">
                  {profileFilter.length === 0
                    ? "Profile: All"
                    : profileFilter.length === 1
                      ? `Profile: ${
                          profileFilter[0] === "strong"
                            ? "Strong Signal"
                            : profileFilter[0] === "moderate"
                              ? "Moderate Signal"
                              : profileFilter[0] === "weak"
                                ? "Weak Signal"
                                : `Missing ${profileFilter[0]}`
                        }`
                      : `Profile: ${profileFilter.length} selected`}
                </span>
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[280px]">
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setProfileFilter([]); }}>
                Clear (show all)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={profileFilter.includes("strong")}
                onCheckedChange={(checked) =>
                  setProfileFilter((prev) =>
                    checked ? [...prev, "strong"] : prev.filter((v) => v !== "strong"),
                  )
                }
                onSelect={(e) => e.preventDefault()}
              >
                <div className="flex flex-col flex-1">
                  <span>Strong Signal</span>
                  <span className="text-[11px] text-muted-foreground">
                    Name, Location, Email/Phone, Age, Role, Salary
                  </span>
                </div>
                <span className="ml-auto text-muted-foreground whitespace-nowrap">
                  {stats.signalCounts.Strong.toLocaleString()} ·{" "}
                  {stats.total ? Math.round((stats.signalCounts.Strong / stats.total) * 100) : 0}%
                </span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={profileFilter.includes("moderate")}
                onCheckedChange={(checked) =>
                  setProfileFilter((prev) =>
                    checked ? [...prev, "moderate"] : prev.filter((v) => v !== "moderate"),
                  )
                }
                onSelect={(e) => e.preventDefault()}
              >
                <div className="flex flex-col flex-1">
                  <span>Moderate Signal</span>
                  <span className="text-[11px] text-muted-foreground">
                    Location, Role, Salary present — others may be missing
                  </span>
                </div>
                <span className="ml-auto text-muted-foreground whitespace-nowrap">
                  {stats.signalCounts.Moderate.toLocaleString()} ·{" "}
                  {stats.total ? Math.round((stats.signalCounts.Moderate / stats.total) * 100) : 0}%
                </span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={profileFilter.includes("weak")}
                onCheckedChange={(checked) =>
                  setProfileFilter((prev) =>
                    checked ? [...prev, "weak"] : prev.filter((v) => v !== "weak"),
                  )
                }
                onSelect={(e) => e.preventDefault()}
              >
                <div className="flex flex-col flex-1">
                  <span>Weak Signal</span>
                  <span className="text-[11px] text-muted-foreground">
                    Missing Location, Role or Salary
                  </span>
                </div>
                <span className="ml-auto text-muted-foreground whitespace-nowrap">
                  {stats.signalCounts.Weak.toLocaleString()} ·{" "}
                  {stats.total ? Math.round((stats.signalCounts.Weak / stats.total) * 100) : 0}%
                </span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Missing field
              </DropdownMenuLabel>
              {PROFILE_FIELD_LABELS.map((label) => {
                const passCount = stats.fieldCompletion.find((f) => f.label === label)?.count ?? 0;
                const missingCount = Math.max(0, stats.total - passCount);
                return (
                  <DropdownMenuCheckboxItem
                    key={label}
                    checked={profileFilter.includes(label)}
                    onCheckedChange={(checked) =>
                      setProfileFilter((prev) =>
                        checked ? [...prev, label] : prev.filter((v) => v !== label),
                      )
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="flex-1">{label}</span>
                    <span className="ml-auto text-muted-foreground whitespace-nowrap">
                      {missingCount.toLocaleString()} ·{" "}
                      {stats.total ? Math.round((missingCount / stats.total) * 100) : 0}%
                    </span>
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-[210px] justify-between font-normal">
                <span className="truncate">
                  {appliedFilters.length === 0
                    ? "Applied: All"
                    : appliedFilters.length === 1
                      ? appliedFilters[0].endsWith("-0")
                        ? `Applied: ${appliedFilters[0].replace("-0", "")} 0`
                        : `Applied: ${appliedFilters[0].replace("-gt0", "")} >0`
                      : `Applied: ${appliedFilters.length} selected`}
                </span>
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[260px]">
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setAppliedFilters([]); }}>
                Clear (show all)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total applied
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={appliedFilters.includes("total-0")}
                onCheckedChange={(checked) =>
                  setAppliedFilters((prev) =>
                    checked ? [...prev, "total-0"] : prev.filter((v) => v !== "total-0"),
                  )
                }
                onSelect={(e) => e.preventDefault()}
              >
                0 <span className="ml-auto text-muted-foreground">({stats.appliedCounts.total0.toLocaleString()})</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={appliedFilters.includes("total-gt0")}
                onCheckedChange={(checked) =>
                  setAppliedFilters((prev) =>
                    checked ? [...prev, "total-gt0"] : prev.filter((v) => v !== "total-gt0"),
                  )
                }
                onSelect={(e) => e.preventDefault()}
              >
                &gt;0 <span className="ml-auto text-muted-foreground">({stats.appliedCounts.totalGt0.toLocaleString()})</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Shortlisted
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={appliedFilters.includes("shortlisted-0")}
                onCheckedChange={(checked) =>
                  setAppliedFilters((prev) =>
                    checked ? [...prev, "shortlisted-0"] : prev.filter((v) => v !== "shortlisted-0"),
                  )
                }
                onSelect={(e) => e.preventDefault()}
              >
                0 <span className="ml-auto text-muted-foreground">({stats.appliedCounts.shortlisted0.toLocaleString()})</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={appliedFilters.includes("shortlisted-gt0")}
                onCheckedChange={(checked) =>
                  setAppliedFilters((prev) =>
                    checked ? [...prev, "shortlisted-gt0"] : prev.filter((v) => v !== "shortlisted-gt0"),
                  )
                }
                onSelect={(e) => e.preventDefault()}
              >
                &gt;0 <span className="ml-auto text-muted-foreground">({stats.appliedCounts.shortlistedGt0.toLocaleString()})</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Rejected
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={appliedFilters.includes("rejected-0")}
                onCheckedChange={(checked) =>
                  setAppliedFilters((prev) =>
                    checked ? [...prev, "rejected-0"] : prev.filter((v) => v !== "rejected-0"),
                  )
                }
                onSelect={(e) => e.preventDefault()}
              >
                0 <span className="ml-auto text-muted-foreground">({stats.appliedCounts.rejected0.toLocaleString()})</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={appliedFilters.includes("rejected-gt0")}
                onCheckedChange={(checked) =>
                  setAppliedFilters((prev) =>
                    checked ? [...prev, "rejected-gt0"] : prev.filter((v) => v !== "rejected-gt0"),
                  )
                }
                onSelect={(e) => e.preventDefault()}
              >
                &gt;0 <span className="ml-auto text-muted-foreground">({stats.appliedCounts.rejectedGt0.toLocaleString()})</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pending
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={appliedFilters.includes("pending-0")}
                onCheckedChange={(checked) =>
                  setAppliedFilters((prev) =>
                    checked ? [...prev, "pending-0"] : prev.filter((v) => v !== "pending-0"),
                  )
                }
                onSelect={(e) => e.preventDefault()}
              >
                0 <span className="ml-auto text-muted-foreground">({stats.appliedCounts.pending0.toLocaleString()})</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={appliedFilters.includes("pending-gt0")}
                onCheckedChange={(checked) =>
                  setAppliedFilters((prev) =>
                    checked ? [...prev, "pending-gt0"] : prev.filter((v) => v !== "pending-gt0"),
                  )
                }
                onSelect={(e) => e.preventDefault()}
              >
                &gt;0 <span className="ml-auto text-muted-foreground">({stats.appliedCounts.pendingGt0.toLocaleString()})</span>
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="User Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">User: All</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="at-risk">At Risk</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {filtered.length.toLocaleString()} of {stats.total.toLocaleString()}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead rowSpan={2} className="align-middle">Seeker</TableHead>
                <TableHead rowSpan={2} className="align-middle">Joined</TableHead>
                <TableHead rowSpan={2} className="align-middle">
                  <span className="inline-flex items-center gap-1">
                    Profile Status
                    <button
                      type="button"
                      onClick={() => setProfileInfoOpen(true)}
                      className="text-muted-foreground hover:text-foreground transition"
                      aria-label="About profile status"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </TableHead>
                <TableHead colSpan={4} className="text-center border-l">Applied</TableHead>
                <TableHead colSpan={4} className="text-center border-l">Pre-shortlisted</TableHead>
                <TableHead rowSpan={2} className="align-middle border-l">
                  User Status
                </TableHead>
                <TableHead rowSpan={2} className="align-middle">Recommended Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs uppercase tracking-wider border-l">Total</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Shortlisted</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Rejected</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Pending</TableHead>
                <TableHead className="text-xs uppercase tracking-wider border-l">Total</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Accepted</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Rejected</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Pending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 200).map((p) => {
                const pending = Math.max(0, p.applications - p.shortlisted - p.rejected);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-semibold">
                      <button
                        type="button"
                        onClick={() => setSelected(p)}
                        className="text-left hover:underline text-primary font-mono text-xs"
                      >
                        {p.id}
                      </button>
                      <div className="text-[11px] text-muted-foreground font-normal font-mono mt-0.5">
                        User: {p.userId || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.createdOn || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`rounded-full ${
                          p.profileSignal === "Strong"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                            : p.profileSignal === "Moderate"
                              ? "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
                        }`}
                      >
                        {p.profileSignal === "Strong"
                          ? "Strong Signal"
                          : p.profileSignal === "Moderate"
                            ? "Moderate Signal"
                            : "Weak Signal"}
                      </Badge>
                      <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                        {p.profileCompletion}% complete
                      </div>
                    </TableCell>

                    <TableCell className="border-l">{p.applications}</TableCell>
                    <TableCell>{p.shortlisted}</TableCell>
                    <TableCell>{p.rejected}</TableCell>
                    <TableCell>{pending}</TableCell>
                    <TableCell className="border-l">0</TableCell>
                    <TableCell>0</TableCell>
                    <TableCell>0</TableCell>
                    <TableCell>0</TableCell>
                    <TableCell className="border-l">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className={`rounded-full cursor-help ${STATUS_STYLES[p.status]}`}>
                              {p.status}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs space-y-1 bg-slate-900 text-slate-50 border-slate-800">
                            <div className="font-medium">{p.status}</div>
                            <div className="text-[11px] tabular-nums text-slate-300">
                              Age: {p.profileAge ?? "—"}{p.profileAge != null ? "d" : ""}
                              {" · "}
                              Applied: {p.lastAppliedAge ?? "—"}{p.lastAppliedAge != null ? "d" : ""}
                              {" · "}
                              Apps: {p.applications}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>
                      <span
                        className="text-xs px-3 py-1 rounded-full border bg-muted/30 text-muted-foreground italic cursor-not-allowed"
                        title="Recommended actions are coming soon"
                      >
                        Coming soon
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-sm text-muted-foreground py-10">
                    No seekers match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {filtered.length > 200 && (
            <div className="p-3 text-center text-xs text-muted-foreground border-t">
              Showing first 200 of {filtered.length.toLocaleString()} matches. Refine with search or filter.
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              Profile {selected?.id}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              User ID: {selected?.userId || "—"} · {selected?.profileStatus} ({selected?.profileCompletion}%)
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="text-sm font-medium">Incomplete fields</div>
              {selected.profileFieldChecks.filter((f) => !f.passed).length === 0 ? (
                <div className="text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-3 py-2">
                  All required fields are complete.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {selected.profileFieldChecks
                    .filter((f) => !f.passed)
                    .map((f) => (
                      <li
                        key={f.label}
                        className="text-sm flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300 px-3 py-1.5"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{f.label}</div>
                          <div className="font-mono text-xs break-words opacity-80">
                            {f.value ? `"${f.value}"` : <span className="italic">empty</span>}
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={profileInfoOpen} onOpenChange={setProfileInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Profile Status</DialogTitle>
            <DialogDescription>
              A profile is considered complete only when all {PROFILE_FIELD_LABELS.length} checks
              below pass for that profile. The % next to each field is the share of profiles
              where just that one field passes — a field can be near 100% on its own while very
              few profiles pass every check, because missing fields are spread across different
              profiles.
            </DialogDescription>

          </DialogHeader>
          <div className="space-y-3">
            <ol className="list-decimal pl-5 space-y-1.5 text-sm">
              {[
                { label: "Name", desc: "not blank and not a placeholder (Unknown, अज्ञात, etc.)" },
                { label: "Location", desc: "not blank and not just city / state / their combination" },
                { label: "Email or Phone", desc: "at least one filled" },
                { label: "Age", desc: "not blank" },
                { label: "Role", desc: 'not blank and not "any"' },
                { label: "Expected Salary", desc: "not blank" },
              ].map((f) => {
                const fc = stats.fieldCompletion.find((x) => x.label === f.label);
                return (
                  <li key={f.label}>
                    <div className="flex items-start justify-between gap-3">
                      <span>
                        <span className="font-medium">{f.label}</span> — {f.desc}
                      </span>
                      <span className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {fc ? `${fc.count.toLocaleString()} (${fc.pct}%)` : ""}
                      </span>
                    </div>
                    {f.label === "Email or Phone" && (
                      <div className="mt-1 ml-1 space-y-0.5 text-xs text-muted-foreground">
                        <div className="flex justify-between gap-3">
                          <span>Email filled</span>
                          <span className="tabular-nums">
                            {stats.emailCount.toLocaleString()} ({stats.emailPct}%)
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Phone filled</span>
                          <span className="tabular-nums">
                            {stats.phoneCount.toLocaleString()} ({stats.phonePct}%)
                          </span>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}

            </ol>
            <div className="rounded border bg-muted/30 px-3 py-2 text-sm">
              Profiles complete (all {PROFILE_FIELD_LABELS.length} checks pass):{" "}
              <span className="font-semibold">{stats.avgCompletion}%</span>
            </div>
          </div>

        </DialogContent>
      </Dialog>
    </div>
  );
}
