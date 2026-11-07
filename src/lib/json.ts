// JSON value type and schema, for upstream data passed through to the page unchanged.
import { z } from "zod";

/** Any value JSON can hold. Server functions can return it; `unknown` they cannot. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

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
