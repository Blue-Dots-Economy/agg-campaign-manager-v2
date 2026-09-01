import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Application } from "./mockData";
import { APP_AGE_LABEL, appAgeBucket, relativeAge } from "./ecosystemHelpers";

export function ApplicationsDrilldown({
  open,
  onOpenChange,
  applications,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  applications: Application[];
}) {
  const counts = useMemo(() => {
    const c = { week: 0, month: 0, older: 0 };
    for (const a of applications) c[appAgeBucket(a.applied_date)]++;
    return c;
  }, [applications]);

  const sorted = useMemo(
    () => [...applications].sort((a, b) => (a.applied_date < b.applied_date ? 1 : -1)),
    [applications]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Applications</DialogTitle>
          <DialogDescription>
            {applications.length} application{applications.length === 1 ? "" : "s"} in this region.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          {(["week", "month", "older"] as const).map((k) => (
            <div key={k} className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">{APP_AGE_LABEL[k]}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{counts[k]}</p>
            </div>
          ))}
        </div>

        <div className="max-h-[55vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seeker Role</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.seeker_role}</TableCell>
                  <TableCell>{a.location}</TableCell>
                  <TableCell className="text-muted-foreground">{relativeAge(a.applied_date)}</TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    No applications to show.
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
