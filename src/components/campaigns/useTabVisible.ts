import { useEffect, useState } from "react";

/** True while the browser tab is visible; polling pauses when it is hidden. */
export function useTabVisible() {
  const [visible, setVisible] = useState(typeof document !== "undefined" ? !document.hidden : true);
  useEffect(() => {
    const h = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);
  return visible;
}
