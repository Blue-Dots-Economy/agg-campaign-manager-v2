import { createServerFn } from "@tanstack/react-start";

export const fetchEcosystemData = createServerFn({ method: "GET" })
  .inputValidator((d: { state: string; district: string }) => d)
  .handler(async ({ data }) => {
    const { loadEcosystem } = await import("./ecosystem.server");
    return await loadEcosystem(data.state, data.district);
  });
