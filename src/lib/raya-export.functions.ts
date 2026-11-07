// Server functions for the Raya → staging-sheet export. The work is in raya-export.server.ts.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { parseInput, programIdSchema } from "@/server/validation";

export type { ExportTarget } from "./raya-export.server";

/** Input of `getExportTarget`. */
export const GetExportTargetInput = z.object({ program: programIdSchema });

// ---------- target read ----------
export const getExportTarget = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(parseInput(GetExportTargetInput))
  .handler(async ({ data }) => {
    const { exportTarget } = await import("./raya-export.server");
    return exportTarget(data.program);
  });

/** Input of `setExportTarget`. The tab is always Sheet1, so `tabName` is accepted and not used. */
export const SetExportTargetInput = z.object({
  program: programIdSchema,
  sheetUrlOrId: z.string().max(2_000),
  tabName: z.string().max(200).optional(),
  label: z.string().max(200).optional(),
});

// ---------- target write ----------
export const setExportTarget = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(parseInput(SetExportTargetInput))
  .handler(async ({ data }) => {
    const { saveExportTarget } = await import("./raya-export.server");
    return saveExportTarget(data);
  });

/** Input of `exportBatchToStaging`; the names are used when the launch record has none. */
export const ExportBatchToStagingInput = z.object({
  program: programIdSchema,
  batchId: z.string().min(1, "batchId required"),
  batchName: z.string().optional(),
  agentName: z.string().optional(),
});

// ---------- main export ----------
export const exportBatchToStaging = createServerFn({ method: "POST" })
  .middleware([requireRole(FN_ROLES.campaigns)])
  .inputValidator(parseInput(ExportBatchToStagingInput))
  .handler(async ({ data }) => {
    const { exportBatch } = await import("./raya-export.server");
    return exportBatch(data);
  });
