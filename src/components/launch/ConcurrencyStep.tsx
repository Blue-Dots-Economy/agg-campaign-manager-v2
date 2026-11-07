import { AlertTriangle, Check, Gauge } from "lucide-react";
import { Panel } from "@/components/Panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  concurrencyInputMax,
  DEFAULT_CALL_STATUSES,
  exceedsAvailable,
  LOW_CONCURRENCY_WARNING,
} from "@/lib/launch/wizard";

/** Highest retry count the form offers. */
const MAX_RETRIES_LIMIT = 10;

/** Longest retry delay the form offers: one week. */
const MAX_RETRY_AFTER_HRS = 168;

/** Contact statuses a batch can be told to call. */
const CALL_STATUSES = ["Pending", "Unanswered", "Failed"] as const;

interface ConcurrencyStepProps {
  available: number;
  cap: number;
  usageLoading: boolean;
  batchesInUse: number;
  concurrency: number;
  setConcurrency: (n: number) => void;
  maxRetries: number;
  setMaxRetries: (n: number) => void;
  retryAfterHrs: number;
  setRetryAfterHrs: (n: number) => void;
  selectedStatuses: string[];
  setSelectedStatuses: (update: (prev: string[]) => string[]) => void;
}

/** Step 5: concurrency, retries and which contact statuses to call, with live account usage. */
export function ConcurrencyStep({
  available,
  cap,
  usageLoading,
  batchesInUse,
  concurrency,
  setConcurrency,
  maxRetries,
  setMaxRetries,
  retryAfterHrs,
  setRetryAfterHrs,
  selectedStatuses,
  setSelectedStatuses,
}: ConcurrencyStepProps) {
  return (
    <Panel title="Step 5 · Concurrency & retries" description="How aggressively Raya should dial">
      <div className="mb-4 max-w-2xl rounded-md border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          Raya rate limit: <strong>1 call per 20 seconds</strong> by default. Keep concurrency low
          or launches will be throttled (HTTP 429).
        </div>
      </div>
      <div
        className={cn(
          "mb-4 max-w-2xl rounded-md border px-3 py-2 text-sm flex items-start gap-2",
          available === 0
            ? "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-400"
            : available <= LOW_CONCURRENCY_WARNING
              ? "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300"
              : "border-brand/20 bg-brand-soft text-brand",
        )}
      >
        <Gauge className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <strong>{usageLoading ? "…" : available}</strong> of {cap} concurrency available right now
          (account-wide, shared by KKB + DKB).
          {batchesInUse ? (
            <span className="ml-1 opacity-80">
              In use by {batchesInUse} batch
              {batchesInUse === 1 ? "" : "es"}.
            </span>
          ) : null}
          {exceedsAvailable(concurrency, available) && (
            <div className="mt-1 font-medium">
              Reduce concurrency to {available} or stop a running batch to proceed.
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3 max-w-2xl">
        <NumberField
          label="Concurrency"
          value={concurrency}
          onChange={setConcurrency}
          min={1}
          max={concurrencyInputMax(available)}
        />
        <NumberField
          label="Max retries"
          value={maxRetries}
          onChange={setMaxRetries}
          min={0}
          max={MAX_RETRIES_LIMIT}
        />
        <NumberField
          label="Retry after (hrs)"
          value={retryAfterHrs}
          onChange={setRetryAfterHrs}
          min={1}
          max={MAX_RETRY_AFTER_HRS}
        />
      </div>
      <div className="mt-4 max-w-2xl">
        <Label className="text-xs">Contacts to call (status)</Label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {CALL_STATUSES.map((s) => {
            const active = selectedStatuses.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSelectedStatuses((prev) => {
                    const next = prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s];
                    return next.length === 0 ? DEFAULT_CALL_STATUSES : next;
                  });
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5",
                  active
                    ? "border-brand bg-brand text-brand-foreground hover:bg-brand/90"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/40",
                )}
              >
                {active && <Check className="h-3 w-3" />}
                {s}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Pending = new / not-yet-called contacts. Add Unanswered or Failed to also re-call those
          from a previous run.
        </p>
      </div>
    </Panel>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}

function NumberField({ label, value, onChange, min, max }: NumberFieldProps) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="mt-1"
      />
    </div>
  );
}
