// In-memory stand-in for the Raya voice API, serving only the paths the app calls.
import { z } from "zod";
import { JsonObjectSchema, JsonValueSchema, type JsonObject, type JsonValue } from "@/lib/json";

/** Seeded Raya agents; their ids go into Settings → Agents. */
export const MOCK_AGENTS = [
  { id: "mock-agent-seekers", name: "Mock seeker agent" },
  { id: "mock-agent-providers", name: "Mock provider agent" },
] as const;

/** First batch id handed out; Raya batch ids are numbers. */
const FIRST_BATCH_ID = 1001;
/** Page size when a list request sends none. */
const DEFAULT_PAGE_SIZE = 20;
/** Contacts in the batch seeded for the first agent. */
const SEEDED_BATCH_CONTACTS = 4;
/** Every this-many contacts, one is left unanswered, so the live view shows more than one status. */
const UNANSWERED_EVERY = 3;
/** Seconds between the first, unanswered attempt and the answered call. */
const RETRY_GAP_S = 600;
/** Length of an answered mock call. */
const ANSWERED_CALL_SECONDS = 185;

interface MockBatch {
  id: number;
  name: string;
  agentId: string;
  agentName: string;
  status: string;
  settings: JsonObject;
  createdAt: string;
  startedAt: string | null;
  contacts: JsonObject[];
}

const CreateBody = z.object({
  agent_id: z.string(),
  batch_name: z.string(),
  contacts: z.array(JsonObjectSchema).min(1),
});
const StartBody = z
  .object({ selected_statuses: z.array(z.string()).optional() })
  .catchall(JsonValueSchema);
const CallBody = z.object({ agent_id: z.string(), to_number: z.string() });

/** Batch settings Raya stores from start and update requests. */
const SETTING_KEYS = ["schedule", "concurrency", "max_retries", "retry_after_hrs"];

const notFound = () => Response.json({ message: "Not found" }, { status: 404 });
const badRequest = (message: string) =>
  Response.json({ status: "error", message, errors: [] }, { status: 400 });

