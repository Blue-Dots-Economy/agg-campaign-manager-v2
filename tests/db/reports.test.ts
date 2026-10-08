// Needs db/bootstrap.sql applied and the three *_DATABASE_URL vars; skipped otherwise.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { runMigrations } from "../../src/server/db/migrate";

const MIGRATOR = process.env.MIGRATOR_DATABASE_URL;
const CM_APP = process.env.CM_APP_DATABASE_URL;
const LOADER = process.env.PURPLE_LOADER_DATABASE_URL;

const PREFIX = "reports-test-";
// 3 seekers calls (2 outbound, 1 inbound), 1 provider, 1 test call.
const CALLS = [
  { id: "a", persona: "seeker", channel: "Outbound", answered: true, test: false },
  { id: "b", persona: "seeker", channel: "Outbound", answered: false, test: false },
  { id: "c", persona: "seeker", channel: "Inbound", answered: true, test: false },
  { id: "d", persona: "provider", channel: "Outbound", answered: true, test: false },
  { id: "e", persona: "seeker", channel: "Outbound", answered: true, test: true },
];

describe.skipIf(!MIGRATOR || !CM_APP || !LOADER)("reports", () => {
  let reports: typeof import("../../src/server/db/reports.server");
  let owner: pg.Client;

  beforeAll(async () => {
    await runMigrations(MIGRATOR!);
    owner = new pg.Client({ connectionString: MIGRATOR });
    await owner.connect();
    await cleanup();

    const loader = new pg.Client({ connectionString: LOADER });
    await loader.connect();
    for (const c of CALLS) {
      await loader.query(
        `insert into purple_dots_calls
           (call_id, call_uuid, persona, channel, call_answered, test_flag, campaign_name, call_date_ist, call_datetime_ist)
         values ($1, $1, $2, $3, $4, $5, 'Reports Test', '2026-09-01', '2026-09-01T10:00:00+05:30')`,
        [PREFIX + c.id, c.persona, c.channel, c.answered, c.test],
      );
    }
    await loader.end();
    await owner.query(
      `insert into program_sync_state (program, row_count, status) values ('seekers', 3, 'ok')
       on conflict (program) do update set row_count = 3, status = 'ok'`,
    );

    process.env.DATABASE_URL = CM_APP;
    reports = await import("../../src/server/db/reports.server");
  });

  async function cleanup() {
    await owner.query("delete from purple_dots_calls where call_id like $1", [PREFIX + "%"]);
    await owner.query("delete from program_sync_state where program = 'seekers'");
  }

  afterAll(async () => {
    await cleanup();
    await owner.end();
    const { getDb } = await import("../../src/server/db/client.server");
    await getDb().$client.end();
  });

  const seekers = { program: "seekers", campaign: "Reports Test" };

  test("aggregate payload counts the non-test seekers calls", async () => {
    const p = (await reports.programAggregatePayload(seekers)) as {
      stateRowCount: number;
      aggregates: { kpis: { total_rows: number } };
    };
    expect(p.stateRowCount).toBe(3);
    expect(p.aggregates.kpis.total_rows).toBe(3);
  });

  test("the channel filter matches the lower-cased channel", async () => {
    const count = async (channel: string) =>
      ((await reports.programAggregates({ ...seekers, channel })) as { kpis: { total_rows: number } }).kpis.total_rows;
    expect(await count("outbound")).toBe(2);
    expect(await count("inbound")).toBe(1);
    expect(await count("all")).toBe(3);
  });

  test("filter options list the campaign and lower-case channels", async () => {
    const o = (await reports.programFilterOptions({ program: "seekers" })) as { campaignTypes: string[]; channels: string[] };
    expect(o.campaignTypes).toContain("Reports Test");
    expect(o.channels.sort()).toEqual(["inbound", "outbound"]);
  });

  test("a date filter outside the data returns nothing", async () => {
    const p = (await reports.programAggregates({ ...seekers, dateFrom: "2025-01-01", dateTo: "2025-01-02" })) as {
      kpis: { total_rows: number };
    };
    expect(p.kpis.total_rows).toBe(0);
  });

  test("every other wrapper runs and returns JSON", async () => {
    const outputs = await Promise.all([
      reports.programMetricGroups(seekers),
      reports.programMetricsRaw(seekers),
      reports.funnelDurations(seekers),
      reports.funnelCallIds({ ...seekers, stage: "answered" }),
      reports.kkbDropAnalysis({ campaign: "Reports Test" }),
      reports.kkbCallOutcomes({ campaign: "Reports Test" }),
      reports.dkbDropAnalysis({ campaign: "Reports Test" }),
      reports.campaignList({ program: "seekers" }),
      reports.campaignDropCauses({ campaign: "Reports Test" }),
      reports.dkbCampaignCauses({ campaign: "Reports Test" }),
    ]);
    for (const out of outputs) expect(out).not.toBeNull();
  });

  test("parameters are validated before reaching Postgres", () => {
    expect(() => reports.programAggregates({ program: 42 as unknown as string })).toThrow();
  });
});
