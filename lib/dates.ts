/**
 * Invariant 7: a session date is a LOCAL calendar day, "YYYY-MM-DD".
 *
 * Every helper here builds and reads dates in local time. Nothing may go via
 * `new Date(iso)` or `toISOString()`, both of which interpret a bare date as
 * UTC — that is exactly how a 6am session ends up filed under the previous day
 * for anyone west of Greenwich, and how a late-evening one drifts forward for
 * anyone east of it.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** A Date (local midnight) as YYYY-MM-DD. */
export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD to a Date at LOCAL midnight. */
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayIso(): string {
  return toIso(new Date());
}

export function shiftIso(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function isFutureIso(iso: string, now = new Date()): boolean {
  return iso > toIso(now);
}

/** "Today", "Yesterday", or "Wed 5 Aug". */
export function describeIso(iso: string, now = new Date()): string {
  const today = toIso(now);
  if (iso === today) return "Today";
  if (iso === shiftIso(today, -1)) return "Yesterday";

  const d = fromIso(iso);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  const month = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][d.getMonth()];
  const sameYear = d.getFullYear() === now.getFullYear();
  return `${day} ${d.getDate()} ${month}${sameYear ? "" : ` ${d.getFullYear()}`}`;
}

export function monthLabel(iso: string): string {
  const d = fromIso(iso);
  const month = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][d.getMonth()];
  return `${month} ${d.getFullYear()}`;
}

export function shiftMonth(iso: string, months: number): string {
  const d = fromIso(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  // Clamp: going back a month from the 31st must not skid into the next one.
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toIso(d);
}

/**
 * Six rows of seven, Monday-first, with nulls for the leading and trailing
 * blanks. Fixed height so the calendar does not jump as months change.
 */
export function monthGrid(iso: string): (string | null)[] {
  const d = fromIso(iso);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  // getDay() is Sunday-first; shift so Monday is column 0.
  const lead = (first.getDay() + 6) % 7;

  const cells: (string | null)[] = Array(lead).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(toIso(new Date(d.getFullYear(), d.getMonth(), day)));
  }
  while (cells.length < 42) cells.push(null);
  return cells;
}

export const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
