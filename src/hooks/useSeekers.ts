// Seekers list from the uploaded UP seekers CSV, shared by the launch and request-campaign pages.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadSeekersAsync, type Seeker } from "@/lib/upSeekersCsv";

/** React Query key for the seekers list. Invalidate it after a new CSV upload. */
export const SEEKERS_QUERY_KEY = ["up-seekers"] as const;

/**
 * Loads seekers with `load` and returns an empty list when loading fails.
 * The pages show an empty cohort rather than an error when no CSV can be read.
 */
export async function loadSeekersOrEmpty<T>(load: () => Promise<{ seekers: T[] }>): Promise<T[]> {
  try {
    return (await load()).seekers;
  } catch {
    // An unreadable or missing CSV means no seekers to pick from.
    return [];
  }
}

/** Reads the seekers list once per session; `enabled` defers the read until a page needs it. */
export function useSeekers(enabled = true) {
  return useQuery<Seeker[]>({
    queryKey: SEEKERS_QUERY_KEY,
    queryFn: () => loadSeekersOrEmpty(loadSeekersAsync),
    enabled,
    staleTime: Infinity,
  });
}

/** Returns a function that makes every page read the seekers list again. */
export function useInvalidateSeekers() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SEEKERS_QUERY_KEY });
}
