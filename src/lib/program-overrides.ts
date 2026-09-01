// Per-program editable overrides persisted to localStorage (session-only edits
// in Settings; registry remains the source of defaults).

import { useEffect, useState } from "react";
import type { ProgramId } from "@/programs/registry";

interface Overrides {
  rayaAgentId?: string;
  sheetCsvUrl?: string;
}

const KEY = (id: ProgramId) => `rozgar.${id}.overrides`;

export function getOverrides(id: ProgramId): Overrides {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY(id)) ?? "{}");
  } catch {
    return {};
  }
}

export function setOverrides(id: ProgramId, next: Overrides) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY(id), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("rozgar:overrides", { detail: { id } }));
}

export function useProgramOverrides(id: ProgramId): Overrides {
  const [v, setV] = useState<Overrides>(() => getOverrides(id));
  useEffect(() => {
    setV(getOverrides(id));
    const onChange = () => setV(getOverrides(id));
    window.addEventListener("rozgar:overrides", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("rozgar:overrides", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [id]);
  return v;
}
