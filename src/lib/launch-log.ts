// Tiny client-side launch log stored in localStorage so the Data & Uploads view
// can surface batches launched from the wizard.
export interface LaunchLogEntry {
  date: string; // ISO
  program: "kkb" | "dkb";
  file: string;
  rows: number;
  status: "appended" | "queued" | "failed";
  batchId?: string;
}

const KEY = "rozgar.launchLog";

export function getLaunchLog(): LaunchLogEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

export function appendLaunchLog(entry: LaunchLogEntry) {
  if (typeof window === "undefined") return;
  const list = [entry, ...getLaunchLog()].slice(0, 50);
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("rozgar:launchLog"));
}
