import { eq, inArray, like } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { blockMovements, blocks, movements, sessions } from "../db/schema";
import { rebuildAllPrs } from "../db/queries";
import { shiftIso, todayIso } from "./dates";

type DB = BaseSQLiteDatabase<any, any, any>;

/**
 * Twelve weeks of plausible training, for looking at screens that need history
 * before they show anything — the load chart above all, which needs two or more
 * sessions of the same lift before it draws at all.
 *
 * Every session it creates is labelled SAMPLE_LABEL, and removal deletes
 * exactly those rows. Real sessions are never touched, because this runs
 * against the same database as the actual log.
 */
export const SAMPLE_LABEL = "Sample data";

/** Deterministic, so the same call always produces the same history. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type Plan = {
  slug: string;
  /** Week index -> [reps, kg] for the top set, or null to skip that week. */
  series: ([number, number] | null)[];
  feel: (number | null)[];
};

/**
 * A back squat that climbs, stalls for three weeks, gets deloaded and then
 * moves again — with the feel rating sliding through the stall. That pairing is
 * the whole reason the chart colours its points.
 */
const BACK_SQUAT: Plan = {
  slug: "back-squat",
  series: [
    [5, 100], [5, 102.5], [5, 105], [3, 110], [5, 107.5], [5, 107.5],
    [5, 107.5], [5, 95], [5, 105], [3, 115], [3, 117.5], [1, 125],
  ],
  feel: [3, 4, 4, 5, 3, 2, 1, 2, 4, 4, 5, 5],
};

const POWER_CLEAN: Plan = {
  slug: "power-clean",
  series: [
    [3, 70], [3, 72.5], null, [3, 75], [3, 77.5], null,
    [3, 77.5], [3, 80], null, [3, 82.5], null, [2, 85],
  ],
  feel: [3, 4, null, 4, 5, null, 2, 4, null, 4, null, 5],
};

const DEADLIFT: Plan = {
  slug: "deadlift",
  series: [
    [5, 140], null, null, [5, 150], null, null,
    [3, 165], null, null, [3, 170], null, [1, 190],
  ],
  feel: [3, null, null, 4, null, null, 3, null, null, 4, null, 5],
};

/** Named workouts, so search and the records list have something to show. */
const BENCHMARKS: { slug: string; week: number; seconds: number; feel: number }[] = [
  { slug: "fran", week: 1, seconds: 340, feel: 2 },
  { slug: "fran", week: 6, seconds: 289, feel: 3 },
  { slug: "fran", week: 11, seconds: 252, feel: 5 },
  { slug: "helen", week: 3, seconds: 748, feel: 3 },
  { slug: "helen", week: 9, seconds: 705, feel: 4 },
  { slug: "grace", week: 7, seconds: 402, feel: 2 },
];

const CINDY = [{ week: 2, rounds: 18, feel: 3 }, { week: 8, rounds: 21, feel: 4 }];
const RUNS = [
  { week: 0, metres: 5000, seconds: 1500, feel: 3 },
  { week: 4, metres: 5000, seconds: 1452, feel: 4 },
  { week: 10, metres: 5000, seconds: 1398, feel: 4 },
];

