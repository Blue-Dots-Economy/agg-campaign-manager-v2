// Schemas for upstream JSON passed through to the page unchanged.
import { z } from "zod";
import type { Json } from "@/server/db/schema";

/** Any value JSON can hold. Server functions can return it; `unknown` they cannot. */
export type JsonValue = Json;

/** Matches any JSON value. */
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

/** Matches a JSON object. */
export const JsonObjectSchema = z.record(z.string(), JsonValueSchema);

/** A JSON object. */
export type JsonObject = z.infer<typeof JsonObjectSchema>;
