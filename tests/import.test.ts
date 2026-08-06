import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { recomputePrsForBlock } from "../db/queries";
import { blockMovements, blocks, movements, prs, sessions } from "../db/schema";
import { buildExportDoc, EXPORT_VERSION } from "../lib/export";
import { currentLogSize, importBackup, parseBackup } from "../lib/import";
import { createCustomMovement } from "../lib/movements";
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

/** A day with a strength piece, a benchmark WOD, and a run. */
async function logRealisticDay() {
  const pc = await idOf("power-clean");
  const fran = await idOf("fran");
  const thruster = await idOf("thruster");
  const pullup = await idOf("pull-up");
  const run = await idOf("run");

  const [s] = await db
    .insert(sessions)
    .values({ date: "2026-08-05", label: "Morning class", notes: "hot" })
    .returning();

  const [strength] = await db
    .insert(blocks)
    .values({
      sessionId: s.id, position: 0, kind: "strength", title: "Power Clean 2x3",
      rawText: "Power clean 2x3\n60 / 70 kg", format: "sets", scoreType: "none", feel: 2,
    })
    .returning();
  await db.insert(blockMovements).values([
    { blockId: strength.id, movementId: pc, position: 0, setNumber: 1, loadG: 60_000, reps: 3, isWarmup: true },
    { blockId: strength.id, movementId: pc, position: 0, setNumber: 2, loadG: 70_000, reps: 3 },
  ]);

  const [wod] = await db
    .insert(blocks)
    .values({
      sessionId: s.id, position: 1, kind: "wod", title: "Fran", benchmarkId: fran,
      rawText: '"Fran"\n21-15-9 thruster, pull-up', format: "for_time",
      scoreType: "time", scoreValue: 252, feel: 5, notes: "unbroken",
    })
    .returning();
  await db.insert(blockMovements).values([
    { blockId: wod.id, movementId: thruster, position: 0, reps: 21, loadG: 43_000 },
    { blockId: wod.id, movementId: pullup, position: 1, reps: 21 },
  ]);

  const [cardio] = await db
    .insert(blocks)
    .values({
      sessionId: s.id, position: 2, kind: "wod", title: "5k", rawText: "5 km Run",
      format: "for_time", scoreType: "time", scoreValue: 1500, feel: 3,
    })
    .returning();
  await db.insert(blockMovements).values({ blockId: cardio.id, movementId: run, position: 0, distanceM: 5000 });

  for (const b of [strength, wod, cardio]) await recomputePrsForBlock(db, b.id);
}

