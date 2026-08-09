import type { SessionHour, SessionsData } from '@/hooks/useData'
import type { SymbolConfig } from '@/engine/symbols'
import { priceUnit, sessionsReusedFromGold } from '@/hooks/useSymbol'

/**
 * Unit suffix for SESSIONS avg-range readouts, per active symbol (Phase 9
 * Stage 2; Phase 15: delegates to the SYMBOL_REGISTRY via priceUnit so
 * indices render `pts`, EURUSD/GBPUSD `USD`, USDJPY `JPY`). XAUUSD/NAS100
 * output is byte-identical to the legacy hardcode (USD / pts).
 *
 * Phase-15 reuse caveat: the five new markets share the XAUUSD H1 session
 * profile (display-only), so their sessions-sourced values are GOLD's and
 * render with gold's USD unit — never with the market's own unit.
 */
export function rangeUnit(config: SymbolConfig): string {
  return sessionsReusedFromGold(config) ? 'USD' : priceUnit(config)
}

/**
 * Decimals for SESSIONS avg-range readouts. XAUUSD keeps the call-site
 * fallback so gold output stays byte-identical; symbols with their own
 * sessions export (NAS100) follow config.priceDecimals; markets on the
 * shared gold profile use the gold fallback (the values ARE gold's).
 */
export function rangeDigits(config: SymbolConfig, goldFallback: number): number {
  return config.symbol === 'XAUUSD' || sessionsReusedFromGold(config)
    ? goldFallback
    : config.priceDecimals
}

/** Terminal ease (design.md §5) */
export const TERMINAL_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function hourLabel(h: number): string {
  return `${pad2(h)}:00`
}

export function fmtUsd(v: number | null, digits = 2): string {
  return v == null ? '—' : v.toFixed(digits)
}

export function fmtPct(v: number | null, digits = 1): string {
  return v == null ? '—' : `${(v * 100).toFixed(digits)}%`
}

export function fmtAtr(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(2)}×`
}

export function fmtAbsRet(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(3)}%`
}

export function fmtInt(v: number): string {
  return v.toLocaleString('en-US')
}

/* ------------------------------------------------------------------ */
/* Thermal color scale: #241b0e (quiet) → #F5A623 (blazing hot)        */
/* ------------------------------------------------------------------ */

const THERMAL_LO = { r: 0x24, g: 0x1b, b: 0x0e }
const THERMAL_HI = { r: 0xf5, g: 0xa6, b: 0x23 }

export function thermalColor(t: number): string {
  const c = Math.min(1, Math.max(0, t))
  const r = Math.round(THERMAL_LO.r + (THERMAL_HI.r - THERMAL_LO.r) * c)
  const g = Math.round(THERMAL_LO.g + (THERMAL_HI.g - THERMAL_LO.g) * c)
  const b = Math.round(THERMAL_LO.b + (THERMAL_HI.b - THERMAL_LO.b) * c)
  return `rgb(${r},${g},${b})`
}

/** Normalize p_high_vol_empirical onto the thermal scale (0.03 → 0.82 anchors). */
export function thermalTForPvol(p: number): number {
  return (p - 0.03) / (0.82 - 0.03)
}

/* ------------------------------------------------------------------ */
/* Radar color modes (toggle chips)                                    */
/* ------------------------------------------------------------------ */

export type ColorMode = 'pvol' | 'absret' | 'rangeatr'

export const COLOR_MODES: { id: ColorMode; label: string }[] = [
  { id: 'pvol', label: 'P(high-vol)' },
  { id: 'absret', label: 'avg |return|' },
  { id: 'rangeatr', label: 'range (ATR)' },
]

export function modeValue(h: SessionHour, mode: ColorMode): number | null {
  if (mode === 'pvol') return h.p_high_vol_empirical
  if (mode === 'absret') return h.avg_abs_ret
  return h.avg_range_atr
}

/** Min/max of a color mode across hours that have data (hour 0 excluded). */
export function modeExtent(hours: SessionHour[], mode: ColorMode): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const h of hours) {
    const v = modeValue(h, mode)
    if (v == null) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  return min > max ? [0, 1] : [min, max]
}

export function wedgeFill(h: SessionHour, mode: ColorMode, extent: [number, number]): string {
  const v = modeValue(h, mode)
  if (v == null) return 'transparent'
  const [min, max] = extent
  const t =
    mode === 'pvol' ? thermalTForPvol(v) : max > min ? (v - min) / (max - min) : 0.5
  return thermalColor(t)
}

/* ------------------------------------------------------------------ */
/* Session bands                                                       */
/* ------------------------------------------------------------------ */

export type BandId = 'asia' | 'london' | 'ny' | 'off'

