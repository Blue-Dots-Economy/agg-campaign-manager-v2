import { describe, expect, test } from "bun:test";
import { linkKeycloakIdentity } from "../../src/server/auth/keycloak-link.server";

const id = { sub: "sub-1", email: "priya@example.org" };
const known = { id: "u-1", email: id.email, keycloakSub: null, active: true, role: "coordinator", rejectedAt: null };

// A database that finds the user by email, then fails the update with `error`.
// Drizzle wraps the driver's error, so the Postgres code sits on the cause.
function failingDb(error: unknown) {
  const lookups = [[], [known]]; // by Keycloak id, then by email
  const chain = (result: unknown) => ({ from: () => ({ where: () => ({ limit: async () => result }) }) });
  return {
    select: () => chain(lookups.shift() ?? []),
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            throw error;
          },
        }),
      }),
    }),
  } as unknown as Parameters<typeof linkKeycloakIdentity>[2];
}

const wrapped = (code: string) => Object.assign(new Error("Failed query"), { cause: Object.assign(new Error("pg"), { code }) });

describe("linking when the database fails", () => {
  test("a duplicate key from a concurrent change is a conflict", async () => {
    expect(await linkKeycloakIdentity(id, null, failingDb(wrapped("23505")))).toEqual({ kind: "refused", reason: "conflict" });
  });

  test("any other error is not hidden as a conflict", async () => {
    await expect(linkKeycloakIdentity(id, null, failingDb(wrapped("57P01")))).rejects.toThrow("Failed query");
  });
});
