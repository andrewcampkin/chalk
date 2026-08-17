import { eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { blockMovements, blocks, movements, prs, sessions } from "../db/schema";
import { rebuildAllPrs, recomputePrsForBlock } from "../db/queries";
import { todayIso } from "./dates";
import { BENCHMARK_COMPONENTS } from "../db/seed";
import { generateRawText, generateTitle, type Draft } from "./draft";
import type { Unit } from "../db/score";

export type SavedPr = {
  movementId: number;
  name: string;
  scoreType: string;
  repScheme: string;
  value: number;
  previousValue: number | null;
};

/**
 * Writes a draft as one block, attached to the session for that date (created
 * on demand — two-a-days append to the same day rather than making a second
 * session, which is what "add another block" means in practice).
 *
 * Returns any records the block set, so the log screen can show the PR moment
 * at the instant it happens rather than making the user go looking.
 */
export async function saveDraft(
  draft: Draft,
  unit: Unit,
  editingBlockId?: number | null,
): Promise<{ sessionId: number; blockId: number; newPrs: SavedPr[] }> {
  if (editingBlockId != null) return updateBlock(draft, unit, editingBlockId);

  const sessionId = await findOrCreateSession(draft.date);

  const existing = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(eq(blocks.sessionId, sessionId));

  const rawText = draft.rawTextDirty
    ? draft.rawText
    : generateRawText(draft, unit);

  const [block] = await db
    .insert(blocks)
    .values({
      sessionId,
      position: existing.length,
      kind: draft.kind,
      title: generateTitle(draft),
      benchmarkId: draft.benchmarkId,
      // Invariant 1: never store an empty verbatim record.
      rawText: rawText.trim() || generateTitle(draft),
      format: draft.format,
      ...shapeColumns(draft),
      scoreType: draft.scoreType,
      scoreValue: draft.scoreValue,
      scoreRounds: draft.scoreRounds,
      scoreReps: draft.scoreReps,
      capped: draft.capped,
      feel: draft.feel,
      notes: draft.notes.trim() || null,
    })
    .returning();

  await writeMovementRows(block.id, draft);

  // A backdated block lands out of order, so an incremental recompute would
  // record a "previous best" that was actually set later. rebuildAllPrs walks
  // the whole history in date order and gets the chronology right. The cache is
  // small and this only happens when logging a day other than today.
  if (draft.date !== todayIso()) {
    await rebuildAllPrs(db);
  } else {
    await recomputePrsForBlock(db, block.id);
  }

  const set = await db
    .select({
      movementId: prs.movementId,
      name: movements.name,
      scoreType: prs.scoreType,
      repScheme: prs.repScheme,
      value: prs.value,
      previousValue: prs.previousValue,
    })
    .from(prs)
    .innerJoin(movements, eq(movements.id, prs.movementId))
    .where(eq(prs.blockId, block.id));

  return { sessionId, blockId: block.id, newPrs: set as SavedPr[] };
}

/**
 * Rewrites an existing block in place.
 *
 * The sets are deleted and reinserted rather than diffed — a block is small,
 * and reconciling row-by-row is a lot of surface area for the chance of
 * leaving an orphan behind.
 *
 * PRs are always fully rebuilt. An edit can lower a value that currently holds
 * a record, and no incremental comparison can detect that (invariant 3): the
 * cache has to be reconstructed from what the blocks now say. Moving the block
 * to a different date needs the same treatment, since record chronology
 * depends on the order.
 */
async function updateBlock(draft: Draft, unit: Unit, blockId: number) {
  const [existing] = await db.select().from(blocks).where(eq(blocks.id, blockId));
  if (!existing) throw new Error("That block no longer exists.");

  const sessionId = await findOrCreateSession(draft.date);
  const rawText = draft.rawTextDirty ? draft.rawText : generateRawText(draft, unit);

  await db
    .update(blocks)
    .set({
      sessionId,
      kind: draft.kind,
      title: generateTitle(draft),
      benchmarkId: draft.benchmarkId,
      rawText: rawText.trim() || generateTitle(draft),
      format: draft.format,
      ...shapeColumns(draft),
      scoreType: draft.scoreType,
      scoreValue: draft.scoreValue,
      scoreRounds: draft.scoreRounds,
      scoreReps: draft.scoreReps,
      capped: draft.capped,
      feel: draft.feel,
      notes: draft.notes.trim() || null,
    })
    .where(eq(blocks.id, blockId));

  await db.delete(blockMovements).where(eq(blockMovements.blockId, blockId));
  await writeMovementRows(blockId, draft);
  await rebuildAllPrs(db);

  // Tidy up a session left with no blocks after the edit moved its only one.
  if (existing.sessionId !== sessionId) await deleteSessionIfEmpty(existing.sessionId);

  const newPrs = await db
    .select({
      movementId: prs.movementId,
      name: movements.name,
      scoreType: prs.scoreType,
      repScheme: prs.repScheme,
      value: prs.value,
      previousValue: prs.previousValue,
    })
    .from(prs)
    .innerJoin(movements, eq(movements.id, prs.movementId))
    .where(eq(prs.blockId, blockId));

  return { sessionId, blockId, newPrs: newPrs as SavedPr[] };
}

/**
 * The structured echo of the header line — "5 rounds", "20 min", "E2MOM".
 * Written so that reopening a block redisplays the stages as they were
 * answered; `raw_text` reads well but cannot be parsed back reliably.
 *
 * Only a WOD has a shape. A strength block's structure is its set rows.
 */
function shapeColumns(draft: Draft) {
  if (draft.kind !== "wod") {
    return { rounds: null, durationMin: null, everyMin: null };
  }
  return {
    rounds: draft.rounds,
    durationMin: draft.durationMin,
    everyMin: draft.everyMin,
  };
}

async function deleteSessionIfEmpty(sessionId: number) {
  const remaining = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(eq(blocks.sessionId, sessionId));
  if (!remaining.length) await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Removes a single block, leaving the rest of the session intact. */
export async function deleteBlock(blockId: number) {
  const [block] = await db.select().from(blocks).where(eq(blocks.id, blockId));
  if (!block) return;
  await db.delete(blocks).where(eq(blocks.id, blockId));
  await deleteSessionIfEmpty(block.sessionId);
  await rebuildAllPrs(db);
}

async function findOrCreateSession(date: string): Promise<number> {
  const [found] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.date, date));
  if (found) return found.id;

  const [created] = await db.insert(sessions).values({ date }).returning();
  return created.id;
}

