import { TooltipProvider } from "@/components/ui/tooltip";
import type { RollupScope } from "@/lib/my-dots-region";
import {
  ControlsAndHeader,
  NeedsAttention,
  ParticipantTable,
  SampleBanner,
  SectionLabel,
  StatusCards,
  TitleRow,
  useRollup,
} from "./shared";

/** Coordinator: own caseload only. The rollup is scoped in the data layer, so no sibling data is present. */
export function CoordinatorRollupView({ scope }: { scope: Extract<RollupScope, { kind: "coordinator" }> }) {
  const { rollup, type, setType, period, setPeriod, refreshing, refresh } = useRollup(scope);
  const participants = rollup.orgs.flatMap((o) => o.coordinators.flatMap((c) => c.participants));

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <TitleRow badge={scope.code} />
        <SampleBanner />
        <ControlsAndHeader
          type={type}
          setType={setType}
          period={period}
          setPeriod={setPeriod}
          total={rollup.total}
          sentence="Lifecycle and profile health across your caseload."
          refreshing={refreshing}
          onRefresh={refresh}
        />
        <StatusCards status={rollup.status} />
        <NeedsAttention rollup={rollup} period={period} mode="self" />
        <div>
          <SectionLabel caption={`${participants.length} participants`}>Your caseload</SectionLabel>
          <div className="rounded-xl border border-border bg-card">
            <ParticipantTable participants={participants} />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
