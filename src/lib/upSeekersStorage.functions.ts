import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { upSeekersUpload } from "@/server/db/schema";

const dashboard = requireRole(FN_ROLES.dashboard);

export const fetchStoredCsv = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .handler(
    async (): Promise<{ text: string; meta: { name: string; uploadedAt: string; rows: number } } | null> => {
      try {
        const [row] = await getDb().select().from(upSeekersUpload).where(eq(upSeekersUpload.id, 1));
        if (!row) return null;
        return { text: row.csv, meta: { name: row.fileName, uploadedAt: row.uploadedAt, rows: row.rowCount } };
      } catch {
        return null;
      }
    },
  );

export const uploadStoredCsv = createServerFn({ method: "POST" })
  .middleware([dashboard])
  .inputValidator((d: { text: string; name: string; rows: number }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    try {
      const values = { id: 1, csv: data.text, fileName: data.name, rowCount: data.rows, uploadedAt: new Date().toISOString() };
      await getDb().insert(upSeekersUpload).values(values).onConflictDoUpdate({ target: upSeekersUpload.id, set: values });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

export const clearStoredCsv = createServerFn({ method: "POST" })
  .middleware([dashboard])
  .handler(async (): Promise<{ ok: boolean }> => {
    try {
      await getDb().delete(upSeekersUpload).where(eq(upSeekersUpload.id, 1));
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });
