import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { Panel } from "@/components/Panel";
import { fetchNorthStar } from "@/lib/north-star.functions";
import { campaignRuns, pooledRate, type NorthStarTrendPoint } from "./north-star-trend";

const tooltipStyle = {
  // Keeps tooltip rows in series order; recharts sorts them by name by default.
  itemSorter: () => 0,
  contentStyle: {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 12,
  },
} as const;

const SERIES = [
  { key: "pickup_to_app", name: "Pickup → Connection", color: "var(--color-chart-1)" },
  { key: "highintent_to_app", name: "High-Intent → Connection", color: "var(--color-chart-2)" },
  { key: "pickup_to_highintent", name: "Pickup → High-Intent", color: "var(--color-chart-3)" },
] as const;

const WINDOWS = [
  { count: 1, label: "Last 1" },
  { count: 3, label: "Last 3" },
  { count: 5, label: "Last 5" },
  { count: 10, label: "Last 10" },
] as const;

export function NorthStarTrend({
  program,
  campaigns,
}: {
  program: string;
  campaigns: NorthStarTrendPoint[];
}) {
  const fetchFn = useServerFn(fetchNorthStar);
  const { data: config } = useQuery({
    queryKey: ["north-star", program],
    queryFn: () => fetchFn({ data: { program } }),
    staleTime: 5 * 60_000,
  });

  const data = useMemo(() => campaignRuns(campaigns ?? []), [campaigns]);

  const targets = new Map((config ?? []).map((r) => [r.key, r.threshold]));

  if (data.length === 0) return null;

  return (
    <Panel
      title="North Star performance over time"
      description="Per-campaign conversion rates against shared targets"
    >
      <div className="h-72">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="var(--color-muted-foreground)"
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip {...tooltipStyle} formatter={(v) => `${String(v)}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={null} />
            {SERIES.map((s) => {
              const t = targets.get(s.key);
              return t == null ? null : (
                <ReferenceLine
                  key={`t-${s.key}`}
                  y={t}
                  stroke={s.color}
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                />
              );
            })}
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {SERIES.map((s) => {
          const t = targets.get(s.key);
          const average = pooledRate(data, s.key);
          return (
            <div key={`avg-${s.key}`} className="rounded-md border border-border px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="truncate">{s.name}</span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span
                  className="text-lg font-semibold tabular-nums"
                  title={`${average.num} / ${average.den}`}
                >
                  {average.rate.toFixed(1)}%
                </span>
                <span className="text-[11px] text-muted-foreground">
                  pooled {average.num}/{average.den} · {data.length}{" "}
                  {data.length === 1 ? "campaign" : "campaigns"}
                  {t == null ? "" : ` · target ${t}%`}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                {WINDOWS.map((w) => {
                  const r = pooledRate(data.slice(-w.count), s.key);
                  return (
                    <span key={w.label} title={r.parts.join("\n") || "no runs"}>
                      {w.label}:{" "}
                      <span className="font-medium text-foreground">{r.rate.toFixed(1)}%</span>
                      <span className="text-[10px]">
                        {" "}
                        ({r.num}/{r.den})
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Rates are pooled across the {data.length} {data.length === 1 ? "campaign" : "campaigns"} in
        range — total numerator ÷ total denominator — so runs with no calls don't drag the number to
        0%. Last 1/3/5/10 use the most recent campaign runs (or fewer if the range is shorter). A
        campaign is one date × type × language run. Dashed lines show the shared target for each
        metric (set them in North Star Metrics).
      </p>
    </Panel>
  );
}
