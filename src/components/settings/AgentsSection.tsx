import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Trash2, RefreshCw, Plus, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  listProgramAgents,
  createProgramAgent,
  refreshProgramAgent,
  deleteProgramAgent,
  loadAgent,
} from "@/lib/agents.functions";
import type { ProgramId } from "@/programs/registry";

function maskId(id: string) {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function AgentsSection() {
  return (
    <div className="space-y-6">
      <Panel
        title="Raya agents"
        description="Add the Raya agents that place calls for each program. Agents added here power the agent dropdown in the Launch wizard."
      >
        <div className="text-xs text-muted-foreground">
          The agent id is the UUID shown in Raya's dashboard. We validate it against the Raya API before saving.
        </div>
      </Panel>

      <Tabs defaultValue="kkb">
        <TabsList>
          <TabsTrigger value="kkb">KKB agents</TabsTrigger>
          <TabsTrigger value="dkb">DKB agents</TabsTrigger>
        </TabsList>
        <TabsContent value="kkb" className="mt-4">
          <ProgramAgents program="kkb" />
        </TabsContent>
        <TabsContent value="dkb" className="mt-4">
          <ProgramAgents program="dkb" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProgramAgents({ program }: { program: ProgramId }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProgramAgents);
  const refreshFn = useServerFn(refreshProgramAgent);
  const deleteFn = useServerFn(deleteProgramAgent);

  const { data, isLoading } = useQuery({
    queryKey: ["program-agents", program],
    queryFn: () => listFn({ data: { program } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["program-agents", program] });
    qc.invalidateQueries({ queryKey: ["program-agents"] });
  };

  const refresh = useMutation({
    mutationFn: (id: string) => refreshFn({ data: { id } }),
    onSuccess: (res) => {
      invalidate();
      if (res.ok) toast.success("Agent refreshed");
      else toast.error(res.error ?? "Failed");
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Agent removed"); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {isLoading ? "Loading…" : `${data?.length ?? 0} agent${(data?.length ?? 0) === 1 ? "" : "s"}`}
        </div>
        <AddAgentDialog defaultProgram={program} onCreated={invalidate} />
      </div>

      <div className="space-y-3">
        {(data ?? []).map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-4 py-3"
          >
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-brand" />
                <div className="font-medium">{a.name || "Unnamed agent"}</div>
                <Badge variant="outline" className="uppercase text-[10px]">{a.program}</Badge>
                <StatusBadge status={a.status} lastError={a.last_error} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground font-mono">{maskId(a.agent_id)}</div>
              {a.status === "error" && a.last_error && (
                <div className="mt-1 text-xs text-red-600 break-all">
                  {a.last_error.length > 200 ? `${a.last_error.slice(0, 200)}…` : a.last_error}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={refresh.isPending}
                onClick={() => refresh.mutate(a.id)}
              >
                {refresh.isPending && refresh.variables === a.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm(`Remove "${a.name || a.agent_id}"?`)) remove.mutate(a.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          </div>
        ))}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
            No agents added yet for {program.toUpperCase()}.
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, lastError }: { status: string; lastError?: string | null }) {
  if (status === "loaded")
    return (
      <Badge className="bg-brand-soft text-brand hover:bg-brand-soft">
        <CheckCircle2 className="mr-1 h-3 w-3" /> loaded
      </Badge>
    );
  if (status === "error") {
    const badge = (
      <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 hover:bg-red-500/25 cursor-help">
        <AlertCircle className="mr-1 h-3 w-3" /> error
      </Badge>
    );
    if (!lastError) return badge;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent className="max-w-md whitespace-pre-wrap break-words text-xs">
            {lastError}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return <Badge variant="outline">unknown</Badge>;
}

function AddAgentDialog({
  defaultProgram, onCreated,
}: { defaultProgram: ProgramId; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [program, setProgram] = useState<ProgramId>(defaultProgram);
  const [agentId, setAgentId] = useState("");
  const [name, setName] = useState("");
  const [probe, setProbe] = useState<{ ok: boolean; name?: string; error?: string } | null>(null);
  const [loadingProbe, setLoadingProbe] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadFn = useServerFn(loadAgent);
  const createFn = useServerFn(createProgramAgent);

  const reset = () => {
    setProgram(defaultProgram); setAgentId(""); setName(""); setProbe(null);
  };

  const onProbe = async () => {
    if (!agentId.trim()) return;
    setLoadingProbe(true); setProbe(null);
    try {
      const res = await loadFn({ data: { agentId: agentId.trim() } });
      if (res.ok) setProbe({ ok: true, name: res.name });
      else setProbe({ ok: false, error: res.error });
    } catch (e) {
      setProbe({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally { setLoadingProbe(false); }
  };

  const onSave = async () => {
    if (!agentId.trim()) return toast.error("Agent id is required");
    setSaving(true);
    try {
      const res = await createFn({ data: { program, agentId: agentId.trim(), name: name.trim() || undefined } });
      if (res.ok) toast.success("Agent added");
      else toast.error(`Saved with error: ${res.error}`);
      setOpen(false); reset(); onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button className="bg-brand hover:bg-brand/90">
          <Plus className="mr-2 h-4 w-4" /> Add agent
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a Raya agent</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label>Program</Label>
            <Select value={program} onValueChange={(v) => setProgram(v as ProgramId)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="kkb">KKB</SelectItem>
                <SelectItem value="dkb">DKB</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Agent id</Label>
            <Input
              value={agentId}
              onChange={(e) => { setAgentId(e.target.value); setProbe(null); }}
              placeholder="e.g. 9c0a…-…-…"
              className="font-mono"
            />
          </div>
          <div>
            <Label>Friendly name (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the Raya agent's name" />
          </div>
          {probe && (
            <div className={`rounded-md px-3 py-2 text-sm ${probe.ok ? "bg-brand-soft text-brand" : "bg-red-500/15 text-red-700 dark:text-red-400"}`}>
              {probe.ok ? `Loaded · ${probe.name}` : probe.error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onProbe} disabled={!agentId.trim() || loadingProbe}>
            {loadingProbe ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Load agent
          </Button>
          <Button onClick={onSave} disabled={saving || !agentId.trim()} className="bg-brand hover:bg-brand/90">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