/** Copies the batch settings found in a request body. */
function pickSettings(body: JsonObject): JsonObject {
  const out: JsonObject = {};
  for (const key of SETTING_KEYS) {
    const v = body[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** A finished call; answered calls carry a summary, transcript and job results. */
function mockCall(id: string, startedAt: Date, answered: boolean): JsonObject {
  const base = {
    uuid: id,
    status: "completed",
    call_start_time: startedAt.toISOString(),
  };
  if (!answered) {
    return { ...base, call_duration: 0, outcome: "no_answer", call_output: {} };
  }
  return {
    ...base,
    call_duration: ANSWERED_CALL_SECONDS,
    outcome: "applied",
    call_recording_url: `https://recordings.mock.local/${id}.mp3`,
    call_transcript: [
      { role: "agent", content: "Hello, this is a test call from the mock agent." },
      { role: "user", content: "Hello, I am looking for a job." },
    ],
    call_output: {
      final_summary: "Mock call: the seeker heard two jobs and applied to one.",
      primary_topic: "job_search",
      user_intent: "high",
      call_answered: true,
      call_engaged: true,
      jobs_shown: true,
      applied_to_job: true,
      jobs_recommended: ["Data entry operator", "Store helper"],
      jobs_applied: ["Data entry operator"],
      jobs_failed_to_apply: [],
      applications_count: 1,
    },
  };
}

/** In-memory Raya: agents, batches with their contacts, and calls by id. */
export function createMockRaya(now: () => Date) {
  const batches = new Map<number, MockBatch>();
  const calls = new Map<string, JsonObject>();
  let nextBatchId = FIRST_BATCH_ID;
  let nextCallNo = 1;

  const agentById = (id: string) => MOCK_AGENTS.find((a) => a.id === id);

  function addCall(call: JsonObject): void {
    calls.set(String(call.uuid), call);
  }

  /** Gives each dialled contact an unanswered first attempt and, for most, an answered call. */
  function dial(batch: MockBatch, statuses: string[]): void {
    const start = now();
    batch.contacts = batch.contacts.map((contact, i) => {
      if (!statuses.includes(String(contact.status))) return contact;
      const n = nextCallNo++;
      const first = mockCall(`mock-call-${n}-1`, start, false);
      const answered = (i + 1) % UNANSWERED_EVERY !== 0;
      const made = [first];
      if (answered) {
        made.push(
          mockCall(`mock-call-${n}-2`, new Date(start.getTime() + RETRY_GAP_S * 1000), true),
        );
      }
      made.forEach((c) => addCall(c));
      return {
        ...contact,
        status: answered ? "Completed" : "Unanswered",
        contact_attempts: made.length,
        updated_at: start.toISOString(),
        calls: made,
      };
    });
  }

  function statusCounts(b: MockBatch): JsonObject {
    const counts: Record<string, number> = {};
    for (const c of b.contacts) {
      const s = String(c.status);
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }

  function batchJson(b: MockBatch): JsonObject {
    return {
      id: b.id,
      name: b.name,
      agent_id: b.agentId,
      agent_name: b.agentName,
      status: b.status,
      ...b.settings,
      created_at: b.createdAt,
      started_at: b.startedAt,
      total_contacts: b.contacts.length,
      status_counts: statusCounts(b),
    };
  }

  function createBatch(agentId: string, name: string, contacts: JsonObject[]): MockBatch {
    const agent = agentById(agentId);
    const id = nextBatchId++;
    const batch: MockBatch = {
      id,
      name,
      agentId,
      agentName: agent?.name ?? agentId,
      status: "pending",
      settings: {},
      createdAt: now().toISOString(),
      startedAt: null,
      contacts: contacts.map((c, i) => ({ ...c, id: `${id}-${i + 1}`, status: "Pending" })),
    };
    batches.set(id, batch);
    return batch;
  }

  function page<T>(items: T[], query: URLSearchParams): T[] {
    const size = Number(query.get("page_size")) || DEFAULT_PAGE_SIZE;
    const pageNo = Number(query.get("page")) || 1;
    return items.slice((pageNo - 1) * size, pageNo * size);
  }

  const [seedAgent] = MOCK_AGENTS;
  const seeded = createBatch(
    seedAgent.id,
    "Mock seeded batch",
    Array.from({ length: SEEDED_BATCH_CONTACTS }, (_, i) => ({
      contact_name: `Mock seeker ${i + 1}`,
      contact_phone: `90000000${String(i + 1).padStart(2, "0")}`,
      country_code: "91",
    })),
  );
  seeded.status = "running";
  seeded.startedAt = seeded.createdAt;
  dial(seeded, ["Pending"]);

  async function readJson(req: Request): Promise<JsonValue> {
    const text = await req.text();
    return text ? JsonValueSchema.parse(JSON.parse(text)) : {};
  }

  /** Answers one Raya request; `path` is the part after the `/raya` prefix. */
  async function handle(req: Request, path: string, query: URLSearchParams): Promise<Response> {
    if (!req.headers.get("x-api-key")) {
      return Response.json({ message: "Invalid or missing API key" }, { status: 401 });
    }
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    const [head, id, action] = parts;
    const method = req.method;

    if (method === "GET" && path === "/agents") return Response.json({ agents: MOCK_AGENTS });
    if (method === "GET" && head === "agent" && id && parts.length === 2) {
      const agent = agentById(id);
      return agent ? Response.json(agent) : notFound();
    }
    if (head === "call") return handleCall(req, method, id);
    if (head !== "batch") return notFound();

    if (!id) {
      if (method === "GET") {
        const agentId = query.get("agent_id");
        const list = [...batches.values()]
          .filter((b) => !agentId || b.agentId === agentId)
          .sort((a, b) => b.id - a.id);
        return Response.json({
          data: page(list, query).map((b) => batchJson(b)),
          total: list.length,
        });
      }
      if (method === "POST") {
        const body = CreateBody.safeParse(await readJson(req));
        if (!body.success) return badRequest("agent_id, batch_name and contacts are required");
        if (!agentById(body.data.agent_id)) return badRequest("Unknown agent_id");
        const batch = createBatch(body.data.agent_id, body.data.batch_name, body.data.contacts);
        return Response.json({
          status: "success",
          message: "Batch created",
          batchId: batch.id,
          totalRows: batch.contacts.length,
          validRows: batch.contacts.length,
          invalidRows: 0,
          contactsInserted: batch.contacts.length,
        });
      }
      return notFound();
    }

    const batch = batches.get(Number(id));
    if (!batch) return notFound();
    if (method === "GET" && action === "contacts") {
      return Response.json({
        batch: batchJson(batch),
        contacts: page(batch.contacts, query),
        total: batch.contacts.length,
      });
    }
    if (method === "PATCH" && !action) {
      const body = JsonObjectSchema.parse(await readJson(req));
      if (typeof body.name === "string") batch.name = body.name;
      batch.settings = { ...batch.settings, ...pickSettings(body) };
      return Response.json({ status: "success", batch: batchJson(batch) });
    }
    if (method === "POST" && action === "start") {
      const body = StartBody.parse(await readJson(req));
      batch.settings = { ...batch.settings, ...pickSettings(body) };
      batch.status = "running";
      batch.startedAt = now().toISOString();
      dial(batch, body.selected_statuses ?? ["Pending"]);
      return Response.json({ status: "success", message: "Batch started", batch_id: batch.id });
    }
    if (method === "POST" && action === "stop") {
      batch.status = "stopped";
      return Response.json({ status: "success", message: "Batch stopped", batch_id: batch.id });
    }
    return notFound();
  }

  async function handleCall(req: Request, method: string, id: string | undefined) {
    if (method === "GET" && id) {
      const call = calls.get(id);
      return call ? Response.json(call) : notFound();
    }
    if (method === "POST" && !id) {
      const body = CallBody.safeParse(await readJson(req));
      if (!body.success || !agentById(body.data.agent_id)) {
        return badRequest("agent_id and to_number are required");
      }
      const call = mockCall(`mock-test-call-${nextCallNo++}`, now(), true);
      addCall(call);
      return Response.json({ status: "success", message: "Call queued", call_id: call.uuid });
    }
    return notFound();
  }

  return { handle };
}
