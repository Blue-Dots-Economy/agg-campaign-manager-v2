import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { JobPost } from "./mockData";
import {
  GAP_LEVEL_CLASSES,
  fmtInt,
  gapLevel,
  maskEmail,
  maskName,
  maskPhone,
  nz,
} from "./ecosystemHelpers";

export function GapDrilldownDialog({
  open,
  onOpenChange,
  title,
  jobs,
  partial,
  right,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  jobs: JobPost[];
  partial?: number;
  right?: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {jobs.length} open job {jobs.length === 1 ? "post" : "posts"} in this group.
            {(partial !== undefined || right !== undefined) && (
              <span className="ml-2 text-xs">
                · Partial Fit pool: <span className="font-medium text-foreground">{partial ?? 0}</span>
                {" · "}
                Right Fit pool: <span className="font-medium text-foreground">{right ?? 0}</span>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Sector</TableHead>
                <TableHead className="text-right">Openings</TableHead>
                <TableHead className="text-right">Apps</TableHead>
                <TableHead className="text-right">Gap</TableHead>
                <TableHead>Gap Level</TableHead>
                <TableHead className="text-right">Partial Fit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => {
                const gap = j.current_openings - j.applications;
                const gl = gapLevel(gap);
                return (
                  <TableRow key={j.id}>
                    <TableCell>{maskName(j.contact_name)}</TableCell>
                    <TableCell className="tabular-nums">{maskPhone(j.contact_phone)}</TableCell>
                    <TableCell>{maskEmail(j.contact_email)}</TableCell>
                    <TableCell>{nz(j.posted_by)}</TableCell>
                    <TableCell>{j.title}</TableCell>
                    <TableCell>{nz(j.sector)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(j.current_openings)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(j.applications)}</TableCell>
                    <TableCell className="text-right tabular-nums">{gap}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={GAP_LEVEL_CLASSES[gl]}>
                        {gl}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(j.partial_fit_seekers)}</TableCell>
                  </TableRow>
                );
              })}
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                    No jobs to show.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
