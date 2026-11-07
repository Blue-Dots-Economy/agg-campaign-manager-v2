import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ReviewCall } from "@/lib/review-ui";

interface CallInfoPanelProps {
  call: ReviewCall;
  finalSummary: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Collapsible campaign, outcome and summary details for the call. */
export function CallInfoPanel({ call, finalSummary, open, onOpenChange }: CallInfoPanelProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="rounded-xl border border-border bg-card">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
          <span className="text-sm font-semibold">Call Info</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1 border-t border-border px-4 py-3 text-xs">
          <Info k="Campaign Day" v={call.campaign_day} />
          <Info k="Campaign Type" v={call.campaign_type} />
          <Info k="Language" v={call.language} />
          <Info k="Job Status" v={call.job_status} />
          <Info k="Outcome" v={call.call_outcome} />
          <Info k="Drop Reason" v={call.drop_reason} />
          {finalSummary && (
            <div className="pt-2">
              <div className="text-muted-foreground">Final Summary</div>
              <div className="mt-0.5 italic text-foreground/80">{finalSummary}</div>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function Info({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium text-foreground">{v || "—"}</span>
    </div>
  );
}
