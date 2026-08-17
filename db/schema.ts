import { sql, relations } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Five tables. The whole design rests on two ideas:
 *
 *  1. `blocks.raw_text` holds the workout verbatim, exactly as it was read off
 *     the whiteboard or crossfit.com. Nothing is lost to the model. Structure is
 *     layered on top, never a prerequisite for logging.
 *  2. `block_movements` is the only reason movement search is fast. Every
 *     movement mentioned in a block gets a row, and one strength set gets one
 *     row — so a 5x3 power clean is five rows, and no sixth table is needed.
 */

/* -------------------------------------------------------------------------- */
/* movements                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The canonical vocabulary. Holds two kinds of thing so that one search index
 * covers both: individual movements ("Power Clean") and named benchmark
 * workouts ("Fran"). Searching "thruster" should surface every Fran you have
 * ever done, which happens naturally because logging Fran also writes
 * block_movements rows for Thruster and Pull-up.
 */
export const movements = sqliteTable(
  "movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Display name, title case. "Push Jerk", "Fran". */
    name: text("name").notNull(),
    /** Stable machine key. "push-jerk". Never changes; safe for seed diffs. */
    slug: text("slug").notNull(),
    kind: text("kind", { enum: ["movement", "benchmark"] })
      .notNull()
      .default("movement"),
    /**
     * CrossFit's three modalities, plus loading distinctions that matter when
     * you want to know what you have been neglecting. Null for benchmarks.
     */
    modality: text("modality", {
      enum: ["barbell", "dumbbell", "gymnastics", "monostructural", "odd_object"],
    }),
    /** Coarser bucket for the activity charts: "squat", "pull", "press", "hinge", "carry", "engine", "core". */
    pattern: text("pattern"),
    /** JSON array of search aliases: ["T2B", "toes to bar"]. */
    aliases: text("aliases", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    /** What a PR in this thing is measured in, used to pre-fill the log form. */
    defaultScoreType: text("default_score_type", {
      enum: ["load", "time", "reps", "rounds_reps", "distance", "none"],
    }),
    /** For benchmarks: the prescription, so the app can render Fran without a log. */
    prescription: text("prescription"),
    /** True for anything the user added themselves; protects them from seed updates. */
    isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
    /** Soft delete — never hard-delete a movement, it would orphan history. */
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("movements_slug_idx").on(t.slug),
    index("movements_kind_idx").on(t.kind),
  ],
);

/* -------------------------------------------------------------------------- */
/* sessions                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A trip to the gym. Deliberately thin — it owns a date and nothing else of
 * substance. Two-a-days are two sessions on one date, which is why date is
 * indexed but not unique.
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** ISO date, "YYYY-MM-DD". Local calendar day, not UTC — a 6am session must
     *  never drift to the previous day. */
    date: text("date").notNull(),
    /** "Morning class", "Open gym". Optional. */
    label: text("label"),
    notes: text("notes"),
    /* No session-level rating: "how it felt" belongs to a block, because within
     * one session the squats and the running rarely feel the same. */
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("sessions_date_idx").on(t.date)],
);

/* -------------------------------------------------------------------------- */
/* blocks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One strength piece or one WOD. A session has one or more, ordered by
 * `position`. This is the row that carries a score.
 */
