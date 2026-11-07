import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { getDb } from "@/server/db/client.server";
import { upSeekersUpload } from "@/server/db/schema";
import { MAX_CONTACTS_PER_BATCH, parseInput } from "@/server/validation";

/** Id of the only row in `up_seekers_upload`; the table holds one CSV at a time. */
const UPLOAD_ROW_ID = 1;

const dashboard = requireRole(FN_ROLES.dashboard);

export const fetchStoredCsv = createServerFn({ method: "GET" })
  .middleware([dashboard])
  .handler(
    async (): Promise<{
      text: string;
      meta: { name: string; uploadedAt: string; rows: number };
    } | null> => {
      try {
        const [row] = await getDb()
          .select()
          .from(upSeekersUpload)
          .where(eq(upSeekersUpload.id, UPLOAD_ROW_ID));
        if (!row) return null;
        return {
          text: row.csv,
          meta: { name: row.fileName, uploadedAt: row.uploadedAt, rows: row.rowCount },
        };
      } catch {
        return null;
      }
    },
  );

/** Largest CSV the app stores, to keep the single upload row small. */
const MAX_CSV_BYTES = 20 * 1024 * 1024;
const csvInput = z.object({
  text: z
    .string()
    .refine((t) => new TextEncoder().encode(t).length <= MAX_CSV_BYTES, "CSV is larger than 20 MB"),
  name: z.string().max(255),
  rows: z.number().int().min(0).max(MAX_CONTACTS_PER_BATCH),
});

export const uploadStoredCsv = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.editors)])
  .inputValidator(parseInput(csvInput))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    try {
      const values = {
        id: UPLOAD_ROW_ID,
        csv: data.text,
        fileName: data.name,
        rowCount: data.rows,
        uploadedAt: new Date().toISOString(),
      };
      await getDb()
        .insert(upSeekersUpload)
        .values(values)
        .onConflictDoUpdate({ target: upSeekersUpload.id, set: values });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

export const clearStoredCsv = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.editors)])
  .handler(async (): Promise<{ ok: boolean }> => {
    try {
      await getDb().delete(upSeekersUpload).where(eq(upSeekersUpload.id, UPLOAD_ROW_ID));
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });
