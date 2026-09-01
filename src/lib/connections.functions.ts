import { createServerFn } from "@tanstack/react-start";
import type { CallRow } from "@/programs/data";
import { type ProgramId } from "@/programs/registry";

export interface SheetConnection {
  id: string;
  program: ProgramId;
  name: string;
  sheet_id: string;
  tab_name: string | null;
  enabled: boolean;
  status: string;
  row_count: number | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
}

async function getServerSupabase() {
  const { sbFor } = await import("@/lib/db.server");
  return sbFor();
}

export const listConnections = createServerFn({ method: "GET" })
  .inputValidator((d: { program: ProgramId }) => d)
  .handler(async ({ data }) => {
    const sb = await getServerSupabase();
    const { data: rows, error } = await sb
      .from("sheet_connections")
      .select("*")
      .eq("program", data.program)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as SheetConnection[];
  });

export const createConnection = createServerFn({ method: "POST" })
  .inputValidator((d: { program: ProgramId; name: string; sheet_id: string; tab_name?: string }) => d)
  .handler(async ({ data }) => {
    const sb = await getServerSupabase();
    const { data: row, error } = await sb
      .from("sheet_connections")
      .insert({
        program: data.program,
        name: data.name,
        sheet_id: data.sheet_id,
        tab_name: data.tab_name || null,
        enabled: true,
        status: "unknown",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as SheetConnection;
  });

export const updateConnection = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; enabled?: boolean; name?: string; tab_name?: string | null }) => d)
  .handler(async ({ data }) => {
    const sb = await getServerSupabase();
    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.name !== undefined) patch.name = data.name;
    if (data.tab_name !== undefined) patch.tab_name = data.tab_name;
    const { data: row, error } = await sb
      .from("sheet_connections")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as SheetConnection;
  });