/**
 * One row per set for strength; one row per movement for a WOD.
 *
 * A logged benchmark also writes rows for its component movements, which is the
 * whole reason searching "thruster" finds every Fran. Components that the user
 * already tagged by hand are not duplicated.
 */
async function writeMovementRows(blockId: number, draft: Draft) {
  const rows: (typeof blockMovements.$inferInsert)[] = [];

  if (draft.kind === "strength" && draft.strengthMovementId != null) {
    let n = 0;
    for (const s of draft.sets) {
      if (s.loadG == null && s.reps == null) continue;
      rows.push({
        blockId,
        movementId: draft.strengthMovementId,
        position: 0,
        setNumber: ++n,
        loadG: s.loadG,
        reps: s.reps,
        isWarmup: s.isWarmup,
        isFailed: s.isFailed,
      });
    }
  }

  draft.movements.forEach((m, i) => {
    rows.push({
      blockId,
      movementId: m.movementId,
      position: i,
      setNumber: null,
      loadG: m.loadG,
      reps: m.reps,
      distanceM: m.distanceM,
      calories: m.calories,
    });
  });

  const tagged = new Set(rows.map((r) => r.movementId));

  if (draft.benchmarkId != null) {
    for (const extra of await benchmarkComponentIds(draft.benchmarkId)) {
      if (tagged.has(extra)) continue;
      tagged.add(extra);
      rows.push({
        blockId,
        movementId: extra,
        position: rows.length,
        setNumber: null,
      });
    }
  }

  if (rows.length) await db.insert(blockMovements).values(rows);
}

/** Resolve a benchmark's declared component slugs to movement ids. */
export async function benchmarkComponentIds(benchmarkId: number): Promise<number[]> {
  const [bench] = await db
    .select({ slug: movements.slug })
    .from(movements)
    .where(eq(movements.id, benchmarkId));
  if (!bench) return [];

  const slugs = BENCHMARK_COMPONENTS[bench.slug];
  if (!slugs?.length) return [];

  const rows = await db
    .select({ id: movements.id })
    .from(movements)
    .where(inArray(movements.slug, slugs));
  return rows.map((r) => r.id);
}

/**
 * Movements used most recently — the one-tap chips on the log screen.
 *
 * Gyms run cycles, so this week's squat day looks like last week's. Ordering by
 * last-seen then frequency is what gets an AMRAP logged in five taps.
 */
export async function recentMovementChips(limit = 10) {
  return db.all<{
    id: number;
    name: string;
    modality: string | null;
    defaultScoreType: string | null;
  }>(sql`
    select m.id as id,
           m.name as name,
           m.modality as modality,
           m.default_score_type as defaultScoreType
    from block_movements bm
    join movements m on m.id = bm.movement_id
    join blocks b    on b.id = bm.block_id
    join sessions s  on s.id = b.session_id
    where m.kind = 'movement' and m.archived_at is null
    group by m.id
    order by max(s.date) desc, count(*) desc
    limit ${limit}
  `);
}
