// Table cells shared by the ecosystem gap panels and their drilldowns.
import { fmtCount } from "@/components/ecosystem/ecosystemHelpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type GapLevelLabel } from "@/lib/ecosystem-data";

const LEVEL_CLASSES: Record<GapLevelLabel, string> = {
  High: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
  Medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  Low: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent",
};

/** Coloured badge for a gap level. */
export function LevelBadge({ level }: { level: GapLevelLabel }) {
  return (
    <Badge variant="outline" className={LEVEL_CLASSES[level]}>
      {level}
    </Badge>
  );
}

/** Gap count in the gap colour. */
export function GapNumber({ value }: { value: number }) {
  return <span className="tabular-nums text-red-600 dark:text-red-400">{fmtCount(value)}</span>;
}

/** Recommended actions as small buttons, or a dash when there are none. */
export function Actions({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((a) => (
        <Button
          key={a}
          variant="outline"
          size="sm"
          className="h-7 bg-brand-soft text-brand border-brand/20 text-xs font-normal hover:bg-brand-soft"
        >
          {a}
        </Button>
      ))}
    </div>
  );
}
