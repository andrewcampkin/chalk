import type { Config } from "drizzle-kit";

/**
 * Generates SQL migrations from db/schema.ts.
 *
 *   npx drizzle-kit generate
 *
 * expo-sqlite has no URL for drizzle-kit to connect to — migrations are
 * generated on the dev machine and bundled, then applied on device with
 * drizzle-orm/expo-sqlite/migrator. The hand-written db/migrations/0001_fts.sql
 * must run AFTER the generated migration that creates `blocks`; lib/db.ts does
 * that explicitly on every launch.
 */
export default {
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  driver: "expo",
} satisfies Config;
