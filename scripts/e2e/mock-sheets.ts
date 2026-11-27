// In-memory stand-in for Google's token endpoint and the Sheets values and batchUpdate calls the app makes.
import { z } from "zod";
import { REGION_CONFIGS } from "@/lib/ecosystem-config";
import { registry } from "@/programs/registry";

/** Access token the mock hands out; any bearer token is accepted. */
export const MOCK_ACCESS_TOKEN = "mock-access-token";
/** Token lifetime in the token reply. Google allows at most one hour. */
const TOKEN_LIFETIME_S = 3600;

/** Spreadsheet with the seeker and provider call logs; connect it in Settings → Connections. */
export const MOCK_CALL_LOG_SHEET_ID = "mock-call-log-sheet-000000000000";
/** Empty spreadsheet for the Raya export (Settings → Results export sheet). */
export const MOCK_STAGING_SHEET_ID = "mock-staging-sheet-0000000000000";
/** Seeker call-log tab, with the seekers program columns. */
export const MOCK_SEEKER_CALLS_TAB = "Seeker Calls";
/** Provider call-log tab, with the providers program columns. */
export const MOCK_PROVIDER_CALLS_TAB = "Provider Calls";
/** Tab the export writes to. */
export const MOCK_STAGING_TAB = "Sheet1";

/** Call rows seeded per call-log tab. */
const SEEDED_CALL_ROWS = 12;
/** Every this-many rows, one call is unanswered. */
const UNANSWERED_EVERY = 4;
/** Rows seeded per ecosystem tab. */
const SEEDED_ECOSYSTEM_ROWS = 5;

interface Tab {
  sheetId: number;
  title: string;
  rows: string[][];
}

const googleError = (status: number, message: string, code: string) =>
  Response.json({ error: { code: status, message, status: code } }, { status });
const notFound = () => googleError(404, "Requested entity was not found.", "NOT_FOUND");

/** Sample cell value for one call-log column. */
function callCell(column: string, i: number, prefix: string): string {
  const answered = (i + 1) % UNANSWERED_EVERY !== 0;
  const day = `Day ${(i % 3) + 1}`;
  const values: Record<string, string> = {
    campaign_day: day,
    campaign_date: `2026-11-0${(i % 3) + 1}`,
    campaign_type: `${prefix.toUpperCase()}_Hindi_${day.replace(" ", "")}`,
    language: "Hindi",
    call_language: "Hindi",
    call_id: `${prefix}-call-${i + 1}`,
    job_id: `${prefix}-job-${i + 1}`,
    phone: `90000001${String(i).padStart(2, "0")}`,
    call_duration_seconds: answered ? String(60 + i * 15) : "0",
    call_datetime_ist: `2026-11-0${(i % 3) + 1} 10:${String(i).padStart(2, "0")}:00`,
    call_outcome: answered ? "applied" : "no_answer",
    call_status: answered ? "Completed" : "Unanswered",
    call_answered: answered ? "Yes" : "No",
    call_engaged: answered ? "Yes" : "No",
    applied_to_job: answered && i % 2 === 0 ? "Yes" : "No",
    applications_count: answered && i % 2 === 0 ? "1" : "0",
    jobs_shown: answered ? "Yes" : "No",
    primary_topic: answered ? "job_search" : "",
    final_summary: answered ? "Mock call summary." : "",
    call_transcript: answered ? '[{"role":"agent","content":"Hello"}]' : "[]",
    call_recording_url: answered ? `https://recordings.mock.local/${prefix}-${i + 1}.mp3` : "",
    drop_reason: answered ? "" : "early_hangup",
    city_campaign: "Ghaziabad",
    seeker_name: `Mock person ${i + 1}`,
    company_name: `Mock company ${i + 1}`,
    user_intent: answered ? "high" : "low",
    jobs_recommended: '["Data entry operator"]',
    jobs_applied: answered && i % 2 === 0 ? '["Data entry operator"]' : "[]",
    jobs_failed_to_apply: "[]",
    intent_score: answered ? "6" : "0",
  };
  return values[column] ?? "";
}

function callLogRows(columns: string[], prefix: string): string[][] {
  const data = Array.from({ length: SEEDED_CALL_ROWS }, (_, i) =>
    columns.map((c) => callCell(c, i, prefix)),
  );
  return [columns, ...data];
}

function tableRows(headers: string[], cell: (header: string, i: number) => string): string[][] {
  const data = Array.from({ length: SEEDED_ECOSYSTEM_ROWS }, (_, i) =>
    headers.map((h) => cell(h, i)),
  );
  return [headers, ...data];
}

