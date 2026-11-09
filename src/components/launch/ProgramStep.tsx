import { Panel } from "@/components/Panel";
import { registry, type ProgramId } from "@/programs/registry";
import { cn } from "@/lib/utils";

/** Programs a batch can be launched for, in display order. */
const LAUNCH_PROGRAMS: ProgramId[] = ["seekers", "providers"];

interface ProgramStepProps {
  program: ProgramId;
  onSelect: (program: ProgramId) => void;
}

/** Step 1: pick the program the batch belongs to. */
export function ProgramStep({ program, onSelect }: ProgramStepProps) {
  return (
    <Panel title="Step 1 · Program" description="Pick which program this batch belongs to">
      <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
        {LAUNCH_PROGRAMS.map((p) => (
          <button
            key={p}
            onClick={() => onSelect(p)}
            className={cn(
              "rounded-xl border-2 p-5 text-left transition-colors",
              program === p
                ? "border-brand bg-brand-soft"
                : "border-border bg-card hover:bg-muted/40",
            )}
          >
            <div className="text-lg font-semibold">{registry[p].label}</div>
            <div className="text-xs text-muted-foreground mt-1">{registry[p].subtitle}</div>
          </button>
        ))}
      </div>
    </Panel>
  );
}
