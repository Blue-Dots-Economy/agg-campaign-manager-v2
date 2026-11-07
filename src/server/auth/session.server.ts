import { eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { getDb } from "@/server/db/client.server";
import { appUsers } from "@/server/db/schema";
import { isRole, type Role } from "@/auth/roles";

export const SESSION_COOKIE = "cm_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

function secretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (at least 32 characters)");
  return new TextEncoder().encode(s);
}

export async function signSession(uid: string, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_SECONDS)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

export async function startSession(uid: string): Promise<void> {
  setCookie(SESSION_COOKIE, await signSession(uid), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function endSession(): void {
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  district: string | null;
  program: string | null;
  nodeType: string | null;
  nodeName: string | null;
  mustChangePassword: boolean;
}

export async function currentUser(): Promise<SessionUser | null> {
  const uid = await verifySession(getCookie(SESSION_COOKIE));
  if (!uid) return null;
  const [u] = await getDb().select().from(appUsers).where(eq(appUsers.id, uid)).limit(1);
  if (!u || !u.active || !isRole(u.role)) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    district: u.district,
    program: u.program,
    nodeType: u.nodeType,
    nodeName: u.nodeName,
    mustChangePassword: u.mustChangePassword,
  };
}
