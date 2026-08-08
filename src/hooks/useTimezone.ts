import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/**
 * GoldCast Phase 14 — UTC | NY display timezone toggle.
 *
 * DISPLAY-ONLY conversion layer. ALL data, engine code, JSON exports, and
 * pinned provenance strings stay UTC — the research is UTC-native. This hook
 * only re-labels what the user sees when they opt in with `?tz=ny`. Default
 * (param absent) is UTC and renders byte-identical to before Phase 14.
 *
 * Backed by the `?tz=ny` URL search param (default: UTC, clean URLs carry no
 * param) — same pattern as `symbol`/`tf` in useSymbol: no provider, the param
 * IS the store, and Navbar's query whitelist forwards it on navigation.
 * `?tz=garbage` safely falls back to UTC (parseTzParam).
 *
 * NY conversion uses Intl.DateTimeFormat with timeZone 'America/New_York' —
 * EST/EDT is resolved by the engine, NEVER hardcoded -5/-4. Because hour-of-
 * day labels (slot grids, hour axes) have no date of their own, DST is
 * resolved against a REFERENCE instant (default: now). The slot grid keeps
 * UTC slot ORDER and identity — only labels change, so at the day boundary
 * 00:00–00:59 UTC renders as 19:xx (EST) or 20:xx (EDT) NY. That wrap is
 * intended and documented here.
 */

export type DisplayTz = 'UTC' | 'NY'

export const NY_ZONE = 'America/New_York'

/** Parse the `?tz` param. Anything but "ny" (case-insensitive) is UTC. */
export function parseTzParam(raw: string | null): DisplayTz {
  return raw != null && raw.toLowerCase() === 'ny' ? 'NY' : 'UTC'
}

/** Honest suffix for converted readouts ("UTC" | "NY"). */
export function tzSuffix(tz: DisplayTz): string {
  return tz
}

export interface TimezoneState {
  tz: DisplayTz
  isNy: boolean
  setTz: (next: DisplayTz) => void
}

export function useTimezone(): TimezoneState {
  const [params, setParams] = useSearchParams()
  const tz = parseTzParam(params.get('tz'))

  const setTz = useCallback(
    (next: DisplayTz) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'UTC') p.delete('tz') // default — keep URLs clean
        else p.set('tz', 'ny')
        return p
      })
    },
    [setParams],
  )

  return { tz, isNy: tz === 'NY', setTz }
}

/* ------------------------------------------------------------------ */
/* Formatting helpers (pure — usable outside React)                    */
/* ------------------------------------------------------------------ */

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** h23-cycle NY wall-clock parts via Intl (DST resolved per instant). */
const NY_PARTS_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: NY_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

interface NyParts {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
}

function nyParts(d: Date): NyParts {
  const out: Record<string, string> = {}
  for (const p of NY_PARTS_FMT.formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = p.value
  }
  return out as unknown as NyParts
}

/**
 * Live wall clock "HH:MM[:SS]" in the display tz. UTC mode is the exact
 * legacy format (UTC getters, zero-padded); NY mode is America/New_York.
 */
export function fmtWallClock(d: Date, tz: DisplayTz, withSeconds = true): string {
  if (tz === 'NY') {
    const p = nyParts(d)
    return withSeconds ? `${p.hour}:${p.minute}:${p.second}` : `${p.hour}:${p.minute}`
  }
  const base = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
  return withSeconds ? `${base}:${pad2(d.getUTCSeconds())}` : base
}

/** Numeric wall-clock parts in the display tz (chart axis math). */
export function wallParts(d: Date, tz: DisplayTz): { hour: number; minute: number; day: number; month: number } {
  if (tz === 'NY') {
    const p = nyParts(d)
    return { hour: Number(p.hour), minute: Number(p.minute), day: Number(p.day), month: Number(p.month) - 1 }
  }
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes(), day: d.getUTCDate(), month: d.getUTCMonth() }
}

/**
 * Convert a UTC hour/minute OF DAY to its "HH:MM" label in the display tz.
 * DST is resolved against `ref` (default: now) — hour-of-day labels carry no
 * date of their own. Day-boundary wrap falls out of the Intl conversion
 * (00:30 UTC → "19:30" EST / "20:30" EDT). UTC mode is byte-identical pad.
 */
export function utcHhMmToTz(hourUtc: number, minuteUtc: number, tz: DisplayTz, ref: Date = new Date()): string {
  if (tz !== 'NY') return `${pad2(hourUtc)}:${pad2(minuteUtc)}`
  const instant = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate(), hourUtc, minuteUtc),
  )
  const p = nyParts(instant)
  return `${p.hour}:${p.minute}`
}

/** Padded hour ("HH") of a UTC hour-of-day in the display tz (axis labels). */
export function utcHourInTz(hourUtc: number, tz: DisplayTz, ref: Date = new Date()): string {
  if (tz !== 'NY') return pad2(hourUtc)
  return utcHhMmToTz(hourUtc, 0, tz, ref).slice(0, 2)
}

/**
 * Convert a JSON slot label ("HH:MM", UTC per export schema) to the display
 * tz. Non-matching strings pass through unchanged (defensive — labels are
 * canonical "HH:MM" in every slot-map export).
 */
export function utcLabelToTz(label: string, tz: DisplayTz, ref: Date = new Date()): string {
  if (tz !== 'NY') return label
  const m = /^(\d{2}):(\d{2})$/.exec(label)
  if (!m) return label
  return utcHhMmToTz(Number(m[1]), Number(m[2]), tz, ref)
}

/** Parse a UTC timestamp string ("YYYY-MM-DD HH:MM[:SS]") as an instant. */
export function parseUtcTimestamp(t: string): Date {
  return new Date(t.replace(' ', 'T') + (t.endsWith('Z') ? '' : 'Z'))
}

/**
 * Full timestamp label in the display tz. UTC mode returns the raw string
 * byte-identical; NY mode renders "YYYY-MM-DD HH:MM" in America/New_York
 * (the date shifts on day-boundary wrap — honest).
 */
export function fmtTimestampInTz(t: string, tz: DisplayTz): string {
  if (tz !== 'NY') return t
  const p = nyParts(parseUtcTimestamp(t))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}

/** Asof/export timestamp readout with honest suffix ("—" when absent). */
export function fmtAsofInTz(asof: string | undefined, tz: DisplayTz): string {
  if (asof == null) return '—'
  return `${fmtTimestampInTz(asof, tz)} ${tzSuffix(tz)}`
}

/**
 * Session-band hour ranges in the display tz. Runs are contiguous UTC hour
 * lists ([[0..6]] → "00–07"); each endpoint converts independently, so a
 * wrapped band reads e.g. "19–02" NY. UTC mode is byte-identical to the
 * legacy formatRuns output.
 */
export function formatRunsInTz(runs: number[][], tz: DisplayTz, ref: Date = new Date()): string {
  return runs
    .map((run) =>
      run.length === 1
        ? utcHourInTz(run[0], tz, ref)
        : `${utcHourInTz(run[0], tz, ref)}–${utcHourInTz((run[run.length - 1] + 1) % 24, tz, ref)}`,
    )
    .join(', ')
}