export const blocks = sqliteTable(
  "blocks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** Order within the session. 0-based. */
    position: integer("position").notNull().default(0),

    kind: text("kind", { enum: ["strength", "wod"] }).notNull(),
    /** "Power Clean 5x3", "Fran", "Back Squat — build to heavy 3". */
    title: text("title"),
    /** Set when this block is a named workout; points at a movements row with kind='benchmark'. */
    benchmarkId: integer("benchmark_id").references(() => movements.id),
    /** The workout as written, verbatim. Never parsed away. Backs full-text search. */
    rawText: text("raw_text").notNull(),

    /** How the work was organised. Drives the timer and the log form. */
    format: text("format", {
      enum: [
        "sets",
        "for_time",
        "amrap",
        "emom",
        "intervals",
        "chipper",
        "max_effort",
        "other",
      ],
    }).notNull(),

    /* ---- shape ---------------------------------------------------------- */
    /**
     * How much work, the way the whiteboard states it. Only the fields the
     * format uses are ever set:
     *
     *   for_time -> rounds       (1 is a chipper, straight through)
     *   amrap    -> durationMin  ("20 min AMRAP")
     *   emom     -> durationMin + everyMin (everyMin 1 is a plain EMOM,
     *                                       2 is an E2MOM, and so on)
     *
     * There is deliberately no rep-scheme column. A ladder's reps belong to the
     * movements that perform them, and every named ladder already carries its
     * prescription on the benchmark row — so a scheme string here would be a
     * third place for "21-15-9" to live and disagree.
     *
     * Stored rather than re-derived because `raw_text` reads well but cannot be
     * parsed back reliably, and reopening a block has to redisplay the stages
     * as they were answered. `raw_text` remains the source of truth (invariant
     * 1); these are its structured echo, and are null on anything hand-typed.
     */
    rounds: integer("rounds"),
    durationMin: integer("duration_min"),
    everyMin: integer("every_min"),

    /* ---- score ---------------------------------------------------------- */
    /**
     * Everything comparable is one integer, so "is this a PR" is a single
     * comparison with the direction flipped for time. Units by scoreType:
     *   load        -> grams          (100kg = 100_000)
     *   time        -> seconds
     *   reps        -> reps
     *   rounds_reps -> TOTAL reps completed (the comparator)
     *   distance    -> metres
     */
    scoreType: text("score_type", {
      enum: ["load", "time", "reps", "rounds_reps", "distance", "none"],
    }).notNull(),
    scoreValue: integer("score_value"),
    /** Display-only companion. For rounds_reps: completed rounds. Ignored elsewhere. */
    scoreRounds: integer("score_rounds"),
    /** Display-only companion. For rounds_reps: the remainder reps. */
    scoreReps: integer("score_reps"),
    /** True when the score is a DNF against the cap; excluded from PR logic. */
    capped: integer("capped", { mode: "boolean" }).notNull().default(false),

    /**
     * How it felt, 1 (wrecked) to 5 (flying). Optional, and deliberately NOT
     * exertion — this is self-assessed quality, so that a session can record
     * "squats felt weak but the running afterwards felt great". That is why it
     * lives on the block and not on the session.
     *
     * Never feeds PR logic. A bad day that still set a record is still a record.
     */
    feel: integer("feel"),

    timeCapSec: integer("time_cap_sec"),
    /**
     * crossfit.com's "Compare to 260717" — a pointer at the last time the same
     * thing was programmed. NOT YET USED: nothing writes or reads this, because
     * movement search already answers "when did I last do this" well enough.
     * Kept because the column is free and the feature is plausible; delete it
     * if it is still unused when the next migration comes round.
     */
    compareToBlockId: integer("compare_to_block_id"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("blocks_session_idx").on(t.sessionId, t.position),
    index("blocks_kind_idx").on(t.kind),
    index("blocks_benchmark_idx").on(t.benchmarkId),
  ],
);

/* -------------------------------------------------------------------------- */
/* block_movements                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The search index, and the set log, in one table.
 *
 * For a WOD: one row per distinct movement, carrying the prescribed load.
 * For strength: one row per SET, same movementId repeated, `setNumber`
 * incrementing. "Power clean 5x3, building" is five rows with rising loadG,
 * and the 3RM falls out of a MAX() over them.
 */
export const blockMovements = sqliteTable(
  "block_movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    blockId: integer("block_id")
      .notNull()
      .references(() => blocks.id, { onDelete: "cascade" }),
    movementId: integer("movement_id")
      .notNull()
      .references(() => movements.id),
    /** Order of appearance within the block. */
    position: integer("position").notNull().default(0),
    /** 1-based set number for strength. Null for a movement inside a WOD. */
    setNumber: integer("set_number"),

    /** Grams. Integer maths only — never store float kilos. */
    loadG: integer("load_g"),
    /** Reps in this set, or per round in a WOD. */
    reps: integer("reps"),
    /** Metres, for runs, rows, and carries. */
    distanceM: integer("distance_m"),
    /** Seconds, for holds and machine intervals. */
    durationSec: integer("duration_sec"),
    /** Calories, for erg pieces. */
    calories: integer("calories"),

    /** Set-level flags that keep bad data out of PRs. */
    isWarmup: integer("is_warmup", { mode: "boolean" }).notNull().default(false),
    isFailed: integer("is_failed", { mode: "boolean" }).notNull().default(false),
    /** "Every rep touch and go", "belt on". */
    note: text("note"),
  },
  (t) => [
    /** The index that makes "find every session with a snatch" instant. */
    index("block_movements_movement_idx").on(t.movementId),
    index("block_movements_block_idx").on(t.blockId, t.position, t.setNumber),
  ],
);

