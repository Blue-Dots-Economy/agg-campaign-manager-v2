import { createFileRoute } from "@tanstack/react-router";
import { isRole, landingFor } from "@/auth/roles";

// Keycloak sends the browser back here with a one-time code. Every check runs
// before a session is started; any failure clears the session and goes back to
// /login with a reason the login screen turns into a message.
export const Route = createFileRoute("/auth/keycloak/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { appOrigin, keycloakConfig } = await import("@/server/auth/config.server");
        const kc = await import("@/server/auth/keycloak.server");
        const session = await import("@/server/auth/session.server");
        const { linkKeycloakIdentity } = await import("@/server/auth/keycloak-link.server");

        const cfg = keycloakConfig();
        const origin = appOrigin();
        const url = new URL(request.url);
        const clearOidc = session.cookieHeader(kc.OIDC_COOKIE, "", 0);
        // A refused login never leaves an earlier user signed in.
        const backToLogin = (reason: string) =>
          new Response(null, {
            status: 302,
            headers: new Headers([
              ["location", `/login?error=${encodeURIComponent(reason)}`],
              ["set-cookie", clearOidc],
              ["set-cookie", session.cookieHeader(session.SESSION_COOKIE, "", 0)],
            ]),
          });

        // Keycloak reports a cancelled or failed login with ?error=.
        if (url.searchParams.get("error")) return backToLogin("failed");
        const req = await kc.openLoginRequest(session.readCookie(request, kc.OIDC_COOKIE), session.secretKey());
        if (!req || url.searchParams.get("state") !== req.state) return backToLogin("expired");
        const code = url.searchParams.get("code");
        if (!code) return backToLogin("failed");

        let identity: Awaited<ReturnType<typeof kc.verifyIdToken>>;
        try {
          identity = await kc.verifyIdToken(cfg, await kc.exchangeCode(cfg, origin, code, req.verifier), req);
        } catch (e) {
          console.error(`[keycloak] login refused: ${e instanceof Error ? e.message : String(e)}`);
          return backToLogin("failed");
        }
        if (!identity.email || !identity.emailVerified) return backToLogin("unverified");

        const result = await linkKeycloakIdentity({ sub: identity.sub, email: identity.email }, identity.name);
        if (result.kind === "refused") return backToLogin(result.reason);

        const headers = new Headers({ location: landingFor(isRole(result.role) ? result.role : undefined) });
        headers.append("set-cookie", clearOidc);
        headers.append(
          "set-cookie",
          session.cookieHeader(session.SESSION_COOKIE, await session.signSession(result.userId), session.SESSION_TTL_SECONDS),
        );
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
