import { create } from "zustand";
import type { BlockFormat, ScoreType } from "../db/schema";
import { formatDistance, formatLoad, type Unit } from "../db/score";
import { todayIso as isoToday } from "./dates";

/**
 * The in-progress log. The ONLY thing Zustand owns — everything else reads from
 * SQLite. Lives here rather than in component state so the movement picker can
 * be a separate screen without prop-drilling a half-finished workout through it.
 */

export type DraftSet = {
  key: string;
  reps: number | null;
  loadG: number | null;
  isWarmup: boolean;
  isFailed: boolean;
};

export type DraftMovement = {
  key: string;
  movementId: number;
  name: string;
  /** Carried from the seed so the form knows to offer metres, not kilos. */
  modality: string | null;
  defaultScoreType: string | null;
  /** Reps per round, or total for a chipper. */
  reps: number | null;
  loadG: number | null;
  distanceM: number | null;
  calories: number | null;
};

export type Draft = {
  date: string;
  kind: "strength" | "wod";
  format: BlockFormat;
  title: string;

  /** Verbatim text. Generated from the structured fields until the user edits it. */
  rawText: string;
  rawTextDirty: boolean;

  benchmarkId: number | null;
  benchmarkName: string | null;
  /**
   * The seeded prescription — "21-15-9 reps for time: thruster, pull-up". This
   * is where a ladder's reps come from now that there is no rep-scheme field:
   * the real wording, straight off the benchmark row, rather than a string
   * retyped into a chip.
   */
  benchmarkPrescription: string | null;

  /** Strength: one movement, many sets. */
  strengthMovementId: number | null;
  strengthMovementName: string | null;
  sets: DraftSet[];
  gridOpen: boolean;

  /** WOD: many movements, one score. */
  movements: DraftMovement[];
  /**
   * How much work. Which of these apply is decided by `format` — see the shape
   * comment on the blocks table. Anything the current format does not use is
   * cleared by setFormat rather than left to linger, so a stage never carries
   * an answer to a question it stopped asking.
   */
  rounds: number | null;
  durationMin: number | null;
  /** EMOM interval: 1 is a plain EMOM, 2 an E2MOM. Null for other formats. */
  everyMin: number | null;

  scoreType: ScoreType;
  scoreValue: number | null;
  scoreRounds: number | null;
  scoreReps: number | null;
  capped: boolean;
  /** 1-5, optional. See lib/feel.ts. */
  feel: number | null;
  notes: string;
};

/**
 * The score type each format implies. An AMRAP is scored in rounds, a for-time
 * in seconds — pre-selecting it removes a tap.
 *
 * `chipper` and `intervals` are no longer offered by the log form (a chipper is
 * a for-time with no rounds, and "5 rounds for time" is a for-time with five),
 * but old blocks still carry them, so they keep their mapping here.
 */
const SCORE_TYPE_FOR_FORMAT: Partial<Record<BlockFormat, ScoreType>> = {
  for_time: "time",
  chipper: "time",
  intervals: "time",
  amrap: "rounds_reps",
  emom: "reps",
  max_effort: "reps",
};

let seq = 0;
const key = () => `k${++seq}`;

/** Re-exported so callers have one source of truth for invariant 7. */
export { todayIso } from "./dates";

function emptyDraft(kind: "strength" | "wod", date: string): Draft {
  return {
    date,
    kind,
    format: kind === "strength" ? "sets" : "for_time",
    title: "",
    rawText: "",
    rawTextDirty: false,
    benchmarkId: null,
    benchmarkName: null,
    benchmarkPrescription: null,
    strengthMovementId: null,
    strengthMovementName: null,
    sets: [{ key: key(), reps: null, loadG: null, isWarmup: false, isFailed: false }],
    gridOpen: false,
    movements: [],
    // One round — a chipper, straight through — is the commonest workout there
    // is, so it is what the Rounds stage opens on rather than a blank.
    rounds: kind === "wod" ? 1 : null,
    durationMin: null,
    everyMin: null,
    // Strength has no block-level score: the sets carry the loads, and a rep
    // max is derived from those rows. See app/log.tsx.
    scoreType: kind === "strength" ? "none" : "time",
    scoreValue: null,
    scoreRounds: null,
    scoreReps: null,
    capped: false,
    feel: null,
    notes: "",
  };
}

