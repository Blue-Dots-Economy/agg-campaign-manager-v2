import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useProgram } from "@/programs/context";
import { CompletedCampaigns } from "@/components/campaigns/CompletedCampaigns";
import { LiveBatchesSection } from "@/components/campaigns/LiveBatchesSection";
import { LiveBatchDetailDialog } from "@/components/campaigns/LiveBatchDetailDialog";
import type { LiveBatch } from "@/lib/raya-live.functions";

export const Route = createFileRoute("/campaigns")({ component: CampaignsPage });

function CampaignsPage() {
  const { config } = useProgram();
  const [openLiveBatch, setOpenLiveBatch] = useState<LiveBatch | null>(null);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live calling batches stream from Raya in real time. Completed campaigns come from the
          synced sheet — open any one to review its performance.
        </p>
      </div>
      <LiveBatchesSection program={config.id} onOpen={setOpenLiveBatch} />
      <CompletedCampaigns />
      <LiveBatchDetailDialog
        batch={openLiveBatch}
        program={config.id}
        onClose={() => setOpenLiveBatch(null)}
      />
    </div>
  );
}
