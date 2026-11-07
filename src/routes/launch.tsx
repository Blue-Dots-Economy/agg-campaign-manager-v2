import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useProgram } from "@/programs/context";
import { useProgramOverrides } from "@/lib/program-overrides";
import { validateContacts } from "@/lib/raya.functions";
import { listProgramAgents } from "@/lib/agents.functions";
import { getNextCampaignDay } from "@/lib/launched-batches.functions";
import { useAuth } from "@/auth/context";
import { useConcurrencyUsage } from "@/hooks/useConcurrencyUsage";
import { useSeekers } from "@/hooks/useSeekers";
import { registry, type ProgramId } from "@/programs/registry";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import {
  ScheduleEditor,
  type ScheduleState,
  makeDefaultSchedule,
} from "@/components/ScheduleEditor";
import { Stepper } from "@/components/launch/Stepper";
import { ProgramStep } from "@/components/launch/ProgramStep";
import { AgentStep } from "@/components/launch/AgentStep";
import { AudienceSourcePicker } from "@/components/launch/AudienceSourcePicker";
import { UploadStep } from "@/components/launch/UploadStep";
import { CohortStep } from "@/components/launch/CohortStep";
import { ConcurrencyStep } from "@/components/launch/ConcurrencyStep";
import { ReviewStep } from "@/components/launch/ReviewStep";
import { LaunchStep } from "@/components/launch/LaunchStep";
import { useLaunchRunner, type LaunchPlan } from "@/components/launch/useLaunchRunner";
import { CONCURRENCY_CAP_DEFAULT } from "@/lib/concurrency-cap";
import { buildCohort, type CohortIntent, type ConfidenceBand } from "@/lib/cohort";
import { detectRegion, parseLaunchCsv, regionInfo, type ParsedCsv } from "@/lib/launch/csv";
import {
  buildCampaignType,
  canAdvance,
  DEFAULT_CALL_STATUSES,
  LAUNCH_STEPS,
  toLaunchContacts,
  type AudienceSource,
  type ValidationReport,
} from "@/lib/launch/wizard";

export const Route = createFileRoute("/launch")({
  component: LaunchWizard,
});

/** Campaign day shown until the server suggests the next one. */
const DEFAULT_CAMPAIGN_DAY = "Day 1";

/** Region every cohort batch is sent with. */
const COHORT_REGION = "GZB";

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_AFTER_HRS = 24;
const DEFAULT_PROFILE_STATUSES = ["Active", "At Risk"];

