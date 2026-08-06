import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { rebuildAllPrs, recomputePrsForBlock, repMaxes } from "../db/queries";
import { blockMovements, blocks, movements, prs, sessions } from "../db/schema";
import { secondsToBuffer, gramsToBuffer, timeBufferToSeconds } from "../lib/entry";
import { makeTestDb, seedMovements } from "./helpers";

let db: any;

beforeEach(async () => {
  ({ db } = makeTestDb(false));
  await seedMovements(db);
});

const idOf = async (slug: string) => {
  const [m] = await db.select().from(movements).where(eq(movements.slug, slug));
  return m.id as number;
};

async function logStrength(date: string, movementId: number, loadG: number, reps: number) {
  const [s] = await db.insert(sessions).values({ date }).returning();
  const [b] = await db
    .insert(blocks)
    .values({ sessionId: s.id, kind: "strength", format: "sets", rawText: "lift", scoreType: "load" })
    .returning();
  await db.insert(blockMovements).values({ blockId: b.id, movementId, setNumber: 1, loadG, reps });
  await recomputePrsForBlock(db, b.id);
  return { sessionId: s.id, blockId: b.id };
}

/** Mirrors what updateBlock() does: rewrite the rows, then rebuild the cache. */
async function editSets(blockId: number, movementId: number, loadG: number, reps: number) {
  await db.delete(blockMovements).where(eq(blockMovements.blockId, blockId));
  await db.insert(blockMovements).values({ blockId, movementId, setNumber: 1, loadG, reps });
  await rebuildAllPrs(db);
}

describe("editing a block", () => {
  it("drops a record when the edit lowers the value that set it", async () => {
    const sn = await idOf("snatch");
    const { blockId } = await logStrength("2026-04-01", sn, 200_000, 1); // fat-fingered

    await editSets(blockId, sn, 70_000, 1);

    const [pr] = await db.select().from(prs).where(eq(prs.movementId, sn));
    expect(pr.value).toBe(70_000);
  });

  it("falls back to the next best block, not to nothing", async () => {
    const bs = await idOf("back-squat");
    await logStrength("2026-01-10", bs, 140_000, 1);
    const { blockId } = await logStrength("2026-02-10", bs, 160_000, 1);

    // The 160 was a typo; it was really 120.
    await editSets(blockId, bs, 120_000, 1);

    const [pr] = await db.select().from(prs).where(eq(prs.movementId, bs));
    expect(pr.value).toBe(140_000);
    expect(pr.date).toBe("2026-01-10");
  });

  it("leaves other blocks untouched", async () => {
    const bs = await idOf("back-squat");
    const pc = await idOf("power-clean");
    await logStrength("2026-03-01", pc, 90_000, 3);
    const { blockId } = await logStrength("2026-03-02", bs, 150_000, 5);

    await editSets(blockId, bs, 100_000, 5);

    const [clean] = await db.select().from(prs).where(eq(prs.movementId, pc));
    expect(clean.value).toBe(90_000);
    const squat = await repMaxes(db, bs);
    expect(squat[0].loadG).toBe(100_000);
  });

  it("keeps the rebuilt cache identical to a from-scratch rebuild", async () => {
    const bs = await idOf("back-squat");
    await logStrength("2026-01-01", bs, 100_000, 5);
    const { blockId } = await logStrength("2026-02-01", bs, 130_000, 5);
    await editSets(blockId, bs, 110_000, 5);

    const after = await db.select().from(prs).orderBy(prs.movementId, prs.repScheme);
    await rebuildAllPrs(db);
    const fresh = await db.select().from(prs).orderBy(prs.movementId, prs.repScheme);

    expect(fresh.map((r: any) => [r.movementId, r.repScheme, r.value, r.date])).toEqual(
      after.map((r: any) => [r.movementId, r.repScheme, r.value, r.date]),
    );
  });
});

describe("loading a saved score back into the keypad", () => {
  it("round-trips a time through the digit buffer", () => {
    for (const seconds of [59, 252, 750, 3870]) {
      expect(timeBufferToSeconds(secondsToBuffer(seconds))).toBe(seconds);
    }
  });

  it("formats a time buffer without leading zeros", () => {
    expect(secondsToBuffer(252)).toBe("412");
    expect(secondsToBuffer(750)).toBe("1230");
    expect(secondsToBuffer(null)).toBe("");
  });

  it("round-trips a load", () => {
    expect(gramsToBuffer(82_500, "kg")).toBe("82.5");
    expect(gramsToBuffer(100_000, "kg")).toBe("100");
    expect(gramsToBuffer(null, "kg")).toBe("");
  });
});
