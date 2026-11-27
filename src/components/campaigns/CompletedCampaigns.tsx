import { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useProgram } from "@/programs/context";
import { useCampaignList } from "@/programs/useProgramAggregates";
import { CampaignCalendar } from "@/components/campaigns/CampaignCalendar";
import {
  CampaignCard,
  CampaignRow,
  type CampaignChannel,
} from "@/components/campaigns/CampaignListItems";
import { Panel } from "@/components/Panel";
import { LoadingState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { CAMPAIGNS_PAGE_SIZE, campaignKey, filterCampaigns, paginate } from "@/lib/campaigns/list";
import {
  DEFAULT_CAMPAIGNS_VIEW,
  readSavedCampaignsView,
  saveCampaignsView,
  type CampaignsView,
} from "@/lib/campaigns/view-preference";
import { cn } from "@/lib/utils";

/** The saved layout only changes through this page, so there is nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => {};
}

/** Completed campaigns from the synced sheet, as a calendar or a searchable, paged list. */
export function CompletedCampaigns() {
  const { config } = useProgram();
  const isDkb = config.id === "providers";
  const successLabel = isDkb ? "Active providers" : "Converted";
  const [channel, setChannel] = useState<CampaignChannel>("all");
  const { data, isLoading } = useCampaignList(config, { channel });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // The saved layout is read after hydration; the server renders the default.
  const savedView = useSyncExternalStore(subscribeToNothing, readSavedCampaignsView, () => null);
  const [chosenView, setChosenView] = useState<CampaignsView | null>(null);
  const view = chosenView ?? savedView ?? DEFAULT_CAMPAIGNS_VIEW;
  const chooseView = (v: CampaignsView) => {
    setChosenView(v);
    saveCampaignsView(v);
  };

  const { recent, all } = useMemo(
    () => filterCampaigns(data ?? [], search, new Date()),
    [data, search],
  );
  const { pageRows, page: clampedPage, pageCount } = paginate(all, page, CAMPAIGNS_PAGE_SIZE);
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Completed campaigns
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Drill into one campaign and compare it to its region's average.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
            {[
              { value: "list" as const, label: "List" },
              { value: "calendar" as const, label: "Calendar" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => chooseView(opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded transition-colors",
                  view === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {!isDkb && (
            <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
              {[
                { value: "all" as const, label: "All calls" },
                { value: "outbound" as const, label: "Outbound" },
                { value: "inbound" as const, label: "Inbound" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setChannel(opt.value)}
                  className={cn(
                    "px-3 py-1.5 rounded transition-colors",
                    channel === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <div className="relative w-72 max-w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by campaign name"
              className="pl-8 h-9"
            />
          </div>
        </div>
      </div>
      {isLoading && !data ? (
        <LoadingState />
      ) : view === "calendar" ? (
        <CampaignCalendar campaigns={all} channel={channel} />
      ) : (
        <>
          {recent.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Latest · review pending
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {recent.map((c) => (
                  <CampaignCard
                    key={campaignKey(c)}
                    campaign={c}
                    successLabel={successLabel}
                    channel={channel}
                    highlighted
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                All campaigns
              </h3>
              {all.length > CAMPAIGNS_PAGE_SIZE && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={clampedPage <= 1}
                    className="inline-flex items-center gap-0.5 rounded-md border border-border px-2 py-1 disabled:opacity-40 hover:bg-muted"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <span className="tabular-nums">
                    Page {clampedPage} of {pageCount}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={clampedPage >= pageCount}
                    className="inline-flex items-center gap-0.5 rounded-md border border-border px-2 py-1 disabled:opacity-40 hover:bg-muted"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            <Panel>
              <ul className="divide-y divide-border">
                {pageRows.length === 0 ? (
                  <li className="py-6 text-center text-sm text-muted-foreground">
                    No campaigns match your search.
                  </li>
                ) : (
                  pageRows.map((c) => (
                    <CampaignRow
                      key={campaignKey(c)}
                      campaign={c}
                      successLabel={successLabel}
                      channel={channel}
                    />
                  ))
                )}
              </ul>
            </Panel>
            {all.length > 0 && (
              <p className="text-[11px] text-muted-foreground text-right tabular-nums">
                {all.length} campaign{all.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
