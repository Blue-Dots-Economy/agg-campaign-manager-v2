// Per-program editable overrides persisted to localStorage (session-only edits
// in Settings; registry remains the source of defaults).

import { useSyncExternalStore } from "react";
import { z } from "zod";
import type { ProgramId } from "@/programs/registry";

const OverridesSchema = z.object({
  rayaAgentId: z.string().optional(),
  sheetCsvUrl: z.string().optional(),
});

type Overrides = z.infer<typeof OverridesSchema>;

const KEY = (id: ProgramId) => `rozgar.${id}.overrides`;
const CHANGE_EVENT = "rozgar:overrides";

/** Parses stored overrides; anything unreadable or wrongly shaped counts as no overrides. */
export function parseOverrides(raw: string | null): Overrides {
  if (raw === null) return {};
  try {
    const parsed = OverridesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    // Not JSON: treat as no overrides.
    return {};
  }
}

/** Reads the stored overrides for a program; empty on the server. */
export function getOverrides(id: ProgramId): Overrides {
  if (typeof window === "undefined") return {};
  return parseOverrides(localStorage.getItem(KEY(id)));
}

/** Stores the overrides for a program and tells open pages to re-read them. */
export function setOverrides(id: ProgramId, next: Overrides) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY(id), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { id } }));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Current overrides for a program, updated when Settings or another tab changes them. */
export function useProgramOverrides(id: ProgramId): Overrides {
  const raw = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(KEY(id)),
    () => null,
  );
  return parseOverrides(raw);
}
