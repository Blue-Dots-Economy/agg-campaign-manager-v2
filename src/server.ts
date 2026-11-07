import "./lib/error-capture";

import type { ServerEntry } from "@tanstack/react-start/server-entry";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { logEvent } from "./server/log.server";

type FetchOptions = Parameters<ServerEntry["fetch"]>[1];

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function loadServerEntry(): Promise<ServerEntry> {
  const m = await import("@tanstack/react-start/server-entry");
  return m.default;
}

function getServerEntry(): Promise<ServerEntry> {
  serverEntryPromise ??= loadServerEntry();
  return serverEntryPromise;
}

/** Logs an error that ended a request, with its stack for debugging. */
function logRequestFailure(operation: string, error: unknown): void {
  logEvent("error", {
    operation,
    status: "failure",
    error,
    stack: error instanceof Error ? error.stack : undefined,
  });
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  logRequestFailure(
    "ssr.render",
    consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`),
  );
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/** Server entry: wraps the TanStack Start handler and shows the error page on a crash. */
export default {
  async fetch(request: Request, opts?: FetchOptions) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, opts);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      logRequestFailure("ssr.request", error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
