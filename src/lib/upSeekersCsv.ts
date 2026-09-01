import bundledCsv from "@/data/up-seekers.csv?raw";

export type ProfileFieldCheck = { label: string; passed: boolean; value: string };

export const PROFILE_FIELD_LABELS = [
  "Name",
  "Location",
  "Email or Phone",
  "Age",
  "Role",
  "Expected Salary",
] as const;

export type ProfileSignal = "Strong" | "Moderate" | "Weak";

export type Seeker = {
  id: string;
  userId: string;
  name: string;
  location: string;
  role: string;
  createdOn: string;
  profileAge: number | null;
  lastAppliedAge: number | null;
  applications: number;
  shortlisted: number;
  rejected: number;
  profileCompletion: number;
  profileFieldChecks: ProfileFieldCheck[];
  emailPresent: boolean;
  phonePresent: boolean;
  phone: string;
  followUpFor: string;
  status: "New" | "Active" | "At Risk" | "Inactive";
  profileStatus: "Complete" | "Incomplete";
  profileSignal: ProfileSignal;
  recommendedAction: string;
};



const DB_NAME = "up-seekers-db";
const DB_VERSION = 1;
const STORE = "csv";
const CSV_KEY = "current-csv";
const META_KEY_IDB = "current-meta";
// Legacy localStorage keys (migrated away from due to 5MB quota).
const LS_STORAGE_KEY = "up-seekers-csv-v1";
const LS_META_KEY = "up-seekers-csv-meta-v1";

export type CsvMeta = { name: string; uploadedAt: string; rows: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Minimal RFC4180-ish CSV parser (handles quoted fields with commas/newlines/escaped quotes)
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        cur.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c && c.trim().length > 0));
}

