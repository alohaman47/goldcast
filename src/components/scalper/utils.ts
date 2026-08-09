import type { ScalperSlot } from '@/hooks/useData'
import { entryForSymbol } from '@/hooks/useSymbol'
import { thermalColor } from '@/components/sessions/utils'

/**
 * Scalper's Clock shared helpers. Thermal scale reuses the exact SessionRadar
 * ramp (#241b0e quiet → #F5A623 blazing) so the two pages read identically.
 */

export const TERMINAL_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function fmtUsd(v: number | null, digits = 2): string {
  return v == null ? '—' : v.toFixed(digits)
}

export function fmtPct(v: number | null, digits = 1): string {
  return v == null ? '—' : `${(v * 100).toFixed(digits)}%`
}

/**
 * Adaptive precision for an already-in-percent stat: 1dp normally, but if
 * 1dp would collapse a positive value to "0.0", render 2dp so a tiny but
 * nonzero value doesn't read as zero (gold: 0.02% of bars; NAS100 1.2%
 * stays "1.2").
 */
export function fmtPctAdaptive(v: number): string {
  const oneDp = v.toFixed(1)
  return oneDp === '0.0' && v > 0 ? v.toFixed(2) : oneDp
}

export function fmtAtr(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(2)}×`
}

export function fmtInt(v: number): string {
  return v.toLocaleString('en-US')
}

/**
 * Range readout for a slot/hour value (the JSON's avg_range_usd field —
 * schema-parity name; per market it is that market's price units). XAUUSD
 * and NAS100 keep the legacy byte-identical `$x.xx` rendering; the Phase-15
 * markets render in their own units at config decimals (indices `pts`,
 * EURUSD/GBPUSD `USD`, USDJPY `JPY`) so 0.0009 never collapses to "$0.00".
 * Unit/decimals come from the registry — no hardcoded per-symbol numbers.
 */
export function fmtSlotRange(v: number | null, symbol: string): string {
  const entry = entryForSymbol(symbol)
  if (entry.id === 'XAUUSD' || entry.id === 'NAS100') return `$${fmtUsd(v)}`
  return `${fmtUsd(v, entry.h1.priceDecimals)} ${entry.rangeUnit}`
}

/** Min/max extent of avg_range_atr across slots that actually have bars. */
export function slotAtrExtent(slots: ScalperSlot[]): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const s of slots) {
    if (s.avg_range_atr == null) continue
    if (s.avg_range_atr < min) min = s.avg_range_atr
    if (s.avg_range_atr > max) max = s.avg_range_atr
  }
  return min > max ? [0, 1] : [min, max]
}

/** Thermal fill for a slot, normalized on the real [min, max] ATR extent. */
export function slotFill(atr: number | null, extent: [number, number]): string {
  if (atr == null) return 'transparent'
  const [min, max] = extent
  const t = max > min ? (atr - min) / (max - min) : 0.5
  return thermalColor(t)
}

/**
 * Slot index for a UTC timestamp — length-agnostic: slot-minutes derive from
 * the day's slot count (1440/96 = 15 min at M15, 1440/288 = 5 min at M5).
 * No 96/288 constants anywhere on the page.
 */
export function slotIndexFor(date: Date, slotsPerDay: number): number {
  const slotMinutes = 1440 / slotsPerDay
  return Math.floor((date.getUTCHours() * 60 + date.getUTCMinutes()) / slotMinutes)
}

/**
 * Verdict chip (hero badge row) — the ONE place short honesty prose is keyed
 * by meta.symbol + meta.timeframe instead of read from the JSON. The slot-map
 * exports carry every number plus long-form econ.verdict / guidance strings
 * verbatim, but no short chip field, so these constants summarize the
 * research findings:
 *  - NAS100 (M15 only): results/nas100_m15_findings.md — spread tax pushes
 *    1:2-RR breakeven to 35.3% (+1.9pp over the 33.4% reference); no
 *    measured edge can pay it.
 *  - XAUUSD M15: results/xauusd_m15_findings.md — econ survivable (+0.7pp
 *    breakeven tax, spread is 2.5% of ATR) but the export carries no
 *    directional edge, only the clock.
 *  - XAUUSD M5: results/xauusd_m5_findings.md — econ NOT survivable: spread
 *    is 4.8% of ATR (1.9× the M15 ratio), breakeven +1.5pp over the 33.4%
 *    reference — prefer M15 timing.
 * Keys are `SYMBOL:TF`; the bare `SYMBOL` key is the M15 (and NAS100) line.
 */
export const SCALPER_VERDICT_CHIP: Record<string, string> = {
  NAS100: 'no edge to pay the spread — timing only',
  XAUUSD: 'spread survivable · still no directional edge — timing only',
  'XAUUSD:M5': 'M5 spread tax +1.5pp — not survivable · prefer M15 timing',
  /* Phase 15 (results/<sym>_m15 findings + econ blocks in the exports) */
  US30: 'spread tax +2.7pp · no directional edge — timing only',
  GER40: 'spread tax +2.0pp over zero-spread floor — timing only',
  EURUSD: 'econ viable on user ECN account · still no directional edge',
  GBPUSD: 'econ cheap on user ECN account · still no directional edge',
  USDJPY: 'econ modeled (commission by analogy) · no directional edge',
}

/** Chip fallback if a future symbol+tf lands without a curated line above. */
export const SCALPER_VERDICT_CHIP_FALLBACK = 'volatility only — no directional edge'

/** Symbol+tf chip lookup: `SYMBOL:TF` first, then bare `SYMBOL`, then fallback. */
export function scalperVerdictChip(symbol: string, timeframe: string): string {
  return (
    SCALPER_VERDICT_CHIP[`${symbol}:${timeframe}`] ?? SCALPER_VERDICT_CHIP[symbol] ?? SCALPER_VERDICT_CHIP_FALLBACK
  )
}
