import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  blocksForMovement,
  feelHistory,
  ftsQuery,
  rebuildAllPrs,
  recomputePrsForBlock,
  repMaxes,
  resolveMovements,
  searchRawText,
  topSetsOverTime,
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

  it("excludes a rep that was failed", async () => {
    const dl = await idOf("deadlift");
    await logSet("2026-02-01", dl, 140_000, 5);
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

describe("PR cache is fully reconstructible", () => {
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

describe("rep maxes come from strength work", () => {
  /**
   * Twenty-one thrusters at 43kg in a Fran is prescribed volume, not an attempt
   * at a 21-rep max. candidatesForBlock already refuses to make a record of it,
   * so the movement screen must refuse too — otherwise it shows a rep max the
   * records screen will not.
   */
  it("ignores a loaded WOD movement", async () => {
    const thruster = await idOf("thruster");

    const [s1] = await db.insert(sessions).values({ date: "2026-06-01" }).returning();
    const [wod] = await db
      .insert(blocks)
      .values({
        sessionId: s1.id, kind: "wod", format: "for_time", rounds: 3,
        rawText: "21-15-9", scoreType: "time", scoreValue: 252,
      })
      .returning();
    await db.insert(blockMovements).values(
      [21, 15, 9].map((reps, i) => ({
        blockId: wod.id, movementId: thruster, setNumber: i + 1, reps, loadG: 43_000,
      })),
    );

    expect(await repMaxes(db, thruster)).toHaveLength(0);
    expect(await topSetsOverTime(db, thruster)).toHaveLength(0);

    const [s2] = await db.insert(sessions).values({ date: "2026-06-08" }).returning();
    const [lift] = await db
      .insert(blocks)
      .values({ sessionId: s2.id, kind: "strength", format: "sets", rawText: "thrusters", scoreType: "load" })
      .returning();
    await db
      .insert(blockMovements)
      .values({ blockId: lift.id, movementId: thruster, setNumber: 1, reps: 3, loadG: 80_000 });

    // The strength set still counts, and the metcon has not crept in beside it.
    const maxes = await repMaxes(db, thruster);
    expect(maxes.map((m: any) => [m.reps, m.loadG])).toEqual([[3, 80_000]]);
    expect(await topSetsOverTime(db, thruster)).toHaveLength(1);
  });

  it("still finds the movement in both, which is a different question", async () => {
    const thruster = await idOf("thruster");
    const [s] = await db.insert(sessions).values({ date: "2026-06-01" }).returning();
    const [wod] = await db
      .insert(blocks)
      .values({ sessionId: s.id, kind: "wod", format: "for_time", rawText: "21-15-9", scoreType: "time" })
      .returning();
    await db.insert(blockMovements).values({ blockId: wod.id, movementId: thruster, reps: 21 });

    expect(await blocksForMovement(db, thruster)).toHaveLength(1);
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

  /**
   * Job 2, and the reason block_movements exists at all. Searching a movement
   * has to reach WODs and strength work alike — "when did I last clean" is not
   * a question about barbells only, and "when did I last do pull-ups" would be
   * unanswerable if WOD rows were skipped because they carry no load.
   */
  it("finds a movement in both a WOD and a strength session", async () => {
    const clean = await idOf("clean");

    const [s1] = await db.insert(sessions).values({ date: "2026-07-01" }).returning();
    const [strength] = await db
      .insert(blocks)
      .values({
        sessionId: s1.id, kind: "strength", format: "sets",
        rawText: "Clean 3x2\n80 / 85 / 90 kg", scoreType: "none",
      })
      .returning();
    await db.insert(blockMovements).values([
      { blockId: strength.id, movementId: clean, setNumber: 1, loadG: 80_000, reps: 2 },
      { blockId: strength.id, movementId: clean, setNumber: 2, loadG: 90_000, reps: 2 },
    ]);

    const [s2] = await db.insert(sessions).values({ date: "2026-07-09" }).returning();
    const [wod] = await db
      .insert(blocks)
      .values({
        sessionId: s2.id, kind: "wod", format: "amrap", durationMin: 12,
        rawText: "12 min AMRAP:\n3 Clean\n6 Push-up", scoreType: "rounds_reps", scoreValue: 90,
      })
      .returning();
    await db.insert(blockMovements).values({ blockId: wod.id, movementId: clean, reps: 3 });

    // The search box resolves the word to a movement...
    const matches = await resolveMovements(db, "clean");
    expect(matches.map((m: any) => m.slug)).toContain("clean");

    // ...and the movement reaches both kinds of block, newest first.
    const rows = await blocksForMovement(db, clean);
    expect(rows.map((r: any) => [r.date, r.kind])).toEqual([
      ["2026-07-09", "wod"],
      ["2026-07-01", "strength"],
    ]);
    // The strength block still reports the heaviest working set alongside it.
    expect(rows[1].topLoadG).toBe(90_000);
  });
});

describe("feel rating", () => {
  it("is per block, so one session can hold different ratings", async () => {
    const bs = await idOf("back-squat");
    const run = await idOf("run");
    const [s] = await db.insert(sessions).values({ date: "2026-07-10" }).returning();

    const [squat] = await db
      .insert(blocks)
      .values({ sessionId: s.id, kind: "strength", format: "sets", rawText: "squats", scoreType: "load", feel: 1 })
      .returning();
    const [metcon] = await db
      .insert(blocks)
      .values({ sessionId: s.id, kind: "wod", format: "for_time", rawText: "run", scoreType: "time", feel: 5 })
      .returning();
    await db.insert(blockMovements).values([
      { blockId: squat.id, movementId: bs, setNumber: 1, loadG: 100_000, reps: 5 },
      { blockId: metcon.id, movementId: run, distanceM: 5000 },
    ]);

    // Weak squats, great running — the exact case the rating exists for.
    expect((await blocksForMovement(db, bs))[0].feel).toBe(1);
    expect((await blocksForMovement(db, run))[0].feel).toBe(5);
  });

  it("stays optional and never touches PR logic", async () => {
    const sn = await idOf("snatch");
    await logSet("2026-08-01", sn, 70_000, 1); // logged with no rating at all

    const [pr] = await db.select().from(prs).where(eq(prs.movementId, sn));
    expect(pr.value).toBe(70_000);
    expect((await blocksForMovement(db, sn))[0].feel).toBeNull();
  });

  it("reports feel history newest first", async () => {
    const bs = await idOf("back-squat");
    for (const [date, feel] of [["2026-05-01", 2], ["2026-05-08", 4]] as const) {
      const [s] = await db.insert(sessions).values({ date }).returning();
      const [b] = await db
        .insert(blocks)
        .values({ sessionId: s.id, kind: "strength", format: "sets", rawText: "sq", scoreType: "load", feel })
        .returning();
      await db.insert(blockMovements).values({ blockId: b.id, movementId: bs, setNumber: 1, loadG: 100_000, reps: 3 });
    }
    const hist = await feelHistory(db, bs);
    expect(hist.map((h: any) => h.feel)).toEqual([4, 2]);
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
