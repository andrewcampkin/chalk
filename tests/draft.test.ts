import { beforeEach, describe, expect, it } from "vitest";
import {
  emptyRound,
  generateRawText,
  roundCount,
  useDraft,
  wodHeader,
  type Draft,
  type DraftMovement,
  type RoundEntry,
} from "../lib/draft";

/**
 * The workout's shape — how many rounds, what happens in each of them, how long
 * the clock runs — is what the staged setup and the round grid write, and the
 * text generator is where it turns back into the lines a whiteboard carries.
 * Worth testing properly: the numbers are only ever read back through here.
 */

/** One argument per round, so mov("Thruster", {reps:21}, {reps:15}) is a ladder. */
const mov = (name: string, ...rounds: Partial<RoundEntry>[]): DraftMovement => ({
  key: name,
  movementId: 1,
  name,
  modality: null,
  defaultScoreType: null,
  rounds: (rounds.length ? rounds : [{}]).map((r) => ({ ...emptyRound(), ...r })),
});

const reps = (...ns: number[]) => ns.map((n) => ({ reps: n }));

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
      movements: [mov("Pull-up", ...reps(7, 7, 7, 7, 7)), mov("Push-up", ...reps(14, 14, 14, 14, 14))],
    });
    expect(generateRawText(d, "kg")).toBe("5 rounds for time:\n7 Pull-up\n14 Push-up");
  });

  it("writes a shared ladder as the header, the way a whiteboard does", () => {
    const d = draft({
      format: "for_time",
      rounds: 3,
      movements: [
        mov("Thruster", { reps: 21, loadG: 43_000 }, { reps: 15, loadG: 43_000 }, { reps: 9, loadG: 43_000 }),
        mov("Pull-up", ...reps(21, 15, 9)),
      ],
    });
    // Not "3 rounds for time" — the ladder is what defines the workout, and
    // repeating it against each line would read as a contradiction.
    expect(generateRawText(d, "kg")).toBe("21-15-9 reps for time:\nThruster (43 kg)\nPull-up");
  });

  it("gives each movement its own ladder when they differ", () => {
    const d = draft({
      format: "for_time",
      rounds: 4,
      movements: [
        mov("Walking Lunge", ...reps(20, 15, 10, 5)),
        // Open 25.1's shape: one movement climbs while the other holds.
        mov("Burpee", ...reps(3, 3, 3, 3)),
      ],
    });
    expect(generateRawText(d, "kg")).toBe(
      "4 rounds for time:\n20-15-10-5 Walking Lunge\n3 Burpee",
    );
  });

  it("ladders a load that climbs while the reps fall", () => {
    const d = draft({
      format: "for_time",
      rounds: 3,
      movements: [
        mov("Squat Clean", { reps: 3, loadG: 80_000 }, { reps: 2, loadG: 90_000 }, { reps: 1, loadG: 100_000 }),
      ],
    });
    // The Games' Climbing Couplet shape. The ladder is shared (there is only
    // one movement following it), so it heads the workout and the line carries
    // the loads that go with it.
    expect(generateRawText(d, "kg")).toBe("3-2-1 reps for time:\nSquat Clean (80-90-100 kg)");
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

describe("strength text", () => {
  const withSets = (sets: { reps: number; loadG: number | null }[]): Draft =>
    draft({
      kind: "strength",
      format: "sets",
      strengthMovementName: "Front Squat",
      sets: sets.map((s, i) => ({ key: `s${i}`, ...s, isWarmup: false, isFailed: false })),
    });

  it("says a uniform load once, not once per set", () => {
    const d = withSets(Array.from({ length: 5 }, () => ({ reps: 5, loadG: 80_000 })));
    expect(generateRawText(d, "kg")).toBe("Front Squat 5x5\n80 kg");
  });

  it("spells out a load that actually moved", () => {
    const d = withSets([
      { reps: 3, loadG: 60_000 },
      { reps: 3, loadG: 70_000 },
      { reps: 3, loadG: 80_000 },
    ]);
    expect(generateRawText(d, "kg")).toBe("Front Squat 3x3\n60 / 70 / 80 kg");
  });
});

describe("the round grid", () => {
  const add = (name: string, id: number) => useDraft.getState().addMovement({ id, name });
  const reps0 = () => useDraft.getState().draft.movements[0].rounds.map((r) => r.reps);

  it("gives a new movement a round for every round of the workout", () => {
    useDraft.getState().setRounds(3);
    add("Thruster", 1);
    expect(reps0()).toHaveLength(3);
  });

  it("reshapes what is already there when the round count changes", () => {
    add("Thruster", 1);
    useDraft.getState().patchRound(useDraft.getState().draft.movements[0].key, 0, { reps: 10 });
    useDraft.getState().setRounds(4);
    // A new round copies the one before it, so a uniform workout is typed once.
    expect(reps0()).toEqual([10, 10, 10, 10]);
    useDraft.getState().setRounds(2);
    expect(reps0()).toEqual([10, 10]);
  });

  it("carries an edit down to the rounds that still agreed with it", () => {
    useDraft.getState().setRounds(5);
    add("Pull-up", 1);
    const k = useDraft.getState().draft.movements[0].key;
    useDraft.getState().patchRound(k, 0, { reps: 7 });
    expect(reps0()).toEqual([7, 7, 7, 7, 7]);
  });

  it("is three edits for a 21-15-9, not nine", () => {
    useDraft.getState().setRounds(3);
    add("Thruster", 1);
    const k = useDraft.getState().draft.movements[0].key;
    // Each entry sweeps the rounds below it, and each is then corrected in turn.
    useDraft.getState().patchRound(k, 0, { reps: 21 });
    expect(reps0()).toEqual([21, 21, 21]);
    useDraft.getState().patchRound(k, 1, { reps: 15 });
    expect(reps0()).toEqual([21, 15, 15]);
    useDraft.getState().patchRound(k, 2, { reps: 9 });
    expect(reps0()).toEqual([21, 15, 9]);
  });

  it("never overwrites a round that has been given its own value", () => {
    useDraft.getState().setRounds(3);
    add("Thruster", 1);
    const k = useDraft.getState().draft.movements[0].key;
    useDraft.getState().patchRound(k, 0, { reps: 21 });
    useDraft.getState().patchRound(k, 2, { reps: 9 });
    // Round 3 has stopped agreeing, so going back to round 1 must leave it be.
    useDraft.getState().patchRound(k, 0, { reps: 20 });
    expect(reps0()).toEqual([20, 20, 9]);
  });

  it("collapses to one round for an AMRAP, which repeats until the clock stops", () => {
    useDraft.getState().setRounds(5);
    add("Pull-up", 1);
    expect(roundCount(useDraft.getState().draft)).toBe(5);
    useDraft.getState().setFormat("amrap");
    expect(roundCount(useDraft.getState().draft)).toBe(1);
    expect(reps0()).toHaveLength(1);
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
