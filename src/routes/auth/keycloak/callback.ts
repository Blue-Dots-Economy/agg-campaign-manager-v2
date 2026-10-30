import { createFileRoute } from "@tanstack/react-router";

// Keycloak sends the browser back here with a one-time code. The checks are in
// callback.server.ts.
export const Route = createFileRoute("/auth/keycloak/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { appOrigin, keycloakConfig } = await import("@/server/auth/config.server");
        const kc = await import("@/server/auth/keycloak.server");
        const session = await import("@/server/auth/session.server");
        const { linkKeycloakIdentity } = await import("@/server/auth/keycloak-link.server");
        const { handleCallback } = await import("@/server/auth/callback.server");

        return handleCallback(request, {
          config: () => keycloakConfig(),
          appOrigin: () => appOrigin(),
          secretKey: session.secretKey,
          openLoginRequest: kc.openLoginRequest,
          exchangeCode: (c, origin, code, verifier) => kc.exchangeCode(c, origin, code, verifier),
          verifyIdToken: (c, idToken, req) => kc.verifyIdToken(c, idToken, req),
          link: (id, name) => linkKeycloakIdentity(id, name),
          signSession: session.signSession,
          readCookie: session.readCookie,
          cookieHeader: session.cookieHeader,
          oidcCookie: kc.OIDC_COOKIE,
          sessionCookie: session.SESSION_COOKIE,
          sessionTtlSeconds: session.SESSION_TTL_SECONDS,
        });
      },
    },
  },
});
