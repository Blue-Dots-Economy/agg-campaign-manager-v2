import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FN_ROLES, ROLES, type Role } from "@/auth/roles";
import { publicMiddleware, requireRole, sessionMiddleware } from "@/auth/middleware";

export const PASSWORDS_OFF = "Sign in with Keycloak. Passwords are not used.";

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

export interface MeResult {
  email: string;
  name: string | null;
  role: Role;
  district: string | null;
  program: string | null;
  nodeType: string | null;
  nodeName: string | null;
  mustChangePassword: boolean;
}

// Password login is switched off: people sign in through Keycloak
// (/auth/keycloak/login). Kept so an old client gets a clear answer.
export const login = createServerFn({ method: "POST" })
  .middleware([publicMiddleware])
  .handler(async (): Promise<never> => refusePasswords());

async function refusePasswords(): Promise<never> {
  const { setResponseStatus } = await import("@tanstack/react-start/server");
  setResponseStatus(403);
  throw new Error(PASSWORDS_OFF);
}

// Works without a valid session, so an expired one can still clear its cookie.
// Ends the Campaign Manager session only; the Keycloak session stays.
export const logout = createServerFn({ method: "POST" })
  .middleware([publicMiddleware])
  .handler(async () => {
    const { endSession } = await import("@/server/auth/session.server");
    endSession();
    return { ok: true };
  });

// Public, so the login screen can load: null when nobody is signed in.
export const me = createServerFn({ method: "GET" })
  .middleware([publicMiddleware])
  .handler(async (): Promise<MeResult | null> => {
    const { currentUser } = await import("@/server/auth/session.server");
    const user = await currentUser();
    if (!user) return null;
    const { id: _id, ...rest } = user;
    return rest;
  });

export const changePassword = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .inputValidator((d: unknown) =>
    z.object({ currentPassword: z.string().max(200), newPassword: z.string().max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await refusePasswords();
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
  role: string;
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
    await refusePasswords();
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
