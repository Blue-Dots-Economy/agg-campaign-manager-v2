import { useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CSV_PREVIEW_ROW_LIMIT, type ParsedCsv } from "@/lib/launch/csv";
import type { ValidationReport } from "@/lib/launch/wizard";

interface UploadStepProps {
  file: File | null;
  parsed: ParsedCsv | null;
  report: ValidationReport | null;
  validating: boolean;
  region: string;
  setRegion: (r: string) => void;
  proceedInvalid: boolean;
  setProceedInvalid: (v: boolean) => void;
  onFile: (f: File) => void;
  onReset: () => void;
}

/** Step 3 (upload): drop a contact CSV, see the server's validation report and a preview. */
export function UploadStep({
  file,
  parsed,
  report,
  validating,
  region,
  setRegion,
  proceedInvalid,
  setProceedInvalid,
  onFile,
  onReset,
}: UploadStepProps) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Panel
      title="Step 3 · Upload & validate"
      description="Drop a CSV — we validate before any Raya call is made"
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-10 cursor-pointer transition-colors",
          drag ? "border-brand bg-brand-soft" : "border-border bg-muted/40",
        )}
      >
        <div className="h-10 w-10 rounded-full bg-brand-soft flex items-center justify-center text-brand">
          <Upload className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium">Drop CSV here, or click to browse</p>
        <p className="text-xs text-muted-foreground">
          Required: contact_name, contact_phone. Optional: country_code (default 91).
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          hidden
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) onFile(f);
          }}
        />
      </div>

      {file && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> File
              </div>
              <div className="text-sm font-medium truncate" title={file.name}>
                {file.name}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                onReset();
                if (inputRef.current) inputRef.current.value = "";
              }}
              title="Remove file"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <InfoTile label="Rows" value={parsed?.rows.length.toLocaleString() ?? "—"} />
          <div className="rounded-lg border bg-card p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Detected region
            </div>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KA">KA · Kannada · Hubli</SelectItem>
                <SelectItem value="GZB">GZB · Hindi · Ghaziabad</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {validating && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Validating…
        </div>
      )}

      {report && (
        <ReportSummary
          report={report}
          proceedInvalid={proceedInvalid}
          setProceedInvalid={setProceedInvalid}
        />
      )}

      {parsed && parsed.headers.length > 0 && <CsvPreview parsed={parsed} />}
    </Panel>
  );
}

interface ReportSummaryProps {
  report: ValidationReport;
  proceedInvalid: boolean;
  setProceedInvalid: (v: boolean) => void;
}

function ReportSummary({ report, proceedInvalid, setProceedInvalid }: ReportSummaryProps) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-brand-soft text-brand hover:bg-brand-soft">{report.valid} valid</Badge>
        <Badge variant="secondary">{report.total} total</Badge>
        {report.invalid > 0 && (
          <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 hover:bg-red-500/25">
            {report.invalid} problems
          </Badge>
        )}
      </div>
      {report.missingCols.length > 0 && (
        <div className="rounded-md bg-red-500/15 text-red-700 dark:text-red-400 px-3 py-2 text-sm">
          Missing required column{report.missingCols.length === 1 ? "" : "s"}:{" "}
          <span className="font-mono">{report.missingCols.join(", ")}</span>
        </div>
      )}
      {report.problems.length > 0 && (
        <div className="rounded-md border max-h-56 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Row</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.problems.map((p) => (
                <TableRow key={p.row}>
                  <TableCell className="text-xs">{p.row}</TableCell>
                  <TableCell className="text-xs">{p.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {report.invalid > 0 && report.missingCols.length === 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={proceedInvalid}
            onChange={(e) => setProceedInvalid(e.target.checked)}
          />
          Proceed with {report.valid} valid rows only (skip {report.invalid} problem rows)
        </label>
      )}
    </div>
  );
}

/** First rows of the uploaded file. Rows and cells keep file order, so their position is their key. */
function CsvPreview({ parsed }: { parsed: ParsedCsv }) {
  return (
    <div className="mt-5">
      <p className="text-xs text-muted-foreground mb-2">
        Preview · first {CSV_PREVIEW_ROW_LIMIT} rows
      </p>
      <div className="max-h-72 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {parsed.headers.map((h) => (
                <TableHead key={h} className="whitespace-nowrap text-xs">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {parsed.rows.slice(0, CSV_PREVIEW_ROW_LIMIT).map((r, i) => (
              <TableRow key={i}>
                {r.map((c, j) => (
                  <TableCell key={j} className="text-xs whitespace-nowrap">
                    {c}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-sm font-medium truncate">{value}</div>
    </div>
  );
}
