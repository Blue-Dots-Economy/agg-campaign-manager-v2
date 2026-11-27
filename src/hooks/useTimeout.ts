import { useEffect, useRef } from "react";

/**
 * Returns a function that runs a callback after a delay; the timer is cleared on unmount.
 * Scheduling again replaces the pending timer.
 */
export function useTimeout(): (callback: () => void, delayMs: number) => void {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (callback, delayMs) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(callback, delayMs);
  };
}
