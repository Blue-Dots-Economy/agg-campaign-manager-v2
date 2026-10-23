import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { NOT_SIGNED_IN } from "./auth/middleware";
import { routeTree } from "./routeTree.gen";

// The session ended (expired, or the user was deactivated): go to login rather
// than leave a page that silently fails to load.
function toLoginIfSignedOut(error: unknown) {
  if (typeof window === "undefined") return;
  if (error instanceof Error && error.message === NOT_SIGNED_IN && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

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
  });

  return router;
};
