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
