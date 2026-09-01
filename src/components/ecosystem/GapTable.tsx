import { useMemo, useState } from "react";
import { Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { JobPost } from "./mockData";
import { GAP_LEVEL_CLASSES, ROLE_CATEGORIES, fmtInt, gapLevel, roleCategory, type GapLevel } from "./ecosystemHelpers";
import { GapDrilldownDialog } from "./GapDrilldownDialog";
import { BalanceStrip, type BalanceRow, type BalanceGroup } from "./BalanceStrip";

type Mode = "role" | "location";
type View = "balance" | "table";

const GAP_LEVELS: GapLevel[] = ["Supply gap", "Borderline", "Balanced", "Good supply", "Excellent"];

export function GapTable({ jobs }: { jobs: JobPost[] }) {
  const [mode, setMode] = useState<Mode>("role");
  const [view, setView] = useState<View>("balance");
  const [keyFilter, setKeyFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [drill, setDrill] = useState<BalanceRow | null>(null);

  const openJobs = useMemo(() => jobs.filter((j) => j.status === "open"), [jobs]);

  const rows: BalanceRow[] = useMemo(() => {
    const groups = new Map<string, JobPost[]>();
    for (const j of openJobs) {
      const k = mode === "role" ? j.title : j.area;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(j);
    }
    const out: BalanceRow[] = [];
    for (const [k, arr] of groups) {
      const openings = arr.reduce((s, j) => s + j.current_openings, 0);
      const applications = arr.reduce((s, j) => s + j.applications, 0);
      const gap = openings - applications;
      const partial = arr.reduce((m, j) => Math.max(m, j.partial_fit_seekers), 0);
      const right = arr.reduce((m, j) => Math.max(m, j.right_fit_seekers), 0);
      out.push({
        key: k,
        openings,
        applications,
        gap,
        partial,
        right,
        level: gapLevel(gap),
        jobs: arr,
      });
    }
    out.sort((a, b) => b.gap - a.gap);
    return out;
  }, [openJobs, mode]);

  const filtered = rows.filter((r) => {
    if (keyFilter !== "all" && r.key !== keyFilter) return false;
    if (levelFilter !== "all" && r.level !== levelFilter) return false;
    return true;
  });

  const groups: BalanceGroup[] | undefined = (() => {
    if (mode !== "role") return undefined;
    const byCat = new Map<string, BalanceRow[]>();
    for (const r of filtered) {
      const cat = roleCategory(r.key);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(r);
    }
    const out: BalanceGroup[] = [];
    for (const cat of ROLE_CATEGORIES) {
      const rs = byCat.get(cat);
      if (!rs || rs.length === 0) continue;
      rs.sort((a, b) => b.gap - a.gap);
      const openings = rs.reduce((s, r) => s + r.openings, 0);
      const applications = rs.reduce((s, r) => s + r.applications, 0);
      const gap = openings - applications;
      const partial = rs.reduce((m, r) => Math.max(m, r.partial), 0);
      const right = rs.reduce((m, r) => Math.max(m, r.right), 0);
      out.push({
        key: cat,
        rows: rs,
        rollup: { key: cat, openings, applications, gap, partial, right, level: gapLevel(gap), jobs: rs.flatMap((r) => r.jobs) },
      });
    }
    return out;
  })();

  const keyOptions = useMemo(() => {
    const s = Array.from(new Set(rows.map((r) => r.key))).sort();
    return s;
  }, [rows]);

  return (
    <Panel
      title="Supply–Demand Balance"
      description="Where role/area demand outpaces available supply."
      action={
        <div className="flex items-center gap-3">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="balance" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Balance</TabsTrigger>
              <TabsTrigger value="table" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Table</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="text-xs text-muted-foreground tabular-nums">
            {filtered.length.toLocaleString("en-IN")} of {rows.length.toLocaleString("en-IN")}
          </div>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setKeyFilter("all"); }}>
          <TabsList>
            <TabsTrigger value="role" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">By Role</TabsTrigger>
            <TabsTrigger value="location" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">By Location</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={keyFilter} onValueChange={setKeyFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={mode === "role" ? "All roles" : "All areas"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{mode === "role" ? "All roles" : "All areas"}</SelectItem>
            {keyOptions.map((k) => (
              <SelectItem key={k} value={k}>{k}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All gap levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All gap levels</SelectItem>
            {GAP_LEVELS.map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {view === "balance" ? (
        <BalanceStrip rows={filtered} groups={groups} onRowClick={(r) => setDrill(r)} />
      ) : (
        <div className="max-h-[440px] overflow-y-auto overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>{mode === "role" ? "Role" : "Area"}</TableHead>
                <TableHead className="text-right">Openings</TableHead>
                <TableHead className="text-right">Applications</TableHead>
                <TableHead className="text-right">Gap</TableHead>
                <TableHead>Gap Level</TableHead>
                <TableHead className="text-right">Partial Fit</TableHead>
                <TableHead className="text-right">Right Fit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow
                  key={r.key}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setDrill(r)}
                >
                  <TableCell className="font-medium">{r.key}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(r.openings)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(r.applications)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.gap}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={GAP_LEVEL_CLASSES[r.level]}>
                      {r.level}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(r.partial)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(r.right)}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No open jobs for this district.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <GapDrilldownDialog
        open={!!drill}
        onOpenChange={(o) => !o && setDrill(null)}
        title={drill ? `${mode === "role" ? "Role" : "Area"}: ${drill.key}` : ""}
        jobs={drill?.jobs ?? []}
        partial={drill?.partial ?? 0}
        right={drill?.right ?? 0}
      />
    </Panel>
  );
}

