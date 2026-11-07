import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { loadEcosystem } from "../../src/lib/ecosystem.server";
import { REGION_CONFIGS } from "../../src/lib/ecosystem-config";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const realFetch = globalThis.fetch;
const realEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(() => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "sa@example.iam.gserviceaccount.com",
    private_key: pem,
  });
});
afterAll(() => {
  if (realEnv === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  else process.env.GOOGLE_SERVICE_ACCOUNT_JSON = realEnv;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

interface Tab {
  headers: string[];
  rows: string[][];
}

/** Serves tabs per spreadsheet id: tab list, header row, batchGet and row count. */
function stubSheets(books: Record<string, Record<string, Tab>>) {
  const stub = async (input: string | URL | Request) => {
    const url = decodeURIComponent(String(input));
    if (url === TOKEN_URL) return json({ access_token: "tok", expires_in: 3600 });
    const book = Object.entries(books).find(([id]) => url.includes(`/spreadsheets/${id}`));
    if (!book) throw new Error(`unexpected ${url}`);
    const tabs = book[1];
    if (url.includes("fields=sheets.properties.title"))
      return json({ sheets: Object.keys(tabs).map((title) => ({ properties: { title } })) });
    const [name, tab] = Object.entries(tabs).find(([t]) => url.includes(`${t}!`)) ?? [];
    if (!name || !tab) return json({ error: "Unable to parse range" }, 400);
    if (url.includes("A1:ZZ1")) return json({ values: [tab.headers] });
    if (url.includes("batchGet")) return json({ valueRanges: [{ values: tab.rows }] });
    if (url.includes("A2:A200000")) return json({ values: tab.rows });
    throw new Error(`unexpected ${url}`);
  };
  globalThis.fetch = Object.assign(stub, { preconnect: realFetch.preconnect });
}

const KA = REGION_CONFIGS.KA;
if (!KA) throw new Error("KA region missing");
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * DAY_MS).toISOString();

const JOBS: Tab = {
  headers: [
    "ID",
    "Role",
    "Job Sector",
    "Current Openings",
    "Applications",
    "Status",
    "Location District",
    "Salary",
  ],
  rows: [
    ["j1", "Driver", "Logistics", "3", "1,200", "Open", "Hubli", "₹15,000"],
    ["j2", "", "", "x", "", "Closed - filled", "Belgavi", ""],
    ["", "Cook", "Food", "1", "0", "", "hubli", ""],
  ],
};
const APPLICATIONS: Tab = {
  headers: ["id", "job_id", "Applied At", "Seeker Role"],
  rows: [
    ["a1", "j1", daysAgo(2), "Driver"],
    ["a2", "j1", daysAgo(20), ""],
    ["a3", "j9", daysAgo(90), "Cook"],
    ["a4", "j1", "not a date", "Cook"],
  ],
};
const SEEKERS: Tab = {
  headers: ["id", "user_id", "Location District", "Organization Name"],
  rows: [
    ["s1", "u1", "Hubli", "Org A"],
    ["s2", "u1", "Hubli", " Org A "],
    ["", "", "hubli", "Org B"],
    ["s4", "u4", "Belgavi", "Org C"],
  ],
};

describe("loadEcosystem", () => {
  test("maps jobs, applications and seeker counts for a district", async () => {
    stubSheets({
      [KA.jobsSheet]: { [KA.jobsTab]: JOBS, [KA.applicationsTab]: APPLICATIONS },
      [KA.seekerSheet]: { [KA.seekerTab]: SEEKERS },
    });
    const eco = await loadEcosystem("KA", "Hubli");
    expect(eco.jobs.map((j) => j.id)).toEqual(["j1", "KA-2"]);
    expect(eco.jobs[0]).toMatchObject({
      title: "Driver",
      category: "Logistics",
      sector: "Logistics",
      current_openings: 3,
      applications: 1200,
      status: "open",
      salary_offered: 15000,
      location_district: "Hubli",
      location_state: "KA",
      area: "—",
    });
    expect(eco.jobs[1]).toMatchObject({ title: "Cook", status: "open", current_openings: 1 });
    expect(eco.applications.total).toBe(3);
    expect(eco.applications.buckets).toEqual({ week: 1, month: 1, older: 1 });
    expect(eco.applications.sample.map((a) => a.id)).toEqual(["a1", "a2", "a4"]);
    expect(eco.applications.sample[1]?.seeker_role).toBe("—");
    expect(eco.seekerCounts).toEqual({ profiles: 3, accounts: 1, orgs: 2 });
    expect(eco.unmapped).toEqual(["jobs:openings", "jobs:title"]);
    expect(Number.isFinite(Date.parse(eco.lastSyncedAt))).toBe(true);
  });

  test("falls back to all rows and the region row count when the district matches nothing", async () => {
    stubSheets({
      [KA.jobsSheet]: { OPEN_ROLES_v2: JOBS, applications: APPLICATIONS },
      [KA.seekerSheet]: { seeker_list: SEEKERS },
    });
    const eco = await loadEcosystem("KA", "Nowhere");
    expect(eco.jobs.length).toBe(3);
    expect(eco.jobs[1]?.status).toBe("closed");
    expect(eco.jobs[1]?.title).toBe("—");
    expect(eco.applications.total).toBe(3);
    expect(eco.seekerCounts).toEqual({ profiles: 4, accounts: 4, orgs: 0 });
  });

  test("notes missing application and seeker columns", async () => {
    stubSheets({
      [KA.jobsSheet]: {
        [KA.jobsTab]: { headers: ["role"], rows: [] },
        [KA.applicationsTab]: { headers: ["id"], rows: [["a1"]] },
      },
      [KA.seekerSheet]: { [KA.seekerTab]: { headers: ["id"], rows: [["s1"]] } },
    });
    const eco = await loadEcosystem("KA", "Hubli");
    expect(eco.unmapped).toEqual([
      "jobs:current_openings",
      "jobs:openings",
      "jobs:title",
      "applications:applied_date",
      "seekers:user_id",
    ]);
    expect(eco.applications.buckets).toEqual({ week: 0, month: 0, older: 1 });
    expect(eco.seekerCounts).toEqual({ profiles: 1, accounts: 0, orgs: 0 });
  });

  test("refuses an unknown region", async () => {
    await expect(loadEcosystem("ZZ", "x")).rejects.toThrow("Unknown region state: ZZ");
  });
});
