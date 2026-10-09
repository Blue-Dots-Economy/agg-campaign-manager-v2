import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { northStarConfig } from "@/server/db/schema";

export interface NorthStarConfigRow {
  key: string;
  threshold: number | null;
  enabled: boolean;
  sort: number;
}

export const fetchNorthStar = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.dashboard)])
  .inputValidator((d: { program: string }) => d)
  .handler(async ({ data }): Promise<NorthStarConfigRow[]> => {
    try {
      const rows = await getDb()
        .select({
          key: northStarConfig.key,
          threshold: northStarConfig.threshold,
          enabled: northStarConfig.enabled,
          sort: northStarConfig.sort,
        })
        .from(northStarConfig)
        .where(eq(northStarConfig.program, data.program))
        .orderBy(asc(northStarConfig.sort));
      return rows.map((r) => ({
        key: String(r.key),
        threshold: r.threshold == null ? null : Number(r.threshold),
        enabled: r.enabled !== false,
        sort: Number(r.sort) || 0,
      }));
    } catch {
      return [];
    }
  });

export const saveNorthStar = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.editors)])
  .inputValidator((d: { program: string; key: string; threshold: number | null; enabled?: boolean }) => d)
  .handler(async ({ data }) => {
    const values = {
      program: data.program,
      key: data.key,
      threshold: data.threshold == null ? null : String(data.threshold),
      enabled: data.enabled ?? true,
      updatedAt: new Date().toISOString(),
    };
    await getDb()
      .insert(northStarConfig)
      .values(values)
      .onConflictDoUpdate({ target: [northStarConfig.program, northStarConfig.key], set: values });
    return { ok: true };
  });
