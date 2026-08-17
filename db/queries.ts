import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { blockMovements, blocks, movements, prs, sessions } from "./schema";
import { isBetter, higherIsBetter } from "./score";

type DB = BaseSQLiteDatabase<any, any, any>;

/* -------------------------------------------------------------------------- */
/* 1. find sessions by movement name — the headline feature                    */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a typed string to movement ids, matching on name and on aliases.
 * Aliases live in a JSON column, so the LIKE runs against the serialised array;
 * good enough at this table size (a few hundred rows) and it avoids a second
 * table for two-letter shorthands.
 */
export async function resolveMovements(db: DB, term: string, limit = 20) {
  const trimmed = term.trim().toLowerCase();
  if (!trimmed) return [];
  const needle = `%${trimmed}%`;
  const rows = await db
    .select()
    .from(movements)
    .where(
      and(
        isNull(movements.archivedAt),
        or(
          like(sql`lower(${movements.name})`, needle),
          like(sql`lower(${movements.aliases})`, needle),
        ),
      ),
    )
    .limit(limit * 3);

  // Prefix matches first — typing "sna" should offer Snatch before Snatch Balance
  // and long before Hang Power Snatch.
  return rows
    .sort((a, b) => rank(a.name, trimmed) - rank(b.name, trimmed))
    .slice(0, limit);
}

function rank(name: string, term: string): number {
  const n = name.toLowerCase();
  if (n === term) return 0;
  if (n.startsWith(term)) return 1;
  if (n.includes(` ${term}`)) return 2;
  return 3;
}

/**
 * Every block that contains this movement, newest first, with its session and
 * the load actually used. This is the "what have I done recently" screen.
 */
export async function blocksForMovement(db: DB, movementId: number, limit = 100) {
  return db
    .select({
      blockId: blocks.id,
      sessionId: blocks.sessionId,
      date: sessions.date,
      kind: blocks.kind,
      title: blocks.title,
      rawText: blocks.rawText,
      format: blocks.format,
      scoreType: blocks.scoreType,
      scoreValue: blocks.scoreValue,
      scoreRounds: blocks.scoreRounds,
      scoreReps: blocks.scoreReps,
      capped: blocks.capped,
      feel: blocks.feel,
      /** Heaviest working set of this movement in the block. */
      topLoadG: sql<number | null>`max(
        case when ${blockMovements.isWarmup} = 0 and ${blockMovements.isFailed} = 0
        then ${blockMovements.loadG} end
      )`,
      topReps: sql<number | null>`max(
        case when ${blockMovements.isWarmup} = 0 and ${blockMovements.isFailed} = 0
        then ${blockMovements.reps} end
      )`,
    })
    .from(blockMovements)
    .innerJoin(blocks, eq(blocks.id, blockMovements.blockId))
    .innerJoin(sessions, eq(sessions.id, blocks.sessionId))
    .where(eq(blockMovements.movementId, movementId))
    .groupBy(blocks.id)
    .orderBy(desc(sessions.date), desc(blocks.position))
    .limit(limit);
}

/**
 * FTS5 treats bare punctuation as query syntax, so an untouched "pull-up"
 * parses as a column filter and throws `no such column: up`. Every user term
 * gets split on non-word characters and re-quoted as a phrase.
 */
export function ftsQuery(term: string): string {
  const tokens = term.trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!tokens.length) return "";
  return tokens.map((t) => `"${t}"`).join(" ");
}

/**
 * Free-text fallback across the verbatim workout text, for anything that was
 * logged before it had a movement tag. Requires the FTS5 virtual table from
 * migrations/0001_fts.sql.
 */
export async function searchRawText(db: DB, term: string, limit = 50) {
  const match = ftsQuery(term);
  if (!match) return [];
  return db.all<{ blockId: number; sessionId: number; date: string; snippet: string }>(sql`
    select b.id as blockId, b.session_id as sessionId, s.date as date,
           snippet(blocks_fts, 0, '[', ']', '…', 12) as snippet
    from blocks_fts
    join blocks b on b.rowid = blocks_fts.rowid
    join sessions s on s.id = b.session_id
    where blocks_fts match ${match}
    order by s.date desc
    limit ${limit}
  `);
}

