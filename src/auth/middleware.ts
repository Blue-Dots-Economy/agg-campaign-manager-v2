// Imported by client code: server-only modules load inside .server().
import { createMiddleware } from "@tanstack/react-start";
import type { Role } from "./roles";

async function fail(status: 401 | 403, message: string): Promise<never> {
  const { setResponseStatus } = await import("@tanstack/react-start/server");
  setResponseStatus(status);
  throw new Error(message);
}

async function assertSameOrigin(): Promise<void> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const req = getRequest();
  if (req.method !== "POST") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    /* malformed: refused below */
  }
  if (!host || originHost !== host) await fail(403, "Cross-site request refused");
}

// No password-change gate: me, logout, changePassword only.
export const sessionMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  await assertSameOrigin();
  const { currentUser } = await import("@/server/auth/session.server");
  const user = await currentUser();
  if (!user) return fail(401, "Not signed in");
  return next({ context: { user } });
});

export const authMiddleware = createMiddleware({ type: "function" })
  .middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    if (context.user.mustChangePassword) await fail(403, "Change your password to continue");
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
