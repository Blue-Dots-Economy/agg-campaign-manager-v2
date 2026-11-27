// Ecosystem onboarding: the "Share a registration link" panel.
import { useState } from "react";
import { useTimeout } from "@/hooks/useTimeout";
import { QrCode } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RegionValue } from "@/components/ecosystem/RegionSelector";
import { registrationUrl } from "@/components/ecosystem/onboarding-helpers";

const Req = () => <span className="text-red-600 dark:text-red-400"> *</span>;

/** How long the "Copied" state shows after copying a link. */
const COPIED_FEEDBACK_MS = 1500;

/** Form that builds a registration link participants can use to join the network. */
export function ShareLink({ region }: { region: RegionValue }) {
  const [org, setOrg] = useState("Purple Dots Aggregator");
  const [instance, setInstance] = useState(region.state);
  const [lever, setLever] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [district, setDistrict] = useState(region.district);
  const [domain, setDomain] = useState("Seeker");
  const [signalSource, setSignalSource] = useState("");
  const [signalSubSource, setSignalSubSource] = useState("");
  const [sourceFullName, setSourceFullName] = useState("");
  const [sourceType, setSourceType] = useState("Government");
  const [active, setActive] = useState(true);
  const [copied, setCopied] = useState(false);
  const later = useTimeout();

  const url = registrationUrl(district, org);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${url}`);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    later(() => setCopied(false), COPIED_FEEDBACK_MS);
  };

  return (
    <Panel
      title="Share a registration link"
      description="Generate a link participants can use to join your network."
      action={
        <Badge
          variant="outline"
          className={
            active
              ? "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent"
              : "bg-muted text-muted-foreground border-transparent"
          }
        >
          {active ? "Live" : "Inactive"}
        </Badge>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="org">Organisation name</Label>
            <Input id="org" value={org} onChange={(e) => setOrg(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="instance">
                Instance (state name)
                <Req />
              </Label>
              <Input id="instance" value={instance} onChange={(e) => setInstance(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lever">Lever / event</Label>
              <Input id="lever" value={lever} onChange={(e) => setLever(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-date">Event date</Label>
              <Input
                id="event-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-location">Event location</Label>
              <Input
                id="event-location"
                value={eventLocation}
                onChange={(e) => setEventLocation(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="district">
                District
                <Req />
              </Label>
              <Input id="district" value={district} onChange={(e) => setDistrict(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>
                Domain
                <Req />
              </Label>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Seeker">Seeker</SelectItem>
                  <SelectItem value="Provider">Provider</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signal-source">Signal source</Label>
              <Input
                id="signal-source"
                value={signalSource}
                onChange={(e) => setSignalSource(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signal-sub">Signal sub-source</Label>
              <Input
                id="signal-sub"
                value={signalSubSource}
                onChange={(e) => setSignalSubSource(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source-full">Source or sub-source full name</Label>
              <Input
                id="source-full"
                value={sourceFullName}
                onChange={(e) => setSourceFullName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Source type</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Government", "Private", "NGO", "Other"].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Generated URL</Label>
            <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground break-all">
              {url}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="share-url">Shareable link</Label>
            <div className="flex items-center gap-2">
              <Input id="share-url" readOnly value={`https://${url}`} />
              <Button className="shrink-0" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Participants who register via this link are added to your network automatically.
          </p>

          <Button
            variant="outline"
            size="sm"
            className={
              active
                ? "text-red-700 dark:text-red-400 border-red-500/30 hover:bg-red-500/10"
                : "text-green-700 dark:text-green-400 border-green-500/30 hover:bg-green-500/10"
            }
            onClick={() => setActive((a) => !a)}
          >
            {active ? "Deactivate link" : "Activate link"}
          </Button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <QrCode className="h-4 w-4 text-brand" />
            QR code
          </div>
          <div
            className="grid place-items-center rounded-xl bg-brand text-primary-foreground text-lg font-semibold"
            style={{ width: 148, height: 148 }}
          >
            QR
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Scan or click to open the registration page
          </p>
          <Button variant="outline" size="sm" onClick={() => toast.success("QR downloaded")}>
            Download QR
          </Button>
        </div>
      </div>
    </Panel>
  );
}