/* -------------------------------------------------------------------------- */
/* 2. PR derivation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Rep maxes for one movement: the heaviest completed set at each rep count,
 * and the date THAT set happened.
 *
 * The date must be correlated with the winning load, not aggregated alongside
 * it — a plain `max(date)` reports the most recent session for the rep count,
 * which stamps a January PR with a June date.
 *
 * Strength blocks only (invariant 11). Twenty-one thrusters at 43kg in a Fran
 * is prescribed volume, not an attempt at a 21-rep max — counting it would put
 * a rep max on this screen that the records screen refuses to show, and the two
 * would disagree.
 */
export async function repMaxes(db: DB, movementId: number) {
  return db.all<{ reps: number; loadG: number; date: string; blockId: number }>(sql`
    select bm.reps          as reps,
           bm.load_g        as loadG,
           s.date           as date,
           b.id             as blockId
    from block_movements bm
    join blocks b   on b.id = bm.block_id
    join sessions s on s.id = b.session_id
    where bm.movement_id = ${movementId}
      and b.kind = 'strength'
      and bm.is_warmup = 0
      and bm.is_failed = 0
      and bm.load_g is not null
      and bm.reps   is not null
    group by bm.reps
    having bm.load_g = max(bm.load_g)
    order by bm.reps
  `);
}

/**
 * Top working set per session, oldest first — the progress chart.
 *
 * Carries `feel` so each point can be coloured by how that day went. A load
 * that stopped moving while the rating slid is a different problem from one
 * that stalled while everything still felt fine.
 *
 * Strength blocks only (invariant 11), for the same reason as repMaxes. A
 * metcon thruster at 43kg plotted against strength thrusters at 80kg is not a
 * dip in progress, it is a different question — and it would make the line
 * unreadable.
 */
export async function topSetsOverTime(db: DB, movementId: number, limit = 200) {
  return db.all<{
    date: string;
    loadG: number;
    reps: number | null;
    feel: number | null;
  }>(sql`
    select s.date          as date,
           max(bm.load_g)  as loadG,
           bm.reps         as reps,
           b.feel          as feel
    from block_movements bm
    join blocks b   on b.id = bm.block_id
    join sessions s on s.id = b.session_id
    where bm.movement_id = ${movementId}
      and b.kind = 'strength'
      and bm.is_warmup = 0 and bm.is_failed = 0
      and bm.load_g is not null
    group by b.id
    order by s.date asc
    limit ${limit}
  `);
}

type Candidate = {
  movementId: number;
  scoreType: "load" | "time" | "reps" | "rounds_reps" | "distance";
  repScheme: string;
  value: number;
  secondary: number | null;
};

function candidatesForBlock(
  block: typeof blocks.$inferSelect,
  sets: (typeof blockMovements.$inferSelect)[],
): Candidate[] {
  const out: Candidate[] = [];

  // Invariant 11: a load record can only come from strength work. A WOD's one
  // contribution is the benchmark result below.
  if (block.kind === "strength") {
    for (const set of sets) {
      if (set.isWarmup || set.isFailed) continue;
      if (set.loadG == null || set.reps == null) continue;
      out.push({
        movementId: set.movementId,
        scoreType: "load",
        repScheme: String(set.reps),
        value: set.loadG,
        secondary: null,
      });
    }
  }

  if (
    block.benchmarkId != null &&
    block.scoreValue != null &&
    block.scoreType !== "none" &&
    !block.capped
  ) {
    out.push({
      movementId: block.benchmarkId,
      scoreType: block.scoreType,
      repScheme: block.format === "amrap" ? "amrap" : "best",
      value: block.scoreValue,
      secondary: block.scoreRounds ?? null,
    });
  }

  return out;
}

/**
 * Recompute the cached records touched by one block. Call after every write.
 *
 * A block that previously HELD a record has to be handled by rebuilding rather
 * than comparing: if a 200kg typo is corrected to 20kg, comparing the new value
 * against the old record leaves the phantom 200kg on file forever. The prs
 * table is a cache, so falling back to a rebuild is always safe.
 */
