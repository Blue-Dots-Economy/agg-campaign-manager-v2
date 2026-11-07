import { describe, expect, test } from "bun:test";
import {
  loadSeekers,
  loadSeekersAsync,
  parseSeekersCsv,
  PROFILE_FIELD_LABELS,
  resetToBundled,
  type Seeker,
} from "@/lib/upSeekersCsv";

const HEADER =
  "id,user_id,name,location,location_district ,location_state,email id,Phone Number,Role,test,Age,Expected Salary,Recommended Action,Applications,Shortlisted,Rejected,Follow up for,Created_On,Profile Age,Last Applied Age";

interface RowInput {
  id?: string;
  user?: string;
  name?: string;
  location?: string;
  district?: string;
  state?: string;
  email?: string;
  phone?: string;
  role?: string;
  test?: string;
  age?: string;
  salary?: string;
  action?: string;
  apps?: string;
  short?: string;
  rej?: string;
  follow?: string;
  created?: string;
  pAge?: string;
  lApp?: string;
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function row(r: RowInput): string {
  return [
    r.id ?? "s1",
    r.user ?? "u1",
    r.name ?? "Asha Devi",
    r.location ?? "12 Main Road, Sector 5",
    r.district ?? "Ghaziabad",
    r.state ?? "Uttar Pradesh",
    r.email ?? "",
    r.phone ?? "+91 98765-43210",
    r.role ?? "Cashier",
    r.test ?? "0",
    r.age ?? "24",
    r.salary ?? "12000",
    r.action ?? "",
    r.apps ?? "3",
    r.short ?? "1",
    r.rej ?? "0",
    r.follow ?? "Update Role",
    r.created ?? "7/6/2026",
    r.pAge ?? "20",
    r.lApp ?? "5",
  ]
    .map((v) => csvCell(v))
    .join(",");
}

function parseOne(r: RowInput): Seeker {
  const out = parseSeekersCsv(`${HEADER}\n${row(r)}\n`);
  expect(out).toHaveLength(1);
  const first = out[0];
  if (!first) throw new Error("no seeker parsed");
  return first;
}

describe("parseSeekersCsv — rows and fields", () => {
  test("maps a complete row to a seeker", () => {
    expect(parseOne({})).toEqual({
      id: "s1",
      userId: "u1",
      name: "Asha Devi",
      location: "12 Main Road, Sector 5",
      role: "Cashier",
      createdOn: "7/6/2026",
      profileAge: 20,
      lastAppliedAge: 5,
      applications: 3,
      shortlisted: 1,
      rejected: 0,
      profileCompletion: 100,
      profileFieldChecks: [
        { label: "Name", passed: true, value: "Asha Devi" },
        { label: "Location", passed: true, value: "12 Main Road, Sector 5" },
        { label: "Email or Phone", passed: true, value: "+91 98765-43210" },
        { label: "Age", passed: true, value: "24" },
        { label: "Role", passed: true, value: "Cashier" },
        { label: "Expected Salary", passed: true, value: "12000" },
      ],
      emailPresent: false,
      phonePresent: true,
      phone: "919876543210",
      followUpFor: "Update Role",
      status: "Active",
      profileStatus: "Complete",
      profileSignal: "Strong",
      recommendedAction: "No Action",
    });
  });

  test("returns no seekers for empty text or a header without rows", () => {
    expect(parseSeekersCsv("")).toEqual([]);
    expect(parseSeekersCsv(HEADER)).toEqual([]);
    expect(parseSeekersCsv(`${HEADER}\n\n  ,  \n`)).toEqual([]);
  });

  test("skips rows without an id and rows flagged as test data", () => {
    const text = [
      HEADER,
      row({ id: "" }),
      row({ id: "a", test: "1" }),
      row({ id: "b", test: "1.0" }),
      row({ id: "c", test: " TRUE " }),
      row({ id: "d", test: "Yes" }),
      row({ id: "e", test: "y" }),
      row({ id: "f", test: "no" }),
      row({ id: "g", test: "" }),
      row({ id: "  h  " }),
    ].join("\n");
    expect(parseSeekersCsv(text).map((s) => s.id)).toEqual(["f", "g", "h"]);
  });

  test("handles quoted fields, escaped quotes, CRLF and newlines inside quotes", () => {
    const text = `${HEADER}\r\n${row({ name: 'Ravi "R" Kumar', location: "Flat 2,\nBlock B" })}\r\n`;
    const [s] = parseSeekersCsv(text);
    expect(s?.name).toBe('Ravi "R" Kumar');
    expect(s?.location).toBe("Flat 2,\nBlock B");
  });

  test("parses a last row without a trailing newline", () => {
    expect(parseSeekersCsv(`${HEADER}\n${row({ id: "x" })}`).map((s) => s.id)).toEqual(["x"]);
  });

  test("matches header names without regard to case or surrounding spaces", () => {
    const text = `ID , NAME,Role\nz1,Meena,Driver`;
    const [s] = parseSeekersCsv(text);
    expect(s?.id).toBe("z1");
    expect(s?.name).toBe("Meena");
    expect(s?.role).toBe("Driver");
    expect(s?.phone).toBe("");
    expect(s?.phonePresent).toBe(false);
    expect(s?.applications).toBe(0);
    expect(s?.profileAge).toBeNull();
    expect(s?.status).toBe("Inactive");
  });

  test("returns no seekers when the id column is missing", () => {
    expect(parseSeekersCsv("name,role\nA,B\n")).toEqual([]);
  });

  test("reads numbers with stray characters and treats unreadable numbers as empty", () => {
    const s = parseOne({ apps: "1,234", short: "abc", rej: "-2", pAge: "", lApp: "3 days" });
    expect(s.applications).toBe(1234);
    expect(s.shortlisted).toBe(0);
    expect(s.rejected).toBe(-2);
    expect(s.profileAge).toBeNull();
    expect(s.lastAppliedAge).toBe(3);
    expect(parseOne({ pAge: "1-2" }).profileAge).toBeNull();
    expect(parseOne({ pAge: "abc" }).profileAge).toBe(0);
  });
});

describe("parseSeekersCsv — profile checks", () => {
  test("fails the name check for blank and placeholder names", () => {
    for (const name of ["", "  ", "Unknown", "unknown", "अज्ञात", "Unnamed  Profile"]) {
      expect(parseOne({ name }).profileFieldChecks[0]?.passed).toBe(false);
    }
    expect(parseOne({ name: "Unnamed Profile X" }).profileFieldChecks[0]?.passed).toBe(true);
  });

  test("fails the location check for blank, district/state-only and listed generic values", () => {
    const loc = (location: string, district = "Ghaziabad", state = "Uttar Pradesh") =>
      parseOne({ location, district, state }).profileFieldChecks[1]?.passed;
    expect(loc("")).toBe(false);
    expect(loc("Ghaziabad")).toBe(false);
    expect(loc("uttar pradesh")).toBe(false);
    expect(loc("Ghaziabad, Uttar Pradesh")).toBe(false);
    expect(loc("Uttar Pradesh, Ghaziabad")).toBe(false);
    expect(loc("Ghaziabad Uttar Pradesh")).toBe(false);
    expect(loc("Ghaziabad,Uttar Pradesh")).toBe(false);
    expect(loc("Noida, Uttar Pradesh", "", "")).toBe(false);
    expect(loc("samaypur (17)", "", "")).toBe(false);
    expect(loc("MURADNAGAR-GZB", "", "")).toBe(false);
    expect(loc("Ghaziabad", "", "")).toBe(false);
    expect(loc("Ghaziabad", "Meerut", "")).toBe(false);
    expect(loc("Sector 5, Ghaziabad")).toBe(true);
    expect(loc("Meerut, Uttar Pradesh", "", "")).toBe(true);
  });

  test("passes email-or-phone when either is present and joins both values", () => {
    const both = parseOne({ email: "a@b.in", phone: "999" });
    expect(both.profileFieldChecks[2]).toEqual({
      label: "Email or Phone",
      passed: true,
      value: "a@b.in · 999",
    });
    expect(both.emailPresent).toBe(true);
    const none = parseOne({ email: " ", phone: "" });
    expect(none.profileFieldChecks[2]).toEqual({
      label: "Email or Phone",
      passed: false,
      value: "",
    });
    expect(none.phonePresent).toBe(false);
  });

  test("fails the role check for blank or 'any', and age and salary when blank", () => {
    expect(parseOne({ role: " ANY " }).profileFieldChecks[4]?.passed).toBe(false);
    expect(parseOne({ role: "" }).profileFieldChecks[4]?.passed).toBe(false);
    expect(parseOne({ age: " " }).profileFieldChecks[3]?.passed).toBe(false);
    expect(parseOne({ salary: "" }).profileFieldChecks[5]?.passed).toBe(false);
  });

  test("keeps the field labels in a fixed order", () => {
    expect(parseOne({}).profileFieldChecks.map((f) => f.label)).toEqual([...PROFILE_FIELD_LABELS]);
  });

  test("rounds completion and sets status and signal from the checks", () => {
    const moderate = parseOne({ name: "unknown", age: "" });
    expect(moderate.profileCompletion).toBe(67);
    expect(moderate.profileStatus).toBe("Incomplete");
    expect(moderate.profileSignal).toBe("Moderate");
    expect(moderate.recommendedAction).toBe("Complete Profile");
    const weak = parseOne({ salary: "" });
    expect(weak.profileCompletion).toBe(83);
    expect(weak.profileSignal).toBe("Weak");
    const empty = parseOne({ name: "", location: "", phone: "", age: "", role: "", salary: "" });
    expect(empty.profileCompletion).toBe(0);
    expect(empty.profileSignal).toBe("Weak");
  });
});

describe("parseSeekersCsv — status and recommended action", () => {
  const status = (pAge: string, lApp: string) => parseOne({ pAge, lApp }).status;

  test("sets the lifecycle status from profile age and last applied age", () => {
    expect(status("7", "100")).toBe("New");
    expect(status("0", "")).toBe("New");
    expect(status("8", "30")).toBe("Active");
    expect(status("8", "31")).toBe("At Risk");
    expect(status("8", "90")).toBe("At Risk");
    expect(status("8", "91")).toBe("Inactive");
    expect(status("8", "")).toBe("Inactive");
    expect(status("", "0")).toBe("Active");
  });

  test("recommends a call type from status, or the sheet action for recent active seekers", () => {
    const action = (r: RowInput) => parseOne(r).recommendedAction;
    expect(action({ pAge: "3" })).toBe("Automated Call");
    expect(action({ pAge: "20", lApp: "40" })).toBe("Automated Call");
    expect(action({ pAge: "20", lApp: "" })).toBe("Manual Call");
    expect(action({ pAge: "20", lApp: "15" })).toBe("Automated Call");
    expect(action({ pAge: "20", lApp: "14", action: "  Kaam Ki Baat " })).toBe("Kaam Ki Baat");
    expect(action({ pAge: "20", lApp: "14", action: "  " })).toBe("No Action");
  });
});

describe("bundled and stored CSV", () => {
  test("drops every row of the bundled CSV file, which are all flagged as test data", async () => {
    const text = await Bun.file("src/data/up-seekers.csv").text();
    expect(parseSeekersCsv(text)).toEqual([]);
    const withoutTestColumn = text.replace(/^(.*?),test,/, "$1,not_test,");
    const seekers = parseSeekersCsv(withoutTestColumn);
    expect(seekers.length).toBeGreaterThan(0);
    for (const s of seekers) {
      expect(s.profileFieldChecks).toHaveLength(PROFILE_FIELD_LABELS.length);
    }
  });

  test("loadSeekers returns the bundled list with bundled meta", () => {
    const { seekers, meta } = loadSeekers();
    expect(meta).toEqual({
      name: "UP_Seeker_140720261141PM.csv (bundled)",
      uploadedAt: "",
      rows: seekers.length,
    });
  });

  test("loadSeekersAsync and resetToBundled fall back to the bundled list outside a browser", async () => {
    expect(await loadSeekersAsync()).toEqual(loadSeekers());
    expect(await resetToBundled()).toEqual(loadSeekers());
  });
});