describe("validating a backup", () => {
  it("rejects things that are not backups", () => {
    expect(parseBackup("not json")).toMatchObject({ ok: false });
    expect(parseBackup('{"app":"strava"}')).toMatchObject({ ok: false });
    expect(parseBackup('{"app":"chalk"}')).toMatchObject({ ok: false });
  });

  it("refuses a file from a newer version of the app", () => {
    const res = parseBackup(JSON.stringify({ app: "chalk", version: 99, sessions: [] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]).toContain("newer version");
  });

  it("refuses a block with no workout text — invariant 1", () => {
    const res = parseBackup(
      JSON.stringify({
        app: "chalk", version: EXPORT_VERSION,
        sessions: [{ date: "2026-08-05", blocks: [{ kind: "wod", format: "amrap", rawText: "  " }] }],
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toContain("workout text");
  });

  it("refuses a non-integer score — invariant 2", () => {
    const res = parseBackup(
      JSON.stringify({
        app: "chalk", version: EXPORT_VERSION,
        sessions: [{
          date: "2026-08-05",
          blocks: [{ kind: "wod", format: "for_time", rawText: "x", score: { type: "time", value: 4.12 } }],
        }],
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toContain("whole number");
  });

  it("refuses a bad date, so a session cannot land on no day at all", () => {
    const res = parseBackup(
      JSON.stringify({ app: "chalk", version: EXPORT_VERSION, sessions: [{ date: "5th Aug", blocks: [] }] }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toContain("YYYY-MM-DD");
  });

  it("accepts an empty but valid backup", () => {
    const res = parseBackup(JSON.stringify({ app: "chalk", version: EXPORT_VERSION, sessions: [] }));
    expect(res.ok).toBe(true);
  });
});

describe("restoring", () => {
  it("round-trips a log without losing anything", async () => {
    await logRealisticDay();
    const before = await buildExportDoc(db);

    const parsed = parseBackup(JSON.stringify(before));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await importBackup(db, parsed.doc);
    const after = await buildExportDoc(db);

    // exportedAt moves; everything that describes training must not.
    expect(after.sessions).toEqual(before.sessions);
    expect(after.counts).toEqual(before.counts);
  });

  it("replaces what was there rather than merging into it", async () => {
    await logRealisticDay();
    const doc = await buildExportDoc(db);

    // A second, unrelated day that must not survive the restore.
    await db.insert(sessions).values({ date: "2020-01-01", label: "old" });

    await importBackup(db, doc);
    const dates = (await db.select().from(sessions)).map((s: any) => s.date);
    expect(dates).toEqual(["2026-08-05"]);
  });

  it("is idempotent — restoring twice gives the same log", async () => {
    await logRealisticDay();
    const doc = await buildExportDoc(db);

    await importBackup(db, doc);
    const once = await buildExportDoc(db);
    await importBackup(db, doc);
    const twice = await buildExportDoc(db);

    expect(twice.sessions).toEqual(once.sessions);
    expect(twice.counts).toEqual(once.counts);
  });

  it("rebuilds records instead of trusting the file — invariant 3", async () => {
    await logRealisticDay();
    const doc: any = await buildExportDoc(db);
    // A backup that has been tampered with, or written by an older build.
    doc.prs = [{ movementId: 1, value: 999_000, repScheme: "1" }];

    await importBackup(db, doc);

    const rows = await db.select().from(prs);
    expect(rows.some((r: any) => r.value === 999_000)).toBe(false);
    // The real 70kg triple is derived from the blocks.
    const pc = await idOf("power-clean");
    const [pr] = await db.select().from(prs).where(eq(prs.movementId, pc));
    expect(pr.value).toBe(70_000);
  });

  it("keeps warm-up and failed flags, which PR queries depend on", async () => {
    await logRealisticDay();
    const doc = await buildExportDoc(db);
    await importBackup(db, doc);

    const pc = await idOf("power-clean");
    const rows = await db.select().from(blockMovements).where(eq(blockMovements.movementId, pc));
    expect(rows.filter((r: any) => r.isWarmup)).toHaveLength(1);
    // The 60kg warm-up must not become the record.
    const [pr] = await db.select().from(prs).where(eq(prs.movementId, pc));
    expect(pr.value).toBe(70_000);
  });

  it("re-tags the benchmark so search still finds it", async () => {
    await logRealisticDay();
    const doc = await buildExportDoc(db);
    await importBackup(db, doc);

    const fran = await idOf("fran");
    const [wod] = await db.select().from(blocks).where(eq(blocks.benchmarkId, fran));
    expect(wod).toBeTruthy();
  });

  it("recreates movements this install has never seen", async () => {
    await createCustomMovement(db, "Burpee Pull-up", "load");
    const custom = await idOf("burpee-pull-up");
    const [s] = await db.insert(sessions).values({ date: "2026-08-06" }).returning();
    const [b] = await db
      .insert(blocks)
      .values({ sessionId: s.id, kind: "wod", format: "amrap", rawText: "burpee pull-ups", scoreType: "reps" })
      .returning();
    await db.insert(blockMovements).values({ blockId: b.id, movementId: custom, reps: 30 });

    const doc = await buildExportDoc(db);

    // A fresh install: seeded vocabulary only, no custom movements.
    const fresh = makeTestDb(false);
    await seedMovements(fresh.db);
    const summary = await importBackup(fresh.db, doc);

    expect(summary.movementsCreated).toBe(1);
    const [restored] = await fresh.db
      .select()
      .from(movements)
      .where(eq(movements.slug, "burpee-pull-up"));
    expect(restored.name).toBe("Burpee Pull-up");
    expect(restored.isCustom).toBe(true);
  });

  it("reads a version 1 file, where benchmark was a bare name", async () => {
    await logRealisticDay();
    const doc: any = await buildExportDoc(db);
    doc.version = 1;
    for (const s of doc.sessions) {
      for (const b of s.blocks) if (b.benchmark) b.benchmark = b.benchmark.name;
    }

    const parsed = parseBackup(JSON.stringify(doc));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await importBackup(db, parsed.doc);

    const fran = await idOf("fran");
    const [wod] = await db.select().from(blocks).where(eq(blocks.benchmarkId, fran));
    expect(wod).toBeTruthy();
  });

  it("reports what is about to be replaced", async () => {
    await logRealisticDay();
    expect(await currentLogSize(db)).toEqual({ sessions: 1, blocks: 3 });
  });
});
