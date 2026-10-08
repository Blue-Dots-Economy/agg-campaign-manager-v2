import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.MIGRATOR_DATABASE_URL ?? process.env.DATABASE_URL ?? "" },
});
