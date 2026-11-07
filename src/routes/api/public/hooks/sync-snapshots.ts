import { createFileRoute } from "@tanstack/react-router";
import { performSync } from "@/lib/snapshot.functions";

// Runs the snapshot sync for both programs. Requires Bearer $CRON_SECRET.
export const Route = createFileRoute("/api/public/hooks/sync-snapshots")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/server/auth/cron.server");
        const refused = authenticateCronRequest(request);
        if (refused) return refused;
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
