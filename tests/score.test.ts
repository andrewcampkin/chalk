import { describe, expect, it } from "vitest";
import {
  estimateOneRepMax,
  formatLoad,
  formatScore,
  formatTime,
  isBetter,
  kgToGrams,
  lbToGrams,
  parseLoad,
  parseTime,
} from "../db/score";
import {
  appendDigit,
  displayTimeBuffer,
  timeBufferToSeconds,
} from "../lib/entry";

describe("load", () => {
  it("stores kilos as integer grams", () => {
    expect(kgToGrams(82.5)).toBe(82500);
    expect(kgToGrams(100)).toBe(100_000);
    // Invariant 2: no floats reach the database.
    expect(Number.isInteger(kgToGrams(60.7))).toBe(true);
  });

  it("converts pounds without drifting", () => {
    expect(lbToGrams(135)).toBe(61235);
  });

  it("parses what a person actually types", () => {
    expect(parseLoad("100", "kg")).toBe(100_000);
    expect(parseLoad("82.5", "kg")).toBe(82_500);
    expect(parseLoad("100kg", "lb")).toBe(100_000);
    expect(parseLoad("225lb", "kg")).toBe(102_058);
    expect(parseLoad("", "kg")).toBeNull();
    expect(parseLoad("heavy", "kg")).toBeNull();
  });

  it("formats without inventing precision", () => {
    expect(formatLoad(100_000, "kg")).toBe("100 kg");
    expect(formatLoad(82_500, "kg")).toBe("82.5 kg");
    expect(formatLoad(null, "kg")).toBe("—");
  });
});

describe("time", () => {
  it("formats seconds as whiteboard notation", () => {
    expect(formatTime(252)).toBe("4:12");
    expect(formatTime(59)).toBe("0:59");
    expect(formatTime(3870)).toBe("1:04:30");
  });

  it("parses the notations people use", () => {
    expect(parseTime("4:12")).toBe(252);
    expect(parseTime("1:04:30")).toBe(3870);
    expect(parseTime("4m20s")).toBe(260);
    expect(parseTime("abc")).toBeNull();
  });
});

describe("keypad entry", () => {
  it("reads digits as a stopwatch, not as raw seconds", () => {
    expect(displayTimeBuffer("412")).toBe("4:12");
    expect(timeBufferToSeconds("412")).toBe(252);
    expect(displayTimeBuffer("1230")).toBe("12:30");
    expect(timeBufferToSeconds("1230")).toBe(750);
  });

  it("refuses to overflow a field", () => {
    expect(appendDigit("1234", "5", "int")).toBe("1234");
    expect(appendDigit("123", "4", "int")).toBe("1234");
  });
});

describe("comparison", () => {
  it("flips direction for time", () => {
    expect(isBetter("load", 100, 90)).toBe(true);
    expect(isBetter("time", 240, 252)).toBe(true);
    expect(isBetter("time", 260, 252)).toBe(false);
  });

  it("treats a first attempt as a record", () => {
    expect(isBetter("load", 60_000, null)).toBe(true);
  });
});

describe("estimated 1RM", () => {
  it("uses Epley and never persists", () => {
    expect(estimateOneRepMax(100_000, 1)).toBe(100_000);
    expect(estimateOneRepMax(100_000, 3)).toBe(110_000);
  });
});

describe("formatScore", () => {
  it("covers every score type", () => {
    expect(formatScore("load", 100_000, { unit: "kg" })).toBe("100 kg");
    expect(formatScore("time", 252)).toBe("4:12");
    expect(formatScore("reps", 150)).toBe("150 reps");
    expect(formatScore("rounds_reps", 315, { rounds: 21, reps: 3 })).toBe("21 + 3");
    expect(formatScore("distance", 5000)).toBe("5000 m");
  });
});