function LaunchWizard() {
  const { programId: ctxProgram, setProgramId } = useProgram();
  const [step, setStep] = useState(0);
  const [program, setProgram] = useState<ProgramId>(ctxProgram);
  const config = registry[program];
  const overrides = useProgramOverrides(program);
  const defaultAgentId = overrides.rayaAgentId || config.rayaAgentId || "";

  const [agentId, setAgentId] = useState<string>(defaultAgentId);

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [region, setRegion] = useState<string>("");
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [validating, setValidating] = useState(false);
  const [proceedInvalid, setProceedInvalid] = useState(false);

  const [source, setSource] = useState<AudienceSource>("upload");
  const [cohortIntent, setCohortIntent] = useState<CohortIntent>("drive");
  const [profileStatuses, setProfileStatuses] = useState<string[]>(DEFAULT_PROFILE_STATUSES);
  const [confidenceBand, setConfidenceBand] = useState<ConfidenceBand>("low");

  const [schedule, setSchedule] = useState<ScheduleState>(() => makeDefaultSchedule());
  const [concurrency, setConcurrency] = useState(DEFAULT_CONCURRENCY);
  const [maxRetries, setMaxRetries] = useState(DEFAULT_MAX_RETRIES);
  const [retryAfterHrs, setRetryAfterHrs] = useState(DEFAULT_RETRY_AFTER_HRS);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(DEFAULT_CALL_STATUSES);

  // User edits to fields that otherwise follow a computed value; null means "not edited".
  const [batchNameEdit, setBatchNameEdit] = useState<{ value: string; forType: string } | null>(
    null,
  );
  const [campaignDayEdit, setCampaignDayEdit] = useState<string | null>(null);
  const [campaignDate, setCampaignDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const { session } = useAuth();
  const canDirectLaunch = session?.role === "admin" || session?.role === "jfc";

  const runner = useLaunchRunner();
  const listAgentsFn = useServerFn(listProgramAgents);
  const validateFn = useServerFn(validateContacts);
  const nextDayFn = useServerFn(getNextCampaignDay);
  const usage = useConcurrencyUsage({ enabled: !runner.launching });
  const available = usage.data?.available ?? Infinity;
  const cap = usage.data?.cap ?? CONCURRENCY_CAP_DEFAULT;

  const seekersQuery = useSeekers(source === "cohort");
  const seekers = seekersQuery.data;
  const cohortContacts = useMemo(
    () =>
      seekers
        ? buildCohort(seekers, { intent: cohortIntent, profileStatuses, confidenceBand })
        : [],
    [seekers, cohortIntent, profileStatuses, confidenceBand],
  );

  // The next free campaign day for the program; it fills the field until the user edits it.
  const nextDayQuery = useQuery({
    queryKey: ["next-campaign-day", program],
    queryFn: () => nextDayFn({ data: { program } }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const campaignDay = campaignDayEdit ?? nextDayQuery.data?.next ?? DEFAULT_CAMPAIGN_DAY;

  const { language, city } = regionInfo(region);
  const campaignType = buildCampaignType({ program, region, campaignDay, source, cohortIntent });
  // The batch name follows the campaign type; a user edit holds until the type changes.
  const batchName =
    batchNameEdit && batchNameEdit.forType === campaignType ? batchNameEdit.value : campaignType;

  // Keep the dashboard-wide program in step with the program picked here.
  useEffect(() => {
    if (program !== ctxProgram) setProgramId(program);
  }, [program, ctxProgram, setProgramId]);

  const agentsQuery = useQuery({
    queryKey: ["program-agents", program],
    queryFn: () => listAgentsFn({ data: { program } }),
    enabled: step >= 1,
    retry: false,
  });
  const agentName = agentsQuery.data?.find((a) => a.agent_id === agentId)?.name ?? "";

  const contacts = toLaunchContacts(source, cohortContacts, report?.validRows, region);
  const plan: LaunchPlan = {
    program,
    agentId,
    agentName,
    batchName,
    campaignDay,
    campaignDate,
    campaignType,
    region,
    language,
    city,
    source,
    cohortIntent,
    profileStatuses,
    confidenceBand,
    contacts,
    schedule,
    concurrency,
    maxRetries,
    retryAfterHrs,
    selectedStatuses,
    available,
    fileName: file?.name,
    reportValid: report?.valid ?? 0,
  };

  const canNext = canAdvance({
    step,
    program,
    agentId,
    source,
    cohortCount: cohortContacts.length,
    report,
    proceedInvalid,
    schedule,
    concurrency,
    maxRetries,
    retryAfterHrs,
    available,
  });

  const selectProgram = (p: ProgramId) => {
    if (p !== program) setCampaignDayEdit(null);
    setProgram(p);
  };

  const selectSource = (s: AudienceSource) => {
    setSource(s);
    if (s === "cohort") setRegion(COHORT_REGION);
  };

  const onFile = async (f: File) => {
    setFile(f);
    setReport(null);
    setProceedInvalid(false);
    setRegion(detectRegion(f.name).region);
    const p = parseLaunchCsv(await f.text());
    setParsed(p);
    setValidating(true);
    try {
      setReport(await validateFn({ data: { headers: p.headers, rows: p.rows } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setParsed(null);
    setReport(null);
  };

  const next = () => setStep((s) => Math.min(LAUNCH_STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 0 && <ProgramStep program={program} onSelect={selectProgram} />}

      {step === 1 && (
        <AgentStep
          program={program}
          agents={agentsQuery.data}
          isLoading={agentsQuery.isLoading}
          error={agentsQuery.error}
          agentId={agentId}
          onSelect={setAgentId}
        />
      )}

      {step === 2 && (
        <div className="space-y-4">
          <AudienceSourcePicker source={source} onSelect={selectSource} />
          {source === "upload" ? (
            <UploadStep
              file={file}
              parsed={parsed}
              report={report}
              validating={validating}
              region={region}
              setRegion={setRegion}
              proceedInvalid={proceedInvalid}
              setProceedInvalid={setProceedInvalid}
              onFile={onFile}
              onReset={() => {
                clearFile();
                setProceedInvalid(false);
              }}
            />
          ) : (
            <CohortStep
              intent={cohortIntent}
              setIntent={setCohortIntent}
              profileStatuses={profileStatuses}
              setProfileStatuses={setProfileStatuses}
              confidenceBand={confidenceBand}
              setConfidenceBand={setConfidenceBand}
              loading={seekersQuery.isLoading}
              count={cohortContacts.length}
            />
          )}
        </div>
      )}

      {step === 3 && (
        <Panel
          title="Step 4 · Schedule"
          description="Days, time window, and timezone for the call window"
        >
          <div className="max-w-xl">
            <ScheduleEditor value={schedule} onChange={setSchedule} />
          </div>
        </Panel>
      )}

      {step === 4 && (
        <ConcurrencyStep
          available={available}
          cap={cap}
          usageLoading={usage.isLoading}
          batchesInUse={usage.data?.batches?.length ?? 0}
          concurrency={concurrency}
          setConcurrency={setConcurrency}
          maxRetries={maxRetries}
          setMaxRetries={setMaxRetries}
          retryAfterHrs={retryAfterHrs}
          setRetryAfterHrs={setRetryAfterHrs}
          selectedStatuses={selectedStatuses}
          setSelectedStatuses={setSelectedStatuses}
        />
      )}

      {step === 5 && (
        <ReviewStep
          programLabel={config.label}
          agentId={agentId}
          agentName={agentName}
          batchName={batchName}
          onBatchNameChange={(value) => setBatchNameEdit({ value, forType: campaignType })}
          source={source}
          cohortIntent={cohortIntent}
          profileStatuses={profileStatuses}
          confidenceBand={confidenceBand}
          fileName={file?.name}
          region={region}
          language={language}
          city={city}
          campaignDay={campaignDay}
          onCampaignDayChange={setCampaignDayEdit}
          campaignDate={campaignDate}
          onCampaignDateChange={setCampaignDate}
          campaignType={campaignType}
          cohortCount={cohortContacts.length}
          report={report}
          schedule={schedule}
          concurrency={concurrency}
          maxRetries={maxRetries}
          retryAfterHrs={retryAfterHrs}
          selectedStatuses={selectedStatuses}
        />
      )}

      {step === 6 && (
        <LaunchStep
          canDirectLaunch={canDirectLaunch}
          requested={runner.requested}
          launching={runner.launching}
          batchId={runner.batchId}
          startPending={runner.startPending}
          startStatus={runner.startStatus}
          launchError={runner.launchError}
          onRequest={() => runner.requestCampaign(plan)}
          onLaunch={() => runner.launch(plan)}
          onRetryStart={(id) => runner.retryStart(plan, id)}
        />
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={back} disabled={step === 0 || runner.launching}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        {step < LAUNCH_STEPS.length - 1 ? (
          <Button
            onClick={next}
            disabled={!canNext}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setStep(0);
              runner.reset();
              clearFile();
            }}
          >
            Start over
          </Button>
        )}
      </div>
    </div>
  );
}
