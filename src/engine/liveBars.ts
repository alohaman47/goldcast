/**
 * Forming-bar construction for GoldCast LIVE.
 *
 * Given the static H1 history (bars.json, last completed bar 2026-08-10 19:00
 * UTC) and live spot ticks, build the CURRENT forming H1 bar:
 *
 *   open  = first tick of the current UTC hour, else last known close
 *   high  = max(open, ticks this hour)
 *   low   = min(open, ticks this hour)
 *   close = latest tick this hour (or open if no tick yet)
 *
 * Honesty rules:
 *  - Fully-elapsed hours between the static history end and the current hour
 *    are NEVER fabricated as candles. They are reported as `gapHours`.
 *  - If the current hour is the same hour as the last static bar, the forming
 *    bar carries the same timestamp and predict() replaces that bar with it.
 *  - `farGap` (gap > FAR_GAP_HOURS) means the chart history is frozen; the UI
 *    must show the GAP banner. The forming bar is still valid for prediction.
 */
import { toUtcMs, type Bar } from './bars'

export interface LiveTick {
  price: number
  /** Receipt time, epoch ms (Date.now()). */
  atMs: number
}

export interface FormingBarResult {
  forming: Bar
  /** Whole hours with no candle between the last static bar and the forming bar. */
  gapHours: number
  /** gapHours > FAR_GAP_HOURS → chart history is frozen (GAP state). */
  farGap: boolean
  /** Epoch ms of the forming bar's hour start (UTC). */
  hourStartMs: number
}

export const FAR_GAP_HOURS = 48
const HOUR_MS = 3_600_000

export function floorHourMs(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS
}

/** MT5-style UTC timestamp "YYYY-MM-DD HH:MM:SS" (matches bars.json). */
export function mt5UtcString(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  )
}

/**
 * Build the forming H1 bar for the current UTC hour.
 * Returns null only when there is no static history at all.
 */
export function buildFormingBar(
  staticBars: Bar[],
  ticks: LiveTick[],
  nowMs: number,
): FormingBarResult | null {
  if (staticBars.length === 0) return null
  const last = staticBars[staticBars.length - 1]
  const lastMs = toUtcMs(last.t)
  // Never build a bar before the last static bar's hour (clock skew guard).
  const hourMs = Math.max(floorHourMs(nowMs), lastMs)

  const sorted = [...ticks].sort((a, b) => a.atMs - b.atMs)
  const inHour = sorted.filter(
    (tk) => tk.atMs >= hourMs && tk.atMs < hourMs + HOUR_MS && Number.isFinite(tk.price),
  )

  let open: number
  if (inHour.length > 0) {
    open = inHour[0].price
  } else {
    const prior = sorted.filter((tk) => tk.atMs < hourMs && Number.isFinite(tk.price))
    open = prior.length > 0 ? prior[prior.length - 1].price : last.c
  }

  let h = open
  let l = open
  let c = open
  for (const tk of inHour) {
    if (tk.price > h) h = tk.price
    if (tk.price < l) l = tk.price
    c = tk.price
  }

  const gapHours = Math.max(0, Math.round((hourMs - lastMs) / HOUR_MS) - 1)
  return {
    forming: { t: mt5UtcString(hourMs), o: open, h, l, c },
    gapHours,
    farGap: gapHours > FAR_GAP_HOURS,
    hourStartMs: hourMs,
  }
}
