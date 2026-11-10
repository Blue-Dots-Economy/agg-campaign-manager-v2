// Server-only helpers for the live-campaign server functions.
import { logEvent } from "@/server/log.server";

/** Message shown when the program's agents cannot be read. */
export const AGENTS_READ_FAILED_MESSAGE = "Could not read this program's agents. Try again later.";

/**
 * Logs a failed agent read and returns the page's failure result.
 * Database errors hold SQL and parameters, so only the error type is logged and none is returned.
 */
export function agentsReadFailed(e: unknown) {
  logEvent("error", {
    operation: "raya-live.readAgents",
    status: "failure",
    error: e instanceof Error ? e.name : "Unknown error",
  });
  return { ok: false as const, batches: [], error: AGENTS_READ_FAILED_MESSAGE };
}
