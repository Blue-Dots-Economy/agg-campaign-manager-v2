import { createFileRoute } from "@tanstack/react-router";

// Starts a Keycloak login: remembers state, nonce, PKCE verifier and the start
// time in a short-lived signed cookie, then sends the browser to Keycloak.
// Leaves cm_session alone, so a link from another site can't sign anyone out.
export const Route = createFileRoute("/auth/keycloak/login")({
  server: {
    handlers: {
      GET: async () => {
        const { appOrigin, keycloakConfig } = await import("@/server/auth/config.server");
        const kc = await import("@/server/auth/keycloak.server");
        const { cookieHeader, secretKey } = await import("@/server/auth/session.server");

        const req = kc.newLoginRequest();
        const headers = new Headers({ location: kc.authorizeUrl(keycloakConfig(), appOrigin(), req) });
        headers.append(
          "set-cookie",
          cookieHeader(kc.OIDC_COOKIE, await kc.sealLoginRequest(req, secretKey()), kc.OIDC_TTL_SECONDS),
        );
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
