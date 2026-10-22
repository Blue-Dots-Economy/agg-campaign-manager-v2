// Failed logins per client address and email, on top of the account lockout.
// Kept one below the lockout threshold, so a single address can never lock an
// account by itself. Keyed by address and email, not address alone, so a proxy
// that hides real client addresses slows one account instead of blocking everyone.
// Kept in memory, per server process.
import { LOCK_MINUTES, MAX_FAILED_LOGINS } from "./password.server";

export const SOURCE_MAX_FAILURES = MAX_FAILED_LOGINS - 1;
export const SOURCE_WINDOW_MS = LOCK_MINUTES * 60_000;

export class FailureLimiter {
  private hits = new Map<string, number[]>();
  private calls = 0;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const fresh = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (fresh.length) this.hits.set(key, fresh);
    else this.hits.delete(key);
    return fresh;
  }

  isBlocked(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length >= this.max;
  }

  recordFailure(key: string, now = Date.now()): void {
    this.hits.set(key, [...this.recent(key, now), now]);
    if (++this.calls % 500 === 0) this.prune(now);
  }

  clear(key: string): void {
    this.hits.delete(key);
  }

  private prune(now: number): void {
    for (const key of [...this.hits.keys()]) this.recent(key, now);
  }
}

export const loginLimiter = new FailureLimiter(SOURCE_MAX_FAILURES, SOURCE_WINDOW_MS);

// The rightmost X-Forwarded-For entry is the one added by our own ingress; the
// entries to its left come from the client and can be anything.
export function clientAddress(forwardedFor: string | null | undefined, socketAddress: string | undefined): string {
  const hops = (forwardedFor ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return hops.at(-1) ?? socketAddress ?? "unknown";
}

export function limiterKey(address: string, email: string): string {
  return `${address}|${email}`;
}