function toIntOrNull(v: string | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function toInt(v: string | undefined): number {
  const n = toIntOrNull(v);
  return n ?? 0;
}
function toPct(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Default exclusion: rows flagged as test data are dropped from any linked sheet/CSV.
 * Treats "1", "1.0", "true", "yes", "y" (case-insensitive) as test = 1 flags. */
function isTestRow(v: string | undefined): boolean {
  if (!v) return false;
  const normalized = v.trim().toLowerCase();
  return ["1", "1.0", "true", "yes", "y"].includes(normalized);
}

function computeStatus(profileAge: number | null, lastAppliedAge: number | null): Seeker["status"] {
  const p = profileAge ?? 9999;
  if (p <= 7) return "New";
  const la = lastAppliedAge;
  if (la !== null && la <= 30) return "Active";
  if (la !== null && la >= 31 && la <= 90) return "At Risk";
  return "Inactive";
}

function computeAction(
  status: Seeker["status"],
  profileStatus: Seeker["profileStatus"],
  lastAppliedAge: number | null,
  csvAction: string,
): string {
  if (profileStatus === "Incomplete") return "Complete Profile";
  switch (status) {
    case "New":
    case "At Risk":
      return "Automated Call";
    case "Inactive":
      return "Manual Call";
    case "Active":
      if (lastAppliedAge !== null && lastAppliedAge > 14) return "Automated Call";
      return csvAction?.trim() || "No Action";
  }
}

function norm(s: string | undefined): string {

  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Normalize a location for blocklist comparison: lowercase, strip punctuation,
 * collapse whitespace. */
function normLoc(s: string | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[.,()\-–—/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Known-generic / non-meaningful location values that should count as incomplete.
 * These are typically just a city, district, or state name (or a short
 * ward/village label) with no street-level detail. */
const INVALID_LOCATIONS = new Set(
  [
    "VaishaliHapur Rd, Near Petrol Pump, E Block, D-Block, Shastri Nagar, Ghaziabad, Uttar Pradesh 201002",
    "Ghaziabad, Uttar Pradesh",
    "Prayagraj, Uttar Pradesh",
    "Gorakhpur, Uttar Pradesh",
    "Lucknow, , ,,Uttar Pradesh",
    "Muradnagar, Uttar Pradesh",
    "MURADNAGAR GZB",
    "GHAZIABAD",
    "Dasna, Uttar Pradesh",
    "Lucknow, LUCKNOW, ,,Uttar Pradesh",
    "MURADNAGAR GHAZIABAD",
    "Modinagar, Uttar Pradesh",
    "Noida, Uttar Pradesh",
    "MODINAGAR GZB",
    "Naini Taluka Naini Dadari, Uttar Pradesh",
    "Prayagraj, , ,,Uttar Pradesh",
    "गाजियाबाद (नगर निगम), तहसील- गाजियाबाद, जनपद- गाजियाबाद, उत्तर प्रदेश",
    "DASNA DEHAT",
    "ARTHLA PAL ROAD- WARD NO.25",
    "SUTHARI",
    "Sirathu, Uttar Pradesh",
    "GANAULI",
    "SHAHZADPUR",
    "MIRPUR HINDU",
    "AURANGABAD FAZALGARH",
    "MODINAGAR GHAZIABAD",
    "RAGHUNATH PUR",
    "SHAPUR BAMHATA - WARD NO.38",
    "38 - ARTHLA",
    "JHALAWA",
    "PATTI",
    "MUKIMPURA",
    "TAUR",
    "SHAMLI",
    "JALALABAD",
    "SAMAYPUR(17)",
    "LAXMI GARDAN LONI",
    "ASALAT NAGAR(14)",
    "JAWAHAR NAGAR KESHAV NAGAR",
    "9 - KADARABAD",
  ].map((v) => normLoc(v)),
);

/** Location must be filled AND contain more than just the district/state (or their combination),
 * and must not match a known-generic value from INVALID_LOCATIONS. */
function isLocationMeaningful(location: string, district: string, state: string): boolean {
  const loc = norm(location);
  if (!loc) return false;
  const d = norm(district);
  const s = norm(state);
  const combos = new Set(
    [d, s, d && s ? `${d}, ${s}` : "", d && s ? `${s}, ${d}` : "", d && s ? `${d} ${s}` : "", d && s ? `${d},${s}` : ""].filter(Boolean),
  );
  if (combos.has(loc)) return false;
  if (INVALID_LOCATIONS.has(normLoc(location))) return false;
  return true;
}

const INVALID_NAMES = new Set(
  [
    "अज्ञात",
    "unknown",
    "उपलब्ध नहीं",
    "उपयोगकर्ता",
    "अभी नाम नहीं बतायाअ",
    "Unnamed Profile",
    "Unknown",
  ].map(norm),
);

function isNameValid(name: string): boolean {
  const n = norm(name);
  return n.length > 0 && !INVALID_NAMES.has(n);
}

/** Profile completeness rules:
 *  1) name not blank and not a placeholder/unknown value
 *  2) location not blank and not just city/state name(s)
 *  3) email OR phone filled
 *  4) age not blank
 *  5) role not blank and not "any"
 *  6) expected salary not blank
 */
function computeProfileChecks(r: {
  name: string;
  location: string;
  district: string;
  state: string;
  email: string;
  phone: string;
  age: string;
  role: string;
  salary: string;
}): { passed: number; total: number; fields: ProfileFieldCheck[] } {
  const emailPhone = [r.email.trim(), r.phone.trim()].filter(Boolean).join(" · ");
  const results = [
    isNameValid(r.name),
    isLocationMeaningful(r.location, r.district, r.state),
    r.email.trim().length > 0 || r.phone.trim().length > 0,
    r.age.trim().length > 0,
    r.role.trim().length > 0 && norm(r.role) !== "any",
    r.salary.trim().length > 0,
  ];
  const values = [
    r.name.trim(),
    r.location.trim(),
    emailPhone,
    r.age.trim(),
    r.role.trim(),
    r.salary.trim(),
  ];
  const fields: ProfileFieldCheck[] = PROFILE_FIELD_LABELS.map((label, i) => ({
    label,
    passed: results[i],
    value: values[i],
  }));
  return { passed: results.filter(Boolean).length, total: results.length, fields };
}

export function parseSeekersCsv(text: string): Seeker[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name.toLowerCase());
  const cId = idx("id");
  const cUser = idx("user_id");
  const cName = idx("name");
  const cLoc = idx("location");
  const cDistrict = idx("location_district");
  const cState = idx("location_state");
  const cEmail = idx("email id");
  const cPhone = idx("phone number");
  const cAge = idx("age");
  const cSalary = idx("expected salary");
  const cRole = idx("role");
  const cAction = idx("recommended action");
  const cApps = idx("applications");
  const cShort = idx("shortlisted");
  const cRej = idx("rejected");
  const cFollow = idx("follow up for");
  const cCreated = idx("created_on");
  const cPAge = idx("profile age");
  const cLApp = idx("last applied age");
  const cTest = idx("test");

  const out: Seeker[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = (r[cId] ?? "").trim();
    if (!id) continue;
    if (cTest !== -1 && isTestRow(r[cTest])) continue;
    const checks = computeProfileChecks({
      name: r[cName] ?? "",
      location: r[cLoc] ?? "",
      district: cDistrict !== -1 ? (r[cDistrict] ?? "") : "",
      state: cState !== -1 ? (r[cState] ?? "") : "",
      email: cEmail !== -1 ? (r[cEmail] ?? "") : "",
      phone: cPhone !== -1 ? (r[cPhone] ?? "") : "",
      age: cAge !== -1 ? (r[cAge] ?? "") : "",
      role: r[cRole] ?? "",
      salary: cSalary !== -1 ? (r[cSalary] ?? "") : "",
    });
    const completion = Math.round((checks.passed / checks.total) * 100);
    const profileStatus: Seeker["profileStatus"] = checks.passed === checks.total ? "Complete" : "Incomplete";
    // Signal: Strong = all 6 pass; Moderate = Location + Role + Salary pass (but not Strong); Weak = otherwise.
    const passedByLabel = new Map(checks.fields.map((f) => [f.label, f.passed] as const));
    const hasCoreSignals =
      (passedByLabel.get("Location") ?? false) &&
      (passedByLabel.get("Role") ?? false) &&
      (passedByLabel.get("Expected Salary") ?? false);
    const profileSignal: ProfileSignal =
      profileStatus === "Complete" ? "Strong" : hasCoreSignals ? "Moderate" : "Weak";
    const profileAge = toIntOrNull(r[cPAge]);
    const lastAppliedAge = toIntOrNull(r[cLApp]);
    const status = computeStatus(profileAge, lastAppliedAge);
    out.push({
      id,
      userId: (r[cUser] ?? "").trim(),
      name: (r[cName] ?? "").trim(),
      location: (r[cLoc] ?? "").trim(),
      role: (r[cRole] ?? "").trim(),
      createdOn: (r[cCreated] ?? "").trim(),
      profileAge,
      lastAppliedAge,
      applications: toInt(r[cApps]),
      shortlisted: toInt(r[cShort]),
      rejected: toInt(r[cRej]),
      profileCompletion: completion,
      profileFieldChecks: checks.fields,
      emailPresent: (cEmail !== -1 ? (r[cEmail] ?? "") : "").trim().length > 0,
      phonePresent: (cPhone !== -1 ? (r[cPhone] ?? "") : "").trim().length > 0,
      phone: (cPhone !== -1 ? (r[cPhone] ?? "") : "").replace(/[^\d]/g, ""),
      followUpFor: (r[cFollow] ?? "").trim(),

      status,
      profileStatus,
      profileSignal,
      recommendedAction: computeAction(status, profileStatus, lastAppliedAge, r[cAction] ?? ""),
    });
  }

  return out;
}


function bundledResult(): { seekers: Seeker[]; meta: CsvMeta } {
  const seekers = parseSeekersCsv(bundledCsv);
  return {
    seekers,
    meta: { name: "UP_Seeker_140720261141PM.csv (bundled)", uploadedAt: "", rows: seekers.length },
  };
}

/** Synchronous initial load — returns the bundled CSV. Use `loadSeekersAsync` after mount to pick up any IndexedDB-persisted upload. */
export function loadSeekers(): { seekers: Seeker[]; meta: CsvMeta } {
  return bundledResult();
}

export async function loadSeekersAsync(): Promise<{ seekers: Seeker[]; meta: CsvMeta }> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return bundledResult();

  // 1) Try server-side stored CSV first (survives cache clears, cross-device).
  try {
    const { fetchStoredCsv } = await import("@/lib/upSeekersStorage.functions");
    const remote = await fetchStoredCsv();
    if (remote?.text) {
      const seekers = parseSeekersCsv(remote.text);
      const meta: CsvMeta = {
        name: remote.meta?.name || "Uploaded CSV",
        uploadedAt: remote.meta?.uploadedAt || "",
        rows: remote.meta?.rows || seekers.length,
      };
      // Warm local cache for offline / faster subsequent loads.
      try {
        await idbSet(CSV_KEY, remote.text);
        await idbSet(META_KEY_IDB, meta);
      } catch { /* ignore quota */ }
      return { seekers, meta };
    }
  } catch { /* fall through to local cache */ }

  try {
    // One-time migration from the old localStorage entries.
    try {
      const legacyText = window.localStorage.getItem(LS_STORAGE_KEY);
      if (legacyText) {
        const legacyMeta = window.localStorage.getItem(LS_META_KEY);
        await idbSet(CSV_KEY, legacyText);
        if (legacyMeta) await idbSet(META_KEY_IDB, JSON.parse(legacyMeta));
        window.localStorage.removeItem(LS_STORAGE_KEY);
        window.localStorage.removeItem(LS_META_KEY);
      }
    } catch {
      /* ignore migration errors */
    }

    const stored = await idbGet<string>(CSV_KEY);
    if (!stored) return bundledResult();
    const seekers = parseSeekersCsv(stored);
    const meta =
      (await idbGet<CsvMeta>(META_KEY_IDB)) ?? {
        name: "Uploaded CSV",
        uploadedAt: "",
        rows: seekers.length,
      };
    return { seekers, meta };
  } catch {
    return bundledResult();
  }
}

export async function saveUploadedCsv(
  name: string,
  text: string,
): Promise<{ seekers: Seeker[]; meta: CsvMeta; persisted: boolean }> {
  const seekers = parseSeekersCsv(text);
  const meta: CsvMeta = { name, uploadedAt: new Date().toISOString(), rows: seekers.length };
  let persisted = false;

  // Upload to server so all users/devices see the same CSV and survives cache clears.
  try {
    const { uploadStoredCsv } = await import("@/lib/upSeekersStorage.functions");
    const res = await uploadStoredCsv({ data: { text, name, rows: seekers.length } });
    if (res?.ok) persisted = true;
  } catch { /* ignore, fall back to local */ }

  if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
    try {
      await idbSet(CSV_KEY, text);
      await idbSet(META_KEY_IDB, meta);
      persisted = persisted || true;
    } catch {
      try {
        await idbDel(CSV_KEY);
        await idbDel(META_KEY_IDB);
      } catch {
        /* ignore */
      }
    }
  }
  return { seekers, meta, persisted };
}

export async function resetToBundled(): Promise<{ seekers: Seeker[]; meta: CsvMeta }> {
  if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
    try {
      await idbDel(CSV_KEY);
      await idbDel(META_KEY_IDB);
    } catch {
      /* ignore */
    }
  }
  try {
    const { clearStoredCsv } = await import("@/lib/upSeekersStorage.functions");
    await clearStoredCsv();
  } catch { /* ignore */ }
  return bundledResult();
}


