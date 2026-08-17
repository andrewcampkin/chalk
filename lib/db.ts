import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import { openDatabaseSync } from "expo-sqlite";
import { sql } from "drizzle-orm";
import migrations from "../db/migrations/migrations";
import ftsSql from "../db/sql/fts.sql";
import { movements } from "../db/schema";
import { seedRows } from "../db/seed";

/**
 * One database, opened once, for the life of the app. expo-sqlite keeps the
 * file in the app's document directory, so it survives updates and is what the
 * JSON export reads from.
 */
export const expoDb = openDatabaseSync("chalk.db", { enableChangeListener: true });
export const db = drizzle(expoDb);

let ready: Promise<void> | null = null;

/**
 * Migrations, then FTS, then seed — in that order, exactly once.
 *
 * The FTS5 virtual table and its triggers are hand-written and live outside
 * drizzle's journal, so they are applied here on every launch. They are dropped
 * and rebuilt each time — see db/sql/fts.sql for why.
 */
export function initDb(): Promise<void> {
  ready ??= (async () => {
    await migrate(db, migrations);

    expoDb.execSync("PRAGMA foreign_keys = ON;");
    expoDb.execSync(ftsSql as unknown as string);

    await seedIfEmpty();
  })();
  return ready;
}

/**
 * The app is useless empty — hand-typing "Thruster" every session is what kills
 * the logging habit. Seeds only when the table is bare, so a user's own custom
 * movements are never touched by a later launch.
 */
async function seedIfEmpty() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(movements);
  if (count > 0) return;

  const rows = seedRows();
  // expo-sqlite has a variable limit per statement; chunk well under it.
  for (let i = 0; i < rows.length; i += 40) {
    await db.insert(movements).values(rows.slice(i, i + 40));
  }
}
