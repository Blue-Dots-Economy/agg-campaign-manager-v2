import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { reviewers } from "@/server/db/schema";

export const listReviewers = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.dashboard)])
  .handler(async (): Promise<string[]> => {
    try {
      const rows = await getDb().select({ email: reviewers.email }).from(reviewers).orderBy(asc(reviewers.email));
      return rows.map((r) => r.email);
    } catch { return []; }
  });

export const addReviewer = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator((d: { email: string }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const email = (data.email || "").trim().toLowerCase();
    if (!email) return { ok: false };
    try { await getDb().insert(reviewers).values({ email }).onConflictDoNothing(); return { ok: true }; }
    catch { return { ok: false }; }
  });

export const removeReviewer = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator((d: { email: string }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const email = (data.email || "").trim().toLowerCase();
    try { await getDb().delete(reviewers).where(eq(reviewers.email, email)); return { ok: true }; }
    catch { return { ok: false }; }
  });
