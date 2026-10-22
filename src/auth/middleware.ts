// Imported by client code: server-only modules load inside .server().
import { createMiddleware } from "@tanstack/react-start";
import type { Role } from "./roles";

// The client sends the user to login when it sees this message (see router.tsx).
export const NOT_SIGNED_IN = "Not signed in";

async function fail(status: 401 | 403, message: string): Promise<never> {
  const { setResponseStatus } = await import("@tanstack/react-start/server");
  setResponseStatus(status);
  throw new Error(message);
}

// POSTs from a browser on another site are refused. Compared with APP_BASE_URL,
// not the request's Host, so a proxy rewriting Host can't widen it. A missing
// APP_BASE_URL throws, so the check fails closed.
async function assertSameOrigin(): Promise<void> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { appOrigin } = await import("@/server/auth/config.server");
  const req = getRequest();
  if (req.method !== "POST") return;
  const expected = appOrigin();
  const origin = req.headers.get("origin");
  if (!origin) return;
  let actual: string | null = null;
  try {
    actual = new URL(origin).origin;
  } catch {
    /* malformed: refused below */
  }
  if (actual !== expected) await fail(403, "Cross-site request refused");
}

// Public functions only (login, me, logout): the cross-site check, no session.
export const publicMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  await assertSameOrigin();
  return next();
});

// No password-change gate: changePassword only.
export const sessionMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  await assertSameOrigin();
  const { currentUser } = await import("@/server/auth/session.server");
  const user = await currentUser();
  if (!user) return fail(401, NOT_SIGNED_IN);
  return next({ context: { user } });
});

// The password-change gate applies to the basic flow only: in the Keycloak flow
// passwords live in Keycloak, so a leftover flag must not lock anyone out.
export const authMiddleware = createMiddleware({ type: "function" })
  .middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    const { authProvider } = await import("@/server/auth/config.server");
    if (context.user.mustChangePassword && authProvider() === "none") {
      await fail(403, "Change your password to continue");
    }
    return next();
  });

export function requireRole(roles: readonly Role[]) {
  return createMiddleware({ type: "function" })
    .middleware([authMiddleware])
    .server(async ({ next, context }) => {
      if (!roles.includes(context.user.role)) await fail(403, "Not allowed for your role");
      return next();
    });
}
