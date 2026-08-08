import { memo } from 'react'
import { useTimezone } from '@/hooks/useTimezone'
import type { DisplayTz } from '@/hooks/useTimezone'
import { cn } from '@/lib/utils'

/**
 * UTC | NY segmented control (Navbar, right of TfToggle) — GoldCast Phase 14.
 * Exact visual language of SymbolToggle/TfToggle (mono, gold active segment,
 * border-line bg-bg3/80). Display-only: UTC is the research-native default
 * (clean URL, no param); NY re-labels times via America/New_York (EST/EDT
 * auto-adjusted) — data and engine stay UTC.
 */

const SEGMENTS: { id: DisplayTz; label: string; title: string }[] = [
  { id: 'UTC', label: 'UTC', title: 'Coordinated Universal Time (research native)' },
  { id: 'NY', label: 'NY', title: 'New York time — EST/EDT auto-adjusted' },
]

export default memo(function TzToggle({ className }: { className?: string }) {
  const { tz, setTz } = useTimezone()

  return (
    <div
      role="group"
      aria-label="Display timezone"
      className={cn('flex items-center rounded-md border border-line bg-bg3/80 p-0.5', className)}
    >
      {SEGMENTS.map((s) => {
        const active = s.id === tz
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => setTz(s.id)}
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
    </div>
  )
})
