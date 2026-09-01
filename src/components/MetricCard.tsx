import type { MetricCardDef, MetricGroup } from "@/lib/snapshot.functions";

const ACCENTS: Record<MetricCardDef["accent"], { bar: string; dot: string; text: string }> = {
  green: { bar: "bg-emerald-500", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  amber: { bar: "bg-amber-500", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  red: { bar: "bg-rose-500", dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  blue: { bar: "bg-brand", dot: "bg-brand", text: "text-brand" },
};

export function MetricCard({ def }: { def: MetricCardDef }) {
  const a = ACCENTS[def.accent];
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-5">
      <div className={`absolute inset-y-0 left-0 w-1 ${a.bar}`} aria-hidden />
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
        <p className="text-xs font-medium text-muted-foreground">{def.label}</p>
      </div>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${a.text}`}>{def.value}</p>
      {def.sub ? <p className="mt-2 text-[11px] text-muted-foreground">{def.sub}</p> : null}
    </div>
  );
}

export function MetricGroupSection({ group }: { group: MetricGroup }) {
  if (!group.cards.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-foreground">{group.title}</h2>
        {group.subtitle ? (
          <p className="text-[11px] text-muted-foreground">{group.subtitle}</p>
        ) : null}
      </div>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(180px, 1fr))` }}
      >
        {group.cards.map((c) => (
          <MetricCard key={c.key} def={c} />
        ))}
      </div>
    </section>
  );
}
