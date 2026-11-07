// Rows keyed by SQL column name, as the UI expects.
import { getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

type Columns<T extends PgTable> = T["_"]["columns"];
export type SqlNamed<T extends PgTable> = {
  [K in keyof Columns<T> as Columns<T>[K]["_"]["name"]]: Columns<T>[K];
};

export function sqlNamed<T extends PgTable>(table: T): SqlNamed<T> {
  return Object.fromEntries(Object.values(getTableColumns(table)).map((c) => [c.name, c])) as SqlNamed<T>;
}

export function fromSqlNames<T extends PgTable>(table: T, patch: Record<string, unknown>): Partial<T["$inferInsert"]> {
  const out: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(getTableColumns(table))) {
    if (col.name in patch) out[key] = patch[col.name];
  }
  return out as Partial<T["$inferInsert"]>;
}