export async function recomputePrsForBlock(db: DB, blockId: number) {
  const [block] = await db.select().from(blocks).where(eq(blocks.id, blockId));
  if (!block) {
    await rebuildAllPrs(db);
    return;
  }

  const held = await db.select().from(prs).where(eq(prs.blockId, blockId));
  const sets = await db
    .select()
    .from(blockMovements)
    .where(eq(blockMovements.blockId, blockId));
  const candidates = candidatesForBlock(block, sets);

  // If this block owns a record that its current contents no longer justify,
  // the cached value is stale in a direction a comparison cannot detect.
  const stale = held.some((h: typeof prs.$inferSelect) => {
    const match = candidates.find(
      (c) =>
        c.movementId === h.movementId &&
        c.scoreType === h.scoreType &&
        c.repScheme === h.repScheme,
    );
    return !match || match.value !== h.value;
  });
  if (stale) {
    await rebuildAllPrs(db);
    return;
  }

  const [session] = await db
    .select({ date: sessions.date })
    .from(sessions)
    .where(eq(sessions.id, block.sessionId));
  if (!session) return;

  for (const c of candidates) {
    await applyCandidate(db, c, session.date, block.id);
  }
}

async function applyCandidate(
  db: DB,
  c: Candidate,
  date: string,
  blockId: number,
) {
  const [existing] = await db
    .select()
    .from(prs)
    .where(
      and(
        eq(prs.movementId, c.movementId),
        eq(prs.scoreType, c.scoreType),
        eq(prs.repScheme, c.repScheme),
      ),
    );

  if (!isBetter(c.scoreType, c.value, existing?.value)) return;

  const row = {
    movementId: c.movementId,
    scoreType: c.scoreType,
    repScheme: c.repScheme,
    value: c.value,
    secondary: c.secondary,
    date,
    blockId,
    previousValue: existing?.value ?? null,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(prs).set(row).where(eq(prs.id, existing.id));
  } else {
    await db.insert(prs).values(row);
  }
}

/**
 * Full rebuild. Run after a delete, or after changing the rules above — the prs
 * table is a cache and must always be reconstructible from scratch.
 */
export async function rebuildAllPrs(db: DB) {
  await db.delete(prs);

  const all = await db
    .select({ id: blocks.id, date: sessions.date })
    .from(blocks)
    .innerJoin(sessions, eq(sessions.id, blocks.sessionId))
    .orderBy(sessions.date, blocks.position);

  for (const b of all) {
    const [block] = await db.select().from(blocks).where(eq(blocks.id, b.id));
    if (!block) continue;
    const sets = await db
      .select()
      .from(blockMovements)
      .where(eq(blockMovements.blockId, b.id));
    for (const c of candidatesForBlock(block, sets)) {
      await applyCandidate(db, c, b.date, b.id);
    }
  }
}

/** Records set most recently — the home screen's "what's new" strip. */
export async function recentPrs(db: DB, limit = 20) {
  return db
    .select({
      id: prs.id,
      movementId: prs.movementId,
      name: movements.name,
      scoreType: prs.scoreType,
      repScheme: prs.repScheme,
      value: prs.value,
      secondary: prs.secondary,
      previousValue: prs.previousValue,
      date: prs.date,
    })
    .from(prs)
    .innerJoin(movements, eq(movements.id, prs.movementId))
    .orderBy(desc(prs.date))
    .limit(limit);
}

/* -------------------------------------------------------------------------- */
/* 3. activity by type                                                         */
/* -------------------------------------------------------------------------- */

/** Blocks per ISO week, split strength vs WOD. Feeds the stacked bar chart. */
export async function activityByWeek(db: DB, sinceDate: string) {
  return db.all<{
    week: string;
    kind: "strength" | "wod";
    blockCount: number;
    sessionCount: number;
  }>(sql`
    select strftime('%Y-%W', s.date) as week,
           b.kind                    as kind,
           count(distinct b.id)      as blockCount,
           count(distinct s.id)      as sessionCount
    from blocks b
    join sessions s on s.id = b.session_id
    where s.date >= ${sinceDate}
    group by week, b.kind
    order by week
  `);
}

/**
 * Exposure by modality — the "am I avoiding gymnastics" view. Counts distinct
 * blocks rather than sets so a 5x5 back squat does not outweigh a whole WOD.
 */
export async function modalityMix(db: DB, sinceDate: string) {
  return db
    .select({
      modality: movements.modality,
      blockCount: sql<number>`count(distinct ${blocks.id})`,
    })
    .from(blockMovements)
    .innerJoin(movements, eq(movements.id, blockMovements.movementId))
    .innerJoin(blocks, eq(blocks.id, blockMovements.blockId))
    .innerJoin(sessions, eq(sessions.id, blocks.sessionId))
    .where(and(gte(sessions.date, sinceDate), eq(movements.kind, "movement")))
    .groupBy(movements.modality);
}