type Store = {
  draft: Draft;
  unit: Unit;
  start: (kind: "strength" | "wod", date?: string) => void;
  /** Replaces the whole draft — used when opening a saved block for editing. */
  load: (d: Draft) => void;
  patch: (p: Partial<Draft>) => void;
  setKind: (k: "strength" | "wod") => void;
  setFormat: (f: BlockFormat) => void;
  addMovement: (m: {
    id: number;
    name: string;
    modality?: string | null;
    defaultScoreType?: string | null;
  }) => void;
  removeMovement: (k: string) => void;
  patchMovement: (k: string, p: Partial<DraftMovement>) => void;
  addSet: () => void;
  removeSet: (k: string) => void;
  patchSet: (k: string, p: Partial<DraftSet>) => void;
  setUnit: (u: Unit) => void;
};

export const useDraft = create<Store>((set, get) => ({
  draft: emptyDraft("wod", isoToday()),
  unit: "kg",

  start: (kind, date) => set({ draft: emptyDraft(kind, date ?? isoToday()) }),

  load: (d) => set({ draft: d }),

  patch: (p) => set((s) => ({ draft: { ...s.draft, ...p } })),

  /**
   * Switching between a WOD and a strength piece changes what a score even
   * means, so everything downstream of the choice is reset. Movements and sets
   * are left alone: they live in separate fields and the two halves of the form
   * never show both.
   */
  setKind: (k) =>
    set((s) => ({
      draft: {
        ...s.draft,
        kind: k,
        format: k === "strength" ? "sets" : "for_time",
        // Strength carries no block-level score — the sets hold the loads, and
        // a rep max is derived from those rows. See app/log.tsx.
        scoreType: k === "strength" ? "none" : "time",
        scoreValue: null,
        scoreRounds: null,
        scoreReps: null,
        capped: false,
        // The shape describes a WOD and nothing else.
        rounds: k === "wod" ? 1 : null,
        durationMin: null,
        everyMin: null,
      },
    })),

  setFormat: (f) =>
    set((s) => ({
      draft: {
        ...s.draft,
        format: f,
        scoreType: SCORE_TYPE_FOR_FORMAT[f] ?? s.draft.scoreType,
        // The score already typed was in the old format's units: 4:12 entered
        // as a time is 252, which read as a rounds total would claim 252
        // rounds. The format is chosen before the score in every real flow, so
        // clearing it costs nothing and stops a nonsense number being saved.
        scoreValue: null,
        scoreRounds: null,
        scoreReps: null,
        // An AMRAP ends when the clock does — there is no cap to fall short of.
        capped: f === "amrap" ? false : s.draft.capped,
        // Drop the answers the new format stops asking for, so nothing stale
        // reaches the database.
        rounds: f === "for_time" ? (s.draft.rounds ?? 1) : null,
        durationMin: f === "amrap" || f === "emom" ? s.draft.durationMin : null,
        everyMin: f === "emom" ? (s.draft.everyMin ?? 1) : null,
      },
    })),

  addMovement: (m) =>
    set((s) => ({
      draft: {
        ...s.draft,
        movements: s.draft.movements.some((x) => x.movementId === m.id)
          ? s.draft.movements
          : [
              ...s.draft.movements,
              {
                key: key(),
                movementId: m.id,
                name: m.name,
                modality: m.modality ?? null,
                defaultScoreType: m.defaultScoreType ?? null,
                reps: null,
                loadG: null,
                distanceM: null,
                calories: null,
              },
            ],
      },
    })),

  removeMovement: (k) =>
    set((s) => ({
      draft: { ...s.draft, movements: s.draft.movements.filter((m) => m.key !== k) },
    })),

  patchMovement: (k, p) =>
    set((s) => ({
      draft: {
        ...s.draft,
        movements: s.draft.movements.map((m) => (m.key === k ? { ...m, ...p } : m)),
      },
    })),

  addSet: () =>
    set((s) => {
      const last = s.draft.sets[s.draft.sets.length - 1];
      return {
        draft: {
          ...s.draft,
          gridOpen: true,
          sets: [
            ...s.draft.sets,
            {
              key: key(),
              // Carry the rep count down the grid so only loads need typing.
              reps: last?.reps ?? null,
              loadG: last?.loadG ?? null,
              isWarmup: false,
              isFailed: false,
            },
          ],
        },
      };
    }),

  removeSet: (k) =>
    set((s) => ({
      draft: {
        ...s.draft,
        sets: s.draft.sets.length > 1 ? s.draft.sets.filter((x) => x.key !== k) : s.draft.sets,
      },
    })),

  patchSet: (k, p) =>
    set((s) => ({
      draft: {
        ...s.draft,
        sets: s.draft.sets.map((x) => (x.key === k ? { ...x, ...p } : x)),
      },
    })),

  setUnit: (u) => set({ unit: u }),
}));

/* -------------------------------------------------------------------------- */
/* raw text generation                                                         */
/* -------------------------------------------------------------------------- */

