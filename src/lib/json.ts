// Schemas for JSON values: upstream replies passed to the page, and free-form input fields.
import { z } from "zod";
import type { Json } from "@/server/db/schema";

/** Any value JSON can hold. Server functions can return it; `unknown` they cannot. */
export type JsonValue = Json;

/** A JSON object. */
export type JsonObject = { [key: string]: JsonValue };

/** Removes keys whose value is undefined, which JSON cannot store. */
export function withoutUndefined(record: Record<string, JsonValue | undefined>): JsonObject {
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(record)) if (v !== undefined) out[k] = v;
  return out;
}

/** Matches any JSON value. Object keys whose value is undefined are dropped. */
export const JsonValueSchema: z.ZodType<JsonValue, unknown> = z.lazy(() => jsonValue);

// Built once: a union created inside z.lazy would be rebuilt on every nested value.
const jsonValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(JsonValueSchema),
  z.record(z.string(), JsonValueSchema.optional()).transform(withoutUndefined),
]);

/** Matches a JSON object. Keys whose value is undefined are dropped. */
export const JsonObjectSchema: z.ZodType<JsonObject, unknown> = z
  .record(z.string(), JsonValueSchema.optional())
  .transform(withoutUndefined);
