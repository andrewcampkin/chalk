import { eq, inArray } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { blockMovements, blocks, movements, prs, sessions } from "../db/schema";
import { rebuildAllPrs } from "../db/queries";
import { EXPORT_VERSION, type ExportDoc } from "./export";
import { slugify, tidyName, uniqueSlug } from "./movements";

type DB = BaseSQLiteDatabase<any, any, any>;

/**
 * Reading a backup back in.
 *
 * Two rules, both from the invariants:
 *
 *  - `prs` is never restored. It is a cache and is rebuilt from the blocks
 *    afterwards, so a stale or hand-edited records block in the file cannot
 *    become a second source of truth (invariant 3).
 *  - `raw_text` is required. A block without its verbatim workout is not a
 *    record worth keeping (invariant 1), so the file is rejected rather than
 *    imported with holes.
 *
 * Validation is complete before anything is written. The alternative — failing
 * partway through a restore — leaves a log that is neither the old one nor the
 * new one, which is the worst outcome available.
 */

const KINDS = new Set(["strength", "wod"]);
const FORMATS = new Set([
  "sets", "for_time", "amrap", "emom", "intervals", "chipper", "max_effort", "other",
]);
const SCORE_TYPES = new Set(["load", "time", "reps", "rounds_reps", "distance", "none"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ParseResult =
  | { ok: true; doc: ExportDoc; version: number }
  | { ok: false; errors: string[] };

/** Parses and fully validates a backup file. Never touches the database. */
export function parseBackup(text: string): ParseResult {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch (e: any) {
    return { ok: false, errors: [`Not valid JSON: ${e?.message ?? e}`] };
  }

  const errors: string[] = [];
  const at = (path: string, msg: string) => errors.push(`${path}: ${msg}`);

  if (raw?.app !== "chalk") {
    return { ok: false, errors: ["This is not a Chalk backup."] };
  }
  const version = Number(raw.version);
  if (!Number.isFinite(version) || version < 1) {
    return { ok: false, errors: ["Missing or unreadable version."] };
  }
  if (version > EXPORT_VERSION) {
    return {
      ok: false,
      errors: [
        `Made by a newer version of Chalk (file is v${version}, this build reads up to v${EXPORT_VERSION}).`,
      ],
    };
  }

  if (raw.customMovements != null && !Array.isArray(raw.customMovements)) {
    at("customMovements", "expected a list");
  }
  for (const [i, m] of (raw.customMovements ?? []).entries?.() ?? []) {
    if (typeof m?.name !== "string" || !m.name.trim()) at(`customMovements[${i}]`, "missing name");
  }

  if (!Array.isArray(raw.sessions)) {
    return { ok: false, errors: ["Missing sessions."] };
  }

  for (const [si, s] of raw.sessions.entries()) {
    const sp = `sessions[${si}]`;
    if (typeof s?.date !== "string" || !ISO_DATE.test(s.date)) {
      at(sp, "date must be YYYY-MM-DD");
    }
    if (!Array.isArray(s?.blocks)) {
      at(sp, "missing blocks");
      continue;
    }
    for (const [bi, b] of s.blocks.entries()) {
      const bp = `${sp}.blocks[${bi}]`;
      if (!KINDS.has(b?.kind)) at(bp, `unknown kind "${b?.kind}"`);
      if (!FORMATS.has(b?.format)) at(bp, `unknown format "${b?.format}"`);
      // Invariant 1.
      if (typeof b?.rawText !== "string" || !b.rawText.trim()) {
        at(bp, "missing the workout text");
      }
      const type = b?.score?.type;
      if (type != null && !SCORE_TYPES.has(type)) at(bp, `unknown score type "${type}"`);
      if (b?.score?.value != null && !Number.isInteger(b.score.value)) {
        // Invariant 2.
        at(bp, "score value must be a whole number");
      }
      for (const field of ["rounds", "durationMin", "everyMin"] as const) {
        const v = b?.shape?.[field];
        if (v != null && (!Number.isInteger(v) || v < 1)) {
          at(bp, `${field} must be a whole number of at least 1`);
        }
      }
      if (b?.movements != null && !Array.isArray(b.movements)) at(bp, "movements must be a list");
      for (const [mi, m] of (b?.movements ?? []).entries()) {
        if (typeof m?.slug !== "string" || !m.slug.trim()) {
          at(`${bp}.movements[${mi}]`, "missing slug");
        }
        for (const field of ["loadG", "reps", "distanceM", "durationSec", "calories"]) {
          if (m?.[field] != null && !Number.isInteger(m[field])) {
            at(`${bp}.movements[${mi}]`, `${field} must be a whole number`);
          }
        }
      }
    }
  }

  if (errors.length) return { ok: false, errors: errors.slice(0, 20) };
  return { ok: true, doc: raw as ExportDoc, version };
}

export type ImportSummary = {
  sessions: number;
  blocks: number;
  sets: number;
  movementsCreated: number;
};

/**
 * Replaces the log with the contents of the backup.
 *
 * Deliberately a restore, not a merge. Merging would need to decide whether a
 * session on the same date is the same session, and getting that wrong
 * silently duplicates history. A backup answers "put it back how it was".
 */
export async function importBackup(db: DB, doc: ExportDoc): Promise<ImportSummary> {
  const slugToId = await resolveSlugs(db, doc);
  const movementsCreated = slugToId.created;

  // Blocks and block_movements cascade from sessions; prs cascades too and is
  // rebuilt at the end regardless.
  await db.delete(sessions);
  await db.delete(prs);

  let blockCount = 0;
  let setCount = 0;

  for (const s of doc.sessions) {
    const [session] = await db
      .insert(sessions)
      .values({ date: s.date, label: s.label ?? null, notes: s.notes ?? null })
      .returning();

    for (const [position, b] of (s.blocks ?? []).entries()) {
      const [block] = await db
        .insert(blocks)
        .values({
          sessionId: session.id,
          position: b.position ?? position,
          kind: b.kind,
          title: b.title ?? null,
          benchmarkId: benchmarkIdFor(b.benchmark, slugToId.map),
          rawText: b.rawText,
          format: b.format as any,
          // Absent in v1 and v2 files, and on anything hand-edited. The header
          // line survives in rawText either way, so a missing shape costs the
          // log form its pre-lit chips and nothing more.
          rounds: b.shape?.rounds ?? null,
          durationMin: b.shape?.durationMin ?? null,
          everyMin: b.shape?.everyMin ?? null,
          scoreType: (b.score?.type ?? "none") as any,
          scoreValue: b.score?.value ?? null,
          scoreRounds: b.score?.rounds ?? null,
          scoreReps: b.score?.reps ?? null,
          capped: !!b.score?.capped,
          feel: b.feel ?? null,
          timeCapSec: b.timeCapSec ?? null,
          notes: b.notes ?? null,
        })
        .returning();
      blockCount++;

      const rows = (b.movements ?? [])
        .map((m, i) => {
          const movementId = slugToId.map.get(m.slug);
          if (movementId == null) return null;
          return {
            blockId: block.id,
            movementId,
            position: i,
            setNumber: m.setNumber ?? null,
            loadG: m.loadG ?? null,
            reps: m.reps ?? null,
            distanceM: m.distanceM ?? null,
            durationSec: m.durationSec ?? null,
            calories: m.calories ?? null,
            isWarmup: !!m.isWarmup,
            isFailed: !!m.isFailed,
            note: m.note ?? null,
          };
        })
        .filter(Boolean) as (typeof blockMovements.$inferInsert)[];

      if (rows.length) {
        await db.insert(blockMovements).values(rows);
        setCount += rows.length;
      }
    }
  }

  // Invariant 3: records are derived, never restored.
  await rebuildAllPrs(db);

  return {
    sessions: doc.sessions.length,
    blocks: blockCount,
    sets: setCount,
    movementsCreated,
  };
}

/** v1 stored a bare display name; v2 stores { slug, name }. */
function benchmarkIdFor(
  ref: { slug: string; name: string } | string | null | undefined,
  map: Map<string, number>,
): number | null {
  if (!ref) return null;
  if (typeof ref === "string") return map.get(slugify(ref)) ?? null;
  return map.get(ref.slug) ?? null;
}

/**
 * Every movement slug the file mentions, mapped to a row in this database —
 * creating the ones this install has never seen, so a backup written on
 * another phone restores complete.
 */
async function resolveSlugs(db: DB, doc: ExportDoc) {
  const wanted = new Map<string, string>(); // slug -> display name, created if absent
  const lookupOnly = new Set<string>(); // resolved if present, never invented

  for (const m of doc.customMovements ?? []) {
    if (m?.slug) wanted.set(m.slug, m.name);
  }
  for (const s of doc.sessions ?? []) {
    for (const b of s.blocks ?? []) {
      // A benchmark is looked up, never created. Inventing a "Fran" that is
      // not the real one would silently break every search that relies on it.
      // v1 files carry a bare display name, so fall back to slugifying it.
      const bench = b.benchmark as any;
      if (typeof bench === "string") lookupOnly.add(slugify(bench));
      else if (bench?.slug) lookupOnly.add(bench.slug);

      for (const m of b.movements ?? []) wanted.set(m.slug, m.name ?? m.slug);
    }
  }

  const slugs = [...new Set([...wanted.keys(), ...lookupOnly])];
  if (!slugs.length) return { map: new Map<string, number>(), created: 0 };
  const existing = await db
    .select({ id: movements.id, slug: movements.slug })
    .from(movements)
    .where(inArray(movements.slug, slugs));

  const map = new Map<string, number>(
    existing.map((r: { slug: string; id: number }) => [r.slug, r.id]),
  );

  let created = 0;
  for (const [slug, name] of wanted) {
    if (map.has(slug)) continue;
    const custom = (doc.customMovements ?? []).find((m) => m.slug === slug);
    const [row] = await db
      .insert(movements)
      .values({
        name: tidyName(name || slug),
        slug: await uniqueSlug(db, slug),
        kind: "movement",
        modality: (custom?.modality ?? null) as any,
        pattern: custom?.pattern ?? null,
        aliases: Array.isArray(custom?.aliases) ? custom!.aliases : [],
        isCustom: true,
      })
      .returning();
    map.set(slug, row.id);
    created++;
  }

  return { map, created };
}

/** What a restore is about to replace, for the confirmation prompt. */
export async function currentLogSize(db: DB): Promise<{ sessions: number; blocks: number }> {
  const s = await db.select({ id: sessions.id }).from(sessions);
  const b = await db.select({ id: blocks.id }).from(blocks);
  return { sessions: s.length, blocks: b.length };
}