export const BAND_ORDER: BandId[] = ['asia', 'london', 'ny', 'off']

export const BAND_META: Record<
  BandId,
  {
    name: string
    tone: string // hairline / highlight color
    glyph: '▲' | '▼'
    glyphTone: 'risk' | 'calm'
    verdict: string
  }
> = {
  asia: {
    name: 'ASIA',
    tone: '#6B7684',
    glyph: '▼',
    glyphTone: 'calm',
    verdict: 'Spreads eat you alive. Cones narrow. Stay flat or size down.',
  },
  london: {
    name: 'LONDON',
    tone: '#5B8DEF',
    glyph: '▲',
    glyphTone: 'risk',
    verdict: 'Range builds. T+1 cones begin widening.',
  },
  ny: {
    name: 'OVERLAP / NEW YORK',
    tone: '#E8B23A',
    glyph: '▲',
    glyphTone: 'risk',
    verdict: 'The window. Widest cones, biggest risk — size accordingly.',
  },
  off: {
    name: 'OFF-HOURS',
    tone: '#454F5B',
    glyph: '▼',
    glyphTone: 'calm',
    verdict: 'Volatility decays. Expect mean-reverting chop.',
  },
}

export function bandHours(data: SessionsData, id: BandId): number[] {
  /* sessions.json exports bands as { hours: number[], label: string } objects
     (matching engine/symbols.ts sessionBands); tolerate a bare number[] too. */
  const raw = data.bands[id] as unknown
  const hours = Array.isArray(raw)
    ? raw
    : raw != null && typeof raw === 'object' && Array.isArray((raw as { hours?: unknown }).hours)
      ? (raw as { hours: number[] }).hours
      : []
  return [...hours].sort((a, b) => a - b)
}

export function bandForHour(data: SessionsData, hour: number): BandId | null {
  for (const id of BAND_ORDER) {
    if (bandHours(data, id).includes(hour)) return id
  }
  return null
}

/** Split a sorted hour list into contiguous runs, e.g. [11,17,18,…,23] → [[11],[17..23]]. */
export function contiguousRuns(hours: number[]): number[][] {
  const runs: number[][] = []
  for (const h of [...hours].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1]
    if (last && h === last[last.length - 1] + 1) last.push(h)
    else runs.push([h])
  }
  return runs
}

/** Format runs as compact UTC ranges: [[0..6]] → "00–07 UTC", [[11],[17..23]] → "11, 17–23 UTC". */
export function formatRuns(runs: number[][]): string {
  return runs
    .map((run) =>
      run.length === 1 ? pad2(run[0]) : `${pad2(run[0])}–${pad2(run[run.length - 1] + 1)}`,
    )
    .join(', ')
}

export interface BandStats {
  id: BandId
  hours: number[]
  runs: number[][]
  hoursLabel: string
  rangeMin: number
  rangeMax: number
  pMin: number
  pMax: number
  peakHour: number
  peakP: number
}

export function computeBandStats(data: SessionsData, id: BandId): BandStats | null {
  const hours = bandHours(data, id)
  const rows = hours
    .map((h) => data.hours.find((r) => r.hour_utc === h))
    .filter((r): r is SessionHour => !!r && r.avg_range_price != null)
  if (rows.length === 0) return null
  const runs = contiguousRuns(hours)
  let rangeMin = Infinity
  let rangeMax = -Infinity
  let pMin = Infinity
  let pMax = -Infinity
  let peakHour = rows[0].hour_utc
  let peakP = -Infinity
  for (const r of rows) {
    if (r.avg_range_price != null) {
      rangeMin = Math.min(rangeMin, r.avg_range_price)
      rangeMax = Math.max(rangeMax, r.avg_range_price)
    }
    if (r.p_high_vol_empirical != null) {
      pMin = Math.min(pMin, r.p_high_vol_empirical)
      pMax = Math.max(pMax, r.p_high_vol_empirical)
      if (r.p_high_vol_empirical > peakP) {
        peakP = r.p_high_vol_empirical
        peakHour = r.hour_utc
      }
    }
  }
  return { id, hours, runs, hoursLabel: `${formatRuns(runs)} UTC`, rangeMin, rangeMax, pMin, pMax, peakHour, peakP }
}

/** Session key from latest.json ("asia" | "london" | "ny" | "off" | …) → display name. */
export function sessionDisplayName(session: string | undefined): string {
  switch (session) {
    case 'asia':
      return 'ASIA'
    case 'london':
      return 'LONDON'
    case 'ny':
      return 'NEW YORK / OVERLAP'
    case 'off':
      return 'OFF-HOURS'
    default:
      return (session ?? '—').toUpperCase()
  }
}
