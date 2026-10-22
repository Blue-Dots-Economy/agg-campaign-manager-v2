import { describe, expect, test } from "bun:test";
import {
  clientAddress,
  FailureLimiter,
  limiterKey,
  SOURCE_MAX_FAILURES,
  SOURCE_WINDOW_MS,
} from "../../src/server/auth/login-limit.server";
import { MAX_FAILED_LOGINS } from "../../src/server/auth/password.server";

describe("login failure limit", () => {
  const t0 = 1_000_000;

  test("stays below the account lockout, so one source cannot lock an account", () => {
    expect(SOURCE_MAX_FAILURES).toBeLessThan(MAX_FAILED_LOGINS);
  });

  test("blocks after the limit within the window", () => {
    const l = new FailureLimiter(SOURCE_MAX_FAILURES, SOURCE_WINDOW_MS);
    for (let i = 0; i < SOURCE_MAX_FAILURES; i++) {
      expect(l.isBlocked("k", t0)).toBe(false);
      l.recordFailure("k", t0);
    }
    expect(l.isBlocked("k", t0)).toBe(true);
  });

  test("forgets failures older than the window", () => {
    const l = new FailureLimiter(2, 1000);
    l.recordFailure("k", t0);
    l.recordFailure("k", t0 + 10);
    expect(l.isBlocked("k", t0 + 500)).toBe(true);
    expect(l.isBlocked("k", t0 + 1011)).toBe(false);
  });

  test("keys are independent, and clear resets one key", () => {
    const l = new FailureLimiter(1, 1000);
    l.recordFailure("a", t0);
    expect(l.isBlocked("a", t0)).toBe(true);
    expect(l.isBlocked("b", t0)).toBe(false);
    l.clear("a");
    expect(l.isBlocked("a", t0)).toBe(false);
  });

  test("the key combines address and email", () => {
    expect(limiterKey("10.0.0.1", "a@x.org")).not.toBe(limiterKey("10.0.0.1", "b@x.org"));
  });
});

describe("client address", () => {
  test("uses the rightmost forwarded entry, which our ingress adds", () => {
    expect(clientAddress("6.6.6.6, 203.0.113.9", "10.0.0.2")).toBe("203.0.113.9");
  });

  test("falls back to the socket address, then to a fixed value", () => {
    expect(clientAddress(null, "10.0.0.2")).toBe("10.0.0.2");
    expect(clientAddress(" , ", undefined)).toBe("unknown");
  });
});
