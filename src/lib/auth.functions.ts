import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FN_ROLES, isRole, type Role } from "@/auth/roles";
import { publicMiddleware, requireRole, sessionMiddleware } from "@/auth/middleware";
import { actionAllowed, userState, type UserAction, type UserState } from "@/auth/user-state";
import { parseInput } from "@/lib/validation";

/** Answer to any password call: sign-in is through Keycloak only. */
export const PASSWORDS_OFF = "Sign in with Keycloak. Passwords are not used.";

const email = z.string().trim().toLowerCase().email().max(320);
const optText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : null));

async function db() {
  const [{ getDb }, schema, orm] = await Promise.all([
    import("@/server/db/client.server"),
    import("@/server/db/schema"),
    import("drizzle-orm"),
  ]);
  return { db: getDb(), appUsers: schema.appUsers, adminActions: schema.adminActions, ...orm };
}

/** The signed-in user, as the browser sees it. */
export interface MeResult {
  email: string;
  name: string | null;
  role: Role;
  district: string | null;
  program: string | null;
  nodeType: string | null;
  nodeName: string | null;
}

/** Refuses password login with a clear message; people sign in through Keycloak. */
export const login = createServerFn({ method: "POST" })
  .middleware([publicMiddleware])
  .handler(async (): Promise<never> => refusePasswords());

async function refusePasswords(): Promise<never> {
  const { setResponseStatus } = await import("@tanstack/react-start/server");
  setResponseStatus(403);
  throw new Error(PASSWORDS_OFF);
}

/**
 * Ends the Campaign Manager session; the Keycloak session stays.
 * Public, so an expired session can still clear its cookie.
 */
export const logout = createServerFn({ method: "POST" })
  .middleware([publicMiddleware])
  .handler(async () => {
    const { endSession } = await import("@/server/auth/session.server");
    endSession();
    return { ok: true };
  });

/** Returns the signed-in user, or null when nobody is signed in; public so the login screen can load. */
export const me = createServerFn({ method: "GET" })
  .middleware([publicMiddleware])
  .handler(async (): Promise<MeResult | null> => {
    const { currentUser } = await import("@/server/auth/session.server");
    const user = await currentUser();
    if (!user) return null;
    const { id: _id, ...rest } = user;
    return rest;
  });

/** Refuses password changes; passwords are not used. */
export const changePassword = createServerFn({ method: "POST" })
  .middleware([sessionMiddleware])
  .validator(
    parseInput(
      z.object({ currentPassword: z.string().max(200), newPassword: z.string().max(200) }),
    ),
  )
  .handler(async (): Promise<never> => refusePasswords());

/** A user as the settings page lists it. */
export interface AppUser {
  email: string;
  name: string | null;
  // null for a user waiting for approval, or rejected.
  role: string | null;
  district: string | null;
  program: string | null;
  node_type: string | null;
  node_name: string | null;
  state: UserState;
  keycloak_linked: boolean;
  last_login_at: string | null;
  created_at: string;
}

const profile = z.object({
  email,
  name: optText,
  role: z.string().refine(isRole, "Unknown role"),
  district: optText,
  program: optText,
  node_type: optText,
  node_name: optText,
});

/** Lists every user, with their approval state and Keycloak link, for the settings page. */
export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.admin)])
  .handler(async (): Promise<AppUser[]> => {
    const { db: d, appUsers, asc } = await db();
    const rows = await d.select().from(appUsers).orderBy(asc(appUsers.createdAt));
    return rows.map((u) => ({
      email: u.email,
      name: u.name,
      role: u.role,
      district: u.district,
      program: u.program,
      node_type: u.nodeType,
      node_name: u.nodeName,
      state: userState(u),
      keycloak_linked: !!u.keycloakSub,
      last_login_at: u.lastLoginAt,
      created_at: u.createdAt,
    }));
  });

