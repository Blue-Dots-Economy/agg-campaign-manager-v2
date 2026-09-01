import { createServerFn } from "@tanstack/react-start";

const BUCKET = "up-seekers";
const OBJECT = "current.csv";
const META_OBJECT = "current-meta.json";

export const fetchStoredCsv = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ text: string; meta: { name: string; uploadedAt: string; rows: number } } | null> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [csvRes, metaRes] = await Promise.all([
        supabaseAdmin.storage.from(BUCKET).download(OBJECT),
        supabaseAdmin.storage.from(BUCKET).download(META_OBJECT),
      ]);
      if (csvRes.error || !csvRes.data) return null;
      const text = await csvRes.data.text();
      let meta = { name: "Uploaded CSV", uploadedAt: "", rows: 0 };
      if (metaRes.data) {
        try { meta = { ...meta, ...JSON.parse(await metaRes.data.text()) }; } catch { /* ignore */ }
      }
      return { text, meta };
    } catch {
      return null;
    }
  },
);

export const uploadStoredCsv = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; name: string; rows: number }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const meta = { name: data.name, uploadedAt: new Date().toISOString(), rows: data.rows };
      const csvBlob = new Blob([data.text], { type: "text/csv" });
      const metaBlob = new Blob([JSON.stringify(meta)], { type: "application/json" });
      const [csvRes, metaRes] = await Promise.all([
        supabaseAdmin.storage.from(BUCKET).upload(OBJECT, csvBlob, { upsert: true, contentType: "text/csv" }),
        supabaseAdmin.storage.from(BUCKET).upload(META_OBJECT, metaBlob, { upsert: true, contentType: "application/json" }),
      ]);
      if (csvRes.error || metaRes.error) return { ok: false };
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

export const clearStoredCsv = createServerFn({ method: "POST" }).handler(async (): Promise<{ ok: boolean }> => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from(BUCKET).remove([OBJECT, META_OBJECT]);
    return { ok: true };
  } catch {
    return { ok: false };
  }
});
