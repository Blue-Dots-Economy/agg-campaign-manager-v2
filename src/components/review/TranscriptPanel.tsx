import type { RefObject } from "react";
import { Loader2 } from "lucide-react";
import { AudioPlayer } from "@/components/review/AudioPlayer";
import { cn } from "@/lib/utils";
import type { ReviewCall } from "@/lib/review-ui";
import { normaliseSpeaker, type Turn } from "@/lib/review/transcript";

interface TranscriptPanelProps {
  call: ReviewCall;
  isLoading: boolean;
  transcript: Turn[];
  flaggedSet: ReadonlySet<number>;
  turnRefs: RefObject<Record<number, HTMLDivElement | null>>;
  recordingUrl: string | undefined;
}

/**
 * Numbered transcript turns with flagged turns marked, and the call recording.
 * Turns keep transcript order, so the turn number is their key.
 */
export function TranscriptPanel({
  call,
  isLoading,
  transcript,
  flaggedSet,
  turnRefs,
  recordingUrl,
}: TranscriptPanelProps) {
  return (
    <section className="lg:col-span-3 lg:h-full lg:min-h-0">
      <div className="flex h-full flex-col rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Transcript</h2>
          <p className="text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `${transcript.length} turns`}
          </p>
        </div>
        <div className="flex-1 min-h-0 space-y-2 overflow-y-auto p-4 max-h-[60vh] lg:max-h-none">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : transcript.length === 0 ? (
            <p className="py-12 text-center text-sm italic text-muted-foreground">
              Transcript not available for this call.
            </p>
          ) : (
            transcript.map((turn, i) => {
              const idx = i + 1;
              const isBot = normaliseSpeaker(turn.speaker) === "Bot";
              const flagged = flaggedSet.has(idx);
              return (
                <div
                  key={idx}
                  ref={(el) => {
                    turnRefs.current[idx] = el;
                  }}
                  className={cn(
                    "rounded-xl border p-3",
                    flagged ? "border-l-4 border-l-red-500 border-border" : "border-border",
                    turn.no_audio && "bg-muted/40",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                        isBot ? "bg-primary" : "bg-slate-400",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold">
                          {isBot ? "Bot" : "Employer"}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            #{idx}
                          </span>
                        </span>
                      </div>
                      <p
                        className={cn(
                          "mt-1 whitespace-pre-wrap text-sm leading-relaxed",
                          turn.no_audio ? "italic text-muted-foreground" : "text-foreground/90",
                        )}
                      >
                        {turn.content || (turn.no_audio ? "[no audio]" : "")}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="border-t border-border p-4">
          <AudioPlayer
            src={recordingUrl}
            companyName={call.call_id || call.job_id}
            duration={Number(call.call_duration_seconds) || 0}
            datetime={call.call_datetime_ist}
          />
        </div>
      </div>
    </section>
  );
}
