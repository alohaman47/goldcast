import { memo } from 'react'
import { useSymbol } from '@/hooks/useSymbol'
import type { TimeframeId } from '@/hooks/useSymbol'
import { cn } from '@/lib/utils'

/**
 * H1 | H4 segmented control (Navbar, right of the SymbolToggle).
 * Rendered ONLY for NAS100 — gold has no H4 engine. Both timeframes are
 * STATIC exports (no live feed), so the group carries a single STATIC hint
 * chip (same honesty language as the SymbolToggle).
 */

const SEGMENTS: { id: TimeframeId; label: string; title: string }[] = [
  { id: 'H1', label: 'H1', title: 'NAS100 H1 — static export (AUC 0.8726)' },
  { id: 'H4', label: 'H4', title: 'NAS100 H4 — static export (AUC 0.8715)' },
]

export default memo(function TfToggle({ className }: { className?: string }) {
  const { symbol, tf, setTf } = useSymbol()
  if (symbol !== 'NAS100') return null

  return (
    <div
      role="group"
      aria-label="Timeframe"
      className={cn('flex items-center rounded-md border border-line bg-bg3/80 p-0.5', className)}
    >
      {SEGMENTS.map((s) => {
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
          </button>
        )
      })}
      <span className="mx-1 rounded border border-line px-1 py-px font-mono text-[8px] font-bold tracking-[0.06em] text-text3">
        STATIC
      </span>
    </div>
  )
})
