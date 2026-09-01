import type { Seeker } from "./upSeekersCsv";

export type CohortIntent = "drive" | "fill";
export type ConfidenceBand = "low" | "medium" | "high";

export interface CohortContact {
  contact_name: string;
  contact_phone: string;
  country_code: string;
  [k: string]: string;
}

// Mock confidence until the real field exists: stand in with profile completeness.
export function mockConfidence(s: Seeker): number {
  return s.profileCompletion;
}
export function confidenceBandOf(score: number): ConfidenceBand {
  return score < 40 ? "low" : score <= 70 ? "medium" : "high";
}

export interface CohortOpts {
  intent: CohortIntent;
  profileStatuses?: string[];
  confidenceBand?: ConfidenceBand;
}

export function buildCohort(seekers: Seeker[], opts: CohortOpts): CohortContact[] {
  const withPhone = seekers.filter((s) => (s.phone ?? "").replace(/\D/g, "").length >= 10);
  let picked: Seeker[];
  if (opts.intent === "drive") {
    const set = new Set(opts.profileStatuses ?? []);
    picked = set.size ? withPhone.filter((s) => set.has(s.status)) : withPhone;
  } else {
    const band = opts.confidenceBand ?? "low";
    picked = withPhone.filter((s) => confidenceBandOf(mockConfidence(s)) === band);
  }
  return picked.map((s) => ({
    contact_name: s.name || "Seeker",
    contact_phone: (s.phone ?? "").replace(/\D/g, "").slice(-10),
    country_code: "91",
    seeker_id: s.id,
    role: s.role,
    location: s.location,
  }));
}
