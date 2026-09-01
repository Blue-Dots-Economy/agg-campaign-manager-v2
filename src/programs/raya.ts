// Raya integration interface — Phase 2 will wire these to the real API.

export interface RayaBatchInput {
  programId: "kkb" | "dkb";
  agentId: string;
  rows: Array<Record<string, unknown>>;
  region: string;
  language: string;
}

export interface RayaBatch {
  batchId: string;
  status: "scheduled" | "running" | "done" | "failed";
  scheduledAt: string;
  count: number;
}

export interface RayaExecution {
  batchId: string;
  startedAt: string;
  finishedAt?: string;
  status: RayaBatch["status"];
  programId: "kkb" | "dkb";
}

export interface RayaClient {
  createBatch(input: RayaBatchInput): Promise<RayaBatch>;
  scheduleBatch(batchId: string, isoDateTime: string): Promise<RayaBatch>;
  listExecutions(programId: "kkb" | "dkb"): Promise<RayaExecution[]>;
}

// Stub client. TODO(phase-2): replace with real HTTP calls to Raya.
export const rayaClient: RayaClient = {
  async createBatch() {
    throw new Error("Raya integration pending — Phase 2");
  },
  async scheduleBatch() {
    throw new Error("Raya integration pending — Phase 2");
  },
  async listExecutions() {
    return [];
  },
};
