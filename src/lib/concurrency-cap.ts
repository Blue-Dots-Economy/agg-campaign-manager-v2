// Account-wide concurrency cap (default 20). Persisted to localStorage so
// Settings can tweak it; server fn accepts cap as a parameter.

import { useEffect, useState } from "react";

export const CONCURRENCY_CAP_DEFAULT = 20;
const KEY = "rozgar.concurrencyCap";

export function getConcurrencyCap(): number {
  if (typeof window === "undefined") return CONCURRENCY_CAP_DEFAULT;
  const raw = localStorage.getItem(KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : CONCURRENCY_CAP_DEFAULT;
}

export function setConcurrencyCap(n: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, String(n));
  window.dispatchEvent(new CustomEvent("rozgar:cap"));
}

export function useConcurrencyCap(): number {
  const [v, setV] = useState<number>(() => getConcurrencyCap());
  useEffect(() => {
    const onChange = () => setV(getConcurrencyCap());
    window.addEventListener("rozgar:cap", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("rozgar:cap", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return v;
}
