import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FN_ROLES, ROLES, type Role } from "@/auth/roles";
import { publicMiddleware, requireRole, sessionMiddleware } from "@/auth/middleware";

export const GENERIC_LOGIN_ERROR = "Email or password is incorrect";
export const TOO_MANY_ATTEMPTS = "Too many attempts. Try again later";

const email = z.string().trim().toLowerCase().email().max(320);
const optText = z.string().trim().max(200).optional().transform((v) => (v ? v : null));

async function db() {
  const [{ getDb }, schema, orm] = await Promise.all([
    import("@/server/db/client.server"),
    import("@/server/db/schema"),
    import("drizzle-orm"),
  ]);
  return { db: getDb(), appUsers: schema.appUsers, ...orm };
}

import type { AuthProvider } from "@/server/auth/config.server";

export type { AuthProvider };

export interface SessionUser {
  email: string;
  name: string | null;
  role: Role;
  district: string | null;
  program: string | null;
  nodeType: string | null;
  nodeName: string | null;
  mustChangePassword: boolean;
}

// authProvider is always there, so the login screen knows which flow to show.
export type MeResult =
  | ({ loggedIn: true; authProvider: AuthProvider } & SessionUser)
  | { loggedIn: false; authProvider: AuthProvider };

// Public: login, me, logout.
export const login = createServerFn({ method: "POST" })
  .middleware([publicMiddleware])
  .inputValidator((d: unknown) => z.object({ email, password: z.string().max(200) }).parse(d))
  .handler(async ({ data }): Promise<{ role: Role; mustChangePassword: boolean }> => {
    const { db: d, appUsers, eq } = await db();
    const pw = await import("@/server/auth/password.server");
    const limit = await import("@/server/auth/login-limit.server");
    const { getRequest, getRequestIP } = await import("@tanstack/react-start/server");
    const { startSession } = await import("@/server/auth/session.server");
    const now = new Date();
    const key = limit.limiterKey(limit.clientAddress(getRequest().headers.get("x-forwarded-for"), getRequestIP()), data.email);

    // Checked before the account, so the answer is the same whether or not the email exists.
    if (limit.loginLimiter.isBlocked(key)) {
      await pw.equaliseRefusal(data.password, null);
      return refuseLogin(429, TOO_MANY_ATTEMPTS);
    }
    const refuse = async (checkedHash: string | null) => {
      limit.loginLimiter.recordFailure(key);
      await pw.equaliseRefusal(data.password, checkedHash);
      return refuseLogin(401, GENERIC_LOGIN_ERROR);
    };
    const [u] = await d.select().from(appUsers).where(eq(appUsers.email, data.email)).limit(1);

    if (!u || !u.active || !u.passwordHash || pw.isLocked(u.lockedUntil, now)) return refuse(null);
    if (!(await pw.verifyPassword(data.password, u.passwordHash))) {
      const next = pw.afterFailedLogin(u.failedLoginCount, u.lastFailedLoginAt, now);
      await d
        .update(appUsers)
        .set({
          failedLoginCount: next.failedLoginCount,
          lockedUntil: next.lockedUntil?.toISOString() ?? null,
          lastFailedLoginAt: next.lastFailedLoginAt.toISOString(),
        })
        .where(eq(appUsers.id, u.id));
      return refuse(u.passwordHash);
    }
    limit.loginLimiter.clear(key);
    await d
      .update(appUsers)
      .set({ failedLoginCount: 0, lockedUntil: null, lastFailedLoginAt: null, lastLoginAt: now.toISOString() })
      .where(eq(appUsers.id, u.id));
    await startSession(u.id);
    return { role: u.role as Role, mustChangePassword: u.mustChangePassword };
  });

async function refuseLogin(status: 401 | 429, message: string): Promise<never> {
  const { setResponseStatus } = await import("@tanstack/react-start/server");
  setResponseStatus(status);
  throw new Error(message);
}

// Works without a valid session, so an expired one can still clear its cookie.
// Returns where the browser should go next.
export const logout = createServerFn({ method: "POST" })
  .middleware([publicMiddleware])
  .handler(async (): Promise<{ redirectTo: string }> => {
    const { endSession } = await import("@/server/auth/session.server");
    endSession();
    return { redirectTo: "/login" };
  });

export const me = createServerFn({ method: "GET" })
  .middleware([publicMiddleware])
  .handler(async (): Promise<MeResult> => {
    const { authProvider } = await import("@/server/auth/config.server");
    const { currentUser } = await import("@/server/auth/session.server");
    const provider = authProvider();
    const user = await currentUser();
    if (!user) return { loggedIn: false, authProvider: provider };
    const { id: _id, ...rest } = user;
    return {
      loggedIn: true,
      authProvider: provider,
      ...rest,
      mustChangePassword: provider === "none" && rest.mustChangePassword,
    };
  });

