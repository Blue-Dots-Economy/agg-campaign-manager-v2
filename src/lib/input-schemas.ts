// Input schemas shared by several server functions. Safe to load in the browser: the exported
// request schemas that use them stay in the client bundle.
import { z } from "zod";
import { withoutUndefined, type JsonObject } from "@/lib/json";
import { registry, type ProgramId } from "@/programs/registry";

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

/** One uploaded contact: a flat record of CSV cells. Undefined values are dropped. */
export const contactSchema: z.ZodType<JsonObject, z.ZodTypeDef, unknown> = z
  .record(z.union([z.string(), z.number(), z.boolean(), z.null()]).optional())
  .transform(withoutUndefined);
