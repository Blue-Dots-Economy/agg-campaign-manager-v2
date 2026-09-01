import type { CallRow } from "./data";
import type { ProgramConfig } from "./registry";

// ---- DKB helpers (read from the raw header→value map) ----
function dkbField(r: CallRow, key: string): string {
  return (r.raw?.[key] ?? "").trim();
}
function isAnsweredStatus(s: string): boolean {
  const x = s.trim().toLowerCase();
  return x.startsWith("answered") || x === "completed";
}
function isPhaseReached(s: string): boolean {
  return /^phase\s*[1-4]$/i.test(s.trim());
}

export function computeKpis(config: ProgramConfig, rows: CallRow[]): Record<string, number> {
  const total = rows.length;

  if (config.id === "providers") {
    const answered = rows.filter((r) => isAnsweredStatus(dkbField(r, "call_status"))).length;
    const jobsVerified = rows.filter((r) => {
      const s = dkbField(r, "job_status").toLowerCase();
      return s === "active" || s === "closed";
    }).length;
    const newJobsPosted = rows.filter((r) => dkbField(r, "new_job_posted").toLowerCase() === "yes").length;
    const talentInsights = rows.filter((r) => dkbField(r, "talent_insights_shown").toLowerCase() === "yes").length;
    const highIntent = rows.filter((r) => {
      const n = Number(dkbField(r, "intent_score"));
      return Number.isFinite(n) && n >= 5;
    }).length;
    return {
      total_calls: total,
      answered_pct: total ? Math.round((answered / total) * 100) : 0,
      jobs_verified: jobsVerified,
      new_jobs_posted: newJobsPosted,
      high_intent: highIntent,
      talent_insights_shown: talentInsights,
    };
  }

  // KKB (and default)
  const answered = rows.filter((r) => r.call_answered).length;
  const engaged = rows.filter((r) => r.call_engaged).length;
  const applications = rows.filter((r) => r.applied_to_job).length;
  const highIntent = rows.filter((r) => r["Intent Score"] >= 5).length;
  return {
    total_calls: total,
    answered_pct: total ? Math.round((answered / total) * 100) : 0,
    engaged_pct: total ? Math.round((engaged / total) * 100) : 0,
    applications,
    high_intent: highIntent,
  };
}

export function byCampaignDay(config: ProgramConfig, rows: CallRow[]) {
  const map = new Map<string, CallRow[]>();
  for (const r of rows) {
    if (!map.has(r.campaign_day)) map.set(r.campaign_day, []);
    map.get(r.campaign_day)!.push(r);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => parseInt(a.split(" ")[1]) - parseInt(b.split(" ")[1]))
    .map(([day, dayRows]) => {
      const isDkb = config.id === "providers";
      const answered = isDkb
        ? dayRows.filter((r) => isAnsweredStatus(dkbField(r, "call_status"))).length
        : dayRows.filter((r) => r.call_answered).length;
      const engaged = dayRows.filter((r) => r.call_engaged).length;
      const converted = isDkb
        ? dayRows.filter((r) => dkbField(r, "new_job_posted").toLowerCase() === "yes").length
        : config.id === "seekers"
          ? dayRows.filter((r) => r.applied_to_job).length
          : dayRows.filter((r) => r.interview_scheduled).length;
      const highIntent = isDkb
        ? dayRows.filter((r) => {
            const n = Number(dkbField(r, "intent_score"));
            return Number.isFinite(n) && n >= 5;
          }).length
        : dayRows.filter((r) => r["Intent Score"] >= 5).length;
      return {
        day,
        date: dayRows[0].campaign_date,
        type: dayRows[0].campaign_type,
        language: dayRows[0].language,
        rows: dayRows.length,
        answered,
        engaged,
        converted,
        new_jobs: isDkb
          ? dayRows.filter((r) => dkbField(r, "new_job_posted").toLowerCase() === "yes").length
          : 0,
        answered_pct: Math.round((answered / dayRows.length) * 100),
        high_intent: highIntent,
      };
    });
}

