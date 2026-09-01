import { cn } from "@/lib/utils";
const STATUS_STYLES: Record<string, string> = {
  Active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", Closed: "bg-red-500/15 text-red-700 dark:text-red-300",
  Unverified: "bg-amber-500/15 text-amber-700 dark:text-amber-300", "Not Called": "bg-muted text-muted-foreground",
};
const OUTCOME_STYLES: Record<string, string> = {
  Completed: "bg-violet-500/15 text-violet-700 dark:text-violet-300", "Early Disconnect": "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "No Answer": "bg-muted text-muted-foreground",
};
export function StatusChip({ status }: { status?: string }) {
  if (!status) return null;
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLES[status] ?? "bg-muted text-muted-foreground")}>{status}</span>;
}
export function OutcomeChip({ outcome }: { outcome?: string }) {
  if (!outcome) return null;
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", OUTCOME_STYLES[outcome] ?? "bg-muted text-muted-foreground")}>{outcome}</span>;
}