const KEYCLOAK_DOWN = "Keycloak can't be reached right now. Nothing was saved.";
const KEYCLOAK_DENIED =
  "Campaign Manager isn't allowed to manage users in Keycloak. Ask an operator to check its Keycloak client. Nothing was saved.";

// Finds or creates the Keycloak account for an email (reuse only a verified,
// enabled one), and makes sure it isn't linked to another user. Keycloak first,
// then the app, so a failed save is fixed by trying again. A created account is
// recorded straight away, with the admin who caused it.
async function keycloakAccountFor(
  emailAddress: string,
  name: string | null,
  forUserId: string | null,
  operator: string,
): Promise<string> {
  const { keycloakAdmin, ACCOUNT_MESSAGES, KeycloakHttpError } =
    await import("@/server/auth/keycloak-admin.server");
  let account: Awaited<ReturnType<Awaited<ReturnType<typeof keycloakAdmin>>["ensureAccount"]>>;
  try {
    account = await (await keycloakAdmin()).ensureAccount(emailAddress, name);
  } catch (e) {
    const { logEvent } = await import("@/server/log.server");
    logEvent("error", { operation: "keycloak.ensureAccount", status: "failure", error: e });
    throw new Error(e instanceof KeycloakHttpError && e.denied ? KEYCLOAK_DENIED : KEYCLOAK_DOWN);
  }
  if (account.kind === "refused") throw new Error(ACCOUNT_MESSAGES[account.reason]);
  const { db: d, appUsers, adminActions, eq } = await db();
  if (account.created) {
    await d.insert(adminActions).values({
      action: "create_keycloak_account",
      email: emailAddress,
      keycloakUserId: account.id,
      operator,
    });
  }
  const [owner] = await d
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.keycloakSub, account.id))
    .limit(1);
  if (owner && owner.id !== forUserId) throw new Error(ACCOUNT_MESSAGES["linked-elsewhere"]);
  return account.id;
}

async function findUser(emailAddress: string) {
  const { db: d, appUsers, eq } = await db();
  const [u] = await d.select().from(appUsers).where(eq(appUsers.email, emailAddress)).limit(1);
  if (!u) throw new Error("No such user.");
  return u;
}

function refuseUnless(
  u: { active: boolean; role: string | null; rejectedAt: string | null },
  action: UserAction,
): UserState {
  const state = userState(u);
  if (!actionAllowed(state, action)) throw new Error(`Can't ${action} a user who is ${state}.`);
  return state;
}

/** Adds a user and links the Keycloak account for their email, creating it when needed. */
export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .validator(parseInput(profile))
  .handler(async ({ data, context }) => {
    const { db: d, appUsers, eq } = await db();
    const [exists] = await d.select().from(appUsers).where(eq(appUsers.email, data.email)).limit(1);
    if (exists) {
      const state = userState(exists);
      if (state === "pending")
        throw new Error("This person is waiting for approval. Approve them in the list instead.");
      if (state === "rejected")
        throw new Error("This person was rejected. Approve them in the list instead.");
      throw new Error("A user with this email already exists.");
    }
    const keycloakSub = await keycloakAccountFor(data.email, data.name, null, context.user.email);
    try {
      await d.insert(appUsers).values({
        email: data.email,
        name: data.name,
        role: data.role,
        district: data.district,
        program: data.program,
        nodeType: data.node_type,
        nodeName: data.node_name,
        keycloakSub,
      });
    } catch (e) {
      const { isUniqueViolation } = await import("@/server/db/errors");
      if (isUniqueViolation(e))
        throw new Error(
          "Someone else just added this user or linked this Keycloak account. Refresh the list.",
        );
      const { logEvent } = await import("@/server/log.server");
      logEvent("error", { operation: "users.create", status: "failure", error: e });
      throw new Error("Saving the user failed. Try again; the Keycloak account is reused.");
    }
    return { ok: true };
  });