/** Workbooks named in the ecosystem region config, with small job, application and seeker tabs. */
function ecosystemBooks(): Array<[string, Array<[string, string[][]]>]> {
  return Object.values(REGION_CONFIGS).flatMap((cfg) => {
    const district = cfg.districts[0] ?? "";
    const jobs = tableRows(
      ["id", "role", "current_openings", "applications", "location_district", "status"],
      (h, i) =>
        ({
          id: `${cfg.state}-job-${i + 1}`,
          role: `Mock role ${i + 1}`,
          current_openings: String(i + 1),
          applications: String(i),
          location_district: district,
          status: "open",
        })[h] ?? "",
    );
    const applications = tableRows(["id", "job_id", "seeker_role", "applied_at"], (h, i) =>
      h === "id"
        ? `${cfg.state}-app-${i + 1}`
        : h === "job_id"
          ? `${cfg.state}-job-${i + 1}`
          : h === "seeker_role"
            ? `Mock role ${i + 1}`
            : "2026-11-01",
    );
    const seekers = tableRows(
      ["id", "user_id", "organization_name", "location_district"],
      (h, i) => (h === "location_district" ? district : `${cfg.state}-${h}-${i + 1}`),
    );
    return [
      [
        cfg.jobsSheet,
        [
          [cfg.jobsTab, jobs],
          [cfg.applicationsTab, applications],
        ],
      ],
      [cfg.seekerSheet, [[cfg.seekerTab, seekers]]],
    ];
  });
}

