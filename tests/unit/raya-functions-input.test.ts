import { describe, expect, test } from "bun:test";
import {
  CreateBatchInput,
  CreateBatchReply,
  GetBatchContactsInput,
  InitiateCallInput,
  ListAgentsInput,
  ListBatchesInput,
  MAX_UPLOAD_ROWS,
  StartBatchInput,
  StopBatchInput,
  UpdateBatchInput,
  ValidateContactsInput,
} from "../../src/lib/raya.functions";
import { MAX_CONTACTS_PER_BATCH } from "../../src/lib/input-schemas";

const contact = { contact_name: "A", contact_phone: "9876543210", country_code: "91" };
const schedule = { timezone: "Asia/Kolkata", start_time: "09:00", end_time: "18:00", days: [1, 2] };

const issue = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.error?.issues[0]?.message;

describe("CreateBatchInput", () => {
  test("keeps extra contact fields for the agent", () => {
    const parsed = CreateBatchInput.parse({
      agentId: "ag",
      batchName: "b",
      contacts: [{ ...contact, seeker_id: "s1", _region: "GZB" }],
      unknownTopLevel: 1,
    });
    expect(parsed.contacts[0]).toEqual({ ...contact, seeker_id: "s1", _region: "GZB" });
    expect(parsed).not.toHaveProperty("unknownTopLevel");
  });
  test("accepts contacts without a country code", () => {
    expect(
      CreateBatchInput.safeParse({
        agentId: "a",
        batchName: "b",
        contacts: [{ ...contact, country_code: undefined }],
      }).success,
    ).toBe(true);
  });
  test("refuses missing fields with the existing messages", () => {
    expect(
      issue(CreateBatchInput.safeParse({ agentId: "", batchName: "b", contacts: [contact] })),
    ).toBe("Missing agent id for this program. Set it in Settings.");
    expect(
      issue(CreateBatchInput.safeParse({ agentId: "a", batchName: "", contacts: [contact] })),
    ).toBe("Missing batch name.");
    expect(issue(CreateBatchInput.safeParse({ agentId: "a", batchName: "b", contacts: [] }))).toBe(
      "No contacts to send.",
    );
  });
  test("refuses malformed contacts and oversized batches", () => {
    expect(
      CreateBatchInput.safeParse({ agentId: "a", batchName: "b", contacts: [{ contact_name: 1 }] })
        .success,
    ).toBe(false);
    const many = Array.from({ length: MAX_CONTACTS_PER_BATCH + 1 }, () => contact);
    expect(
      CreateBatchInput.safeParse({ agentId: "a", batchName: "b", contacts: many }).success,
    ).toBe(false);
    expect(CreateBatchInput.safeParse(null).success).toBe(false);
  });
});

describe("StartBatchInput and UpdateBatchInput", () => {
  test("accept what the launch pages send", () => {
    const input = {
      batchId: "42",
      schedule,
      maxRetries: 2,
      retryAfterHrs: 24,
      concurrency: 5,
      selectedStatuses: ["Pending"],
    };
    expect(StartBatchInput.parse(input)).toEqual(input);
    expect(StartBatchInput.parse({ batchId: "42" })).toEqual({ batchId: "42" });
    expect(UpdateBatchInput.parse({ batchId: "42", name: "n", schedule })).toEqual({
      batchId: "42",
      name: "n",
      schedule,
    });
  });
  test("refuse a bad schedule with the existing messages", () => {
    expect(
      issue(StartBatchInput.safeParse({ batchId: "1", schedule: { ...schedule, days: [] } })),
    ).toBe("Pick at least one day of the week.");
    expect(
      issue(
        StartBatchInput.safeParse({ batchId: "1", schedule: { ...schedule, end_time: "08:00" } }),
      ),
    ).toBe("end_time must be after start_time.");
    expect(
      issue(StartBatchInput.safeParse({ batchId: "1", schedule: { ...schedule, start_time: "" } })),
    ).toBe("Schedule requires start_time and end_time.");
  });
  test("refuse a missing batch id and wrong types", () => {
    expect(issue(StartBatchInput.safeParse({ batchId: "" }))).toBe("Missing batch id.");
    expect(StartBatchInput.safeParse({ batchId: "1", concurrency: "5" }).success).toBe(false);
    expect(UpdateBatchInput.safeParse({}).success).toBe(false);
  });
});

describe("list inputs", () => {
  test("accept no input", () => {
    expect(ListAgentsInput.parse(undefined)).toEqual({});
    expect(ListBatchesInput.parse(undefined)).toEqual({});
    expect(ListBatchesInput.parse({ agentId: "a", page: 2 })).toEqual({ agentId: "a", page: 2 });
  });
  test("refuse wrong types", () => {
    expect(ListAgentsInput.safeParse({ page: "1" }).success).toBe(false);
    expect(GetBatchContactsInput.safeParse({ page: 1 }).success).toBe(false);
  });
});

describe("ValidateContactsInput", () => {
  test("accepts headers and rows of strings", () => {
    expect(ValidateContactsInput.parse({ headers: ["a"], rows: [["1"], []] })).toEqual({
      headers: ["a"],
      rows: [["1"], []],
    });
  });
  test("refuses non-string cells and too many rows", () => {
    expect(ValidateContactsInput.safeParse({ headers: ["a"], rows: [[1]] }).success).toBe(false);
    const rows = Array.from({ length: MAX_UPLOAD_ROWS + 1 }, () => ["x"]);
    expect(ValidateContactsInput.safeParse({ headers: ["a"], rows }).success).toBe(false);
  });
});

describe("StopBatchInput and InitiateCallInput", () => {
  test("accept valid input", () => {
    expect(StopBatchInput.parse({ batchId: "1" })).toEqual({ batchId: "1" });
    expect(InitiateCallInput.parse({ agentId: "a", toNumber: "9", agentArgs: { x: 1 } })).toEqual({
      agentId: "a",
      toNumber: "9",
      agentArgs: { x: 1 },
    });
  });
  test("refuse missing values", () => {
    expect(issue(InitiateCallInput.safeParse({ agentId: "a", toNumber: "" }))).toBe(
      "Missing phone number.",
    );
    expect(StopBatchInput.safeParse({}).success).toBe(false);
  });
});

describe("CreateBatchReply", () => {
  test("reads an unexpected field type as missing instead of failing", () => {
    const r = CreateBatchReply.parse({ batchId: 7, totalRows: "3", data: "x", message: 1 });
    expect(r.batchId).toBe(7);
    expect(r.totalRows).toBeNull();
    expect(r.data).toBeNull();
    expect(r.message).toBeNull();
  });
  test("keeps validation details", () => {
    const r = CreateBatchReply.parse({ status: "error", invalidRows: 2, errors: [{ row: 2 }] });
    expect(r).toMatchObject({ status: "error", invalidRows: 2, errors: [{ row: 2 }] });
  });
});
