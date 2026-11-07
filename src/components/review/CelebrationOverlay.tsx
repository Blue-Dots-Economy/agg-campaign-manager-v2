import { Check } from "lucide-react";

/** Which check-mark animation plays after a review is submitted. */
export type Celebration = "normal" | "milestone";

/** Full-screen check-mark shown briefly after a review is submitted. */
export function CelebrationOverlay({ celebrate }: { celebrate: Celebration | null }) {
  return (
    <>
      {celebrate && (
        <div
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          aria-hidden="true"
        >
          {celebrate === "milestone" && (
            <>
              <span className="rozgar-ring absolute h-28 w-28 rounded-full border-4 border-primary" />
              <span className="rozgar-ring-2 absolute h-28 w-28 rounded-full border-4 border-primary" />
            </>
          )}
          <span className="rozgar-pop flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl">
            <Check className="h-10 w-10" strokeWidth={3} />
          </span>
        </div>
      )}
    </>
  );
}
