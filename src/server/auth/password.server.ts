// Also verifies existing pgcrypto bcrypt hashes.
import bcrypt from "bcryptjs";
import { randomBytes, randomInt } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 10;
const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

// Every refused login runs one full-cost check, so timing does not reveal
// whether the email exists. checkedHash: the hash already compared, if any.
// The dummy hash is made at startup from random bytes rather than committed, so
// there is no hash literal in the source and nothing it could ever match.
const DUMMY_HASH = bcrypt.hash(randomBytes(32).toString("hex"), COST);

export async function equaliseRefusal(plain: string, checkedHash: string | null): Promise<void> {
  let rounds = 0;
  try {
    rounds = checkedHash ? bcrypt.getRounds(checkedHash) : 0;
  } catch {
    /* not a bcrypt hash */
  }
  if (rounds < COST) await verifyPassword(plain, await DUMMY_HASH);
}

export function passwordProblem(plain: string): string | null {
  return plain.length < MIN_PASSWORD_LENGTH ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` : null;
}

// No 0/O/1/l/I.
const TEMP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export function temporaryPassword(length = 14): string {
  let out = "";
  for (let i = 0; i < length; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return out;
}

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export function afterFailedLogin(failedCount: number, now: Date): { failedLoginCount: number; lockedUntil: Date | null } {
  const next = failedCount + 1;
  return next >= MAX_FAILED_LOGINS
    ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) }
    : { failedLoginCount: next, lockedUntil: null };
}

export function isLocked(lockedUntil: string | Date | null | undefined, now: Date): boolean {
  return !!lockedUntil && new Date(lockedUntil).getTime() > now.getTime();
}
