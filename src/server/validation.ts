// Input validation for server functions. Loaded by `.functions.ts` modules that the browser
// also imports, so server-only code is imported inside the failure path.
import { z } from "zod";
import { registry, type ProgramId } from "@/programs/registry";
import type { Json } from "@/server/db/schema";

/** First words of the message sent to the browser when input fails validation. */
export const INVALID_INPUT_MESSAGE = "Invalid input";

/** Most problems named in one error message, to keep the message short. */
const MAX_ISSUES_IN_MESSAGE = 5;

/**
 * Replaces Zod default messages that repeat the rejected value. Messages a schema sets itself
 * take precedence over this map and reach the browser as written.
 */
const noEchoErrorMap: z.ZodErrorMap = (issue, ctx) =>
  issue.code === z.ZodIssueCode.invalid_enum_value
    ? { message: "Invalid value" }
    : { message: ctx.defaultError };

function describeIssue(issue: z.ZodIssue): string {
  return issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}

/**
 * Builds a server-function input validator that parses with a Zod schema.
 * The message names each bad field with the schema's message; it never repeats rejected values.
 *
 * @param schema - Schema for the input; unknown keys are dropped (Zod's default `strip`).
 * @returns A validator for `.inputValidator(...)` that resolves to the parsed input.
 * @throws {Error} From the validator, after setting HTTP status 400, when the input does not match.
 */
export function parseInput<S extends z.ZodTypeAny>(
  schema: S,
): (input: z.input<S>) => Promise<z.output<S>> {
  return async (input) => {
    const result = await schema.safeParseAsync(input, { errorMap: noEchoErrorMap });
    if (result.success) return result.data;
    const problems = [...new Set(result.error.issues.map(describeIssue))];
    const { setResponseStatus } = await import("@tanstack/react-start/server");
    setResponseStatus(400);
    throw new Error(
      `${INVALID_INPUT_MESSAGE}: ${problems.slice(0, MAX_ISSUES_IN_MESSAGE).join("; ")}`,
    );
  };
}

/** Narrows an unknown value, such as parsed JSON, to an object with string keys. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Most rows in a stored seeker CSV, and so most contacts one campaign request or batch may carry. */
export const MAX_CONTACTS_PER_BATCH = 200_000;

/** A program id from the program registry. */
export const programIdSchema = z
  .string()
  .refine((v): v is ProgramId => Object.hasOwn(registry, v), "Unknown program");

/** Removes keys whose value is undefined, which JSON cannot store. */
function withoutUndefined(record: Record<string, Json | undefined>): { [key: string]: Json } {
  const out: { [key: string]: Json } = {};
  for (const [k, v] of Object.entries(record)) if (v !== undefined) out[k] = v;
  return out;
}

/** Any JSON value, for free-form fields stored in jsonb columns. Undefined object values are dropped. */
export const jsonSchema: z.ZodType<Json, z.ZodTypeDef, unknown> = z.lazy(() => jsonValue);

const jsonValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(jsonSchema),
  z.record(jsonSchema.optional()).transform(withoutUndefined),
]);

/** A JSON object, for free-form records such as schedules and cohort filters. */
export const jsonObjectSchema = z.record(jsonSchema.optional()).transform(withoutUndefined);

/** One uploaded contact: a flat record of CSV cells. Undefined values are dropped. */
export const contactSchema: z.ZodType<{ [key: string]: Json }, z.ZodTypeDef, unknown> = z
  .record(z.union([z.string(), z.number(), z.boolean(), z.null()]).optional())
  .transform(withoutUndefined);
