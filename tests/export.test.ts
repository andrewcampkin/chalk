import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { recomputePrsForBlock } from "../db/queries";
import { blockMovements, blocks, movements, sessions } from "../db/schema";
import { buildExportDoc, exportFilename } from "../lib/export";
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

async function logDay() {
  const pc = await idOf("power-clean");
  const fran = await idOf("fran");
  const thruster = await idOf("thruster");
  const pullup = await idOf("pull-up");

  const [s] = await db
    .insert(sessions)
    .values({ date: "2026-08-05", label: "Morning class" })
    .returning();

  const [strength] = await db
    .insert(blocks)
    .values({
      sessionId: s.id,
      position: 0,
      kind: "strength",
      title: "Power Clean 2x3",
      rawText: "Power clean 2x3, building\n60 / 70 kg",
      format: "sets",
      scoreType: "load",
      feel: 2,
    })
    .returning();
  await db.insert(blockMovements).values([
    { blockId: strength.id, movementId: pc, setNumber: 1, loadG: 60_000, reps: 3 },
    { blockId: strength.id, movementId: pc, setNumber: 2, loadG: 70_000, reps: 3 },
  ]);

  const [wod] = await db
    .insert(blocks)
    .values({
      sessionId: s.id,
      position: 1,
      kind: "wod",
      title: "Fran",
      benchmarkId: fran,
      rawText: '"Fran"\n21-15-9 for time:\nThruster (43 kg)\nPull-up',
      format: "for_time",
      scoreType: "time",
      scoreValue: 252,
      feel: 5,
    })
    .returning();
  await db.insert(blockMovements).values([
    { blockId: wod.id, movementId: thruster, position: 0, reps: 21, loadG: 43_000 },
    { blockId: wod.id, movementId: pullup, position: 1, reps: 21 },
  ]);

  await recomputePrsForBlock(db, strength.id);
  await recomputePrsForBlock(db, wod.id);
}

describe("export", () => {
  it("names the file by date", () => {
    expect(exportFilename(new Date(2026, 7, 6))).toBe("chalk-2026-08-06.json");
  });

  it("is empty but well formed on a fresh install", async () => {
    const doc = await buildExportDoc(db);
    expect(doc.app).toBe("chalk");
    expect(doc.sessions).toEqual([]);
    expect(doc.counts).toEqual({ sessions: 0, blocks: 0, sets: 0, customMovements: 0 });
  });

  it("nests blocks under sessions and sets under blocks", async () => {
    await logDay();
    const doc = await buildExportDoc(db);

    expect(doc.counts).toEqual({ sessions: 1, blocks: 2, sets: 4, customMovements: 0 });
    expect(doc.sessions).toHaveLength(1);
    expect(doc.sessions[0].label).toBe("Morning class");
    expect(doc.sessions[0].blocks).toHaveLength(2);
    expect(doc.sessions[0].blocks[0].movements).toHaveLength(2);
  });

  it("keeps the verbatim text intact — invariant 1", async () => {
    await logDay();
    const doc = await buildExportDoc(db);
    expect(doc.sessions[0].blocks[0].rawText).toBe("Power clean 2x3, building\n60 / 70 kg");
    expect(doc.sessions[0].blocks[1].rawText).toContain("21-15-9 for time:");
  });

  it("is readable without the database — names, not foreign keys", async () => {
    await logDay();
    const doc = await buildExportDoc(db);
    const wod = doc.sessions[0].blocks[1];

    expect(wod.benchmark).toBe("Fran");
    expect(wod.movements.map((m) => m.slug)).toEqual(["thruster", "pull-up"]);
    expect(wod.movements.map((m) => m.name)).toEqual(["Thruster", "Pull-up"]);
    // No numeric ids anywhere in the serialised form.
    expect(JSON.stringify(doc)).not.toContain('"movementId"');
  });

  it("carries the feel rating and the score", async () => {
    await logDay();
    const doc = await buildExportDoc(db);
    expect(doc.sessions[0].blocks[0].feel).toBe(2);
    expect(doc.sessions[0].blocks[1].feel).toBe(5);
    expect(doc.sessions[0].blocks[1].score).toMatchObject({ type: "time", value: 252, capped: false });
  });

  it("omits the PR cache, which must be rebuilt not restored", async () => {
    await logDay();
    const doc = await buildExportDoc(db);
    expect(JSON.stringify(doc)).not.toContain('"prs"');
    expect("prs" in doc).toBe(false);
  });

  it("round-trips through JSON", async () => {
    await logDay();
    const doc = await buildExportDoc(db);
    const parsed = JSON.parse(JSON.stringify(doc));
    expect(parsed.sessions[0].blocks[0].movements[1].loadG).toBe(70_000);
  });

  it("exports the user's own movements but not the 156 seeded ones", async () => {
    await db
      .insert(movements)
      .values({ name: "Kettlebell Windmill", slug: "kettlebell-windmill", kind: "movement", isCustom: true });
    const doc = await buildExportDoc(db);
    expect(doc.customMovements.map((m) => m.slug)).toEqual(["kettlebell-windmill"]);
    expect(doc.counts.customMovements).toBe(1);
  });
});
