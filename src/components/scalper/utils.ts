import type { ScalperSlot } from '@/hooks/useData'
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

/** Slot index (0..95) for a UTC timestamp. */
export function slotIndexFor(date: Date): number {
  return date.getUTCHours() * 4 + Math.floor(date.getUTCMinutes() / 15)
}

/**
 * Verdict chip (hero badge row) — the ONE place short honesty prose is keyed
 * by meta.symbol instead of read from the JSON. The slot-map exports carry
 * every number plus long-form econ.verdict / guidance strings verbatim, but
 * no short chip field, so these constants summarize the research findings:
 *  - NAS100: results/nas100_m15_findings.md — spread tax pushes 1:2-RR
 *    breakeven to 35.3% (+1.9pp over the 33.4% reference); no measured edge
 *    can pay it.
 *  - XAUUSD: results/xauusd_m15_findings.md — econ survivable (+0.7pp
 *    breakeven tax, spread is 2.5% of ATR) but the export carries no
 *    directional edge, only the clock.
 */
export const SCALPER_VERDICT_CHIP: Record<string, string> = {
  NAS100: 'no edge to pay the spread — timing only',
  XAUUSD: 'spread survivable · still no directional edge — timing only',
}

/** Chip fallback if a future symbol lands without a curated line above. */
export const SCALPER_VERDICT_CHIP_FALLBACK = 'volatility only — no directional edge'
