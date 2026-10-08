import { beforeAll, describe, expect, test } from "bun:test";
import { SignJWT } from "jose";
import { canAccess, FN_ROLES, ROLES, type Role } from "../../src/auth/roles";
import {
  afterFailedLogin,
  hashPassword,
  isLocked,
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
  passwordProblem,
  temporaryPassword,
  verifyPassword,
} from "../../src/server/auth/password.server";

const SECRET = "test-secret-at-least-thirty-two-characters!";
let session: typeof import("../../src/server/auth/session.server");

beforeAll(async () => {
  process.env.SESSION_SECRET = SECRET;
  session = await import("../../src/server/auth/session.server");
});

describe("session", () => {
  test("a signed token verifies to its uid", async () => {
    expect(await session.verifySession(await session.signSession("u-1"))).toBe("u-1");
  });

  test("expires after 12 hours", async () => {
    const issued = Date.now() - (session.SESSION_TTL_SECONDS + 60) * 1000;
    expect(await session.verifySession(await session.signSession("u-1", issued))).toBeNull();
  });

  test("a tampered payload is rejected", async () => {
    const [h, , sig] = (await session.signSession("u-1")).split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "admin", exp: 9999999999 })).toString("base64url");
    expect(await session.verifySession(`${h}.${forged}.${sig}`)).toBeNull();
  });

  test("a token signed with another secret is rejected", async () => {
    const other = await new SignJWT({ uid: "u-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("another-secret-also-thirty-two-characters"));
    expect(await session.verifySession(other)).toBeNull();
  });

  test("garbage and missing tokens are rejected", async () => {
    expect(await session.verifySession(undefined)).toBeNull();
    expect(await session.verifySession("not.a.jwt")).toBeNull();
  });
});

describe("password", () => {
  test("verifies an existing pgcrypto crypt(..., gen_salt('bf')) hash", async () => {
    // select crypt('correct horse battery', gen_salt('bf')) on Postgres 17
    const pgcrypto = "$2a$06$SahHZYM.mvVi7e/FRucq/.ProJd.75wqGhhOx6hWSwJnSg/QLbKLu";
    expect(await verifyPassword("correct horse battery", pgcrypto)).toBe(true);
    expect(await verifyPassword("wrong horse battery", pgcrypto)).toBe(false);
  });

  test("hashes and verifies a new password", async () => {
    const hash = await hashPassword("a new password");
    expect(await verifyPassword("a new password", hash)).toBe(true);
    expect(await verifyPassword("another", hash)).toBe(false);
  });

  test("no hash or no password never verifies", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("", "$2a$06$SahHZYM.mvVi7e/FRucq/.ProJd.75wqGhhOx6hWSwJnSg/QLbKLu")).toBe(false);
  });

  test("at least 10 characters", () => {
    expect(passwordProblem("123456789")).not.toBeNull();
    expect(passwordProblem("1234567890")).toBeNull();
  });

  test("temporary passwords are long enough and differ", () => {
    const a = temporaryPassword();
    expect(passwordProblem(a)).toBeNull();
    expect(a).not.toBe(temporaryPassword());
  });
});

describe("lockout", () => {
  const now = new Date("2026-10-08T10:00:00Z");

  test(`${MAX_FAILED_LOGINS} failures lock for ${LOCK_MINUTES} minutes`, () => {
    let count = 0;
    let lockedUntil: Date | null = null;
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) ({ failedLoginCount: count, lockedUntil } = afterFailedLogin(count, now));
    expect(lockedUntil).not.toBeNull();
    expect(isLocked(lockedUntil, now)).toBe(true);
    expect(isLocked(lockedUntil, new Date(now.getTime() + LOCK_MINUTES * 60_000 + 1))).toBe(false);
  });

  test("fewer failures do not lock", () => {
    expect(afterFailedLogin(MAX_FAILED_LOGINS - 2, now).lockedUntil).toBeNull();
  });
});

describe("roles", () => {
  const pages: Record<Role, string[]> = {
    admin: ["/", "/campaigns", "/review", "/launch", "/ecosystem-view", "/campaign-requests", "/request-campaign", "/user-level-analysis", "/settings"],
    jfc: ["/", "/campaigns", "/review", "/launch", "/ecosystem-view", "/campaign-requests", "/request-campaign", "/user-level-analysis"],
    coordinator: ["/", "/campaigns", "/review", "/request-campaign", "/user-level-analysis"],
    user: ["/", "/campaigns", "/review", "/user-level-analysis"],
    owner: ["/", "/user-level-analysis"],
    ecosystem: ["/ecosystem-view", "/", "/user-level-analysis"],
  };
  const all = pages.admin;

  test.each(ROLES.map((r) => [r]))("%s opens exactly its pages", (role) => {
    for (const page of all) expect([page, canAccess(role, page)]).toEqual([page, pages[role].includes(page)]);
  });

  test("every role can change its own password", () => {
    for (const role of ROLES) expect(canAccess(role, "/change-password")).toBe(true);
  });

  test("server function groups follow the pages", () => {
    expect(FN_ROLES.admin).toEqual(["admin"]);
    expect(FN_ROLES.launch.sort()).toEqual(["admin", "jfc"]);
    expect(FN_ROLES.requestCampaign.sort()).toEqual(["admin", "coordinator", "jfc"]);
    expect(FN_ROLES.campaigns.sort()).toEqual(["admin", "coordinator", "jfc", "user"]);
    expect(FN_ROLES.dashboard.sort()).toEqual([...ROLES].sort());
  });
});
