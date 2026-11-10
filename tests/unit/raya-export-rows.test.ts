import { describe, expect, test } from "bun:test";
import {
  buildRow,
  columnCoverage,
  isCompletedCall,
  mergeCallDetail,
  pickCallTime,
  pickLastCall,
  type BuildCtx,
  type InputRow,
} from "../../src/lib/raya-export-rows";

describe("pickCallTime", () => {
  test("reads the first known time field", () => {
    expect(pickCallTime({ start_time: "b", created_at: "c" })).toBe("b");
    expect(pickCallTime({ call_time: "e" })).toBe("e");
    expect(pickCallTime(null)).toBe("");
  });
});

describe("isCompletedCall", () => {
  test("needs a call id", () => {
    expect(isCompletedCall({ status: "completed" })).toBe(false);
    expect(isCompletedCall(null)).toBe(false);
  });
  test("refuses calls that have not finished", () => {
    expect(isCompletedCall({ id: "1", status: "In Progress" })).toBe(false);
    expect(isCompletedCall({ uuid: "1", call_status: "queued" })).toBe(false);
  });
  test("accepts any other status", () => {
    expect(isCompletedCall({ execution_id: 7, status: "Completed" })).toBe(true);
    expect(isCompletedCall({ id: "1" })).toBe(true);
  });
});

describe("pickLastCall", () => {
  test("returns the latest completed call", () => {
    const contact = {
      calls: [
        { id: "a", call_start_time: "2026-06-01 10:00:00 IST" },
        { id: "b", call_start_time: "2026-06-03 10:00:00 IST" },
        { id: "c", call_start_time: "2026-06-05 10:00:00 IST", status: "pending" },
      ],
    };
    expect(pickLastCall(contact)?.id).toBe("b");
  });
  test("returns null without completed calls", () => {
    expect(pickLastCall({ calls: [] })).toBeNull();
    expect(pickLastCall({ calls: [{ status: "done" }] })).toBeNull();
    expect(pickLastCall({})).toBeNull();
  });
});

describe("mergeCallDetail", () => {
  test("merges top-level fields and call_output", () => {
    const call = { id: "1", outcome: "x", call_output: { a: 1, b: 1 } };
    expect(mergeCallDetail(call, { outcome: "y", call_output: { b: 2 } })).toEqual({
      id: "1",
      outcome: "y",
      call_output: { a: 1, b: 2 },
    });
  });
  test("keeps the call when there is no detail", () => {
    const call = { id: "1" };
    expect(mergeCallDetail(call, null)).toBe(call);
    expect(mergeCallDetail(call, "text")).toBe(call);
  });
});

const COLUMNS = [
  "campaign_day",
  "Campaign Date",
  "campaign_type",
  "language",
  "call_id",
  "phone",
  "call_duration_seconds",
  "call_datetime_ist",
  "call_outcome",
  "call_answered",
  "call_engaged",
  "applied_to_job",
  "applications_count",
  "jobs_shown",
  "primary_topic",
  "call_recording_url",
  "final_summary",
  "call_transcript",
  "tried_to_apply",
  "drop_reason",
  "city_campaign",
  "seeker_name",
  "user_intent",
  "jobs_recommended",
  "jobs_applied",
  "jobs_failed_to_apply",
  "Intent Score",
  "intent_score_reasoning",
  "job_id",
  "company_name",
  "salary_input",
  "call_status",
  "contact_attempts",
  "new_job_role",
  "custom_field",
  "unknown_column",
];

function ctx(overrides: Partial<BuildCtx> = {}): BuildCtx {
  return {
    columns: COLUMNS,
    program: "seekers",
    batchName: "SEEKERS_Kannada_Day2",
    agentName: "agent",
    launchMeta: {},
    inputByPhone: new Map<string, InputRow>(),
    ...overrides,
  };
}

const CONTACT = {
  contact_phone: "+91 98765 43210",
  name: "Contact Name",
  status: "Completed",
  contact_attempts: 2,
  custom_field: "from contact",
  agent_args: { _region: "KA", job_id: "J-args" },
};

