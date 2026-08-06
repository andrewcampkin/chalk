import { eq, like, sql } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { movements } from "../db/schema";

type DB = BaseSQLiteDatabase<any, any, any>;

/**
 * Adding a movement the seed never heard of.
 *
 * Coaches invent combinations constantly — burpee pull-ups, devil's press,
 * whatever this week's couplet is — and the app is useless if a workout cannot
 * be logged because its name is missing. Custom movements are flagged
 * `isCustom` so the seed never touches them and the JSON export carries them,
 * since a backup that omitted them would not rebuild.
 */

export type CustomScoreType = "reps" | "load" | "distance";

/** "Burpee Pull-up" -> "burpee-pull-up". */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Tidies what was typed without mangling shorthand like "DB snatch". */
export function tidyName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return name;
  return name[0].toUpperCase() + name.slice(1);
}

/**
 * Slugs are unique, and a coach's new movement may well collide with something
 * archived years ago, so suffix rather than fail.
 */
export async function uniqueSlug(db: DB, base: string): Promise<string> {
  const root = base || "movement";
  const taken = await db
    .select({ slug: movements.slug })
    .from(movements)
    .where(like(movements.slug, `${root}%`));
  const set = new Set(taken.map((r: { slug: string }) => r.slug));
  if (!set.has(root)) return root;
  for (let n = 2; n < 1000; n++) {
    if (!set.has(`${root}-${n}`)) return `${root}-${n}`;
  }
  return `${root}-${Date.now()}`;
}

export async function createCustomMovement(
  db: DB,
  rawName: string,
  scoreType: CustomScoreType,
): Promise<typeof movements.$inferSelect | null> {
  const name = tidyName(rawName);
  if (!name) return null;

  // Reuse rather than duplicate if the name already exists, however it got there.
  const [existing] = await db
    .select()
    .from(movements)
    .where(eq(sql`lower(${movements.name})`, name.toLowerCase()));
  if (existing) return existing;

  const slug = await uniqueSlug(db, slugify(name));

  const [created] = await db
    .insert(movements)
    .values({
      name,
      slug,
      kind: "movement",
      // Left null deliberately: guessing a modality would put a made-up
      // movement into the activity mix under a category nobody chose.
      modality: null,
      pattern: null,
      aliases: [],
      defaultScoreType: scoreType,
      isCustom: true,
    })
    .returning();

  return created ?? null;
}
