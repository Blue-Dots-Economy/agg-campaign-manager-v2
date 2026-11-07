import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { reviewers } from "@/server/db/schema";
import { parseInput } from "@/server/validation";

const emailInput = z.object({ email: z.string().max(320) });

/** Lists reviewer emails. */
export const listReviewers = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.dashboard)])
  .handler(async (): Promise<string[]> => {
    try {
      const rows = await getDb()
        .select({ email: reviewers.email })
        .from(reviewers)
        .orderBy(asc(reviewers.email));
      return rows.map((r) => r.email);
    } catch {
      return [];
    }
  });

/** Adds a reviewer email. */
export const addReviewer = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(parseInput(emailInput))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const email = (data.email || "").trim().toLowerCase();
    if (!email) return { ok: false };
    try {
      await getDb().insert(reviewers).values({ email }).onConflictDoNothing();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

/** Removes a reviewer email. */
export const removeReviewer = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(parseInput(emailInput))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const email = (data.email || "").trim().toLowerCase();
    try {
      await getDb().delete(reviewers).where(eq(reviewers.email, email));
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });
