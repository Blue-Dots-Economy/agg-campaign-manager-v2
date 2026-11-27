import { Check, FileText, Loader2, Rocket } from "lucide-react";
import { Panel } from "@/components/Panel";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CohortIntent, ConfidenceBand } from "@/lib/cohort";

const INTENTS = [
  {
    id: "drive",
    icon: Rocket,
    title: "Drive Applications",
    desc: "Call seekers to push them to apply.",
  },
  {
    id: "fill",
    icon: FileText,
    title: "Fill Missing Information",
    desc: "Call seekers to complete their profile.",
  },
] as const;

const STATUSES = ["New", "Active", "At Risk", "Inactive"];

const BANDS: { id: ConfidenceBand; label: string }[] = [
  { id: "low", label: "Low (< 40)" },
  { id: "medium", label: "Medium (40–70)" },
  { id: "high", label: "High (> 70)" },
];

interface CohortStepProps {
  intent: CohortIntent;
  setIntent: (v: CohortIntent) => void;
  profileStatuses: string[];
  setProfileStatuses: (v: string[]) => void;
  confidenceBand: ConfidenceBand;
  setConfidenceBand: (v: ConfidenceBand) => void;
  loading: boolean;
  count: number;
}

/** Step 3 (cohort): pick the call intent and filter, and show how many seekers match. */
export function CohortStep({
  intent,
  setIntent,
  profileStatuses,
  setProfileStatuses,
  confidenceBand,
  setConfidenceBand,
  loading,
  count,
}: CohortStepProps) {
  const toggleStatus = (s: string) =>
    setProfileStatuses(
      profileStatuses.includes(s)
        ? profileStatuses.filter((x) => x !== s)
        : [...profileStatuses, s],
    );

  return (
    <Panel title="Step 3 · Create cohort" description="Build an audience from My Blue Dots">
      <div className="grid gap-3 sm:grid-cols-2 max-w-xl mb-5">
        {INTENTS.map((o) => (
          <button
            key={o.id}
            onClick={() => setIntent(o.id)}
            className={cn(
              "rounded-xl border-2 p-4 text-left transition-colors flex items-start gap-3",
              intent === o.id
                ? "border-brand bg-brand-soft"
                : "border-border bg-card hover:bg-muted/40",
            )}
          >
            <span className="mt-0.5 text-brand">
              <o.icon className="h-5 w-5" />
            </span>
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold">
                {o.title}
                {o.id === "fill" && (
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                    Mock
                  </span>
                )}
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">{o.desc}</span>
            </span>
          </button>
        ))}
      </div>

      {intent === "drive" ? (
        <div className="max-w-xl">
          <Label className="text-xs">Profile status · select one or more</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {STATUSES.map((s) => {
              const on = profileStatuses.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5",
                    on
                      ? "border-brand bg-brand text-brand-foreground hover:bg-brand/90"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {on && <Check className="h-3 w-3" />}
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="max-w-xl">
          <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            Confidence score isn't in the data yet — this is a mock using profile completeness as a
            stand-in until the field lands.
          </div>
          <Label className="text-xs">Confidence score · target a band</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {BANDS.map((b) => {
              const on = confidenceBand === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setConfidenceBand(b.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5",
                    on
                      ? "border-brand bg-brand text-brand-foreground hover:bg-brand/90"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {on && <Check className="h-3 w-3" />}
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-5 flex items-baseline gap-2 border-t border-border pt-4">
        {loading ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading My Blue Dots…
          </span>
        ) : (
          <>
            <span className="text-2xl font-semibold tabular-nums">
              {count.toLocaleString("en-IN")}
            </span>
            <span className="text-sm text-muted-foreground">
              blue dots match — they'll be called
            </span>
          </>
        )}
      </div>
    </Panel>
  );
}
