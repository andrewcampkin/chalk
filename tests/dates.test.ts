import { describe, expect, it } from "vitest";
import {
  describeIso,
  fromIso,
  isFutureIso,
  monthGrid,
  monthLabel,
  shiftIso,
  shiftMonth,
  toIso,
  todayIso,
} from "../lib/dates";

describe("local calendar days — invariant 7", () => {
  it("never lets an early-morning session drift to the previous day", () => {
    // 6am local. Anything routed through UTC lands on the 4th for a negative
    // offset, which is the exact bug this guards.
    const sixAm = new Date(2026, 7, 5, 6, 0, 0);
    expect(toIso(sixAm)).toBe("2026-08-05");
  });

  it("never lets a late-evening session drift forward", () => {
    const elevenPm = new Date(2026, 7, 5, 23, 30, 0);
    expect(toIso(elevenPm)).toBe("2026-08-05");
  });

  it("round-trips through a local Date", () => {
    const iso = "2026-08-05";
    const d = fromIso(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(5);
    expect(toIso(d)).toBe(iso);
  });

  it("produces a well formed today", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("shifting", () => {
  it("steps back a day", () => {
    expect(shiftIso("2026-08-05", -1)).toBe("2026-08-04");
  });

  it("crosses a month boundary", () => {
    expect(shiftIso("2026-08-01", -1)).toBe("2026-07-31");
  });

  it("crosses a year boundary", () => {
    expect(shiftIso("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles a leap day", () => {
    expect(shiftIso("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftIso("2027-03-01", -1)).toBe("2027-02-28");
  });
});

describe("month navigation", () => {
  it("does not skid past a short month from the 31st", () => {
    // Naive month arithmetic turns 31 March into 31 February -> 3 March.
    expect(shiftMonth("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonth("2026-05-31", -1)).toBe("2026-04-30");
  });

  it("moves forward and back", () => {
    expect(shiftMonth("2026-08-15", 1)).toBe("2026-09-15");
    expect(shiftMonth("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("labels the month", () => {
    expect(monthLabel("2026-08-05")).toBe("August 2026");
  });
});

describe("month grid", () => {
  it("is always six rows of seven", () => {
    expect(monthGrid("2026-08-05")).toHaveLength(42);
    expect(monthGrid("2026-02-10")).toHaveLength(42);
  });

  it("starts on Monday", () => {
    // 1 Aug 2026 is a Saturday, so five leading blanks then the 1st.
    const cells = monthGrid("2026-08-05");
    expect(cells.slice(0, 5).every((c) => c === null)).toBe(true);
    expect(cells[5]).toBe("2026-08-01");
  });

  it("contains every day of the month exactly once", () => {
    const days = monthGrid("2026-08-05").filter(Boolean);
    expect(days).toHaveLength(31);
    expect(new Set(days).size).toBe(31);
  });
});

describe("describing a date", () => {
  const now = new Date(2026, 7, 5); // Wed 5 Aug 2026

  it("names today and yesterday", () => {
    expect(describeIso("2026-08-05", now)).toBe("Today");
    expect(describeIso("2026-08-04", now)).toBe("Yesterday");
  });

  it("spells out anything older", () => {
    expect(describeIso("2026-08-01", now)).toBe("Sat 1 Aug");
  });

  it("adds the year when it differs", () => {
    expect(describeIso("2025-12-24", now)).toBe("Wed 24 Dec 2025");
  });
});

describe("future dates", () => {
  it("rejects tomorrow — you cannot log a workout you have not done", () => {
    const now = new Date(2026, 7, 5);
    expect(isFutureIso("2026-08-06", now)).toBe(true);
    expect(isFutureIso("2026-08-05", now)).toBe(false);
    expect(isFutureIso("2026-08-04", now)).toBe(false);
  });
});
