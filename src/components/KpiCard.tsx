import { MetricCard } from "@/components/metrics/MetricCard";
import type { KpiDef } from "@/programs/registry";

interface Props {
  def: KpiDef;
  value: number;
  previous?: number | null;
}

export function KpiCard({ def, value, previous }: Props) {
  const hasTarget = typeof def.target === "number" && def.target > 0;
  const sub = hasTarget
    ? `Target ${def.format === "percent" ? `${def.target}%` : def.target?.toLocaleString()}`
    : undefined;

  return (
    <MetricCard
      label={def.label}
      value={value}
      format={def.format === "percent" ? "percent" : "number"}
      sub={sub}
      previous={previous ?? null}
    />
  );
}
