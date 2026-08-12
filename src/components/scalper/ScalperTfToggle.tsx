import { memo } from 'react'
import type { ScalperClockData, ScalperTf } from '@/hooks/useData'
import { fmtInt } from '@/components/scalper/utils'
import { cn } from '@/lib/utils'

/**
 * M15 | M5 segmented control for the Scalper's Clock page header (Phase 13).
 * Same visual language as the Navbar TfToggle/SymbolToggle (mono, gold
 * active, border-line bg-bg3/80) but PAGE-LOCAL: it drives the `?stf` param
 * (useScalperTf), never the engine `?tf`.
 *
 * Honesty rules:
 *  - NAS100 has no M5 export, so instead of a fake/disabled control the page
 *    renders a quiet mono note: "M5 map: gold only".
 *  - Segment tooltips name the dataset (bars + end date). When the segment's
 *    export is the loaded one, the tooltip is derived from its meta; the
 *    unloaded sibling falls back to a documented constant that mirrors that
 *    file's meta exactly.
 */

/** Mirrors xauusd_m5_slots.json meta (bar_count 325,160 · last_bar 2026-08-04 16:00:00). */
const M5_TITLE_FALLBACK = 'XAUUSD M5 — 325,160 bars, ends 2026-08-04'
/** Mirrors xauusd_m15_slots.json meta (bar_count 110,964 · last_bar 2026-08-11 17:45:00). */
const M15_TITLE_FALLBACK = 'XAUUSD M15 — 110,964 bars, ends 2026-08-11'

function segmentTitle(tf: ScalperTf, meta: ScalperClockData['meta'] | null): string {
  if (meta && meta.timeframe === tf) {
    return `${meta.symbol} ${meta.timeframe} — ${fmtInt(meta.bar_count)} bars, ends ${meta.last_bar.slice(0, 10)}`
  }
  return tf === 'M5' ? M5_TITLE_FALLBACK : M15_TITLE_FALLBACK
}

interface ScalperTfToggleProps {
  /** meta.symbol of the active export (NAS100 → honest note, no control). */
  symbol: string
  stf: ScalperTf
  setStf: (next: ScalperTf) => void
  /** Loaded export meta, when available — tooltips source from it. */
  meta: ScalperClockData['meta'] | null
  className?: string
}

export default memo(function ScalperTfToggle({ symbol, stf, setStf, meta, className }: ScalperTfToggleProps) {
  if (symbol !== 'XAUUSD') {
    return (
      <span className={cn('micro-mono text-text3', className)} title={`${symbol} has no M5 research export`}>
        M5 map: gold only
      </span>
    )
  }

  const segments: { id: ScalperTf; label: string }[] = [
    { id: 'M15', label: 'M15' },
    { id: 'M5', label: 'M5' },
  ]

  return (
    <div
      role="group"
      aria-label="Scalper clock timeframe"
      className={cn('flex items-center rounded-md border border-line bg-bg3/80 p-0.5', className)}
    >
      {segments.map((s) => {
        const active = s.id === stf
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => setStf(s.id)}
            aria-pressed={active}
            title={segmentTitle(s.id, meta)}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 font-mono text-[11px] font-semibold tracking-[0.05em] transition-colors duration-150',
              active ? 'bg-gold/15 text-gold shadow-[inset_0_0_0_1px_rgba(232,178,58,0.5)]' : 'text-text2 hover:text-text0',
            )}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
})