const FORMAT_LABEL: Record<BlockFormat, string> = {
  sets: "",
  for_time: "for time",
  amrap: "AMRAP",
  emom: "EMOM",
  intervals: "intervals",
  chipper: "for time",
  max_effort: "max effort",
  other: "",
};

/**
 * Builds the verbatim text from the structured entry, so `raw_text` is always
 * populated without the user typing prose. The moment they edit it by hand,
 * `rawTextDirty` latches and this stops overwriting them.
 */
export function generateRawText(d: Draft, unit: Unit): string {
  const line = (m: DraftMovement) => {
    // A run reads "400 m Run", not "Run (400 m)".
    if (m.distanceM || m.calories) {
      const lead = m.distanceM ? formatDistance(m.distanceM) : `${m.calories} cal`;
      const tail = m.distanceM && m.calories ? ` (${m.calories} cal)` : "";
      return `${lead} ${m.name}${tail}`;
    }
    const bits = [m.reps ? String(m.reps) : null, m.name].filter(Boolean).join(" ");
    const extras: string[] = [];
    if (m.loadG) extras.push(formatLoad(m.loadG, unit));
    return extras.length ? `${bits} (${extras.join(", ")})` : bits;
  };

  if (d.kind === "strength") {
    const name = d.strengthMovementName ?? "";
    const working = d.sets.filter((s) => s.loadG != null || s.reps != null);
    const scheme =
      working.length > 1 && working.every((s) => s.reps === working[0].reps)
        ? `${working.length}x${working[0].reps ?? ""}`
        : working.map((s) => s.reps ?? "?").join("-");
    const loads = working
      .map((s) => (s.loadG != null ? formatLoad(s.loadG, unit).replace(/ (kg|lb)$/, "") : "—"))
      .join(" / ");
    const head = [name, scheme].filter(Boolean).join(" ");
    return [head, loads ? `${loads} ${unit}` : ""].filter(Boolean).join("\n");
  }

  // A benchmark states itself better than the stages can. Fran is "21-15-9
  // reps for time", and no round count or per-movement rep box will ever say
  // that as well as the prescription already does. The auto-tagged components
  // still get their block_movements rows, so search is unaffected either way.
  if (d.benchmarkPrescription) {
    // Anything the user actually typed — a load, a scaled rep count — is worth
    // keeping alongside it. Bare component names are not: the prescription
    // just listed them.
    const own = d.movements.filter(
      (m) => m.reps != null || m.loadG != null || m.distanceM != null || m.calories != null,
    );
    return [`"${d.benchmarkName}"`, d.benchmarkPrescription, ...own.map(line)].join("\n");
  }

  const body = d.movements.map(line).join("\n");
  return [d.benchmarkName ? `"${d.benchmarkName}"` : "", wodHeader(d), body]
    .filter(Boolean)
    .join("\n");
}

/**
 * The line a whiteboard carries above the movements, written the way CrossFit
 * writes it: "For time:", "5 rounds for time:", "20 min AMRAP:", "EMOM 24 min:".
 */
export function wodHeader(d: Draft): string {
  const label = FORMAT_LABEL[d.format];

  if (d.format === "amrap") return `${d.durationMin ?? "?"} min AMRAP:`;

  if (d.format === "emom") {
    const mins = d.durationMin ?? "?";
    // "EMOM" already says every minute. Anything longer has to be spelled out.
    return (d.everyMin ?? 1) <= 1
      ? `EMOM ${mins} min:`
      : `Every ${d.everyMin} min for ${mins} min:`;
  }

  // A single round is a chipper, and a whiteboard just writes "For time:".
  if (d.rounds && d.rounds > 1) return `${d.rounds} rounds ${label}:`.trim();
  return label ? `${label[0].toUpperCase()}${label.slice(1)}:` : "";
}

/** A sensible block title without asking for one. */
export function generateTitle(d: Draft): string {
  if (d.title.trim()) return d.title.trim();
  if (d.benchmarkName) return d.benchmarkName;
  if (d.kind === "strength") {
    const working = d.sets.filter((s) => s.loadG != null);
    const scheme =
      working.length > 1 && working.every((s) => s.reps === working[0].reps)
        ? `${working.length}x${working[0].reps ?? ""}`
        : "";
    return [d.strengthMovementName ?? "Strength", scheme].filter(Boolean).join(" ");
  }
  if (d.movements.length) {
    const names = d.movements.map((m) => m.name);
    return names.length <= 2 ? names.join(" + ") : `${names[0]} +${names.length - 1}`;
  }
  return d.format === "amrap" ? "AMRAP" : "WOD";
}
