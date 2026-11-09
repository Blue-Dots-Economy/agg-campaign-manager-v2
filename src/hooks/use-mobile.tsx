import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const isMobileNow = () => window.innerWidth < MOBILE_BREAKPOINT;

/** True when the viewport is narrower than the mobile breakpoint; false during server render. */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, isMobileNow, () => false);
}
