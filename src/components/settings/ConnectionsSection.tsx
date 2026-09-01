import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plug, Trash2, RefreshCw, Copy, CheckCircle2, AlertCircle, Loader2, Pencil } from "lucide-react";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  revalidateConnections,
  listSheetTabsFn,
  type SheetConnection,
} from "@/lib/connections.functions";
const DEFAULT_SA_EMAIL = "blue-dots-admin@blue-dots-project.iam.gserviceaccount.com";
import type { ProgramId } from "@/programs/registry";

function extractSheetId(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : input.trim();
}
function maskId(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}
function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ConnectionsSection() {
  return (
    <div className="space-y-6">
      <Panel
        title="Google Sheets connections"
        description="The dashboard reads enabled sheets server-side via a Google service account. Share each sheet with the address below as a Viewer before connecting."
      >
        <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-4 py-3 text-sm">
          <code className="font-mono text-xs">{DEFAULT_SA_EMAIL}</code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(DEFAULT_SA_EMAIL);
              toast.success("Service account email copied");
            }}
          >
            <Copy className="mr-1 h-3.5 w-3.5" /> Copy
          </Button>
        </div>
      </Panel>

      <Tabs defaultValue="seekers">
        <TabsList>
          <TabsTrigger value="seekers">KKB sheets</TabsTrigger>
          <TabsTrigger value="providers">DKB sheets</TabsTrigger>
        </TabsList>
        <TabsContent value="seekers" className="mt-4">
          <ProgramConnections program="seekers" />
        </TabsContent>
        <TabsContent value="providers" className="mt-4">
          <ProgramConnections program="providers" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProgramConnections({ program }: { program: ProgramId }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listConnections);
  const updateFn = useServerFn(updateConnection);
  const deleteFn = useServerFn(deleteConnection);
  const testFn = useServerFn(testConnection);
  const revalidateFn = useServerFn(revalidateConnections);

  const { data, isLoading } = useQuery({
    queryKey: ["connections", program],
    queryFn: () => listFn({ data: { program } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["connections", program] });
    qc.invalidateQueries({ queryKey: ["program-rows", program] });
  };

  useEffect(() => {
    let cancelled = false;
    revalidateFn({ data: { program } })
      .then((res) => {
        if (!cancelled && res.checked > 0) invalidate();
      })
      .catch(() => { /* surfaced per-row */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program]);

  const toggle = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      updateFn({ data: vars }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Connection removed");
    },
  });
  const refresh = useMutation({
    mutationFn: (c: SheetConnection) =>
      testFn({ data: { id: c.id, sheet_id: c.sheet_id, tab_name: c.tab_name ?? undefined } }),
    onSuccess: (res) => {
      invalidate();
      if (res.ok) toast.success(`Connected · ${res.rowCount} rows`);
      else toast.error(res.error);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {isLoading ? "Loading…" : `${data?.length ?? 0} connection${(data?.length ?? 0) === 1 ? "" : "s"}`}
        </div>
        <ConnectDialog program={program} onCreated={invalidate} />
      </div>

      <div className="space-y-3">
        {(data ?? []).map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-4 py-3"
          >
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2">
                <Plug className="h-4 w-4 text-brand" />
                <div className="font-medium">{c.name}</div>
                <StatusBadge status={c.status} enabled={c.enabled} lastError={c.last_error} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground font-mono">
                {maskId(c.sheet_id)}
                {c.tab_name ? ` · ${c.tab_name}` : ""}
              </div>
              {c.status === "error" && c.last_error && (
                <div className="mt-1 text-xs text-red-600 break-all">
                  {c.last_error.length > 200 ? `${c.last_error.slice(0, 200)}…` : c.last_error}
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground text-right min-w-[120px]">
              <div>{c.row_count ?? "—"} rows</div>
              <div>synced {timeAgo(c.last_synced_at)}</div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={c.enabled}
                onCheckedChange={(v) => toggle.mutate({ id: c.id, enabled: v })}
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={refresh.isPending}
                onClick={() => refresh.mutate(c)}
              >
                {refresh.isPending && refresh.variables?.id === c.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <EditConnectionDialog connection={c} onSaved={invalidate} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm(`Remove "${c.name}"?`)) remove.mutate(c.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          </div>
        ))}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
            No sheets connected yet for {program.toUpperCase()}.
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  enabled,
  lastError,
}: {
  status: string;
  enabled: boolean;
  lastError?: string | null;
}) {
  if (!enabled) return <Badge variant="secondary">disabled</Badge>;
  if (status === "connected")
    return (
      <Badge className="bg-brand-soft text-brand hover:bg-brand-soft">
        <CheckCircle2 className="mr-1 h-3 w-3" /> connected
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
  return <Badge variant="outline">checking</Badge>;
}

function TabPicker({
  sheetId,
  value,
  onChange,
  disabled,
}: {
  sheetId: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const listTabsFn = useServerFn(listSheetTabsFn);
  const [tabs, setTabs] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (!sheetId) {
      setTabs(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    listTabsFn({ data: { sheet_id: sheetId } })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setTabs(res.tabs);
          if (!value && res.tabs.length > 0) onChange(res.tabs[0]);
        } else {
          setTabs([]);
          setErr(res.error);
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId]);

  if (!sheetId) {
    return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Paste sheet URL first" disabled />;
  }
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading tabs…
      </div>
    );
  }
  if (manual || err || !tabs || tabs.length === 0) {
    return (
      <div className="space-y-1">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Sheet1" disabled={disabled} />
        {err && <div className="text-xs text-red-600 break-all">{err}</div>}
        {tabs && tabs.length > 0 && (
          <button type="button" className="text-xs text-brand underline" onClick={() => setManual(false)}>
            Pick from list
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Pick a tab" />
        </SelectTrigger>
        <SelectContent>
          {tabs.map((t) => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setManual(true)}>
        Type manually
      </button>
    </div>
  );
}

function ConnectDialog({ program, onCreated }: { program: ProgramId; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [tab, setTab] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; rows?: number; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const createFn = useServerFn(createConnection);
  const testFn = useServerFn(testConnection);

  const sheetId = extractSheetId(url);

  const onTest = async () => {
    if (!sheetId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testFn({ data: { sheet_id: sheetId, tab_name: tab || undefined } });
      setTestResult(res.ok ? { ok: true, rows: res.rowCount } : { ok: false, error: res.error });
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  const onSave = async () => {
    if (!name || !sheetId) return toast.error("Name and sheet are required");
    try {
      await createFn({ data: { program, name, sheet_id: sheetId, tab_name: tab || undefined } });
      toast.success("Connection added");
      setOpen(false);
      setName(""); setUrl(""); setTab(""); setTestResult(null);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-brand hover:bg-brand/90">
          <Plug className="mr-2 h-4 w-4" /> Connect a sheet
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a {program.toUpperCase()} sheet</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label>Friendly name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="KKB Day-8 Hubli" />
          </div>
          <div>
            <Label>Sheet URL or ID</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
            {sheetId && url && (
              <div className="mt-1 text-xs text-muted-foreground font-mono">id: {sheetId}</div>
            )}
          </div>
          <div>
            <Label>Tab</Label>
            <TabPicker sheetId={sheetId} value={tab} onChange={setTab} />
          </div>
          {testResult && (
            <div
              className={`rounded-md px-3 py-2 text-sm ${
                testResult.ok ? "bg-brand-soft text-brand" : "bg-red-500/15 text-red-700 dark:text-red-400"
              }`}
            >
              {testResult.ok ? `Connected · ${testResult.rows} rows` : testResult.error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onTest} disabled={!sheetId || testing}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Test connection
          </Button>
          <Button onClick={onSave} className="bg-brand hover:bg-brand/90">
            Add connection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditConnectionDialog({
  connection,
  onSaved,
}: {
  connection: SheetConnection;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(connection.name);
  const [tab, setTab] = useState(connection.tab_name ?? "");
  const [saving, setSaving] = useState(false);

  const updateFn = useServerFn(updateConnection);
  const testFn = useServerFn(testConnection);

  useEffect(() => {
    if (open) {
      setName(connection.name);
      setTab(connection.tab_name ?? "");
    }
  }, [open, connection]);

  const onSave = async () => {
    setSaving(true);
    try {
      await updateFn({ data: { id: connection.id, name, tab_name: tab || null } });
      const res = await testFn({
        data: { id: connection.id, sheet_id: connection.sheet_id, tab_name: tab || undefined },
      });
      if (res.ok) toast.success(`Connected · ${res.rowCount} rows`);
      else toast.error(res.error);
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit connection</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label>Friendly name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            id: {maskId(connection.sheet_id)}
          </div>
          <div>
            <Label>Tab</Label>
            <TabPicker sheetId={connection.sheet_id} value={tab} onChange={setTab} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={saving} className="bg-brand hover:bg-brand/90">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save & test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