/** Links a user who has no Keycloak login to the account for their email, creating it when needed. */
export const setUpKeycloakLogin = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .validator(parseInput(z.object({ email })))
  .handler(async ({ data, context }) => {
    const u = await findUser(data.email);
    if (u.keycloakSub) throw new Error("This user already has a Keycloak login.");
    const keycloakSub = await keycloakAccountFor(u.email, u.name, u.id, context.user.email);
    const { db: d, appUsers, eq } = await db();
    await d
      .update(appUsers)
      .set({ keycloakSub, updatedAt: new Date().toISOString() })
      .where(eq(appUsers.id, u.id));
    return { ok: true };
  });

/** Approves a pending or rejected user with the given role. */
export const approveAppUser = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .validator(parseInput(z.object({ email, role: z.string().refine(isRole, "Unknown role") })))
  .handler(async ({ data }) => {
    const u = await findUser(data.email);
    refuseUnless(u, "approve");
    const { db: d, appUsers, eq } = await db();
    await d
      .update(appUsers)
      .set({ role: data.role, active: true, rejectedAt: null, updatedAt: new Date().toISOString() })
      .where(eq(appUsers.id, u.id));
    return { ok: true };
  });

/** Rejects a pending user; rejecting a rejected user does nothing. */
export const rejectAppUser = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .validator(parseInput(z.object({ email })))
  .handler(async ({ data }) => {
    const u = await findUser(data.email);
    if (refuseUnless(u, "reject") === "rejected") return { ok: true };
    const { db: d, appUsers, eq } = await db();
    const now = new Date().toISOString();
    await d.update(appUsers).set({ rejectedAt: now, updatedAt: now }).where(eq(appUsers.id, u.id));
    return { ok: true };
  });

/**
 * Removes a user's Keycloak link so their next login links again by verified email, which fixes a
 * recreated Keycloak account. An admin is not linked at login, so another admin then uses Set up login.
 */
export const unlinkKeycloakAccount = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .validator(parseInput(z.object({ email })))
  .handler(async ({ data, context }) => {
    if (data.email === context.user.email)
      throw new Error("You cannot unlink your own Keycloak login.");
    const u = await findUser(data.email);
    const { db: d, appUsers, eq } = await db();
    await d
      .update(appUsers)
      .set({ keycloakSub: null, updatedAt: new Date().toISOString() })
      .where(eq(appUsers.id, u.id));
    return { ok: true };
  });

async function activeAdminCount(): Promise<number> {
  const { db: d, appUsers, and, eq, count } = await db();
  const [r] = await d
    .select({ n: count() })
    .from(appUsers)
    .where(and(eq(appUsers.role, "admin"), eq(appUsers.active, true)));
  return r?.n ?? 0;
}

/** Updates a user's profile and role; refuses to demote the last active admin. */
export const updateAppUser = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .validator(parseInput(profile))
  .handler(async ({ data }) => {
    const u = await findUser(data.email);
    refuseUnless(u, "edit");
    const { db: d, appUsers, eq } = await db();
    if (
      u.role === "admin" &&
      u.active &&
      data.role !== "admin" &&
      (await activeAdminCount()) <= 1
    ) {
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

/** Refuses password resets; passwords are not used. */
export const resetAppUserPassword = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .validator(parseInput(z.object({ email })))
  .handler(async (): Promise<never> => refusePasswords());

/** Activates or deactivates a user; refuses to deactivate yourself or the last active admin. */
export const setAppUserActive = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .validator(parseInput(z.object({ email, active: z.boolean() })))
  .handler(async ({ data, context }) => {
    const u = await findUser(data.email);
    refuseUnless(u, data.active ? "activate" : "deactivate");
    if (!data.active) {
      if (data.email === context.user.email) throw new Error("You cannot deactivate yourself.");
      if (u.role === "admin" && (await activeAdminCount()) <= 1)
        throw new Error("Cannot deactivate the last active admin.");
    }
    const { db: d, appUsers, eq } = await db();
    await d
      .update(appUsers)
      .set({ active: data.active, updatedAt: new Date().toISOString() })
      .where(eq(appUsers.id, u.id));
    return { ok: true };
  });