export const changePassword = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .inputValidator((d: unknown) =>
    z.object({ currentPassword: z.string().max(200), newPassword: z.string().max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db: d, appUsers, eq } = await db();
    const pw = await import("@/server/auth/password.server");
    const problem = pw.passwordProblem(data.newPassword);
    if (problem) throw new Error(problem);
    const [u] = await d.select().from(appUsers).where(eq(appUsers.id, context.user.id)).limit(1);
    if (!u || !(await pw.verifyPassword(data.currentPassword, u.passwordHash))) {
      throw new Error("Current password is incorrect");
    }
    if (data.newPassword === data.currentPassword) throw new Error("Choose a password different from the current one.");
    await d
      .update(appUsers)
      .set({ passwordHash: await pw.hashPassword(data.newPassword), mustChangePassword: false, updatedAt: new Date().toISOString() })
      .where(eq(appUsers.id, u.id));
    return { ok: true };
  });

export interface AppUser {
  email: string;
  name: string | null;
  // null for a user waiting for approval.
  role: string | null;
  district: string | null;
  program: string | null;
  node_type: string | null;
  node_name: string | null;
  active: boolean;
  must_change_password: boolean;
  has_password: boolean;
  locked: boolean;
  created_at: string;
}

const profile = z.object({
  email,
  name: optText,
  role: z.enum(ROLES),
  district: optText,
  program: optText,
  node_type: optText,
  node_name: optText,
});

export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.admin)])
  .handler(async (): Promise<AppUser[]> => {
    const { db: d, appUsers, asc } = await db();
    const { isLocked } = await import("@/server/auth/password.server");
    const now = new Date();
    const rows = await d.select().from(appUsers).orderBy(asc(appUsers.createdAt));
    return rows.map((u) => ({
      email: u.email,
      name: u.name,
      role: u.role,
      district: u.district,
      program: u.program,
      node_type: u.nodeType,
      node_name: u.nodeName,
      active: u.active,
      must_change_password: u.mustChangePassword,
      has_password: !!u.passwordHash,
      locked: isLocked(u.lockedUntil, now),
      created_at: u.createdAt,
    }));
  });

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator((d: unknown) => profile.parse(d))
  .handler(async ({ data }): Promise<{ temporaryPassword: string }> => {
    const { db: d, appUsers, eq } = await db();
    const pw = await import("@/server/auth/password.server");
    const [exists] = await d.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.email, data.email)).limit(1);
    if (exists) throw new Error("A user with this email already exists.");
    const temporaryPassword = pw.temporaryPassword();
    await d.insert(appUsers).values({
      email: data.email,
      name: data.name,
      role: data.role,
      district: data.district,
      program: data.program,
      nodeType: data.node_type,
      nodeName: data.node_name,
      passwordHash: await pw.hashPassword(temporaryPassword),
      mustChangePassword: true,
    });
    return { temporaryPassword };
  });

async function activeAdminCount(): Promise<number> {
  const { db: d, appUsers, and, eq, count } = await db();
  const [r] = await d.select({ n: count() }).from(appUsers).where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true)));
  return r?.n ?? 0;
}

export const updateAppUser = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator((d: unknown) => profile.parse(d))
  .handler(async ({ data }) => {
    const { db: d, appUsers, eq } = await db();
    const [u] = await d.select().from(appUsers).where(eq(appUsers.email, data.email)).limit(1);
    if (!u) throw new Error("No such user.");
    if (u.role === "admin" && u.active && data.role !== "admin" && (await activeAdminCount()) <= 1) {
      throw new Error("Cannot demote the last active admin.");
    }
    await d
      .update(appUsers)
      .set({
        name: data.name,
        role: data.role,
        district: data.district,
        program: data.program,
        nodeType: data.node_type,
        nodeName: data.node_name,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(appUsers.id, u.id));
    return { ok: true };
  });

export const resetAppUserPassword = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator((d: unknown) => z.object({ email }).parse(d))
  .handler(async ({ data }): Promise<{ temporaryPassword: string }> => {
    const { db: d, appUsers, eq } = await db();
    const pw = await import("@/server/auth/password.server");
    const temporaryPassword = pw.temporaryPassword();
    const updated = await d
      .update(appUsers)
      .set({
        passwordHash: await pw.hashPassword(temporaryPassword),
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(appUsers.email, data.email))
      .returning({ id: appUsers.id });
    if (updated.length === 0) throw new Error("No such user.");
    return { temporaryPassword };
  });

export const setAppUserActive = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator((d: unknown) => z.object({ email, active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db: d, appUsers, eq } = await db();
    if (!data.active) {
      if (data.email === context.user.email) throw new Error("You cannot deactivate yourself.");
      const [u] = await d.select().from(appUsers).where(eq(appUsers.email, data.email)).limit(1);
      if (u?.role === "admin" && u.active && (await activeAdminCount()) <= 1) {
        throw new Error("Cannot deactivate the last active admin.");
      }
    }
    await d
      .update(appUsers)
      .set({ active: data.active, updatedAt: new Date().toISOString() })
      .where(eq(appUsers.email, data.email));
    return { ok: true };
  });