/** Parsed A1 range: tab plus zero-based start and inclusive end cells. */
interface A1 {
  tab: string;
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const CELL = /^([A-Z]+)(\d+)$/;

/** Parses `Tab!A1:B2`, `'My Tab'!A1` and the like; returns null when the text is not a range. */
function parseA1(range: string): A1 | null {
  const bang = range.lastIndexOf("!");
  if (bang < 0) return null;
  let tab = range.slice(0, bang);
  if (tab.startsWith("'") && tab.endsWith("'")) tab = tab.slice(1, -1).replace(/''/g, "'");
  const [from = "", to] = range.slice(bang + 1).split(":");
  const a = CELL.exec(from);
  const b = CELL.exec(to ?? from);
  if (!a?.[1] || !a[2] || !b?.[1] || !b[2]) return null;
  return {
    tab,
    startCol: colIndex(a[1]),
    startRow: Number(a[2]) - 1,
    endCol: colIndex(b[1]),
    endRow: Number(b[2]) - 1,
  };
}

/** Drops trailing blank cells and rows, as Google does in value replies. */
function trimBlank(rows: string[][]): string[][] {
  const out = rows.map((r) => {
    let end = r.length;
    while (end > 0 && !r[end - 1]) end--;
    return r.slice(0, end);
  });
  while (out.length > 0 && out[out.length - 1]?.length === 0) out.pop();
  return out;
}

const ValuesBody = z.object({ values: z.array(z.array(z.unknown())) });
const BatchValuesBody = z.object({
  data: z.array(z.object({ range: z.string(), values: z.array(z.array(z.unknown())) })),
});
const SheetRequests = z.object({
  requests: z.array(
    z.object({
      addSheet: z.object({ properties: z.object({ title: z.string() }) }).optional(),
      deleteSheet: z.object({ sheetId: z.number() }).optional(),
    }),
  ),
});

/** In-memory spreadsheets with the OAuth token endpoint. */
export function createMockSheets() {
  const books = new Map<string, Tab[]>();
  let nextTabId = 1;

  function addTab(book: Tab[], title: string, rows: string[][] = []): void {
    book.push({ sheetId: nextTabId++, title, rows });
  }
  function seed(id: string, tabs: Array<[string, string[][]]>): void {
    const book: Tab[] = [];
    for (const [title, rows] of tabs) addTab(book, title, rows);
    books.set(id, book);
  }
  seed(MOCK_CALL_LOG_SHEET_ID, [
    [MOCK_SEEKER_CALLS_TAB, callLogRows(registry.seekers.columns, "seekers")],
    [MOCK_PROVIDER_CALLS_TAB, callLogRows(registry.providers.columns, "providers")],
  ]);
  seed(MOCK_STAGING_SHEET_ID, [[MOCK_STAGING_TAB, []]]);
  for (const [id, tabs] of ecosystemBooks()) seed(id, tabs);

  function read(book: Tab[], range: string): { range: string; values?: string[][] } | null {
    const a1 = parseA1(range);
    const tab = a1 && book.find((t) => t.title === a1.tab);
    if (!a1 || !tab) return null;
    const values = trimBlank(
      tab.rows.slice(a1.startRow, a1.endRow + 1).map((r) => r.slice(a1.startCol, a1.endCol + 1)),
    );
    return values.length > 0 ? { range, values } : { range };
  }

  function write(tab: Tab, startRow: number, startCol: number, values: unknown[][]): void {
    values.forEach((row, r) => {
      const target = tab.rows[startRow + r] ?? [];
      while (tab.rows.length <= startRow + r) tab.rows.push([]);
      row.forEach((v, c) => {
        while (target.length < startCol + c) target.push("");
        target[startCol + c] = v == null ? "" : String(v);
      });
      tab.rows[startRow + r] = target;
    });
  }

  const badRange = (range: string) =>
    googleError(400, `Unable to parse range: ${range}`, "INVALID_ARGUMENT");

  /** Answers the values endpoints: get, update, clear, append, batchGet and batchUpdate. */
  async function values(req: Request, book: Tab[], rest: string, query: URLSearchParams) {
    if (req.method === "GET" && rest === "values:batchGet") {
      const ranges = query.getAll("ranges");
      const valueRanges = ranges.map((r) => read(book, r));
      const missing = ranges.find((_, i) => !valueRanges[i]);
      if (missing !== undefined) return badRange(missing);
      return Response.json({ valueRanges });
    }
    if (req.method === "POST" && rest === "values:batchUpdate") {
      const body = BatchValuesBody.parse(await req.json());
      for (const d of body.data) {
        const a1 = parseA1(d.range);
        const tab = a1 && book.find((t) => t.title === a1.tab);
        if (!a1 || !tab) return badRange(d.range);
        write(tab, a1.startRow, a1.startCol, d.values);
      }
      return Response.json({ totalUpdatedRows: body.data.length });
    }
    if (!rest.startsWith("values/")) return notFound();
    let range = rest.slice("values/".length);
    let action = "";
    for (const suffix of [":clear", ":append"]) {
      if (range.endsWith(suffix)) {
        range = range.slice(0, -suffix.length);
        action = suffix;
      }
    }
    const a1 = parseA1(range);
    const tab = a1 && book.find((t) => t.title === a1.tab);
    if (!a1 || !tab) return badRange(range);

    if (req.method === "GET" && !action) return Response.json(read(book, range));
    if (req.method === "PUT" && !action) {
      write(tab, a1.startRow, a1.startCol, ValuesBody.parse(await req.json()).values);
      return Response.json({ updatedRange: range });
    }
    if (req.method === "POST" && action === ":clear") {
      tab.rows.slice(a1.startRow, a1.endRow + 1).forEach((row) => {
        for (let c = a1.startCol; c <= a1.endCol && c < row.length; c++) row[c] = "";
      });
      return Response.json({ clearedRange: range });
    }
    if (req.method === "POST" && action === ":append") {
      write(
        tab,
        trimBlank(tab.rows).length,
        a1.startCol,
        ValuesBody.parse(await req.json()).values,
      );
      return Response.json({ updates: { updatedRange: range } });
    }
    return notFound();
  }

  /** Answers addSheet and deleteSheet requests. */
  async function batchUpdate(req: Request, book: Tab[]) {
    const body = SheetRequests.parse(await req.json());
    for (const r of body.requests) {
      if (r.addSheet) addTab(book, r.addSheet.properties.title);
      if (r.deleteSheet) {
        const id = r.deleteSheet.sheetId;
        const i = book.findIndex((t) => t.sheetId === id);
        if (i < 0) return googleError(400, `No grid with id: ${id}`, "INVALID_ARGUMENT");
        book.splice(i, 1);
      }
    }
    return Response.json({ replies: body.requests.map(() => ({})) });
  }

  /** Answers one Sheets request; `path` is the part after `/v4/spreadsheets/`. */
  async function handle(req: Request, path: string, query: URLSearchParams): Promise<Response> {
    if (!req.headers.get("authorization")?.startsWith("Bearer ")) {
      return googleError(401, "Request is missing a valid access token.", "UNAUTHENTICATED");
    }
    const decoded = decodeURIComponent(path);
    const slash = decoded.indexOf("/");
    const head = slash < 0 ? decoded : decoded.slice(0, slash);
    const rest = slash < 0 ? "" : decoded.slice(slash + 1);
    const [id = "", op] = head.split(":");
    const book = books.get(id);
    if (!book) return notFound();

    if (req.method === "GET" && !op && !rest) {
      return Response.json({
        spreadsheetId: id,
        sheets: book.map((t) => ({ properties: { sheetId: t.sheetId, title: t.title } })),
      });
    }
    if (req.method === "POST" && op === "batchUpdate" && !rest) return batchUpdate(req, book);
    if (!op) return values(req, book, rest, query);
    return notFound();
  }

  /** Issues a token for any assertion; the JWT signature is not checked. */
  function token(): Response {
    return Response.json({
      access_token: MOCK_ACCESS_TOKEN,
      expires_in: TOKEN_LIFETIME_S,
      token_type: "Bearer",
    });
  }

  return { handle, token };
}
