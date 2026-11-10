import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { RouteError } from "@/components/RouteError";
import { NOT_SIGNED_IN } from "./auth/middleware";
import { routeTree } from "./routeTree.gen";

/**
 * Sends the browser to the login page when a server call answers "not signed in", so an expired
 * session or a deactivated user does not leave a page that silently fails to load.
 */
function toLoginIfSignedOut(error: unknown) {
  if (typeof window === "undefined") return;
  if (
    error instanceof Error &&
    error.message === NOT_SIGNED_IN &&
    window.location.pathname !== "/login"
  ) {
    window.location.assign("/login");
  }
}

/** Builds the app router with a fresh query client and the shared error screen. */
export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: toLoginIfSignedOut }),
    mutationCache: new MutationCache({ onError: toLoginIfSignedOut }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteError,
  });

  return router;
};
