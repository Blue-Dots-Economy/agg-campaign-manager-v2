import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    const { logEvent } = await import("./server/log.server");
    logEvent("error", {
      operation: "request",
      status: "failure",
      error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/** TanStack Start instance; its request middleware shows the error page on a crash. */
export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
