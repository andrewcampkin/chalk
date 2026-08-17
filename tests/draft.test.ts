import { beforeEach, describe, expect, it } from "vitest";
import {
  generateRawText,
  useDraft,
  wodHeader,
  type Draft,
  type DraftMovement,
} from "../lib/draft";

/**
 * The workout's shape — how many rounds, how long the clock runs, how often the
 * bell goes — is what the log form's dials write, and `wodHeader` is where it
 * turns back into the line a whiteboard carries. Worth testing properly: the
 * numbers are only ever seen again through this function.
 */

const mov = (name: string, over: Partial<DraftMovement> = {}): DraftMovement => ({
  key: name,
  movementId: 1,
  name,
  modality: null,
  defaultScoreType: null,
  reps: null,
  loadG: null,
  distanceM: null,
  calories: null,
  ...over,
});

function draft(over: Partial<Draft> = {}): Draft {
  useDraft.getState().start("wod", "2026-08-17");
  return { ...useDraft.getState().draft, ...over };
}

beforeEach(() => useDraft.getState().start("wod", "2026-08-17"));

describe("wodHeader", () => {
  it("writes a plain for-time when no rounds are set", () => {
    expect(wodHeader(draft({ format: "for_time" }))).toBe("For time:");
  });

  it("treats one round as a chipper, because that is how it is written", () => {
    expect(wodHeader(draft({ format: "for_time", rounds: 1 }))).toBe("For time:");
  });

  it("counts any number of rounds, not just the ones with a chip", () => {
    expect(wodHeader(draft({ format: "for_time", rounds: 2 }))).toBe("2 rounds for time:");
    expect(wodHeader(draft({ format: "for_time", rounds: 10 }))).toBe("10 rounds for time:");
  });

  it("writes an AMRAP clock of any length", () => {
    expect(wodHeader(draft({ format: "amrap", durationMin: 7 }))).toBe("7 min AMRAP:");
    expect(wodHeader(draft({ format: "amrap", durationMin: 20 }))).toBe("20 min AMRAP:");
  });

  it("marks a missing duration rather than inventing one", () => {
    expect(wodHeader(draft({ format: "amrap", durationMin: null }))).toBe("? min AMRAP:");
  });

  it("leaves the interval unsaid for a plain EMOM", () => {
    expect(wodHeader(draft({ format: "emom", durationMin: 24, everyMin: 1 }))).toBe("EMOM 24 min:");
    expect(wodHeader(draft({ format: "emom", durationMin: 20, everyMin: null }))).toBe("EMOM 20 min:");
  });

  it("spells out a longer interval", () => {
    const d = draft({ format: "emom", durationMin: 15, everyMin: 3 });
    expect(wodHeader(d)).toBe("Every 3 min for 15 min:");
  });

  it("says nothing for a format that has no header", () => {
    expect(wodHeader(draft({ format: "sets" }))).toBe("");
  });
});

describe("generateRawText", () => {
  it("puts the reps on each line when the rounds are uniform", () => {
    const d = draft({
      format: "for_time",
      rounds: 5,
      movements: [mov("Pull-up", { reps: 7 }), mov("Push-up", { reps: 14 })],
    });
    expect(generateRawText(d, "kg")).toBe("5 rounds for time:\n7 Pull-up\n14 Push-up");
  });

  it("lets a benchmark state itself, ladder and all", () => {
    // This is what replaced the rep-scheme field. No round count or per-movement
    // rep box says "21-15-9" as well as the prescription already does, and the
    // auto-tagged components are listed in it rather than repeated under it.
    const d = draft({
      format: "for_time",
      benchmarkName: "Fran",
      benchmarkPrescription: "21-15-9 reps for time: thruster (95/65 lb), pull-up",
      movements: [mov("Thruster"), mov("Pull-up")],
    });
    expect(generateRawText(d, "kg")).toBe(
      '"Fran"\n21-15-9 reps for time: thruster (95/65 lb), pull-up',
    );
  });

  it("keeps what was actually typed alongside the prescription", () => {
    const d = draft({
      format: "for_time",
      benchmarkName: "Fran",
      benchmarkPrescription: "21-15-9 reps for time: thruster (95/65 lb), pull-up",
      movements: [mov("Thruster", { loadG: 40_000 }), mov("Pull-up")],
    });
    expect(generateRawText(d, "kg")).toBe(
      '"Fran"\n21-15-9 reps for time: thruster (95/65 lb), pull-up\nThruster (40 kg)',
    );
  });
});

describe("setFormat", () => {
  const { setFormat, patch } = useDraft.getState();

  it("clears a score typed in the old format's units", () => {
    // 4:12 entered as a time is 252 seconds. Read as a rounds total it would
    // claim 252 rounds, and nothing downstream could tell the difference.
    patch({ format: "for_time", scoreType: "time", scoreValue: 252 });
    setFormat("amrap");
    const d = useDraft.getState().draft;
    expect(d.scoreType).toBe("rounds_reps");
    expect(d.scoreValue).toBeNull();
    expect(d.scoreRounds).toBeNull();
  });

  it("drops the answers the new format stops asking for", () => {
    patch({ format: "for_time", rounds: 5 });
    setFormat("amrap");
    expect(useDraft.getState().draft.rounds).toBeNull();
  });

  it("opens Rounds on one — a chipper, straight through", () => {
    setFormat("amrap");
    setFormat("for_time");
    expect(useDraft.getState().draft.rounds).toBe(1);
  });

  it("keeps the clock when moving between the two timed formats", () => {
    setFormat("amrap");
    patch({ durationMin: 16 });
    setFormat("emom");
    expect(useDraft.getState().draft.durationMin).toBe(16);
  });

  it("starts an EMOM at every minute", () => {
    setFormat("emom");
    expect(useDraft.getState().draft.everyMin).toBe(1);
  });

  it("clears a cap on an AMRAP, which cannot be capped", () => {
    patch({ capped: true });
    setFormat("amrap");
    expect(useDraft.getState().draft.capped).toBe(false);
  });

  it("still knows the formats the picker no longer offers", () => {
    setFormat("intervals");
    expect(useDraft.getState().draft.scoreType).toBe("time");
    setFormat("chipper");
    expect(useDraft.getState().draft.scoreType).toBe("time");
  });
});

describe("setKind", () => {
  it("takes the WOD shape off a strength piece", () => {
    const { setKind, patch } = useDraft.getState();
    patch({ format: "amrap", durationMin: 20, rounds: 5, scoreValue: 300 });
    setKind("strength");
    const d = useDraft.getState().draft;
    expect(d.format).toBe("sets");
    // A strength block's score lives on its set rows, never on the block.
    expect(d.scoreType).toBe("none");
    expect(d.scoreValue).toBeNull();
    expect([d.rounds, d.durationMin, d.everyMin]).toEqual([null, null, null]);
  });
});
