/**
 * A logbook, not a dashboard. The reference is the notebook on the shelf by the
 * whiteboard: dated entries, tabular figures, the workout as written.
 *
 * One accent, used only for records. If chalk-yellow shows up anywhere that is
 * not a personal best, it stops meaning anything.
 */

export const colors = {
  bg: "#12100E",
  surface: "#1B1815",
  surfaceHi: "#262220",
  line: "#332E2A",

  text: "#F2EDE6",
  textDim: "#A39A8E",
  textFaint: "#6B635A",

  /** Records only. Never decoration. */
  accent: "#F5C542",
  accentDim: "#5C4A18",

  strength: "#7FA8C9",
  wod: "#C98F7F",
  danger: "#C96B5B",
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
};

/**
 * Minimum 56 — the whole app is operated lying on the floor with shaking hands.
 * Nothing tappable is ever smaller than this.
 */
export const tap = {
  min: 56,
  chip: 52,
  key: 64,
};

export const type = {
  /** Numbers are the interface. Tabular figures so loads stack in a column. */
  mono: "monospace" as const,
  display: 44,
  score: 34,
  title: 20,
  body: 16,
  label: 13,
  tiny: 11,
};
