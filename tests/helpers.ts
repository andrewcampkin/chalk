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
/**
 * Every database handed out, so it can be closed between tests.
 *
 * Left open, better-sqlite3 finalises its Statement objects during process
 * teardown, after Node has already disposed the environment. Node 24.19 asserts
 * on that (`RemoveEnvironmentCleanupHook: (env) != nullptr`) and the whole test
 * worker segfaults, which surfaces only as "Worker exited unexpectedly".
 */
const openDbs: Database.Database[] = [];

export function closeAllTestDbs() {
  while (openDbs.length) {
    try {
      openDbs.pop()?.close();
    } catch {
      // Already closed — nothing to do.
    }
  }
}

export function makeTestDb(seed = true) {
  const sqlite = new Database(":memory:");
  openDbs.push(sqlite);
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