const CALL = {
  uuid: "call-1",
  call_duration: 130,
  call_start_time: "2026-06-23 10:11:12 IST",
  call_recording_url: "https://rec/1",
  call_transcript: [{ role: "agent", content: "hi" }],
  call_output: {
    jobs_recommended: '[{"job_id":"J1"}]',
    jobs_applied: [{ job_id: "J1" }],
    jobs_failed_to_apply: [],
    final_summary: "summary",
    primary_topic: "jobs",
    drop_reason: "",
    seeker_name: "Seeker",
    user_intent: "wants work",
    company_name: "Acme",
    new_job_role: { title: "Driver" },
  },
};

function asObject(row: string[] | null): Record<string, string> {
  expect(row).not.toBeNull();
  return Object.fromEntries(COLUMNS.map((c, i) => [c, row?.[i] ?? "<missing>"]));
}

describe("buildRow", () => {
  test("builds a full row from the last call", () => {
    const row = asObject(
      buildRow(
        CONTACT,
        CALL,
        ctx({
          launchMeta: { campaignDay: "Day 2", campaignDate: "2026-06-22" },
          inputByPhone: new Map([["9876543210", { raw: { salary_input: "15000" } }]]),
        }),
      ),
    );
    expect(row).toEqual({
      campaign_day: "Day 2",
      "Campaign Date": "2026-06-22",
      campaign_type: "SEEKERS_Kannada_Day2",
      language: "Kannada",
      call_id: "call-1",
      phone: "9876543210",
      call_duration_seconds: "130",
      call_datetime_ist: "2026-06-23 10:11:12",
      call_outcome: "Completed",
      call_answered: "Yes",
      call_engaged: "Yes",
      applied_to_job: "Yes",
      applications_count: "1",
      jobs_shown: "Yes",
      primary_topic: "jobs",
      call_recording_url: "https://rec/1",
      final_summary: "summary",
      call_transcript: '[{"role":"agent","content":"hi"}]',
      tried_to_apply: "Yes",
      drop_reason: "",
      city_campaign: "Hubli-Dharwad",
      seeker_name: "Seeker",
      user_intent: "wants work",
      jobs_recommended: '[{"job_id":"J1"}]',
      jobs_applied: '[{"job_id":"J1"}]',
      jobs_failed_to_apply: "[]",
      "Intent Score": "9",
      intent_score_reasoning: "Duration 130s (+3)|Application (+4)|Engagement (+2) → 9/10",
      job_id: "J-args",
      company_name: "Acme",
      salary_input: "15000",
      call_status: "Completed",
      contact_attempts: "2",
      new_job_role: '{"title":"Driver"}',
      custom_field: "from contact",
      unknown_column: "",
    });
  });

  test("prefers launch metadata over detected region", () => {
    const row = asObject(
      buildRow(
        CONTACT,
        CALL,
        ctx({
          launchMeta: {
            campaignDate: "2026-06-22",
            language: "Hindi",
            cityCampaign: "Ghaziabad",
            campaignType: "CUSTOM",
          },
        }),
      ),
    );
    expect(row.language).toBe("Hindi");
    expect(row.city_campaign).toBe("Ghaziabad");
    expect(row.campaign_type).toBe("CUSTOM");
  });

  test("derives date, type and outcome when data is missing", () => {
    const call = { id: 5, start_time: "2026-06-23T08:00:00Z", call_output: {} };
    const row = asObject(buildRow({ phone: "12345" }, call, ctx({ batchName: "", agentName: "" })));
    expect(row["Campaign Date"]).toBe("2026-06-23");
    expect(row.campaign_type).toBe("SEEKERS__Day1");
    expect(row.call_outcome).toBe("No Answer");
    expect(row.call_answered).toBe("No");
    expect(row.applied_to_job).toBe("No");
    expect(row.call_transcript).toBe("[]");
    expect(row["Intent Score"]).toBe("0");
    expect(row.phone).toBe("12345");
  });

  test("returns null without a last call or a call id", () => {
    expect(buildRow(CONTACT, null, ctx())).toBeNull();
    expect(buildRow(CONTACT, { call_output: {} }, ctx())).toBeNull();
  });
});

describe("columnCoverage", () => {
  test("splits columns by whether any row fills them", () => {
    expect(
      columnCoverage(
        ["a", "b", "c"],
        [
          ["x", " ", ""],
          ["", "", "z"],
        ],
      ),
    ).toEqual({ populatedColumns: ["a", "c"], emptyColumns: ["b"] });
  });
  test("treats every column as empty without rows", () => {
    expect(columnCoverage(["a"], [])).toEqual({ populatedColumns: [], emptyColumns: ["a"] });
  });
});
