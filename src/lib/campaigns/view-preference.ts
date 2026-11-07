// Remembers whether the completed campaigns section shows the list or the calendar.

/** Layouts of the completed campaigns section. */
export type CampaignsView = "list" | "calendar";

/** Layout used until the user picks one. */
export const DEFAULT_CAMPAIGNS_VIEW: CampaignsView = "calendar";

/** localStorage key that holds the chosen layout. */
export const CAMPAIGNS_VIEW_STORAGE_KEY = "campaigns_view";

/** Returns the stored layout, or null when the value is missing or unknown. */
export function parseCampaignsView(raw: string | null): CampaignsView | null {
  return raw === "list" || raw === "calendar" ? raw : null;
}

/** Reads the saved layout in the browser; returns null on the server. */
export function readSavedCampaignsView(): CampaignsView | null {
  if (typeof window === "undefined") return null;
  return parseCampaignsView(window.localStorage.getItem(CAMPAIGNS_VIEW_STORAGE_KEY));
}

/** Saves the chosen layout for the next visit. */
export function saveCampaignsView(view: CampaignsView): void {
  if (typeof window !== "undefined") window.localStorage.setItem(CAMPAIGNS_VIEW_STORAGE_KEY, view);
}
