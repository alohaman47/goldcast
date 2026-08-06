/**
 * Shared bar types + timestamp helpers.
 *
 * Bar timestamps are MT5 UTC strings ("YYYY-MM-DD HH:MM:SS"; daily bars may be
 * "YYYY-MM-DD HH:MM:SS" at midnight or plain "YYYY-MM-DD"). All extraction is
 * done as UTC, matching the tz-naive pandas DatetimeIndex on the Python side.
 */

export interface Bar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface DailyBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
}

/** Hour of day (0-23), UTC — pandas `index.hour`. */
export function hourOf(t: string): number {
  return parseInt(t.slice(11, 13), 10);
}

/** Day key "YYYY-MM-DD" — pandas `index.normalize()`. */
export function dayKey(t: string): string {
  return t.slice(0, 10);
}

/** Day of week, Monday=0 .. Sunday=6 — pandas `index.dayofweek` (UTC). */
export function dowOf(t: string): number {
  const y = parseInt(t.slice(0, 4), 10);
  const m = parseInt(t.slice(5, 7), 10);
  const d = parseInt(t.slice(8, 10), 10);
  const jsDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sunday=0
  return (jsDow + 6) % 7;
}

/** Epoch-ms comparison helper (UTC) for sorting/guards. */
export function toUtcMs(t: string): number {
  const y = +t.slice(0, 4);
  const mo = +t.slice(5, 7);
  const d = +t.slice(8, 10);
  const hh = t.length >= 13 ? +t.slice(11, 13) : 0;
  const mm = t.length >= 16 ? +t.slice(14, 16) : 0;
  const ss = t.length >= 19 ? +t.slice(17, 19) : 0;
  return Date.UTC(y, mo - 1, d, hh, mm, ss);
}