// ---- DKB-specific breakdowns ----

export function phasesReachedBreakdown(rows: CallRow[]) {
  const buckets: Record<string, number> = {
    "Phase 1": 0,
    "Phase 2": 0,
    "Phase 3": 0,
    "Phase 4": 0,
  };
  let notReached = 0;
  for (const r of rows) {
    const v = dkbField(r, "phases_reached");
    if (!v || !isPhaseReached(v)) {
      notReached++;
      continue;
    }
    const norm = v.trim().replace(/\s+/g, " ");
    const key = norm.charAt(0).toUpperCase() + norm.slice(1).toLowerCase();
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return [
    ...Object.entries(buckets).map(([phase, count]) => ({ phase, count })),
    { phase: "Not reached", count: notReached },
  ];
}

export function jobStatusBreakdown(rows: CallRow[]) {
  const order = ["Unverified", "Active", "Closed", "Not Called", "Wrong Number"];
  const buckets: Record<string, number> = Object.fromEntries(order.map((k) => [k, 0]));
  for (const r of rows) {
    const v = dkbField(r, "job_status");
    if (!v) {
      buckets["Not Called"]++;
      continue;
    }
    const matched = order.find((k) => k.toLowerCase() === v.toLowerCase());
    if (matched) buckets[matched]++;
    else buckets[v] = (buckets[v] ?? 0) + 1;
  }
  return Object.entries(buckets).map(([status, count]) => ({ status, count }));
}

export function callOutcomeBreakdown(rows: CallRow[]) {
  const order = ["Early Disconnect", "No Answer", "Completed", "Callback Requested", "Failure"];
  const buckets: Record<string, number> = Object.fromEntries(order.map((k) => [k, 0]));
  for (const r of rows) {
    const v = dkbField(r, "call_outcome") || r.call_outcome;
    if (!v) continue;
    const matched = order.find((k) => k.toLowerCase() === v.toLowerCase());
    if (matched) buckets[matched]++;
    else buckets[v] = (buckets[v] ?? 0) + 1;
  }
  return Object.entries(buckets).map(([outcome, count]) => ({ outcome, count }));
}

export function intentDistributionDkb(rows: CallRow[]) {
  const buckets: Record<number, number> = {};
  for (let i = 0; i <= 10; i++) buckets[i] = 0;
  for (const r of rows) {
    const n = Number(dkbField(r, "intent_score"));
    if (!Number.isFinite(n)) continue;
    const k = Math.max(0, Math.min(10, Math.round(n)));
    buckets[k] = (buckets[k] ?? 0) + 1;
  }
  return Object.entries(buckets).map(([score, count]) => ({ score: `${score}`, count }));
}

export function dropReasonBreakdown(config: ProgramConfig, rows: CallRow[]) {
  const buckets = Object.fromEntries(config.dropReasons.map((r) => [r, 0]));
  for (const r of rows) {
    const reason = r.drop_reason;
    if (!reason) continue;
    if (reason in buckets) buckets[reason]++;
    else buckets.other = (buckets.other ?? 0) + 1;
  }
  return Object.entries(buckets).map(([reason, count]) => ({ reason, count }));
}

export function intentDistribution(rows: CallRow[]) {
  const buckets: Record<number, number> = {};
  for (let i = 0; i <= 10; i++) buckets[i] = 0;
  for (const r of rows) buckets[r["Intent Score"]] = (buckets[r["Intent Score"]] ?? 0) + 1;
  return Object.entries(buckets).map(([score, count]) => ({ score: `${score}`, count }));
}

export function regionSplit(rows: CallRow[]) {
  const ka = rows.filter((r) => r.city_campaign === "Hubli-Dharwad").length;
  const gzb = rows.filter((r) => r.city_campaign === "Ghaziabad").length;
  return [
    { region: "KA", count: ka },
    { region: "GZB", count: gzb },
  ];
}
