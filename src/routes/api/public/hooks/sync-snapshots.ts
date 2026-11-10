import { createFileRoute } from "@tanstack/react-router";
import { errorMessage } from "@/lib/errors";
import { performSync } from "@/lib/snapshot.functions";
import type { ProgramId } from "@/programs/registry";

/** Programs the cron hook syncs. */
const SYNC_PROGRAMS: readonly ProgramId[] = ["seekers", "providers"];

// Runs the snapshot sync for both programs. Requires Bearer $CRON_SECRET.
export const Route = createFileRoute("/api/public/hooks/sync-snapshots")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/server/auth/cron.server");
        const refused = authenticateCronRequest(request);
        if (refused) return refused;
        const body = await Promise.all(
          SYNC_PROGRAMS.map(async (program) => {
            try {
              const r = await performSync(program);
              return {
                program,
                status: "fulfilled",
                ok: r.ok,
                rowCount: r.rowCount,
                skipped: r.skipped ?? false,
              };
            } catch (e) {
              return { program, status: "rejected", error: errorMessage(e) };
            }
          }),
        );
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
