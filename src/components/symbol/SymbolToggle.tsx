import { memo } from 'react'
import { useSymbol } from '@/hooks/useSymbol'
import type { SymbolId } from '@/engine/symbols'
import { cn } from '@/lib/utils'

/**
 * XAUUSD | NAS100 segmented control (Navbar, left of the route links).
 * Active segment gets the gold accent; NAS100 carries a STATIC hint because
 * it has no live feed (honest state, engine verified OOS).
 */

const SEGMENTS: { id: SymbolId; label: string; hint: string | null }[] = [
  { id: 'XAUUSD', label: 'XAUUSD', hint: null },
  { id: 'NAS100', label: 'NAS100', hint: 'STATIC' },
]

export default memo(function SymbolToggle({ className }: { className?: string }) {
  const { symbol, setSymbol } = useSymbol()

  return (
    <div
      role="group"
      aria-label="Symbol"
      className={cn('flex items-center rounded-md border border-line bg-bg3/80 p-0.5', className)}
    >
      {SEGMENTS.map((s) => {
        const active = s.id === symbol
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => setSymbol(s.id)}
            aria-pressed={active}
            title={s.id === 'NAS100' ? 'NAS100 — static export, no live feed (engine verified OOS)' : 'XAUUSD — live engine'}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 font-mono text-[11px] font-semibold tracking-[0.05em] transition-colors duration-150',
              active ? 'bg-gold/15 text-gold shadow-[inset_0_0_0_1px_rgba(232,178,58,0.5)]' : 'text-text2 hover:text-text0',
            )}
          >
            {s.label}
            {s.hint && (
              <span
                className={cn(
                  'rounded border px-1 py-px font-mono text-[8px] font-bold tracking-[0.06em]',
                  active ? 'border-gold/40 text-gold' : 'border-line text-text3',
                )}
              >
                {s.hint}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
})
