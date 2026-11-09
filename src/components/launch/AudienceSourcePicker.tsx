import { Gauge, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AudienceSource } from "@/lib/launch/wizard";

const SOURCES = [
  {
    id: "upload",
    icon: Upload,
    title: "Bulk upload",
    desc: "Dial a CSV of contacts you provide.",
  },
  {
    id: "cohort",
    icon: Gauge,
    title: "Create cohort",
    desc: "Build an audience from My Blue Dots.",
  },
] as const;

interface AudienceSourcePickerProps {
  source: AudienceSource;
  onSelect: (source: AudienceSource) => void;
}

/** Step 3 header: choose between a CSV upload and a seekers cohort. */
export function AudienceSourcePicker({ source, onSelect }: AudienceSourcePickerProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
      {SOURCES.map((o) => (
        <button
          key={o.id}
          onClick={() => onSelect(o.id)}
          className={cn(
            "rounded-xl border-2 p-4 text-left transition-colors flex items-start gap-3",
            source === o.id
              ? "border-brand bg-brand-soft"
              : "border-border bg-card hover:bg-muted/40",
          )}
        >
          <span className="mt-0.5 text-brand">
            <o.icon className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">{o.title}</span>
            <span className="block text-xs text-muted-foreground mt-0.5">{o.desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
