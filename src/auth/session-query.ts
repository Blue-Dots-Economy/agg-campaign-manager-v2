// Query key and loader for the signed-in session, shared by the auth provider and its tests.
import type { QueryClient } from "@tanstack/react-query";

/** React Query key for the current session. */
export const SESSION_QUERY_KEY = ["session"] as const;

/**
 * Loads the session with `load`; a failed load (the server can't be reached) means no session.
 *
 * @returns The session, or `null` when not signed in.
 */
export async function loadSessionOrNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    // me() answers null when nobody is signed in; an error here means the server can't be reached.
    return null;
  }
}

/** True for every cached query except the session itself; used to drop user data on sign-in and sign-out. */
export function isNotSessionQuery(query: { queryKey: readonly unknown[] }): boolean {
  return query.queryKey[0] !== SESSION_QUERY_KEY[0];
}

/**
 * Marks every cached query stale except the session, so data refreshes without re-reading who is signed in.
 * A failed session re-read would count as signed out, so the session is left alone.
 */
export function invalidateAllButSession(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ predicate: isNotSessionQuery });
}
