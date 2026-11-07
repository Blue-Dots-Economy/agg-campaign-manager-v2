import { useState } from "react";
import { Plus, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  MAX_RATING,
  NO_ISSUES,
  NOTES_MAX_LENGTH,
  ratingLabel,
  type TurnFlag,
} from "@/lib/review/review-form";

interface IssueOption {
  id: string;
  color: string;
  desc: string;
  /** Programs that offer this issue; all programs when absent. */
  datasets?: string[];
}

const ISSUE_OPTIONS: IssueOption[] = [
  { id: "Latency Issue", color: "bg-red-500", desc: "Bot paused too long between responses" },
  {
    id: "Flow Broken",
    color: "bg-orange-500",
    desc: "Conversation jumped phases or skipped steps",
  },
  {
    id: "Data Not Capturing",
    color: "bg-yellow-500",
    desc: "Bot failed to record what employer said",
  },
  {
    id: "Transcript Issue",
    color: "bg-purple-500",
    desc: "Speech-to-text errors, wrong language or garbled text",
  },
  {
    id: "Hallucinating",
    color: "bg-blue-500",
    desc: "Bot made up information not said by employer",
  },
  { id: "Wrong Language", color: "bg-gray-800", desc: "Bot spoke in wrong language" },
  { id: "API Failing", color: "bg-pink-500", desc: "API errors or failures during the call" },
  {
    id: "Irrelevant Job Shared",
    color: "bg-indigo-500",
    desc: "Job recommendation didn't match the seeker",
    datasets: ["seekers"],
  },
  { id: "Weak Introduction", color: "bg-violet-500", desc: "Introduction needs to be better" },
  { id: NO_ISSUES, color: "bg-emerald-500", desc: "Everything looked correct" },
];

const RATING_STEPS = Array.from({ length: MAX_RATING }, (_, i) => i + 1);

interface IssuesPickerProps {
  dataset: string;
  issues: string[];
  onToggleIssue: (id: string) => void;
}

/** Checklist of call issues offered for the program. */
export function IssuesPicker({ dataset, issues, onToggleIssue }: IssuesPickerProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Label className="text-sm font-semibold">Issues detected</Label>
      <div className="mt-3 space-y-2">
        {ISSUE_OPTIONS.filter((o) => !o.datasets || o.datasets.includes(dataset)).map((opt) => {
          const checked = issues.includes(opt.id);
          return (
            <label
              key={opt.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-2.5",
                checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggleIssue(opt.id)}
                className="mt-0.5"
              />
              <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", opt.color)} />
              <span className="flex-1">
                <span className="block text-sm font-medium">{opt.id}</span>
                <span className="block text-xs text-muted-foreground">{opt.desc}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** A turn flag in the form; `key` keeps list rows stable and is not saved. */
export interface FlagEntry extends TurnFlag {
  key: string;
}

interface TurnFlagsEditorProps {
  turnCount: number;
  flags: FlagEntry[];
  onAdd: (flag: TurnFlag) => void;
  onRemove: (key: string) => void;
  onScrollToTurn: (turn: number) => void;
}

/** Pins notes to transcript turns; clicking a flag scrolls to its turn. */
export function TurnFlagsEditor({
  turnCount,
  flags,
  onAdd,
  onRemove,
  onScrollToTurn,
}: TurnFlagsEditorProps) {
  const [flagTurn, setFlagTurn] = useState("");
  const [flagNote, setFlagNote] = useState("");
  const turnNumbers = Array.from({ length: turnCount }, (_, i) => i + 1);

  function addFlag() {
    const n = parseInt(flagTurn, 10);
    if (!n || !flagNote.trim()) {
      toast.error("Pick a turn and write a note.");
      return;
    }
    onAdd({ turn: n, note: flagNote.trim() });
    setFlagTurn("");
    setFlagNote("");
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Label className="text-sm font-semibold">Flag a specific turn</Label>
      <div className="mt-3 flex gap-2">
        <Select value={flagTurn} onValueChange={setFlagTurn}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Turn" />
          </SelectTrigger>
          <SelectContent>
            {turnNumbers.map((n) => (
              <SelectItem key={n} value={String(n)}>
                Turn {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={flagNote}
          onChange={(e) => setFlagNote(e.target.value)}
          placeholder="Describe the issue…"
          className="flex-1"
        />
        <Button type="button" onClick={addFlag} size="icon" variant="outline" className="shrink-0">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {flags.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {flags.map((f) => (
            <li
              key={f.key}
              className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2 text-xs"
            >
              <button
                onClick={() => onScrollToTurn(f.turn)}
                className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-700 dark:text-red-400 hover:bg-red-500/25"
              >
                Turn {f.turn}
              </button>
              <span className="flex-1 text-foreground/80">{f.note}</span>
              <button
                onClick={() => onRemove(f.key)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface NotesFieldProps {
  notes: string;
  setNotes: (notes: string) => void;
}

/** Free-text observations, capped at `NOTES_MAX_LENGTH` characters. */
export function NotesField({ notes, setNotes }: NotesFieldProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Label htmlFor="notes" className="text-sm font-semibold">
        Additional observations
      </Label>
      <Textarea
        id="notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX_LENGTH))}
        rows={3}
        className="mt-2"
        placeholder="Anything else worth mentioning…"
      />
      <div className="mt-1 text-right text-xs text-muted-foreground">
        {notes.length}/{NOTES_MAX_LENGTH}
      </div>
    </div>
  );
}

interface RatingPickerProps {
  rating: number;
  setRating: (rating: number) => void;
}

/** One-to-five star rating of the call. */
export function RatingPicker({ rating, setRating }: RatingPickerProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Label className="text-sm font-semibold">Overall call quality</Label>
      <div className="mt-2 flex items-center gap-1">
        {RATING_STEPS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className="rounded p-1 transition hover:scale-110"
            aria-label={`Rate ${n}`}
          >
            <Star
              className={cn(
                "h-6 w-6",
                n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
              )}
            />
          </button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">{ratingLabel(rating)}</span>
      </div>
    </div>
  );
}

interface SubmitBarProps {
  canSubmit: boolean;
  hint: string;
  submitting: boolean;
  isAdmin: boolean;
  bulkMode: boolean;
  onSubmit: () => void;
}

/** Sticky submit button with the reason it is not ready yet. */
export function SubmitBar({
  canSubmit,
  hint,
  submitting,
  isAdmin,
  bulkMode,
  onSubmit,
}: SubmitBarProps) {
  return (
    <div className="sticky bottom-0 z-10 -mx-1 border-t border-border bg-card/95 px-1 pb-1 pt-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      {!canSubmit && (
        <p className="mb-2 text-center text-[11px] font-medium text-muted-foreground">{hint}</p>
      )}
      <Button onClick={onSubmit} disabled={submitting || isAdmin} className="w-full rounded-full">
        {submitting
          ? "Submitting…"
          : isAdmin
            ? "Reviewing disabled for admin"
            : bulkMode
              ? "Submit & next call"
              : "Submit Review"}
      </Button>
    </div>
  );
}
