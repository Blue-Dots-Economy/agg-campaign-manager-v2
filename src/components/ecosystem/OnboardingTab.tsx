import { useMemo, useRef, useState } from "react";
import { useTimeout } from "@/hooks/useTimeout";
import { AlertTriangle, BadgeCheck, Check, Copy, Download, Upload, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getFlaggedProfiles,
  getOnboardingHealth,
  getRegistrationLinks,
  type FlaggedProfile,
  type RegistrationLink,
} from "@/lib/ecosystem-data";
import type { RegionValue } from "@/components/ecosystem/RegionSelector";
import { ShareLink } from "@/components/ecosystem/ShareLink";
import { fieldFromIssue } from "@/components/ecosystem/onboarding-helpers";

export function OnboardingTab({ region }: { region: RegionValue }) {
  return (
    <div className="space-y-6">
      <HealthRow region={region} />
      <AddParticipants />
      <ShareLink region={region} />
      <YourLinks region={region} />
      <FlaggedSection region={region} />
    </div>
  );
}

/* 1. Health */

function HealthCard({
  icon,
  tone,
  value,
  caption,
  action,
}: {
  icon: React.ReactNode;
  tone: "brand" | "green" | "red";
  value: number;
  caption: string;
  action?: React.ReactNode;
}) {
  const tile =
    tone === "brand"
      ? "bg-brand-soft text-brand"
      : tone === "green"
        ? "bg-green-500/15 text-green-700 dark:text-green-400"
        : "bg-red-500/15 text-red-700 dark:text-red-400";
  return (
    <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
      <div className={`h-10 w-10 shrink-0 rounded-lg grid place-items-center ${tile}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
          {value}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>
      </div>
      {action}
    </div>
  );
}

function HealthRow({ region }: { region: RegionValue }) {
  const health = useMemo(() => getOnboardingHealth(region), [region]);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <HealthCard
        icon={<Users className="h-5 w-5" />}
        tone="brand"
        value={health.totalRegistered}
        caption="Total registered via your links"
      />
      <HealthCard
        icon={<BadgeCheck className="h-5 w-5" />}
        tone="green"
        value={health.verified}
        caption="Verified and discoverable"
      />
      <HealthCard
        icon={<AlertTriangle className="h-5 w-5" />}
        tone="red"
        value={health.unverified}
        caption="Unverified seekers"
        action={
          <Button variant="outline" size="sm" className="shrink-0">
            Verify now
          </Button>
        }
      />
    </div>
  );
}

/* 2. Add participants */

/** How long the placeholder upload takes before it reports success. */
const SIMULATED_UPLOAD_MS = 2000;

function AddParticipants() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const later = useTimeout();

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    setFile(f);
    setDone(false);
  };

  const upload = () => {
    setUploading(true);
    setDone(false);
    later(() => {
      setUploading(false);
      setDone(true);
      toast.success("Participants uploaded");
    }, SIMULATED_UPLOAD_MS);
  };

  return (
    <Panel
      title="Add participants"
      description="Bulk upload seekers or providers from a spreadsheet."
      action={
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Download className="h-4 w-4" />
          Download template
        </Button>
      }
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragging ? "border-brand bg-brand-soft" : "border-border bg-muted/30"
        }`}
      >
        <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">Drag your CSV here or click to browse</p>
        <p className="mt-1 text-xs text-muted-foreground">
          .csv files only · max 500 rows per upload
        </p>
        {file ? <p className="mt-3 text-xs text-brand font-medium">{file.name}</p> : null}
        <input
          ref={inputRef}
          type="file"
          aria-label="Participants CSV file"
          accept=".csv"
          className="hidden"
          onChange={(e) => pick(e.currentTarget.files?.[0])}
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button disabled={!file || uploading} onClick={upload}>
          {uploading ? "Uploading…" : "Upload"}
        </Button>
        {uploading ? (
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
          </div>
        ) : null}
        {done ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
            <Check className="h-4 w-4" /> Upload complete
          </span>
        ) : null}
      </div>
    </Panel>
  );
}

/* 4. Your registration links */

