import { createServerFn } from "@tanstack/react-start";
import { requireRole } from "@/auth/middleware";
import { FN_ROLES } from "@/auth/roles";

export const fetchEcosystemData = createServerFn({ method: "GET" })
  .middleware([requireRole(FN_ROLES.admin)])
  .inputValidator((d: { state: string; district: string }) => d)
  .handler(async ({ data }) => {
    const { loadEcosystem } = await import("./ecosystem.server");
    return await loadEcosystem(data.state, data.district);
  });
