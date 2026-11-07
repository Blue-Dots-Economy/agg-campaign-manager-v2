// Readers for loosely shaped Raya objects, where the same field can appear under several names.

/** A JSON-like value read from Raya; object fields may be undefined. */
export type RayaValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly RayaValue[]
  | { readonly [key: string]: RayaValue };

/** A Raya object; most keys may be missing. */
export interface RayaRecord {
  readonly [key: string]: RayaValue;
}

/** A Raya object that may itself be missing. */
export type RayaItem = RayaRecord | null | undefined;

/** Returns the first value among `keys` that is neither null nor missing, like `a ?? b ?? c`. */
export function first(item: RayaItem, ...keys: string[]): RayaValue {
  for (const k of keys) {
    const v = item?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/** Returns `v` when it is an object (not an array). */
export function asRecord(v: RayaValue): RayaRecord | undefined {
  return v !== null && typeof v === "object" && !isArray(v) ? v : undefined;
}

/** Array check that keeps the readonly element type. */
export function isArray(v: RayaValue): v is readonly RayaValue[] {
  return Array.isArray(v);
}

/** Returns `v` as text, or null when it is missing. */
export function textOrNull(v: RayaValue): string | null {
  if (v === undefined || v === null) return null;
  return typeof v === "string" ? v : String(v);
}
