/**
 * "How did that feel" — 1 to 5, optional, per block.
 *
 * Five points rather than an RPE 1-10 because it has to be a single confident
 * tap while lying on the floor, and because nobody can honestly distinguish a
 * 6 from a 7 in that state.
 *
 * The ramp runs red -> neutral -> green and deliberately skips amber. Chalk
 * yellow means "personal record" and nothing else; a rating that shaded towards
 * it would quietly devalue the one colour that is supposed to matter.
 */

export type Feel = 1 | 2 | 3 | 4 | 5;

export const FEELS: {
  value: Feel;
  label: string;
  short: string;
  color: string;
}[] = [
  { value: 1, label: "Wrecked", short: "Wrecked", color: "#C15A4A" },
  { value: 2, label: "Flat", short: "Flat", color: "#A86B52" },
  { value: 3, label: "Normal", short: "Normal", color: "#7C7570" },
  { value: 4, label: "Strong", short: "Strong", color: "#6E9B7A" },
  { value: 5, label: "Flying", short: "Flying", color: "#5BB37E" },
];

export function feelColor(feel: number | null | undefined): string | null {
  if (feel == null) return null;
  return FEELS.find((f) => f.value === feel)?.color ?? null;
}

export function feelLabel(feel: number | null | undefined): string | null {
  if (feel == null) return null;
  return FEELS.find((f) => f.value === feel)?.label ?? null;
}

/**
 * Blends the ramp for an average, so a movement sitting at 2.4 reads as the
 * colour between Flat and Normal rather than snapping to one of them.
 */
export function feelColorContinuous(avg: number | null | undefined): string | null {
  if (avg == null || !Number.isFinite(avg)) return null;
  const clamped = Math.min(5, Math.max(1, avg));
  const lo = FEELS[Math.floor(clamped) - 1];
  const hi = FEELS[Math.min(4, Math.ceil(clamped) - 1)];
  if (!lo || !hi) return null;
  return mix(lo.color, hi.color, clamped - Math.floor(clamped));
}

function mix(a: string, b: string, t: number): string {
  const pa = hex(a);
  const pb = hex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function hex(h: string): [number, number, number] {
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}