/* -------------------------------------------------------------------------- */
/* prs                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A cache of current bests, one row per (movement, scoreType, repScheme).
 * Fully derivable from the tables above — recompute on write, and rebuild from
 * scratch whenever the derivation rules change. Exists so the home screen does
 * not run aggregates over the whole history on every render.
 */
export const prs = sqliteTable(
  "prs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    movementId: integer("movement_id")
      .notNull()
      .references(() => movements.id, { onDelete: "cascade" }),
    scoreType: text("score_type", {
      enum: ["load", "time", "reps", "rounds_reps", "distance"],
    }).notNull(),
    /**
     * Which record this is. The rep count ("1", "3", "5", "10") for a rep max;
     * "best" for a benchmark scored on time or reps; "amrap" for a max-rounds
     * effort. Keeping it a string means a new record type never needs a
     * migration. Written in db/queries.ts, candidatesForBlock().
     */
    repScheme: text("rep_scheme").notNull(),
    /** Same units as blocks.scoreValue / blockMovements.loadG. */
    value: integer("value").notNull(),
    /** Display companion, as on blocks. */
    secondary: integer("secondary"),
    /** ISO date the record was set. */
    date: text("date").notNull(),
    /** Provenance. Deleting the source block must trigger a recompute. */
    blockId: integer("block_id").references(() => blocks.id, {
      onDelete: "cascade",
    }),
    /** The record this one beat, so the app can say "+5kg since March". */
    previousValue: integer("previous_value"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("prs_unique_idx").on(t.movementId, t.scoreType, t.repScheme),
    index("prs_date_idx").on(t.date),
  ],
);

/* -------------------------------------------------------------------------- */
/* relations                                                                   */
/* -------------------------------------------------------------------------- */

export const sessionsRelations = relations(sessions, ({ many }) => ({
  blocks: many(blocks),
}));

export const blocksRelations = relations(blocks, ({ one, many }) => ({
  session: one(sessions, {
    fields: [blocks.sessionId],
    references: [sessions.id],
  }),
  benchmark: one(movements, {
    fields: [blocks.benchmarkId],
    references: [movements.id],
  }),
  movements: many(blockMovements),
}));

export const blockMovementsRelations = relations(blockMovements, ({ one }) => ({
  block: one(blocks, {
    fields: [blockMovements.blockId],
    references: [blocks.id],
  }),
  movement: one(movements, {
    fields: [blockMovements.movementId],
    references: [movements.id],
  }),
}));

export const movementsRelations = relations(movements, ({ many }) => ({
  appearances: many(blockMovements),
  prs: many(prs),
}));

export const prsRelations = relations(prs, ({ one }) => ({
  movement: one(movements, {
    fields: [prs.movementId],
    references: [movements.id],
  }),
  block: one(blocks, { fields: [prs.blockId], references: [blocks.id] }),
}));

/* -------------------------------------------------------------------------- */
/* inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type Movement = typeof movements.$inferSelect;
export type NewMovement = typeof movements.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Block = typeof blocks.$inferSelect;
export type NewBlock = typeof blocks.$inferInsert;
export type BlockMovement = typeof blockMovements.$inferSelect;
export type NewBlockMovement = typeof blockMovements.$inferInsert;
export type Pr = typeof prs.$inferSelect;
export type NewPr = typeof prs.$inferInsert;

export type ScoreType = NonNullable<Block["scoreType"]>;
export type BlockFormat = Block["format"];
