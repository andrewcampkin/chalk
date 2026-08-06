import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  blocksForMovement,
  ftsQuery,
  rebuildAllPrs,
  recomputePrsForBlock,
  repMaxes,
  searchRawText,
  staleMovements,
} from "../db/queries";
import { blockMovements, blocks, movements, prs, sessions } from "../db/schema";
import { validateSeed } from "../db/seed";
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

/** Log one strength set on a date. */
async function logSet(
  date: string,
  movementId: number,
  loadG: number,
  reps: number,
  opts: { warmup?: boolean; failed?: boolean } = {},
) {
  const [s] = await db.insert(sessions).values({ date }).returning();
  const [b] = await db
    .insert(blocks)
    .values({
      sessionId: s.id,
      kind: "strength",
      format: "sets",
      rawText: "lift",
      scoreType: "load",
    })
    .returning();
  await db.insert(blockMovements).values({
    blockId: b.id,
    movementId,
    setNumber: 1,
    loadG,
    reps,
    isWarmup: opts.warmup ?? false,
    isFailed: opts.failed ?? false,
  });
  await recomputePrsForBlock(db, b.id);
  return b.id as number;
}

describe("seed", () => {
  it("has no typos in benchmark component slugs", () => {
    expect(validateSeed()).toEqual([]);
  });

  it("loads the whole vocabulary", async () => {
    const all = await db.select().from(movements);
    expect(all.length).toBe(156);
  });
});

describe("repMaxes", () => {
  it("reports the date the winning set actually happened", async () => {
    const pc = await idOf("power-clean");
    await logSet("2026-01-10", pc, 100_000, 3); // heavy, January
    await logSet("2026-06-20", pc, 60_000, 3); // light, June

    const [max] = await repMaxes(db, pc);
    expect(max.loadG).toBe(100_000);
    // Regression: a plain max(date) reported 2026-06-20 here.
    expect(max.date).toBe("2026-01-10");
  });

  it("excludes warm-ups and failed reps", async () => {
    const dl = await idOf("deadlift");
    await logSet("2026-02-01", dl, 140_000, 5);
    await logSet("2026-02-08", dl, 200_000, 5, { warmup: true });
    await logSet("2026-02-15", dl, 210_000, 5, { failed: true });

    const [max] = await repMaxes(db, dl);
    expect(max.loadG).toBe(140_000);
  });

  it("keeps rep schemes separate", async () => {
    const bs = await idOf("back-squat");
    await logSet("2026-03-01", bs, 120_000, 5);
    await logSet("2026-03-08", bs, 140_000, 1);

    const rows = await repMaxes(db, bs);
    expect(rows.find((r: any) => r.reps === 5)?.loadG).toBe(120_000);
    expect(rows.find((r: any) => r.reps === 1)?.loadG).toBe(140_000);
  });
});

describe("PR cache (invariant 3: fully reconstructible)", () => {
  it("ratchets down when a block is corrected", async () => {
    const sn = await idOf("snatch");
    const blockId = await logSet("2026-04-01", sn, 200_000, 1); // typo

    await db
      .update(blockMovements)
      .set({ loadG: 20_000 })
      .where(eq(blockMovements.blockId, blockId));
    await recomputePrsForBlock(db, blockId);

    const [pr] = await db.select().from(prs).where(eq(prs.movementId, sn));
    // Regression: the phantom 200kg used to survive forever.
    expect(pr.value).toBe(20_000);
  });

  it("matches a full rebuild exactly", async () => {
    const pc = await idOf("power-clean");
    const bs = await idOf("back-squat");
    await logSet("2026-01-05", pc, 80_000, 3);
    await logSet("2026-02-05", pc, 90_000, 3);
    await logSet("2026-03-05", bs, 150_000, 1);

    const incremental = await db.select().from(prs).orderBy(prs.movementId, prs.repScheme);
    await rebuildAllPrs(db);
    const rebuilt = await db.select().from(prs).orderBy(prs.movementId, prs.repScheme);

    expect(rebuilt.map((r: any) => [r.movementId, r.repScheme, r.value])).toEqual(
      incremental.map((r: any) => [r.movementId, r.repScheme, r.value]),
    );
  });

  it("records what the previous best was", async () => {
    const pc = await idOf("power-clean");
    await logSet("2026-01-05", pc, 80_000, 3);
    await logSet("2026-02-05", pc, 90_000, 3);

    const [pr] = await db.select().from(prs).where(eq(prs.movementId, pc));
    expect(pr.value).toBe(90_000);
    expect(pr.previousValue).toBe(80_000);
  });

  it("never lets a capped score set a record", async () => {
    const fran = await idOf("fran");
    const [s] = await db.insert(sessions).values({ date: "2026-05-01" }).returning();
    const [b] = await db
      .insert(blocks)
      .values({
        sessionId: s.id,
        kind: "wod",
        format: "for_time",
        rawText: "Fran",
        benchmarkId: fran,
        scoreType: "time",
        scoreValue: 600,
        capped: true,
      })
      .returning();
    await recomputePrsForBlock(db, b.id);

    const rows = await db.select().from(prs).where(eq(prs.movementId, fran));
    expect(rows.length).toBe(0);
  });
});

describe("full-text search", () => {
  it("survives hyphenated movement names", () => {
    expect(ftsQuery("pull-up")).toBe('"pull" "up"');
    expect(ftsQuery("")).toBe("");
  });

  it("finds a workout by a word nobody tagged", async () => {
    const [s] = await db.insert(sessions).values({ date: "2026-06-01" }).returning();
    await db.insert(blocks).values({
      sessionId: s.id,
      kind: "wod",
      format: "for_time",
      rawText: "21-15-9 thruster and pull-up, wearing a vest",
      scoreType: "time",
      scoreValue: 252,
    });

    // Regression: this threw `no such column: up`.
    const hits = await searchRawText(db, "pull-up");
    expect(hits.length).toBe(1);
    expect(await searchRawText(db, "vest")).toHaveLength(1);
  });
});

describe("movement history (not just PRs)", () => {
  it("finds WOD appearances, not only loaded strength sets", async () => {
    const pullup = await idOf("pull-up");
    const [s] = await db.insert(sessions).values({ date: "2026-07-04" }).returning();
    const [b] = await db
      .insert(blocks)
      .values({
        sessionId: s.id,
        kind: "wod",
        format: "amrap",
        rawText: "20 min AMRAP: 5 pull-up, 10 push-up, 15 air squat",
        scoreType: "rounds_reps",
        scoreValue: 315,
      })
      .returning();
    await db.insert(blockMovements).values({ blockId: b.id, movementId: pullup, reps: 5 });

    const rows = await blocksForMovement(db, pullup);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-07-04");
  });
});

describe("neglect list", () => {
  it("flags bodyweight work with no record attached", async () => {
    const pullup = await idOf("pull-up");
    const [s] = await db.insert(sessions).values({ date: "2026-01-02" }).returning();
    const [b] = await db
      .insert(blocks)
      .values({ sessionId: s.id, kind: "wod", format: "amrap", rawText: "cindy", scoreType: "rounds_reps" })
      .returning();
    await db.insert(blockMovements).values({ blockId: b.id, movementId: pullup, reps: 5 });

    const stale = await staleMovements(db, "2026-06-01");
    expect(stale.map((r: any) => r.name)).toContain("Pull-up");
  });
});
