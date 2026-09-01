import { createServerFn } from "@tanstack/react-start";

const SPREADSHEET_ID = "1J2WDeSOCaIVz2KvWMmI9dVE4iTh_Dqbt8Aqb6423a2U";
const RANGE = "seeker_profile!A1:AK";

export type Seeker = {
  id: string;
  userId: string;
  name: string;
  location: string;
  role: string;
  createdOn: string; // raw date string
  profileAge: number | null;
  lastAppliedAge: number | null;
  applications: number;
  shortlisted: number;
  rejected: number;
  profileCompletion: number; // percentage 0-100
  followUpFor: string;
  status: "New" | "Active" | "At Risk" | "Inactive";
  profileStatus: "Complete" | "Incomplete";
  recommendedAction: string;
};

function toInt(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function toPct(v: unknown): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function computeStatus(profileAge: number | null, lastAppliedAge: number | null): Seeker["status"] {
  const pAge = profileAge ?? 9999;
  if (pAge <= 7) return "New";
  const la = lastAppliedAge;
  if (la !== null && la <= 30) return "Active";
  if (la !== null && la >= 31 && la <= 90) return "At Risk";
  // Inactive: Profile Age > 7 AND (Last Applied Age > 90 OR no applications / null)
  return "Inactive";
}

function computeRecommendedAction(
  status: Seeker["status"],
  profileStatus: Seeker["profileStatus"],
  lastAppliedAge: number | null,
): string {
  if (profileStatus === "Incomplete") return "Complete Profile";
  switch (status) {
    case "New":
      return "Automated Call";
    case "At Risk":
      return "Automated Call";
    case "Inactive":
      return "Manual Call";
    case "Active":
      // "if status = active for more than 14 days" — approximated via lastAppliedAge > 14
      if (lastAppliedAge !== null && lastAppliedAge > 14) return "Automated Call";
      return "No Action";
  }
}

export const getUpSeekers = createServerFn({ method: "GET" }).handler(async () => {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovableKey || !connKey) {
    throw new Error("Google Sheets connector is not configured");
  }
  const url = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API failed [${res.status}]: ${body}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  const rows = data.values ?? [];
  if (rows.length < 2) return [] as Seeker[];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name.toLowerCase());
  const cId = idx("id");
  const cUser = idx("user_id");
  const cName = idx("name");
  const cLoc = idx("location");
  const cRole = idx("role");
  const cCreated = idx("created_on");
  const cProfileAge = idx("profile age");
  const cLastAppliedAge = idx("last applied age");
  const cApps = idx("applications");
  const cShort = idx("shortlisted");
  const cRej = idx("rejected");
  const cCompletion = idx("profile completion");
  const cFollowUp = idx("follow up for");

  const seekers: Seeker[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const name = (r[cName] ?? "").trim();
    if (!name) continue;
    const profileAge = toIntOrNull(r[cProfileAge]);
    const lastAppliedAge = toIntOrNull(r[cLastAppliedAge]);
    const applications = toInt(r[cApps]);
    const shortlisted = toInt(r[cShort]);
    const rejected = toInt(r[cRej]);
    const completion = toPct(r[cCompletion]);
    const profileStatus: Seeker["profileStatus"] = completion >= 100 ? "Complete" : "Incomplete";
    const status = computeStatus(profileAge, lastAppliedAge);
    const recommendedAction = computeRecommendedAction(status, profileStatus, lastAppliedAge);
    seekers.push({
      id: r[cId] ?? String(i),
      userId: r[cUser] ?? "",
      name,
      location: r[cLoc] ?? "",
      role: r[cRole] ?? "",
      createdOn: r[cCreated] ?? "",
      profileAge,
      lastAppliedAge,
      applications,
      shortlisted,
      rejected,
      profileCompletion: completion,
      followUpFor: r[cFollowUp] ?? "",
      status,
      profileStatus,
      recommendedAction,
    });
  }
  return seekers;
});
