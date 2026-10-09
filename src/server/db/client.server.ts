import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as relations from "./relations";
import * as schema from "./schema";

const fullSchema = { ...schema, ...relations };

let db: NodePgDatabase<typeof fullSchema> | undefined;

export function getDb(): NodePgDatabase<typeof fullSchema> {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    db = drizzle(new pg.Pool({ connectionString: url }), { schema: fullSchema });
  }
  return db;
}
