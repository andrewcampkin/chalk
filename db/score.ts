import type { ScoreType } from "./schema";

/**
 * Every score in the database is one integer. This file is the only place that
 * knows what those integers mean. If a number is being formatted or compared
 * anywhere else in the app, that is a bug.
 *
 * Units:
 *   load     -> grams
 *   time     -> seconds
 *   reps     -> reps
 *   distance -> metres
 */

/** For time, smaller wins. For everything else, bigger wins. */
export function higherIsBetter(scoreType: ScoreType): boolean {
  return scoreType !== "time";
}

export function isBetter(
  scoreType: ScoreType,
  candidate: number,
  incumbent: number | null | undefined,
): boolean {
  if (incumbent == null) return true;
  return higherIsBetter(scoreType)
    ? candidate > incumbent
    : candidate < incumbent;
}

/* -------------------------------------------------------------------------- */
/* load                                                                        */
/* -------------------------------------------------------------------------- */

const LB_IN_GRAMS = 453.59237;

export type Unit = "kg" | "lb";

export function kgToGrams(kg: number): number {
  return Math.round(kg * 1000);
}

export function lbToGrams(lb: number): number {
  return Math.round(lb * LB_IN_GRAMS);
}

export function gramsToKg(g: number): number {
  return g / 1000;
}

export function gramsToLb(g: number): number {
  return g / LB_IN_GRAMS;
}

export function toGrams(value: number, unit: Unit): number {
  return unit === "kg" ? kgToGrams(value) : lbToGrams(value);
}

/** Parses "100", "100kg", "82.5 kg", "225lb" into grams. Null if unreadable. */
export function parseLoad(input: string, fallbackUnit: Unit): number | null {
  const raw = input.trim().toLowerCase().replace(/,/g, "");
  if (!raw) return null;
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*(kg|kgs|k|lb|lbs|#)?$/);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const suffix = m[2];
  const unit: Unit = suffix
    ? suffix.startsWith("k")
      ? "kg"
      : "lb"
    : fallbackUnit;
  return toGrams(value, unit);
}

/**
 * One decimal place, trailing ".0" trimmed. Deliberately does NOT round to
 * plate increments — a logged lift is what was actually on the bar, and a gym
 * with 0.5kg change plates or an odd dumbbell would have its number quietly
 * rewritten.
 */
export function formatLoad(grams: number | null, unit: Unit): string {
  if (grams == null) return "—";
  if (unit === "kg") {
    const kg = gramsToKg(grams);
    return `${trimZeros(kg.toFixed(1))} kg`;
  }
  const lb = gramsToLb(grams);
  return `${trimZeros(lb.toFixed(1))} lb`;
}

function trimZeros(s: string): string {
  return s.replace(/\.0$/, "");
}

/* -------------------------------------------------------------------------- */
/* time                                                                        */
/* -------------------------------------------------------------------------- */

/** "3:21" or "1:04:30". Seconds in, whiteboard notation out. */
export function formatTime(totalSeconds: number | null): string {
  if (totalSeconds == null) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0
    ? `${h}:${mm}:${String(s).padStart(2, "0")}`
    : `${mm}:${String(s).padStart(2, "0")}`;
}

/** Accepts "3:21", "3.21", "201" (seconds), "3m21s". Returns seconds or null. */
export function parseTime(input: string): number | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  const colon = raw.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/);
  if (colon) {
    const [, h, m, s] = colon;
    return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s);
  }
  const mmss = raw.match(/^(\d{1,3})[:.](\d{1,2})$/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);

  const worded = raw.match(/^(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/);
  if (worded && (worded[1] || worded[2])) {
    return Number(worded[1] ?? 0) * 60 + Number(worded[2] ?? 0);
  }
  const bare = raw.match(/^\d+$/);
  if (bare) return Number(raw);
  return null;
}

/* -------------------------------------------------------------------------- */
/* rounds + reps                                                               */
/* -------------------------------------------------------------------------- */

/**
 * AMRAP scores are stored as total reps so they compare as one integer, with
 * rounds and remainder kept alongside for display. This needs the round length,
 * which the app derives from the sum of prescribed reps in block_movements.
 */
export function roundsRepsToTotal(
  rounds: number,
  reps: number,
  repsPerRound: number,
): number {
  return rounds * repsPerRound + reps;
}

export function formatRoundsReps(
  rounds: number | null,
  reps: number | null,
): string {
  if (rounds == null) return "—";
  return reps ? `${rounds} + ${reps}` : `${rounds} rounds`;
}

/* -------------------------------------------------------------------------- */
/* one formatter to rule them all                                              */
/* -------------------------------------------------------------------------- */

export function formatScore(
  scoreType: ScoreType,
  value: number | null,
  opts: { rounds?: number | null; reps?: number | null; unit?: Unit } = {},
): string {
  const unit = opts.unit ?? "kg";
  switch (scoreType) {
    case "load":
      return formatLoad(value, unit);
    case "time":
      return formatTime(value);
    case "reps":
      return value == null ? "—" : `${value} reps`;
    case "rounds_reps":
      return formatRoundsReps(opts.rounds ?? null, opts.reps ?? null);
    case "distance":
      return value == null ? "—" : `${value} m`;
    case "none":
      return "—";
  }
}

/* -------------------------------------------------------------------------- */
/* estimated 1RM                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Epley. Used only for a greyed-out "estimated" line next to real records — an
 * estimate must never be written to the prs table or the number stops meaning
 * anything.
 */
export function estimateOneRepMax(loadG: number, reps: number): number {
  if (reps <= 1) return loadG;
  return Math.round(loadG * (1 + reps / 30));
}
