import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAUNCH_STEPS } from "@/lib/launch/wizard";

/** Numbered progress bar across the top of the launch wizard. */
export function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {LAUNCH_STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={label} className="flex items-center gap-2 shrink-0">
            <div
              className={cn(
                "h-7 w-7 rounded-full text-xs font-semibold flex items-center justify-center border-2",
                done
                  ? "bg-brand border-brand text-brand-foreground"
                  : active
                    ? "border-brand text-brand"
                    : "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-xs whitespace-nowrap",
                active ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {i < LAUNCH_STEPS.length - 1 && <div className="w-6 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}
