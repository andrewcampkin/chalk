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

  /** Strength: one movement, many sets. */
  strengthMovementId: number | null;
  strengthMovementName: string | null;
  sets: DraftSet[];
  gridOpen: boolean;

  /** WOD: many movements, one score. */
  movements: DraftMovement[];
  /** "21-15-9", "5 rounds", free text — drives the generated raw text. */
  repScheme: string;
  rounds: number | null;
  durationMin: number | null;

  scoreType: ScoreType;
  scoreValue: number | null;
  scoreRounds: number | null;
  scoreReps: number | null;
  capped: boolean;
  /** 1-5, optional. See lib/feel.ts. */
  feel: number | null;
  notes: string;
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
    strengthMovementId: null,
    strengthMovementName: null,
    sets: [{ key: key(), reps: null, loadG: null, isWarmup: false, isFailed: false }],
    gridOpen: false,
    movements: [],
    repScheme: "",
    rounds: null,
    durationMin: null,
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

  setFormat: (f) =>
    set((s) => ({
      draft: {
        ...s.draft,
        format: f,
        // The score type follows the format — an AMRAP is scored in rounds,
        // a for-time in seconds. Pre-selecting it removes a tap.
        scoreType:
          f === "amrap"
            ? "rounds_reps"
            : f === "for_time" || f === "chipper" || f === "intervals"
              ? "time"
              : f === "emom" || f === "max_effort"
                ? "reps"
                : s.draft.scoreType,
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

  const header =
    d.format === "amrap"
      ? `${d.durationMin ?? "?"} min AMRAP:`
      : d.format === "emom"
        ? `EMOM ${d.durationMin ?? "?"} min:`
        : d.repScheme
          ? `${d.repScheme} ${FORMAT_LABEL[d.format]}:`.trim()
          : d.rounds
            ? `${d.rounds} rounds ${FORMAT_LABEL[d.format]}:`.trim()
            : `${FORMAT_LABEL[d.format]}:`.replace(/^:$/, "").trim();

  const body = d.movements.map(line).join("\n");
  return [d.benchmarkName ? `"${d.benchmarkName}"` : "", header, body]
    .filter(Boolean)
    .join("\n");
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
