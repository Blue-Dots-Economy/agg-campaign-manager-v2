// Readers for loosely shaped Raya objects, where the same field can appear under several names.
import type { JsonObject, JsonValue } from "@/lib/json";

/** A Raya object; most keys may be missing. */
export type RayaRecord = Readonly<Record<string, JsonValue | undefined>>;

/** A Raya object that may itself be missing. */
export type RayaItem = RayaRecord | null | undefined;

/** Returns the first value among `keys` that is neither null nor missing, like `a ?? b ?? c`. */
export function first(item: RayaItem, ...keys: string[]): JsonValue | undefined {
  for (const k of keys) {
    const v = item?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/** Returns `v` when it is a JSON object. */
export function asRecord(v: JsonValue | undefined): JsonObject | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v : undefined;
}

/** Returns `v` as text, or null when it is missing. */
export function textOrNull(v: JsonValue | undefined): string | null {
  if (v === undefined || v === null) return null;
  return typeof v === "string" ? v : String(v);
}
