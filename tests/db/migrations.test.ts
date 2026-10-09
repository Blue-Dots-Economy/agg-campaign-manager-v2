// Needs db/bootstrap.sql applied and TEST_DATABASE_URL (the campaign_manager login); skipped otherwise.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import pg from "pg";
import { migrationsFolder, runMigrations } from "../../src/server/db/migrate";

const URL = process.env.TEST_DATABASE_URL;

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

describe.skipIf(!URL)("migrations", () => {
  let owner: pg.Client;

  beforeAll(async () => {
    await runMigrations(URL!);
    owner = new pg.Client({ connectionString: URL });
    await owner.connect();
  });
  afterAll(() => owner?.end());

  test("every journal entry is applied, and a re-run applies nothing", async () => {
    const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8"));
    const count = async () =>
      Number((await owner.query("select count(*) from drizzle.__drizzle_migrations")).rows[0].count);
    expect(await count()).toBe(journal.entries.length);
    await runMigrations(URL!);
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

  test("one login owns the database, both schemas and every table and function", async () => {
    const me = (await owner.query("select current_user as u")).rows[0].u;
    expect(me).toBe("campaign_manager");
    const db = await owner.query(
      "select pg_get_userbyid(datdba) as o from pg_database where datname = current_database()",
    );
    expect(db.rows[0].o).toBe(me);
    const schemas = await owner.query(
      "select nspname, pg_get_userbyid(nspowner) as o from pg_namespace where nspname in ('public', 'platform') order by 1",
    );
    expect(schemas.rows).toEqual([
      { nspname: "platform", o: me },
      { nspname: "public", o: me },
    ]);
    const foreign = await owner.query(
      `select relname from pg_class
       where relnamespace = 'public'::regnamespace and relkind in ('r', 'v', 'S') and relowner <> current_user::regrole
       union all
       select proname from pg_proc
       where pronamespace = 'public'::regnamespace and proowner <> current_user::regrole`,
    );
    expect(foreign.rows).toEqual([]);
  });

  test("it does the dashboard's job and the pipeline's", async () => {
    expect(await attempt(URL!, "insert into reviewers (email) values ('t@example.org')")).toBeNull();
    for (const [fn, args] of Object.entries(DASHBOARD_CALLS)) {
      expect(await attempt(URL!, `select public.${fn}(${args})`)).toBeNull();
    }
    expect(
      await attempt(
        URL!,
        `insert into purple_dots_calls (call_id, call_uuid) values ('t', 't');
         insert into purple_dots_connections (call_id, provider_item_id) values ('t', 'p')`,
      ),
    ).toBeNull();
    expect(await attempt(URL!, "create table platform.t_probe (i int)")).toBeNull();
  });
});
