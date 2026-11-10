import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RefreshCw, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Panel } from "@/components/Panel";
import { MetricCard } from "@/components/metrics/MetricCard";
import { RegionSelector, type RegionValue } from "@/components/ecosystem/RegionSelector";
import { OnboardingTab } from "@/components/ecosystem/OnboardingTab";
import { Actions, GapNumber, LevelBadge } from "@/components/ecosystem/GapCells";
import { ProviderDrilldown, SeekerDrilldown } from "@/components/ecosystem/GapDrilldowns";
import { REGION_TREE } from "@/lib/ecosystem-config";
import {
  getEcosystemTotals,
  getProviderCategories,
  getSeekerNeeds,
  matchesGapLevel,
  providerGapRows,
  seekerGapRows,
  type GapLevelLabel,
} from "@/lib/ecosystem-data";
import { fmtCount as fmt, syncedAgo } from "@/components/ecosystem/ecosystemHelpers";

export const Route = createFileRoute("/ecosystem-view")({
  component: EcosystemView,
  head: () => ({
    meta: [
      { title: "Ecosystem view · Purple Dots" },
      { name: "description", content: "Provider and seeker gap analysis by district." },
      { property: "og:title", content: "Ecosystem view · Purple Dots" },
      { property: "og:description", content: "Provider and seeker gap analysis by district." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function EcosystemView() {
  const [region, setRegion] = useState<RegionValue>({
    state: REGION_TREE[0]?.state ?? "",
    district: REGION_TREE[0]?.districts[0] ?? "",
  });
  const [syncedAt, setSyncedAt] = useState(() => new Date().toISOString());

  const totals = useMemo(() => getEcosystemTotals(region), [region]);

  return (
    <Tabs defaultValue="providers" className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap items-center gap-2">
          <RegionSelector value={region} onChange={setRegion} />
          <TabsList>
            <TabsTrigger
              value="providers"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Providers
            </TabsTrigger>
            <TabsTrigger
              value="seekers"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Seekers
            </TabsTrigger>
            <TabsTrigger
              value="onboarding"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Onboarding
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
            {`Synced ${syncedAgo(syncedAt)}`}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setSyncedAt(new Date().toISOString())}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync now
          </Button>
        </div>
      </div>

      <TabsContent value="providers" className="space-y-6 mt-0">
        <TotalsRow totals={totals} />
        <GapSummary totals={totals} />
        <ProvidersGapPanel region={region} />
      </TabsContent>

      <TabsContent value="seekers" className="space-y-6 mt-0">
        <TotalsRow totals={totals} />
        <GapSummary totals={totals} />
        <SeekersGapPanel region={region} />
      </TabsContent>

      <TabsContent value="onboarding" className="space-y-6 mt-0">
        <OnboardingTab region={region} />
      </TabsContent>
    </Tabs>
  );
}

function TotalsRow({ totals }: { totals: ReturnType<typeof getEcosystemTotals> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <MetricCard
        label="Total seekers"
        value={totals.totalSeekers}
        sub="registered in this district"
      />
      <MetricCard
        label="Total service providers"
        value={totals.totalProviders}
        sub="active organisations"
      />
      <MetricCard
        label="Total connections"
        value={totals.totalConnections}
        sub="seeker ↔ provider links made"
      />
    </div>
  );
}

function Figure({ value, label, red }: { value: string; label: string; red?: boolean }) {
  return (
    <div>
      <p
        className={`text-2xl font-semibold tracking-tight tabular-nums ${
          red ? "text-red-600 dark:text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function GapSummary({ totals }: { totals: ReturnType<typeof getEcosystemTotals> }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Action gap" description="Connections the ecosystem could have initiated.">
        <div className="grid grid-cols-2 gap-4">
          <Figure
            value={`${fmt(totals.seekersInitiated)} / ${fmt(totals.totalSeekers)}`}
            label="Seekers · initiated connections"
          />
          <Figure
            value={`${fmt(totals.providersInitiated)} / ${fmt(totals.totalProviders)}`}
            label="Providers · initiated connections"
          />
        </div>
      </Panel>
      <Panel title="Demand-supply gap" description="Where supply cannot meet demand today.">
        <div className="grid grid-cols-2 gap-4">
          <Figure
            red
            value={fmt(totals.seekerDemandGap)}
            label="Gap in seeker demand · seekers above current provider capacity"
          />
          <Figure
            red
            value={fmt(totals.providerSupplyGap)}
            label="Gap in provider supply · providers needed to meet seeker demand"
          />
        </div>
      </Panel>
    </div>
  );
}

const LEVEL_OPTIONS: (GapLevelLabel | "All")[] = ["All", "High", "Medium", "Low"];

function GapFilters({
  itemLabel,
  options,
  value,
  onValue,
  level,
  onLevel,
  shown,
  total,
}: {
  itemLabel: string;
  options: string[];
  value: string;
  onValue: (v: string) => void;
  level: string;
  onLevel: (v: string) => void;
  shown: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <Select value={value} onValueChange={onValue}>
        <SelectTrigger className="h-8 w-[240px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="All">All {itemLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={level} onValueChange={onLevel}>
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LEVEL_OPTIONS.map((l) => (
            <SelectItem key={l} value={l}>
              {l === "All" ? "All gap levels" : `${l} gap`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="ml-auto text-xs text-muted-foreground">
        {shown} of {total} {itemLabel}
      </span>
    </div>
  );
}

function ProvidersGapPanel({ region }: { region: RegionValue }) {
  const rows = useMemo(() => getProviderCategories(region), [region]);
  const [cat, setCat] = useState("All");
  const [level, setLevel] = useState("All");
  const [open, setOpen] = useState<string | null>(null);

  const enriched = providerGapRows(rows);

  const filtered = enriched.filter(
    (r) => (cat === "All" || r.category === cat) && matchesGapLevel(r, level),
  );

  return (
    <Panel
      title="Gaps"
      description="Status on gaps from inaction, and from demand outstripping supply."
      action={
        <Button variant="outline" size="sm">
          Request download
        </Button>
      }
    >
      <GapFilters
        itemLabel="categories"
        options={rows.map((r) => r.category)}
        value={cat}
        onValue={setCat}
        level={level}
        onLevel={setLevel}
        shown={filtered.length}
        total={rows.length}
      />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service category</TableHead>
              <TableHead className="text-right">Service providers</TableHead>
              <TableHead className="text-right">
                Can service upto{" "}
                <span className="block text-[10px] font-normal text-muted-foreground">
                  count of seekers
                </span>
              </TableHead>
              <TableHead className="text-right">Matching seekers</TableHead>
              <TableHead className="text-right">Connections</TableHead>
              <TableHead className="text-right">Action gap</TableHead>
              <TableHead>Action gap level</TableHead>
              <TableHead className="text-right">Demand-supply gap</TableHead>
              <TableHead>Demand-supply gap level</TableHead>
              <TableHead>Recommended actions</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.category}>
                <TableCell className="font-medium">{r.category}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.providers)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.capacity)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.matching)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.connections)}</TableCell>
                <TableCell className="text-right">
                  <GapNumber value={r.ag} />
                </TableCell>
                <TableCell>
                  <LevelBadge level={r.agL} />
                </TableCell>
                <TableCell className="text-right">
                  <GapNumber value={r.ds} />
                </TableCell>
                <TableCell>
                  <LevelBadge level={r.dsL} />
                </TableCell>
                <TableCell>
                  <Actions items={r.actions} />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`View providers in ${r.category}`}
                    onClick={() => setOpen(r.category)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  No categories match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ProviderDrilldown region={region} category={open} onClose={() => setOpen(null)} />
    </Panel>
  );
}

function SeekersGapPanel({ region }: { region: RegionValue }) {
  const rows = useMemo(() => getSeekerNeeds(region), [region]);
  const [need, setNeed] = useState("All");
  const [level, setLevel] = useState("All");
  const [open, setOpen] = useState<string | null>(null);

  const enriched = seekerGapRows(rows);

  const filtered = enriched.filter(
    (r) => (need === "All" || r.area === need) && matchesGapLevel(r, level),
  );

  return (
    <Panel
      title="Gaps"
      description="Status on gaps from inaction, and from demand outstripping supply."
      action={
        <Button variant="outline" size="sm">
          Request download
        </Button>
      }
    >
      <GapFilters
        itemLabel="needs"
        options={rows.map((r) => r.area)}
        value={need}
        onValue={setNeed}
        level={level}
        onLevel={setLevel}
        shown={filtered.length}
        total={rows.length}
      />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Seeker need area</TableHead>
              <TableHead className="text-right">Aggregators</TableHead>
              <TableHead className="text-right">
                Can reach upto{" "}
                <span className="block text-[10px] font-normal text-muted-foreground">
                  count of seekers
                </span>
              </TableHead>
              <TableHead className="text-right">Matching providers</TableHead>
              <TableHead className="text-right">Connections</TableHead>
              <TableHead className="text-right">Action gap</TableHead>
              <TableHead>Action gap level</TableHead>
              <TableHead className="text-right">Demand-supply gap</TableHead>
              <TableHead>Demand-supply gap level</TableHead>
              <TableHead>Recommended actions</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.area}>
                <TableCell className="font-medium">{r.area}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.aggregators)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.reach)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.matching)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.connections)}</TableCell>
                <TableCell className="text-right">
                  <GapNumber value={r.ag} />
                </TableCell>
                <TableCell>
                  <LevelBadge level={r.agL} />
                </TableCell>
                <TableCell className="text-right">
                  <GapNumber value={r.ds} />
                </TableCell>
                <TableCell>
                  <LevelBadge level={r.dsL} />
                </TableCell>
                <TableCell>
                  <Actions items={r.actions} />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`View aggregators for ${r.area}`}
                    onClick={() => setOpen(r.area)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  No needs match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <SeekerDrilldown region={region} area={open} onClose={() => setOpen(null)} />
    </Panel>
  );
}
