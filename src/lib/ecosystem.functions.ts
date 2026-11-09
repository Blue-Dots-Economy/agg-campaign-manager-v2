import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";
import { parseInput } from "@/server/validation";

/** Loads ecosystem data for one state and district. */
export const fetchEcosystemData = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator(
    parseInput(z.object({ state: z.string().max(200), district: z.string().max(200) })),
  )
  .handler(async ({ data }) => {
    const { loadEcosystem } = await import("./ecosystem.server");
    return await loadEcosystem(data.state, data.district);
  });
