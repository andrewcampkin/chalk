import { parseLoad, type Unit } from "../db/score";

/**
 * Digit-accumulator entry, the way a stopwatch works: typing 4 1 2 reads as
 * 4:12, not 412 seconds. Nobody lying on the floor should have to find a colon
 * key, and the system keyboard doesn't have one anyway.
 */

export type FieldKind = "time" | "load" | "int";

/** "412" -> "4:12", "1230" -> "12:30", "10430" -> "1:04:30". */
export function displayTimeBuffer(buf: string): string {
  const d = buf.replace(/\D/g, "").slice(-6);
  if (!d) return "0:00";
  const padded = d.padStart(d.length <= 4 ? 4 : 6, "0");
  if (padded.length <= 4) {
    return `${Number(padded.slice(0, 2))}:${padded.slice(2)}`;
  }
  return `${Number(padded.slice(0, 2))}:${padded.slice(2, 4)}:${padded.slice(4)}`;
}

/** Seconds from the same buffer. Minutes/seconds, so 4 1 2 is 252. */
export function timeBufferToSeconds(buf: string): number | null {
  const d = buf.replace(/\D/g, "").slice(-6);
  if (!d) return null;
  const padded = d.padStart(d.length <= 4 ? 4 : 6, "0");
  if (padded.length <= 4) {
    return Number(padded.slice(0, 2)) * 60 + Number(padded.slice(2));
  }
  return (
    Number(padded.slice(0, 2)) * 3600 +
    Number(padded.slice(2, 4)) * 60 +
    Number(padded.slice(4))
  );
}

export function appendDigit(buf: string, digit: string, kind: FieldKind): string {
  if (kind === "load") {
    if (buf.replace(/\D/g, "").length >= 6) return buf;
    return buf + digit;
  }
  if (buf.replace(/\D/g, "").length >= (kind === "time" ? 6 : 4)) return buf;
  return buf + digit;
}

export function appendDot(buf: string): string {
  return buf.includes(".") ? buf : (buf || "0") + ".";
}

export function backspace(buf: string): string {
  return buf.slice(0, -1);
}

export function bufferToValue(
  buf: string,
  kind: FieldKind,
  unit: Unit,
): number | null {
  if (!buf) return null;
  if (kind === "time") return timeBufferToSeconds(buf);
  if (kind === "load") return parseLoad(buf, unit);
  const n = Number(buf.replace(/\D/g, ""));
  return Number.isFinite(n) && buf.replace(/\D/g, "") !== "" ? n : null;
}

/**
 * The inverse of timeBufferToSeconds, for loading a saved score back into the
 * pad: 252 -> "412", which redisplays as 4:12.
 */
export function secondsToBuffer(seconds: number | null): string {
  if (seconds == null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const digits = h > 0 ? `${h}${pad2(m)}${pad2(s)}` : `${m}${pad2(s)}`;
  return digits.replace(/^0+(?=\d)/, "");
}

/** Grams back to the load buffer: 82500 -> "82.5". */
export function gramsToBuffer(grams: number | null, unit: Unit): string {
  if (grams == null) return "";
  const value = unit === "kg" ? grams / 1000 : grams / 453.59237;
  return String(Math.round(value * 100) / 100);
}

export function displayBuffer(buf: string, kind: FieldKind, placeholder = "—"): string {
  if (kind === "time") return buf ? displayTimeBuffer(buf) : placeholder;
  return buf || placeholder;
}
