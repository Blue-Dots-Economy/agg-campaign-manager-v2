import { createFileRoute } from "@tanstack/react-router";

// "Not you? Sign out of Keycloak" on the login screen. Ends the Keycloak session
// in this browser (Keycloak asks to confirm) and returns to /login, so another
// person can sign in. The only place Campaign Manager ends a Keycloak session.
export const Route = createFileRoute("/auth/keycloak/sign-out")({
  server: {
    handlers: {
      GET: async () => {
        const { appOrigin, keycloakConfig } = await import("@/server/auth/config.server");
        const { keycloakSignOutUrl } = await import("@/server/auth/keycloak.server");
        return new Response(null, {
          status: 302,
          headers: { location: keycloakSignOutUrl(keycloakConfig(), appOrigin()) },
        });
      },
    },
  },
});