/**
 * Movements done at some point but not since `sinceDate` — the neglect list.
 *
 * Deliberately keyed on "have I ever logged this", not "do I have a record for
 * this": bodyweight and gymnastics work rarely produces a load PR, and those
 * are exactly the things quietly dropping out of the training week.
 */
export async function staleMovements(db: DB, sinceDate: string, limit = 40) {
  const recent = db
    .select({ id: blockMovements.movementId })
    .from(blockMovements)
    .innerJoin(blocks, eq(blocks.id, blockMovements.blockId))
    .innerJoin(sessions, eq(sessions.id, blocks.sessionId))
    .where(gte(sessions.date, sinceDate));

  return db.all<{ id: number; name: string; lastSeen: string; timesDone: number }>(sql`
    select m.id           as id,
           m.name         as name,
           max(s.date)    as lastSeen,
           count(*)       as timesDone
    from block_movements bm
    join movements m on m.id = bm.movement_id
    join blocks b    on b.id = bm.block_id
    join sessions s  on s.id = b.session_id
    where m.kind = 'movement'
      and m.archived_at is null
      and m.id not in (
        select bm2.movement_id
        from block_movements bm2
        join blocks b2   on b2.id = bm2.block_id
        join sessions s2 on s2.id = b2.session_id
        where s2.date >= ${sinceDate}
      )
    group by m.id
    order by lastSeen desc
    limit ${limit}
  `);
}

/* -------------------------------------------------------------------------- */
/* 4. reading sessions                                                         */
/* -------------------------------------------------------------------------- */

/** Reverse-chronological session list for the history screen. */
export async function recentSessions(db: DB, limit = 60) {
  return db.all<{
    id: number;
    date: string;
    label: string | null;
    blockCount: number;
    summary: string | null;
    feels: string | null;
    avgFeel: number | null;
  }>(sql`
    select s.id                        as id,
           s.date                      as date,
           s.label                     as label,
           count(b.id)                 as blockCount,
           group_concat(b.title, ' · ') as summary,
           group_concat(coalesce(b.feel, 0)) as feels,
           avg(b.feel)                 as avgFeel
    from sessions s
    left join blocks b on b.session_id = s.id
    group by s.id
    order by s.date desc, s.id desc
    limit ${limit}
  `);
}

/**
 * How a movement has felt over time, alongside how it went.
 *
 * The point of pairing them: a load that stopped moving while the rating slid
 * from Strong to Flat is a different story from one that stalled while it still
 * felt fine, and only one of those is a programming problem.
 */
export async function feelHistory(db: DB, movementId: number, limit = 60) {
  return db.all<{ date: string; feel: number | null; title: string | null }>(sql`
    select s.date as date, b.feel as feel, b.title as title
    from block_movements bm
    join blocks b   on b.id = bm.block_id
    join sessions s on s.id = b.session_id
    where bm.movement_id = ${movementId} and b.feel is not null
    group by b.id
    order by s.date desc
    limit ${limit}
  `);
}

export async function sessionWithBlocks(db: DB, sessionId: number) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!session) return null;

  const blockRows = await db
    .select()
    .from(blocks)
    .where(eq(blocks.sessionId, sessionId))
    .orderBy(blocks.position);

  const ids = blockRows.map((b: typeof blocks.$inferSelect) => b.id);
  const movementRows = ids.length
    ? await db
        .select({
          blockId: blockMovements.blockId,
          movementId: blockMovements.movementId,
          name: movements.name,
          setNumber: blockMovements.setNumber,
          loadG: blockMovements.loadG,
          reps: blockMovements.reps,
          isWarmup: blockMovements.isWarmup,
          isFailed: blockMovements.isFailed,
        })
        .from(blockMovements)
        .innerJoin(movements, eq(movements.id, blockMovements.movementId))
        .where(inArray(blockMovements.blockId, ids))
        .orderBy(blockMovements.position, blockMovements.setNumber)
    : [];

  return {
    session,
    blocks: blockRows.map((b: typeof blocks.$inferSelect) => ({
      ...b,
      movements: movementRows.filter(
        (m: { blockId: number }) => m.blockId === b.id,
      ),
    })),
  };
}

export async function deleteSession(db: DB, sessionId: number) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  await rebuildAllPrs(db);
}

export { higherIsBetter, notInArray };