export const deleteConnection = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const sb = await getServerSupabase();
    const { error } = await sb.from("sheet_connections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSheetTabsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { sheet_id: string }) => d)
  .handler(async ({ data }) => {
    const { listSheetTabs } = await import("./sheets.server");
    try {
      const tabs = await listSheetTabs(data.sheet_id);
      return { ok: true as const, tabs };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const testConnection = createServerFn({ method: "POST" })
  .inputValidator((d: { id?: string; sheet_id: string; tab_name?: string }) => d)
  .handler(async ({ data }) => {
    const { readSheet } = await import("./sheets.server");
    try {
      const result = await readSheet(data.sheet_id, data.tab_name);
      if (data.id) {
        const sb = await getServerSupabase();
        const patch: Record<string, unknown> = {
          status: "connected",
          row_count: result.rowCount,
          last_error: null,
          last_synced_at: new Date().toISOString(),
        };
        if (result.effectiveTab && result.effectiveTab !== (data.tab_name ?? "")) {
          patch.tab_name = result.effectiveTab;
        }
        await sb.from("sheet_connections").update(patch).eq("id", data.id);
      }
      return {
        ok: true as const,
        rowCount: result.rowCount,
        headers: result.headers,
        effectiveTab: result.effectiveTab,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (data.id) {
        const sb = await getServerSupabase();
        await sb
          .from("sheet_connections")
          .update({ status: "error", last_error: msg, last_synced_at: new Date().toISOString() })
          .eq("id", data.id);
      }
      return { ok: false as const, error: msg };
    }
  });

/** Re-validate every enabled connection for a program and refresh stored status. */
export const revalidateConnections = createServerFn({ method: "POST" })
  .inputValidator((d: { program: ProgramId }) => d)
  .handler(async ({ data }) => {
    const sb = await getServerSupabase();
    const { data: rows } = await sb
      .from("sheet_connections")
      .select("*")
      .eq("program", data.program)
      .eq("enabled", true);
    const list = (rows ?? []) as SheetConnection[];
    if (list.length === 0 || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return { checked: 0 };
    }
    const { readSheet } = await import("./sheets.server");
    for (const c of list) {
      try {
        const result = await readSheet(c.sheet_id, c.tab_name ?? undefined);
        const patch: Record<string, unknown> = {
          status: "connected",
          row_count: result.rowCount,
          last_error: null,
          last_synced_at: new Date().toISOString(),
        };
        if (result.effectiveTab && result.effectiveTab !== (c.tab_name ?? "")) {
          patch.tab_name = result.effectiveTab;
        }
        await sb.from("sheet_connections").update(patch).eq("id", c.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await sb
          .from("sheet_connections")
          .update({ status: "error", last_error: msg, last_synced_at: new Date().toISOString() })
          .eq("id", c.id);
      }
    }
    return { checked: list.length };
  });

// ---- Aggregation -----------------------------------------------------------

function asYesNoBool(v: string | undefined): boolean {
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "1";
}
function asNum(v: string | undefined): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(/[,%]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function asJsonArr(v: string | undefined): string[] {
  if (!v) return [];
  const s = String(v).trim();
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {
      /* fall through */
    }
  }
  return s.split(/[|,;]/).map((x) => x.trim()).filter(Boolean);
}

function normKey(h: string): string {
  return String(h ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function mapRow(headers: string[], values: string[]): CallRow {
  const idx: Record<string, number> = {};
  const raw: Record<string, string> = {};
  headers.forEach((h, i) => {
    const k = normKey(h);
    if (!(k in idx)) idx[k] = i;
    raw[k] = values[i] ?? "";
  });
  const get = (k: string) => {
    const i = idx[normKey(k)];
    return i !== undefined ? values[i] : undefined;
  };
  // DKB sheets express "answered" through call_status, not a boolean column.
  const callStatusRaw = get("call_status") ?? "";
  const callStatus = callStatusRaw.trim().toLowerCase();
  const answeredFromStatus =
    callStatus.startsWith("answered") || callStatus === "completed";
  return {
    campaign_day: get("campaign_day") ?? "",
    campaign_date: get("campaign_date") ?? "",
    campaign_type: get("campaign_type") ?? "",
    language: get("language") ?? "",
    call_id: get("call_id") ?? "",
    phone: get("phone") ?? get("contact_phone") ?? "",
    call_duration_seconds: asNum(get("call_duration_seconds")),
    call_datetime_ist: get("call_datetime_ist") ?? "",
    call_outcome: get("call_outcome") ?? "",
    call_answered: get("call_answered") !== undefined
      ? asYesNoBool(get("call_answered"))
      : answeredFromStatus,
    call_engaged: asYesNoBool(get("call_engaged")),
    applied_to_job: asYesNoBool(get("applied_to_job")),
    applications_count: asNum(get("applications_count")),
    jobs_shown: asYesNoBool(get("jobs_shown")),
    primary_topic: get("primary_topic") ?? "",
    call_language: get("call_language") ?? get("language") ?? "",
    call_recording_url: "",
    final_summary: "",
    call_transcript: "",
    tried_to_apply: asYesNoBool(get("tried_to_apply")),
    drop_reason: get("drop_reason") ?? "",
    city_campaign: get("city_campaign") ?? "",
    seeker_name: get("seeker_name") ?? get("candidate_name") ?? get("company_name") ?? "",
    user_intent: get("user_intent") ?? "low",
    jobs_recommended: asJsonArr(get("jobs_recommended")),
    jobs_applied: asJsonArr(get("jobs_applied")),
    jobs_failed_to_apply: asJsonArr(get("jobs_failed_to_apply")),
    "Intent Score": asNum(get("intent_score")),
    "Intent Score Reasoning": "",
    counselled: asYesNoBool(get("counselled")),
    interview_scheduled: asYesNoBool(get("interview_scheduled")),
    course_interest: get("course_interest") ?? undefined,
    trade: get("trade") ?? undefined,
    counsellor_id: get("counsellor_id") ?? undefined,
    candidate_name: get("candidate_name") ?? undefined,
    raw,
  };
}

export const getCallDetailFn = createServerFn({ method: "POST" })
  .inputValidator((d: { program: ProgramId; call_id: string }) => d)
  .handler(async ({ data }) => {
    const sb = await getServerSupabase();
    const { data: conns } = await sb
      .from("sheet_connections")
      .select("*")
      .eq("program", data.program)
      .eq("enabled", true);
    const list = (conns ?? []) as SheetConnection[];
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || list.length === 0) {
      return { ok: false as const, error: "No connection" };
    }
    const { getCallDetail } = await import("./sheets.server");
    for (const c of list) {
      try {
        const d = await getCallDetail(c.sheet_id, c.tab_name ?? undefined, data.call_id);
        if (d) return { ok: true as const, detail: d };
      } catch {
        /* try next */
      }
    }
    return { ok: false as const, error: "Not found" };
  });

export const fetchProgramRows = createServerFn({ method: "GET" })
  .inputValidator((d: { program: ProgramId }) => d)
  .handler(async ({ data }) => {
    const sb = await getServerSupabase();
    const { data: conns, error } = await sb
      .from("sheet_connections")
      .select("*")
      .eq("program", data.program)
      .eq("enabled", true);
    if (error) throw new Error(error.message);
    const list = (conns ?? []) as SheetConnection[];

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || list.length === 0) {
      return {
        source: "empty" as const,
        connectionCount: list.length,
        rows: [] as CallRow[],
        errors: [] as { id: string; name: string; message: string }[],
      };
    }

    const { readSheet } = await import("./sheets.server");
    const out: CallRow[] = [];
    const seen = new Set<string>();
    const errors: { id: string; name: string; message: string }[] = [];
    for (const c of list) {
      try {
        const { headers, rows, effectiveTab } = await readSheet(c.sheet_id, c.tab_name ?? undefined);
        for (const r of rows) {
          const mapped = mapRow(headers, r);
          const key = mapped.call_id || `${c.id}:${out.length}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(mapped);
        }
        const patch: Record<string, unknown> = {
          status: "connected",
          row_count: rows.length,
          last_error: null,
          last_synced_at: new Date().toISOString(),
        };
        if (effectiveTab && effectiveTab !== (c.tab_name ?? "")) {
          patch.tab_name = effectiveTab;
        }
        await sb.from("sheet_connections").update(patch).eq("id", c.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ id: c.id, name: c.name, message: msg });
        await sb
          .from("sheet_connections")
          .update({ status: "error", last_error: msg, last_synced_at: new Date().toISOString() })
          .eq("id", c.id);
      }
    }

    if (out.length === 0) {
      return {
        source: "empty" as const,
        connectionCount: list.length,
        rows: [] as CallRow[],
        errors,
      };
    }
    return { source: "sheets" as const, connectionCount: list.length, rows: out, errors };
  });
