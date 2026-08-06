import { asc, eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { blockMovements, blocks, movements, sessions } from "../db/schema";

type DB = BaseSQLiteDatabase<any, any, any>;

/**
 * 1 — original.
 * 2 — `benchmark` became { slug, name } instead of a bare display name. The
 *     slug is the stable machine key; a display name can be edited, and a
 *     restore that silently failed to re-tag Fran would be worse than one that
 *     refused to run. Import still accepts version 1.
 */
export const EXPORT_VERSION = 2;

/**
 * The backup format.
 *
 * Nested and self-describing on purpose: this is the file you open in three
 * years, possibly without the app, and it has to be readable on its own. Every
 * movement reference therefore carries its slug and display name rather than a
 * bare foreign key.
 *
 * `prs` is deliberately absent. It is a cache (invariant 3) and rebuilding it
 * from these rows is the point — exporting it would create a second source of
 * truth that could disagree with the blocks it came from.
 */
export type ExportDoc = {
  app: "chalk";
  version: number;
  exportedAt: string;
  counts: { sessions: number; blocks: number; sets: number; customMovements: number };
  /** Only the user's own additions — the 156 seeded rows ship with the app. */
  customMovements: {
    slug: string;
    name: string;
    modality: string | null;
    pattern: string | null;
    aliases: string[];
  }[];
  sessions: ExportSession[];
};

export type ExportSession = {
  date: string;
  label: string | null;
  notes: string | null;
  blocks: ExportBlock[];
};

export type ExportBlock = {
  position: number;
  kind: "strength" | "wod";
  title: string | null;
  benchmark: { slug: string; name: string } | null;
  /** Invariant 1: the verbatim record. The one field that must never be lost. */
  rawText: string;
  format: string;
  score: {
    type: string;
    value: number | null;
    rounds: number | null;
    reps: number | null;
    capped: boolean;
  };
  feel: number | null;
  timeCapSec: number | null;
  notes: string | null;
  movements: {
    slug: string;
    name: string;
    setNumber: number | null;
    loadG: number | null;
    reps: number | null;
    distanceM: number | null;
    durationSec: number | null;
    calories: number | null;
    isWarmup: boolean;
    isFailed: boolean;
    note: string | null;
  }[];
};

/**
 * Reads the whole log into one document. Pure data access, no Expo modules, so
 * it can be tested against a real database.
 */
export async function buildExportDoc(db: DB, now = new Date()): Promise<ExportDoc> {
  const sessionRows = await db.select().from(sessions).orderBy(asc(sessions.date), asc(sessions.id));
  const blockRows = await db.select().from(blocks).orderBy(asc(blocks.sessionId), asc(blocks.position));
  const setRows = await db
    .select({
      blockId: blockMovements.blockId,
      slug: movements.slug,
      name: movements.name,
      position: blockMovements.position,
      setNumber: blockMovements.setNumber,
      loadG: blockMovements.loadG,
      reps: blockMovements.reps,
      distanceM: blockMovements.distanceM,
      durationSec: blockMovements.durationSec,
      calories: blockMovements.calories,
      isWarmup: blockMovements.isWarmup,
      isFailed: blockMovements.isFailed,
      note: blockMovements.note,
    })
    .from(blockMovements)
    .innerJoin(movements, eq(movements.id, blockMovements.movementId))
    .orderBy(asc(blockMovements.position), asc(blockMovements.setNumber));

  const allMovements = await db.select().from(movements);
  const refById = new Map<number, { slug: string; name: string }>(
    allMovements.map((m: any) => [m.id, { slug: m.slug, name: m.name }]),
  );

  const setsByBlock = new Map<number, any[]>();
  for (const r of setRows) {
    const list = setsByBlock.get(r.blockId) ?? [];
    list.push(r);
    setsByBlock.set(r.blockId, list);
  }

  const blocksBySession = new Map<number, any[]>();
  for (const b of blockRows) {
    const list = blocksBySession.get(b.sessionId) ?? [];
    list.push(b);
    blocksBySession.set(b.sessionId, list);
  }

  const exported: ExportSession[] = sessionRows.map((s: any) => ({
    date: s.date,
    label: s.label,
    notes: s.notes,
    blocks: (blocksBySession.get(s.id) ?? []).map(
      (b: any): ExportBlock => ({
        position: b.position,
        kind: b.kind,
        title: b.title,
        benchmark: b.benchmarkId != null ? (refById.get(b.benchmarkId) ?? null) : null,
        rawText: b.rawText,
        format: b.format,
        score: {
          type: b.scoreType,
          value: b.scoreValue,
          rounds: b.scoreRounds,
          reps: b.scoreReps,
          capped: !!b.capped,
        },
        feel: b.feel,
        timeCapSec: b.timeCapSec,
        notes: b.notes,
        movements: (setsByBlock.get(b.id) ?? []).map((m: any) => ({
          slug: m.slug,
          name: m.name,
          setNumber: m.setNumber,
          loadG: m.loadG,
          reps: m.reps,
          distanceM: m.distanceM,
          durationSec: m.durationSec,
          calories: m.calories,
          isWarmup: !!m.isWarmup,
          isFailed: !!m.isFailed,
          note: m.note,
        })),
      }),
    ),
  }));

  const custom = allMovements.filter((m: any) => m.isCustom);

  return {
    app: "chalk",
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    counts: {
      sessions: sessionRows.length,
      blocks: blockRows.length,
      sets: setRows.length,
      customMovements: custom.length,
    },
    customMovements: custom.map((m: any) => ({
      slug: m.slug,
      name: m.name,
      modality: m.modality,
      pattern: m.pattern,
      aliases: Array.isArray(m.aliases) ? m.aliases : [],
    })),
    sessions: exported,
  };
}

/** chalk-2026-08-06.json */
export function exportFilename(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `chalk-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
