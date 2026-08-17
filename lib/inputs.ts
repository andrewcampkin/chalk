/**
 * Which fields a movement should offer when logging it.
 *
 * Driven by the seed's `defaultScoreType`, NOT by modality. Double-unders,
 * single-unders and crossovers are all monostructural but are counted in reps,
 * so keying on modality would put a metres box next to a skipping rope.
 *
 * Nobody does reps of running, and nobody loads a barbell for a 400.
 */

export type InputKind = "reps" | "load" | "distance" | "calories";

export type MovementShape = {
  modality?: string | null;
  defaultScoreType?: string | null;
};

export function inputsFor(m: MovementShape): InputKind[] {
  if (m.defaultScoreType === "distance") return ["distance", "calories"];
  if (isBodyweight(m)) return ["reps"];
  return ["reps", "load"];
}

export function isDistanceMovement(m: MovementShape): boolean {
  return m.defaultScoreType === "distance";
}

/**
 * Gymnastics is your own bodyweight, so it gets no kilos box.
 *
 * This one keys on modality where the distance question keys on score type,
 * and that is not an inconsistency: "is it measured in metres" is a property of
 * how the movement is counted, while "is there a barbell" is a property of what
 * the movement is. A pull-up and a double-under are both counted in reps, and
 * only one of them ever has a plate on it.
 *
 * Weighted variants do exist, so the log form can still reveal a load on
 * request — it is just not sitting there on the common path, where every
 * pull-up in every WOD would otherwise carry an empty kg box.
 */
export function isBodyweight(m: MovementShape): boolean {
  return m.modality === "gymnastics";
}

/** Common CrossFit distances, so the usual case is one tap rather than typing. */
export const DISTANCE_PRESETS = [200, 400, 800, 1000, 2000, 5000];

export function presetLabel(metres: number): string {
  return metres >= 1000 ? `${metres / 1000}k` : `${metres}m`;
}
