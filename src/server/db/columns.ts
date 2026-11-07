// Rows keyed by SQL column name, as the UI expects.
import { getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

type Columns<T extends PgTable> = T["_"]["columns"];

/** SQL column name of the table field `K`. */
type SqlName<T extends PgTable, K> = K extends keyof Columns<T>
  ? Columns<T>[K]["_"]["name"]
  : never;

/** The table's columns keyed by SQL column name, for `select(...)` and `returning(...)`. */
export type SqlNamed<T extends PgTable> = {
  [K in keyof Columns<T> as SqlName<T, K>]: Columns<T>[K];
};

/** An insert row of the table keyed by SQL column name. */
export type SqlNamedInsert<T extends PgTable> = {
  [K in keyof T["$inferInsert"] as SqlName<T, K>]: T["$inferInsert"][K];
};

/** Returns the table's columns keyed by SQL column name, so a select returns snake_case rows. */
export function sqlNamed<T extends PgTable>(table: T): SqlNamed<T> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- keys are built at runtime from the same column names the mapped type reads.
  return Object.fromEntries(
    Object.values(getTableColumns(table)).map((c) => [c.name, c]),
  ) as SqlNamed<T>;
}

/**
 * Converts a patch keyed by SQL column name to the table's field names for insert or update.
 * Keys the patch holds are copied, even when their value is undefined.
 */
export function fromSqlNames<T extends PgTable>(
  table: T,
  patch: Partial<SqlNamedInsert<T>>,
): Partial<T["$inferInsert"]> {
  const source: Record<string, unknown> = patch;
  const out: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(getTableColumns(table))) {
    if (col.name in source) out[key] = source[col.name];
  }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- each value comes from the key of the same column in a typed patch.
  return out as Partial<T["$inferInsert"]>;
}
