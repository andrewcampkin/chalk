import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { movements } from "../db/schema";
import { seedRows } from "../db/seed";

/**
 * A real SQLite database built from the real generated migration, not a
 * hand-written approximation — a test schema that drifts from the shipped one
 * tests nothing.
 */
export function makeTestDb(seed = true) {
  const sqlite = new Database(":memory:");
  const dir = join(__dirname, "..", "db", "migrations");
  const generated = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of generated) {
    const ddl = readFileSync(join(dir, file), "utf8");
    for (const stmt of ddl.split("--> statement-breakpoint")) sqlite.exec(stmt);
  }
  sqlite.exec(readFileSync(join(__dirname, "..", "db", "sql", "fts.sql"), "utf8"));

  const db = drizzle(sqlite) as any;
  if (seed) db.insert(movements).values(seedRows()).run?.() ?? null;
  return { db, sqlite };
}

export async function seedMovements(db: any) {
  await db.insert(movements).values(seedRows());
}
