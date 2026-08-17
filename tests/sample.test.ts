import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { blocksForMovement, repMaxes, topSetsOverTime } from "../db/queries";
import { blockMovements, blocks, movements, prs, sessions } from "../db/schema";
import { loadSampleData, removeSampleData, sampleDataCount, SAMPLE_LABEL } from "../lib/sample";
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

/** A session the user logged themselves, which must survive everything. */
async function logRealSession() {
  const bs = await idOf("back-squat");
  const [s] = await db
    .insert(sessions)
    .values({ date: "2020-01-15", label: "Morning class" })
    .returning();
  const [b] = await db
    .insert(blocks)
    .values({
      sessionId: s.id,
      kind: "strength",
      format: "sets",
      rawText: "my own squats",
      scoreType: "load",
    })
    .returning();
  await db.insert(blockMovements).values({
    blockId: b.id,
    movementId: bs,
    setNumber: 1,
    loadG: 200_000,
    reps: 1,
  });
  return { sessionId: s.id, blockId: b.id };
}

describe("sample data", () => {
  it("creates a history worth looking at", async () => {
    const res = await loadSampleData(db);
    expect(res.sessions).toBeGreaterThan(20);
    expect(res.blocks).toBeGreaterThan(30);
  });

  it("gives the load chart enough points to draw", async () => {
    await loadSampleData(db);
    const points = await topSetsOverTime(db, await idOf("back-squat"));
    // The chart renders nothing below two points.
    expect(points.length).toBe(12);
    expect(points[0].date < points[points.length - 1].date).toBe(true);
  });

  it("colours those points — most sessions carry a feel rating", async () => {
    await loadSampleData(db);
    const points = await topSetsOverTime(db, await idOf("back-squat"));
    expect(points.every((p: any) => p.feel != null)).toBe(true);
    // The stall is the interesting part: it should dip and recover.
    const feels = points.map((p: any) => p.feel);
    expect(Math.min(...feels)).toBe(1);
    expect(Math.max(...feels)).toBe(5);
  });

  it("excludes warm-ups from the rep maxes it produces", async () => {
    await loadSampleData(db);
    const maxes = await repMaxes(db, await idOf("back-squat"));
    const single = maxes.find((m: any) => m.reps === 1);
    // 125kg top single, not a warm-up ramp value.
    expect(single?.loadG).toBe(125_000);
  });

  it("produces records", async () => {
    await loadSampleData(db);
    const rows = await db.select().from(prs);
    expect(rows.length).toBeGreaterThan(5);
  });

  it("writes Fran as the three different rounds it actually is", async () => {
    await loadSampleData(db);
    const thruster = await idOf("thruster");
    const [fran] = await db.select().from(blocks).where(eq(blocks.title, "Fran"));

    expect(fran.rounds).toBe(3);
    const rows = await db
      .select()
      .from(blockMovements)
      .where(eq(blockMovements.blockId, fran.id))
      .orderBy(blockMovements.position, blockMovements.setNumber);
    // Two movements over three rounds — six rows, not two (invariant 4).
    expect(rows).toHaveLength(6);
    expect(
      rows.filter((r: any) => r.movementId === thruster).map((r: any) => [r.setNumber, r.reps]),
    ).toEqual([[1, 21], [2, 15], [3, 9]]);
  });

  it("carries the shape on every WOD, so the stages reopen on the right answers", async () => {
    await loadSampleData(db);
    const wods = await db.select().from(blocks).where(eq(blocks.kind, "wod"));
    expect(wods.length).toBeGreaterThan(10);
    for (const w of wods) {
      if (w.format === "for_time") expect(w.rounds).toBeGreaterThan(0);
      // A clock, not a round count: an AMRAP or EMOM repeats until time is up.
      if (w.format === "amrap" || w.format === "emom") {
        expect(w.durationMin).toBeGreaterThan(0);
        expect(w.rounds).toBeNull();
      }
      if (w.format === "emom") expect(w.everyMin).toBeGreaterThan(0);
    }
  });

  it("covers all three formats, so no stage is unrepresented", async () => {
    await loadSampleData(db);
    const wods = await db.select().from(blocks).where(eq(blocks.kind, "wod"));
    const formats = new Set(wods.map((w: any) => w.format));
    expect([...formats].sort()).toEqual(["amrap", "emom", "for_time"]);
    // Both EMOM shapes: a plain one and an E2MOM.
    const every = wods.filter((w: any) => w.format === "emom").map((w: any) => w.everyMin);
    expect(every.sort()).toEqual([1, 2]);
  });

  it("gives movement search WODs to find, not just strength sessions", async () => {
    await loadSampleData(db);
    // Job 2: pull-ups appear in Fran, Helen and Cindy and nowhere in the
    // strength plans, so every hit here has to come from a WOD.
    const rows = await blocksForMovement(db, await idOf("pull-up"));
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.every((r: any) => r.kind === "wod")).toBe(true);
  });
});

describe("removing sample data", () => {
  it("leaves real sessions completely untouched", async () => {
    const real = await logRealSession();
    await loadSampleData(db);
    await removeSampleData(db);

    const remaining = await db.select().from(sessions);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(real.sessionId);
    expect(remaining[0].label).toBe("Morning class");

    const blocksLeft = await db.select().from(blocks);
    expect(blocksLeft).toHaveLength(1);
    expect(blocksLeft[0].rawText).toBe("my own squats");
  });

  it("rebuilds records from what is left, not from the sample", async () => {
    await logRealSession();
    await loadSampleData(db);
    await removeSampleData(db);

    const rows = await db.select().from(prs).where(eq(prs.movementId, await idOf("back-squat")));
    // The user's own 200kg single is the only back squat record still standing.
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(200_000);
  });

  it("removes every set it inserted, leaving no orphans", async () => {
    await logRealSession();
    await loadSampleData(db);
    await removeSampleData(db);

    const sets = await db.select().from(blockMovements);
    expect(sets).toHaveLength(1);
    expect(sets[0].loadG).toBe(200_000);
  });

  it("is idempotent and safe to run when nothing was loaded", async () => {
    await logRealSession();
    expect(await removeSampleData(db)).toBe(0);
    expect(await db.select().from(sessions)).toHaveLength(1);
  });

  it("reports how much sample data is present", async () => {
    expect(await sampleDataCount(db)).toBe(0);
    await loadSampleData(db);
    expect(await sampleDataCount(db)).toBeGreaterThan(20);
    await removeSampleData(db);
    expect(await sampleDataCount(db)).toBe(0);
  });

  it("labels every session it creates, which is what makes removal exact", async () => {
    await loadSampleData(db);
    const all = await db.select().from(sessions);
    expect(all.every((s: any) => s.label === SAMPLE_LABEL)).toBe(true);
  });
});
