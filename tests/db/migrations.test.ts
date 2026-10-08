// Needs db/bootstrap.sql applied and the three *_DATABASE_URL vars; skipped otherwise.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import pg from "pg";
import { migrationsFolder, runMigrations } from "../../src/server/db/migrate";

const MIGRATOR = process.env.MIGRATOR_DATABASE_URL;
const CM_APP = process.env.CM_APP_DATABASE_URL;
const LOADER = process.env.PURPLE_LOADER_DATABASE_URL;

const APP_TABLES = [
  "app_users", "campaign_requests", "launched_batch_inputs", "launched_batches",
  "north_star_config", "program_agents", "program_export_targets",
  "program_sync_state", "reviewers", "sheet_connections", "transcript_reviews",
  "up_seekers_upload",
];
const DASHBOARD_CALLS: Record<string, string> = {
  get_campaign_drop_causes: "_campaign => 'x'",
  get_campaign_list: "_program => 'seekers'",
  get_dkb_campaign_causes: "_campaign => 'x'",
  get_dkb_drop_analysis: "",
  get_funnel_call_ids: "_program => 'seekers'",
  get_funnel_durations: "_program => 'seekers'",
  get_kkb_call_outcomes: "",
  get_kkb_drop_analysis: "",
  get_program_aggregate_payload: "_program => 'seekers'",
  get_program_aggregates: "_program => 'seekers'",
  get_program_filter_options: "_program => 'seekers'",
  get_program_metric_groups: "_program => 'seekers'",
  get_program_metrics_raw: "_program => 'seekers'",
};
const DASHBOARD_FUNCTIONS = Object.keys(DASHBOARD_CALLS);

// Error code of one statement in a rolled-back transaction, or null.
async function attempt(url: string, sql: string): Promise<string | null> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(sql);
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "error";
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
}

describe.skipIf(!MIGRATOR || !CM_APP || !LOADER)("migrations", () => {
  let owner: pg.Client;

  beforeAll(async () => {
    await runMigrations(MIGRATOR!);
    owner = new pg.Client({ connectionString: MIGRATOR });
    await owner.connect();
  });
  afterAll(() => owner?.end());

  test("every journal entry is applied, and a re-run applies nothing", async () => {
    const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8"));
    const count = async () =>
      Number((await owner.query("select count(*) from drizzle.__drizzle_migrations")).rows[0].count);
    expect(await count()).toBe(journal.entries.length);
    await runMigrations(MIGRATOR!);
    expect(await count()).toBe(journal.entries.length);
  });

  test("the baseline objects exist, and the dropped ones do not", async () => {
    const tables = (
      await owner.query("select tablename from pg_tables where schemaname = 'public' order by 1")
    ).rows.map((r) => r.tablename);
    expect(tables).toEqual([...APP_TABLES, "purple_dots_calls", "purple_dots_connections"].sort());

    const views = (await owner.query("select viewname from pg_views where schemaname = 'public'")).rows;
    expect(views.map((r) => r.viewname)).toEqual(["call_rows"]);

    const fns = (
      await owner.query(
        `select proname, prosecdef from pg_proc
         where pronamespace = 'public'::regnamespace and proname like 'get\\_%' order by 1`,
      )
    ).rows;
    expect(fns.map((r) => r.proname)).toEqual(DASHBOARD_FUNCTIONS);
    expect(fns.filter((r) => r.prosecdef)).toEqual([]);

    const rls = await owner.query(
      "select relname from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity",
    );
    expect(rls.rows).toEqual([]);
  });

  test("call_rows lower-cases channel", async () => {
    await owner.query("begin");
    try {
      await owner.query(
        "insert into purple_dots_calls (call_id, call_uuid, channel) values ('t1', 't1', 'Inbound')",
      );
      const { rows } = await owner.query("select channel from call_rows where call_id = 't1'");
      expect(rows).toEqual([{ channel: "inbound" }]);
    } finally {
      await owner.query("rollback");
    }
  });

  test("cm_app reads the pipeline and runs every dashboard function, but cannot write calls", async () => {
    expect(await attempt(CM_APP!, "insert into reviewers (email) values ('t@example.org')")).toBeNull();
    expect(await attempt(CM_APP!, "select count(*) from call_rows")).toBeNull();
    for (const [fn, args] of Object.entries(DASHBOARD_CALLS)) {
      expect(await attempt(CM_APP!, `select public.${fn}(${args})`)).toBeNull();
    }
    expect(await attempt(CM_APP!, "insert into purple_dots_calls (call_id, call_uuid) values ('t', 't')")).toBe("42501");
    expect(await attempt(CM_APP!, "create table t (i int)")).toBe("42501");
  });

  test("purple_loader writes only the two pipeline tables", async () => {
    expect(
      await attempt(
        LOADER!,
        `insert into purple_dots_calls (call_id, call_uuid) values ('t', 't');
         insert into purple_dots_connections (call_id, provider_item_id) values ('t', 'p')`,
      ),
    ).toBeNull();
    expect(await attempt(LOADER!, "select count(*) from app_users")).toBe("42501");
    expect(await attempt(LOADER!, "select count(*) from call_rows")).toBe("42501");
    expect(await attempt(LOADER!, "delete from purple_dots_calls")).toBe("42501");
  });

  test("schema platform belongs to the pipeline", async () => {
    expect(await attempt(LOADER!, "create table platform.t_probe (i int)")).toBeNull();
    expect(await attempt(LOADER!, "create table public.t_probe (i int)")).toBe("42501");
    expect(await attempt(CM_APP!, "create table platform.t_probe (i int)")).toBe("42501");
  });
});