export async function loadSampleData(db: DB): Promise<{ sessions: number; blocks: number }> {
  const ids = await slugIds(db);
  const random = rng(20260806);
  const today = todayIso();

  // Week 0 is twelve weeks ago; each plan entry is one week later.
  const dateFor = (week: number, dayOffset = 0) =>
    shiftIso(today, -(11 - week) * 7 + dayOffset);

  let sessionCount = 0;
  let blockCount = 0;

  const sessionFor = async (date: string): Promise<number> => {
    const [found] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.date, date));
    if (found) return found.id;
    const [made] = await db
      .insert(sessions)
      .values({ date, label: SAMPLE_LABEL })
      .returning();
    sessionCount++;
    return made.id;
  };

  const addBlock = async (
    date: string,
    values: typeof blocks.$inferInsert,
    rows: (typeof blockMovements.$inferInsert)[],
  ) => {
    const sessionId = await sessionFor(date);
    const existing = await db
      .select({ id: blocks.id })
      .from(blocks)
      .where(eq(blocks.sessionId, sessionId));
    const [block] = await db
      .insert(blocks)
      .values({ ...values, sessionId, position: existing.length })
      .returning();
    blockCount++;
    if (rows.length) {
      await db.insert(blockMovements).values(rows.map((r) => ({ ...r, blockId: block.id })));
    }
    return block.id;
  };

  // ---- strength -----------------------------------------------------------
  for (const [planIndex, plan] of [BACK_SQUAT, POWER_CLEAN, DEADLIFT].entries()) {
    const movementId = ids[plan.slug];
    if (!movementId) continue;

    for (const [week, entry] of plan.series.entries()) {
      if (!entry) continue;
      const [reps, topKg] = entry;
      const date = dateFor(week, planIndex);
      const name = titleFor(plan.slug);

      // A warm-up ramp then three working sets at the top load, which is how
      // the sets grid is actually used.
      const rows: (typeof blockMovements.$inferInsert)[] = [];
      const warmups = [0.5, 0.7, 0.85];
      warmups.forEach((f, i) => {
        rows.push({
          blockId: 0,
          movementId,
          setNumber: i + 1,
          loadG: Math.round((topKg * f) / 2.5) * 2500,
          reps,
          isWarmup: true,
        });
      });
      for (let i = 0; i < 3; i++) {
        rows.push({
          blockId: 0,
          movementId,
          setNumber: warmups.length + i + 1,
          loadG: Math.round(topKg * 1000),
          reps,
          // The occasional missed rep, so the failed flag has something to hide.
          isFailed: random() < 0.04,
        });
      }

      await addBlock(
        date,
        {
          sessionId: 0,
          kind: "strength",
          title: `${name} 3x${reps}`,
          rawText: `${name} 3x${reps}\n${topKg} kg`,
          format: "sets",
          scoreType: "load",
          feel: plan.feel[week] ?? null,
        },
        rows,
      );
    }
  }

  // ---- benchmarks ---------------------------------------------------------
  for (const b of BENCHMARKS) {
    const benchmarkId = ids[b.slug];
    if (!benchmarkId) continue;
    const components = COMPONENTS[b.slug] ?? [];
    await addBlock(
      dateFor(b.week, 3),
      {
        sessionId: 0,
        kind: "wod",
        title: titleFor(b.slug),
        benchmarkId,
        rawText: `"${titleFor(b.slug)}"`,
        format: "for_time",
        scoreType: "time",
        scoreValue: b.seconds,
        feel: b.feel,
      },
      components
        .map((slug, i) => ({ blockId: 0, movementId: ids[slug], position: i }))
        .filter((r) => r.movementId != null),
    );
  }

  // ---- an AMRAP and some running -----------------------------------------
  for (const c of CINDY) {
    const benchmarkId = ids["cindy"];
    if (!benchmarkId) continue;
    await addBlock(
      dateFor(c.week, 4),
      {
        sessionId: 0,
        kind: "wod",
        title: "Cindy",
        benchmarkId,
        rawText: '"Cindy"\n20 min AMRAP:\n5 Pull-up\n10 Push-up\n15 Air Squat',
        format: "amrap",
        scoreType: "rounds_reps",
        scoreValue: c.rounds * 30,
        scoreRounds: c.rounds,
        scoreReps: 0,
        feel: c.feel,
      },
      ["pull-up", "push-up", "air-squat"]
        .map((slug, i) => ({ blockId: 0, movementId: ids[slug], position: i, reps: [5, 10, 15][i] }))
        .filter((r) => r.movementId != null),
    );
  }

  for (const r of RUNS) {
    const runId = ids["run"];
    if (!runId) continue;
    await addBlock(
      dateFor(r.week, 5),
      {
        sessionId: 0,
        kind: "wod",
        title: "5k run",
        rawText: "5 km Run",
        format: "for_time",
        scoreType: "time",
        scoreValue: r.seconds,
        feel: r.feel,
      },
      [{ blockId: 0, movementId: runId, distanceM: r.metres }],
    );
  }

  await rebuildAllPrs(db);
  return { sessions: sessionCount, blocks: blockCount };
}

/**
 * Deletes only what loadSampleData created, matched on the session label.
 * Blocks and sets cascade; the PR cache is rebuilt from whatever is left.
 */
export async function removeSampleData(db: DB): Promise<number> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.label, SAMPLE_LABEL));
  if (rows.length) {
    await db.delete(sessions).where(inArray(sessions.id, rows.map((r: { id: number }) => r.id)));
  }
  await rebuildAllPrs(db);
  return rows.length;
}

export async function sampleDataCount(db: DB): Promise<number> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.label, SAMPLE_LABEL));
  return rows.length;
}

const COMPONENTS: Record<string, string[]> = {
  fran: ["thruster", "pull-up"],
  helen: ["run", "kettlebell-swing", "pull-up"],
  grace: ["clean-and-jerk"],
};

const TITLES: Record<string, string> = {
  "back-squat": "Back Squat",
  "power-clean": "Power Clean",
  deadlift: "Deadlift",
  fran: "Fran",
  helen: "Helen",
  grace: "Grace",
};

function titleFor(slug: string): string {
  return TITLES[slug] ?? slug;
}

async function slugIds(db: DB): Promise<Record<string, number>> {
  const wanted = [
    "back-squat", "power-clean", "deadlift", "fran", "helen", "grace", "cindy",
    "thruster", "pull-up", "push-up", "air-squat", "run", "kettlebell-swing",
    "clean-and-jerk",
  ];
  const rows = await db
    .select({ id: movements.id, slug: movements.slug })
    .from(movements)
    .where(inArray(movements.slug, wanted));
  return Object.fromEntries(rows.map((r: { slug: string; id: number }) => [r.slug, r.id]));
}
