import { createFileRoute } from "@tanstack/react-router";
import { performSync } from "@/lib/snapshot.functions";

// Public cron endpoint — runs the snapshot sync for both programs.
// Triggered by pg_cron every 30 minutes.
export const Route = createFileRoute("/api/public/hooks/sync-snapshots")({
  server: {
    handlers: {
      POST: async () => {
        const results = await Promise.allSettled([
          performSync("seekers"),
          performSync("providers"),
        ]);
        const body = results.map((r, i) => ({
          program: i === 0 ? "seekers" : "providers",
          status: r.status,
          ...(r.status === "fulfilled"
            ? { ok: r.value.ok, rowCount: r.value.rowCount, skipped: (r.value as { skipped?: boolean }).skipped ?? false }
            : { error: String(r.reason instanceof Error ? r.reason.message : r.reason) }),
        }));
        return new Response(JSON.stringify({ ok: true, results: body }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => {
        // Allow GET as a health/manual trigger convenience.
        return new Response(JSON.stringify({ ok: true, hint: "POST to trigger sync" }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
