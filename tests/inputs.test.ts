import { describe, expect, it } from "vitest";
import { formatDistance, formatScore } from "../db/score";
import { MOVEMENTS } from "../db/seed";
import { inputsFor, isDistanceMovement, presetLabel } from "../lib/inputs";

const bySlug = (slug: string) => {
  const m = MOVEMENTS.find((x) => x.slug === slug);
  if (!m) throw new Error(`no seed movement ${slug}`);
  return m;
};

describe("which fields a movement offers", () => {
  it("asks the machines for distance, never reps or load", () => {
    for (const slug of ["run", "row", "bike-erg", "ski-erg", "swim", "assault-bike"]) {
      expect(inputsFor(bySlug(slug))).toEqual(["distance", "calories"]);
      expect(isDistanceMovement(bySlug(slug))).toBe(true);
    }
  });

  it("keeps skipping in reps even though it is monostructural", () => {
    // The trap: keying this off modality would put a metres box next to a rope.
    for (const slug of ["double-under", "single-under", "crossover"]) {
      expect(bySlug(slug).modality).toBe("monostructural");
      expect(isDistanceMovement(bySlug(slug))).toBe(false);
      expect(inputsFor(bySlug(slug))).toEqual(["reps", "load"]);
    }
  });

  it("keeps barbell and gymnastics work on reps and load", () => {
    for (const slug of ["back-squat", "thruster", "pull-up", "burpee"]) {
      expect(inputsFor(bySlug(slug))).toEqual(["reps", "load"]);
    }
  });
});

describe("distance formatting", () => {
  it("stays in metres where the whiteboard would", () => {
    expect(formatDistance(400)).toBe("400 m");
    expect(formatDistance(800)).toBe("800 m");
  });

  it("switches to kilometres once metres stop reading naturally", () => {
    expect(formatDistance(1000)).toBe("1 km");
    expect(formatDistance(5000)).toBe("5 km");
    expect(formatDistance(2000)).toBe("2 km");
  });

  it("handles a mile without inventing precision", () => {
    expect(formatDistance(1609)).toBe("1.61 km");
  });

  it("routes through formatScore", () => {
    expect(formatScore("distance", 5000)).toBe("5 km");
    expect(formatScore("distance", 400)).toBe("400 m");
    expect(formatScore("distance", null)).toBe("—");
  });
});

describe("distance presets", () => {
  it("labels the way a whiteboard does", () => {
    expect(presetLabel(400)).toBe("400m");
    expect(presetLabel(1000)).toBe("1k");
    expect(presetLabel(5000)).toBe("5k");
  });
});