function YourLinks({ region }: { region: RegionValue }) {
  const [links, setLinks] = useState<RegistrationLink[]>(() => getRegistrationLinks(region));
  const [tab, setTab] = useState<"Seeker" | "Provider">("Seeker");

  const shown = links.filter((l) => l.domain === tab);
  const activeCount = links.filter((l) => l.active).length;

  const copySlug = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(`https://purpledots.in/register/org/${slug}`);
      toast.success("Link copied");
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Panel
      title="Your registration links"
      description="Links you have created for field and digital outreach."
      action={
        <Badge
          variant="outline"
          className="bg-green-500/15 text-green-700 dark:text-green-400 border-transparent"
        >
          {activeCount} active
        </Badge>
      }
    >
      <div className="flex items-center gap-2 mb-4">
        {(["Seeker", "Provider"] as const).map((d) => (
          <Button
            key={d}
            size="sm"
            variant="outline"
            className={`rounded-full ${tab === d ? "bg-brand-soft text-brand border-brand/30" : ""}`}
            onClick={() => setTab(d)}
          >
            {d} links
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {shown.map((l) => (
          <div key={l.id} className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{l.name}</p>
                <Badge
                  variant="outline"
                  className={
                    l.active
                      ? "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent"
                      : "bg-muted text-muted-foreground border-transparent"
                  }
                >
                  {l.active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setLinks((prev) =>
                      prev.map((p) => (p.id === l.id ? { ...p, active: !p.active } : p)),
                    )
                  }
                >
                  {l.active ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Delete ${l.name}`}
                  onClick={() => {
                    setLinks((prev) => prev.filter((p) => p.id !== l.id));
                    toast.success(`Deleted "${l.name}"`);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <p className="mt-1 text-xs text-muted-foreground">{l.description}</p>

            <div className="mt-3 flex items-center gap-2 rounded-md bg-muted px-3 py-2">
              <span className="font-mono text-xs text-muted-foreground break-all">
                purpledots.in/register/org/<span className="text-brand">{l.slug}</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 ml-auto shrink-0"
                aria-label={`Copy link for ${l.name}`}
                onClick={() => copySlug(l.slug)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              <Badge variant="outline" className="bg-brand-soft text-brand border-transparent">
                {l.domain}
              </Badge>
              <span>
                <strong className="text-foreground">{l.registrations}</strong> registrations
              </span>
              <span>
                <strong className="text-foreground">{l.verified}</strong> verified
              </span>
              <span>{l.lastUsed}</span>
            </div>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No {tab.toLowerCase()} links yet.
          </p>
        )}
      </div>
    </Panel>
  );
}

/* 5. Flagged profiles */

function FlaggedSection({ region }: { region: RegionValue }) {
  const profiles = useMemo(() => getFlaggedProfiles(region), [region]);
  const [fixing, setFixing] = useState<FlaggedProfile | null>(null);
  const [value, setValue] = useState("");

  const notify = (p: FlaggedProfile) => toast.success(`Notification sent to ${p.name}`);
  const openFix = (p: FlaggedProfile) => {
    setFixing(p);
    setValue("");
  };

  return (
    <Panel
      title="Flagged profiles"
      description="Profiles that need correction before they go live."
    >
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead>Upload date</TableHead>
              <TableHead className="text-right">Days flagged</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.type}</TableCell>
                <TableCell className="text-red-700 dark:text-red-400">{p.issue}</TableCell>
                <TableCell>{p.uploadDate}</TableCell>
                <TableCell className="text-right tabular-nums">{p.daysFlagged}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-brand"
                      onClick={() => notify(p)}
                    >
                      Notify
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openFix(p)}>
                      Fix
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-3">
        {profiles.map((p) => (
          <div key={p.id} className="rounded-lg border border-border p-4">
            <p className="text-sm font-semibold text-foreground">{p.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{p.type}</p>
            <p className="mt-2 text-xs text-red-700 dark:text-red-400">{p.issue}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {p.uploadDate} · {p.daysFlagged} days flagged
            </p>
            <div className="mt-3 flex items-center gap-1.5">
              <Button variant="ghost" size="sm" className="text-brand" onClick={() => notify(p)}>
                Notify
              </Button>
              <Button variant="outline" size="sm" onClick={() => openFix(p)}>
                Fix
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Sheet open={!!fixing} onOpenChange={(o) => !o && setFixing(null)}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>{fixing?.name}</SheetTitle>
            <SheetDescription>Correct the flagged field to publish this profile.</SheetDescription>
          </SheetHeader>
          {fixing ? (
            <div className="space-y-4 p-4">
              <div className="rounded-md bg-red-500/15 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                {fixing.issue}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fix-field" className="capitalize">
                  {fieldFromIssue(fixing.issue)}
                </Label>
                <Input
                  id="fix-field"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={`Enter ${fieldFromIssue(fixing.issue)}`}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  toast.success(`Changes saved for ${fixing.name}`);
                  setFixing(null);
                }}
              >
                Save changes
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </Panel>
  );
}
