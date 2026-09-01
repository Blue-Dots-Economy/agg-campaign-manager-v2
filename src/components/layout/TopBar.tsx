import { Upload, Rocket, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProgram } from "@/programs/context";
import { useAuth } from "@/auth/context";
import { Link, useRouterState } from "@tanstack/react-router";
import { MobileNav } from "./MobileNav";
import { AccountMenu } from "./AccountMenu";
import {
  useSyncProgram,
  useProgramAggregates,
  useAutoFreshness,
} from "@/programs/useProgramAggregates";
import { ConcurrencyChip } from "@/components/ConcurrencyChip";

export function TopBar() {
  const { config } = useProgram();
  const { session } = useAuth();
  const canDirectLaunch = session?.role === "admin" || session?.role === "jfc";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isUserOverview = pathname === "/user-level-analysis";
  const sync = useSyncProgram(config.id);
  const query = useProgramAggregates(config);
  const lastSynced = query.data?.lastSyncedAt ?? null;

  // On-load freshness: kick off a silent background sync if the snapshot is stale.
  const autoSync = useAutoFreshness(config.id, lastSynced);
  const isSyncing = sync.isPending || autoSync.isPending;

  const ageMs = lastSynced ? Date.now() - new Date(lastSynced).getTime() : null;
  const stale = ageMs !== null && ageMs > 60 * 60_000; // > 1 hour
  const ago = lastSynced ? timeAgo(lastSynced) : "never";

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b bg-background">
      <MobileNav />
      {!isUserOverview && (
        <div>
          <p className="text-sm text-muted-foreground">
            Here's how {config.label} is performing
          </p>
        </div>
      )}
      <div className="flex items-center gap-2 ml-auto">
        {!isUserOverview && (
          <>
            <ConcurrencyChip />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft text-brand px-3 py-1 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              {config.label} program
            </span>
            <span
              className={`text-xs ${
                isSyncing
                  ? "text-muted-foreground"
                  : stale
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
              }`}
              title={lastSynced ?? "Never synced"}
            >
              {isSyncing ? "Updating…" : `Updated ${ago}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => sync.mutate({ force: true })}
              disabled={isSyncing}
              title={`Last synced ${ago}`}
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing…" : "Refresh"}
            </Button>
            {canDirectLaunch && (
              <Link to="/launch">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Upload className="h-4 w-4" /> Upload CSV
                </Button>
              </Link>
            )}
            <Link to={canDirectLaunch ? "/launch" : "/request-campaign"}>
              <Button size="sm" className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
                <Rocket className="h-4 w-4" /> {canDirectLaunch ? "Launch campaign" : "Request campaign"}
              </Button>
            </Link>
          </>
        )}
        <AccountMenu />
      </div>
    </header>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
