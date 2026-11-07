// Drilldown dialogs for the ecosystem gap panels.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type RegionValue } from "@/components/ecosystem/RegionSelector";
import {
  getAggregatorsForNeed,
  getProvidersForCategory,
  providerGapRows,
  seekerGapRows,
} from "@/lib/ecosystem-data";

import { Actions, GapNumber, LevelBadge } from "@/components/ecosystem/GapCells";
import { fmtCount as fmt } from "@/components/ecosystem/ecosystemHelpers";

const contactCls = "font-mono text-xs text-muted-foreground";

/** Dialog listing the service providers in a category with their gaps. */
export function ProviderDrilldown({
  region,
  category,
  onClose,
}: {
  region: RegionValue;
  category: string | null;
  onClose: () => void;
}) {
  const orgs = category ? getProvidersForCategory(region, category) : [];
  return (
    <Dialog open={!!category} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{category}</DialogTitle>
          <DialogDescription>
            {orgs.length} service provider{orgs.length === 1 ? "" : "s"} in this category.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Can service upto</TableHead>
                <TableHead className="text-right">Matching</TableHead>
                <TableHead className="text-right">Connections</TableHead>
                <TableHead className="text-right">Action gap</TableHead>
                <TableHead>Action level</TableHead>
                <TableHead className="text-right">D-S gap</TableHead>
                <TableHead>D-S level</TableHead>
                <TableHead>Recommended actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providerGapRows(orgs).map((o) => {
                const { ag, ds, agL, dsL, actions } = o;
                return (
                  <TableRow key={o.org}>
                    <TableCell className="font-medium">{o.org}</TableCell>
                    <TableCell className={contactCls}>{o.email}</TableCell>
                    <TableCell className={contactCls}>{o.phone}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(o.capacity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(o.matching)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(o.connections)}</TableCell>
                    <TableCell className="text-right">
                      <GapNumber value={ag} />
                    </TableCell>
                    <TableCell>
                      <LevelBadge level={agL} />
                    </TableCell>
                    <TableCell className="text-right">
                      <GapNumber value={ds} />
                    </TableCell>
                    <TableCell>
                      <LevelBadge level={dsL} />
                    </TableCell>
                    <TableCell>
                      <Actions items={actions} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Dialog listing the aggregators for a seeker need with their gaps. */
export function SeekerDrilldown({
  region,
  area,
  onClose,
}: {
  region: RegionValue;
  area: string | null;
  onClose: () => void;
}) {
  const orgs = area ? getAggregatorsForNeed(region, area) : [];
  return (
    <Dialog open={!!area} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{area}</DialogTitle>
          <DialogDescription>
            {orgs.length} aggregator{orgs.length === 1 ? "" : "s"} reaching seekers in this need
            area.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Can reach upto</TableHead>
                <TableHead className="text-right">Matching</TableHead>
                <TableHead className="text-right">Connections</TableHead>
                <TableHead className="text-right">Action gap</TableHead>
                <TableHead>Action level</TableHead>
                <TableHead className="text-right">D-S gap</TableHead>
                <TableHead>D-S level</TableHead>
                <TableHead>Recommended actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {seekerGapRows(orgs).map((o) => {
                const { ag, ds, agL, dsL, actions } = o;
                return (
                  <TableRow key={o.org}>
                    <TableCell className="font-medium">{o.org}</TableCell>
                    <TableCell className={contactCls}>{o.email}</TableCell>
                    <TableCell className={contactCls}>{o.phone}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(o.reach)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(o.matching)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(o.connections)}</TableCell>
                    <TableCell className="text-right">
                      <GapNumber value={ag} />
                    </TableCell>
                    <TableCell>
                      <LevelBadge level={agL} />
                    </TableCell>
                    <TableCell className="text-right">
                      <GapNumber value={ds} />
                    </TableCell>
                    <TableCell>
                      <LevelBadge level={dsL} />
                    </TableCell>
                    <TableCell>
                      <Actions items={actions} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
