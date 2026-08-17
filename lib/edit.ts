import { asc, eq } from "drizzle-orm";
import { db } from "./db";
import { blockMovements, blocks, movements, sessions } from "../db/schema";
import type { Draft, DraftMovement, DraftSet } from "./draft";
import { gramsToBuffer, secondsToBuffer } from "./entry";
import { isDistanceMovement } from "./inputs";
import type { Unit } from "../db/score";

/**
 * Rebuilds an editable draft from a saved block, along with the keypad buffers
 * so every field redisplays the value that is actually stored.
 *
 * `rawTextDirty` is set true on purpose. The verbatim text is the source of
 * truth (invariant 1) and must survive an edit untouched unless the user
 * deliberately rewrites it — regenerating it from the structured fields could
 * quietly discard something typed by hand months ago.
 */
export async function draftFromBlock(
  blockId: number,
  unit: Unit,
): Promise<{ draft: Draft; buffers: Record<string, string> } | null> {
  const [block] = await db.select().from(blocks).where(eq(blocks.id, blockId));
  if (!block) return null;

  const [session] = await db
    .select({ date: sessions.date })
    .from(sessions)
    .where(eq(sessions.id, block.sessionId));
  if (!session) return null;

  const rows = await db
    .select({
      movementId: blockMovements.movementId,
      name: movements.name,
      modality: movements.modality,
      defaultScoreType: movements.defaultScoreType,
      setNumber: blockMovements.setNumber,
      loadG: blockMovements.loadG,
      reps: blockMovements.reps,
      distanceM: blockMovements.distanceM,
      calories: blockMovements.calories,
      isWarmup: blockMovements.isWarmup,
      isFailed: blockMovements.isFailed,
    })
    .from(blockMovements)
    .innerJoin(movements, eq(movements.id, blockMovements.movementId))
    .where(eq(blockMovements.blockId, blockId))
    .orderBy(asc(blockMovements.position), asc(blockMovements.setNumber));

  const [benchmark] = block.benchmarkId
    ? await db
        .select({ name: movements.name, prescription: movements.prescription })
        .from(movements)
        .where(eq(movements.id, block.benchmarkId))
    : [];

  const buffers: Record<string, string> = {};
  let n = 0;
  const key = () => `e${++n}`;

  const setRows = rows.filter((r: { setNumber: number | null }) => r.setNumber != null);
  const movementRows = rows.filter((r: { setNumber: number | null }) => r.setNumber == null);

  const sets: DraftSet[] = setRows.map((r: any) => {
    const k = key();
    buffers[`set:${k}:reps`] = r.reps != null ? String(r.reps) : "";
    buffers[`set:${k}:load`] = gramsToBuffer(r.loadG, unit);
    return {
      key: k,
      reps: r.reps,
      loadG: r.loadG,
      isWarmup: !!r.isWarmup,
      isFailed: !!r.isFailed,
    };
  });

  const draftMovements: DraftMovement[] = movementRows.map((r: any) => {
    const k = key();
    const shape = { modality: r.modality, defaultScoreType: r.defaultScoreType };
    if (isDistanceMovement(shape)) {
      buffers[`mov:${k}:distance`] = r.distanceM != null ? String(r.distanceM) : "";
      buffers[`mov:${k}:calories`] = r.calories != null ? String(r.calories) : "";
    } else {
      buffers[`mov:${k}:reps`] = r.reps != null ? String(r.reps) : "";
      buffers[`mov:${k}:load`] = gramsToBuffer(r.loadG, unit);
    }
    return {
      key: k,
      movementId: r.movementId,
      name: r.name,
      modality: r.modality,
      defaultScoreType: r.defaultScoreType,
      reps: r.reps,
      loadG: r.loadG,
      distanceM: r.distanceM,
      calories: r.calories,
    };
  });

  const numBuf = (n: number | null) => (n != null ? String(n) : "");
  buffers["shape:rounds"] = numBuf(block.rounds);
  buffers["shape:duration"] = numBuf(block.durationMin);
  buffers["shape:every"] = numBuf(block.everyMin);

  if (block.scoreType === "rounds_reps") {
    buffers.rounds = block.scoreRounds != null ? String(block.scoreRounds) : "";
    buffers.reps = block.scoreReps != null ? String(block.scoreReps) : "";
  } else if (block.scoreType === "time") {
    buffers.score = secondsToBuffer(block.scoreValue);
  } else if (block.scoreType === "load") {
    buffers.score = gramsToBuffer(block.scoreValue, unit);
  } else if (block.scoreValue != null) {
    buffers.score = String(block.scoreValue);
  }

  const draft: Draft = {
    date: session.date,
    kind: block.kind,
    format: block.format,
    title: block.title ?? "",
    rawText: block.rawText,
    rawTextDirty: true,
    benchmarkId: block.benchmarkId,
    benchmarkName: benchmark?.name ?? null,
    benchmarkPrescription: benchmark?.prescription ?? null,
    strengthMovementId: setRows[0]?.movementId ?? null,
    strengthMovementName: setRows[0]?.name ?? null,
    sets: sets.length
      ? sets
      : [{ key: key(), reps: null, loadG: null, isWarmup: false, isFailed: false }],
    gridOpen: sets.length > 1,
    movements: draftMovements,
    rounds: block.rounds,
    durationMin: block.durationMin,
    everyMin: block.everyMin,
    scoreType: block.scoreType,
    scoreValue: block.scoreValue,
    scoreRounds: block.scoreRounds,
    scoreReps: block.scoreReps,
    capped: !!block.capped,
    feel: block.feel,
    notes: block.notes ?? "",
  };

  return { draft, buffers };
}
