import { memo } from 'react'
import { useSymbol } from '@/hooks/useSymbol'
import type { AppSymbolId, TimeframeId } from '@/hooks/useSymbol'
import { cn } from '@/lib/utils'

/**
 * H1 | H4 segmented control (Navbar, right of the SymbolPicker).
 * Rendered for the two symbols with an H4 engine (Phase 12 — gold has an
 * H4 engine now). The five Phase-15 markets are H1-ONLY: instead of a fake
 * or disabled control they get a quiet mono note ("H1 only") — honest, the
 * same pattern the Scalper's Clock uses for the gold-only M5 map.
 * Honesty hints are per-symbol:
 *  - XAUUSD: per-segment chips — H1 is the LIVE engine (green/live language),
 *    H4 is a STATIC export.
 *  - NAS100: both timeframes are STATIC exports, so the group keeps its
 *    single trailing STATIC chip.
 */

interface Segment {
  id: TimeframeId
  label: string
  title: string
  hint: 'LIVE' | 'STATIC' | null
}

const SEGMENTS: Partial<Record<AppSymbolId, Segment[]>> = {
  XAUUSD: [
    { id: 'H1', label: 'H1', title: 'XAUUSD H1 — live engine (AUC 0.778)', hint: 'LIVE' },
    { id: 'H4', label: 'H4', title: 'XAUUSD H4 — static export (AUC 0.735)', hint: 'STATIC' },
  ],
  NAS100: [
    { id: 'H1', label: 'H1', title: 'NAS100 H1 — static export (AUC 0.8726)', hint: null },
    { id: 'H4', label: 'H4', title: 'NAS100 H4 — static export (AUC 0.8715)', hint: null },
  ],
}

export default memo(function TfToggle({ className }: { className?: string }) {
  const { symbol, tf, setTf } = useSymbol()
  const segments = SEGMENTS[symbol]

  /* H1-only markets (Phase 15): no choice to make — honest note, no control. */
  if (segments == null) {
    return (
      <span className={cn('micro-mono text-text3', className)} title={`${symbol} has an H1 engine only — static export`}>
        H1 only
      </span>
    )
  }

  return (
    <div
      role="group"
      aria-label="Timeframe"
      className={cn('flex items-center rounded-md border border-line bg-bg3/80 p-0.5', className)}
    >
      {segments.map((s) => {
        const active = s.id === tf
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => setTf(s.id)}
            aria-pressed={active}
            title={s.title}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 font-mono text-[11px] font-semibold tracking-[0.05em] transition-colors duration-150',
              active ? 'bg-gold/15 text-gold shadow-[inset_0_0_0_1px_rgba(232,178,58,0.5)]' : 'text-text2 hover:text-text0',
            )}
          >
            {s.label}
            {s.hint === 'LIVE' && (
              <span
                className={cn(
                  'flex items-center gap-1 rounded border px-1 py-px font-mono text-[8px] font-bold tracking-[0.06em]',
                  active ? 'border-up/40 text-up' : 'border-up/30 text-up/80',
                )}
              >
                <span className="h-1 w-1 rounded-full bg-up animate-pulse-dot" aria-hidden="true" />
                LIVE
              </span>
            )}
            {s.hint === 'STATIC' && (
              <span
                className={cn(
                  'rounded border px-1 py-px font-mono text-[8px] font-bold tracking-[0.06em]',
                  active ? 'border-gold/40 text-gold' : 'border-line text-text3',
                )}
              >
                STATIC
              </span>
            )}
          </button>
        )
      })}
      {symbol === 'NAS100' && (
        <span className="mx-1 rounded border border-line px-1 py-px font-mono text-[8px] font-bold tracking-[0.06em] text-text3">
          STATIC
        </span>
      )}
    </div>
  )
})
