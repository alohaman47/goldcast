import { memo } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useSymbol, SYMBOL_REGISTRY, SYMBOL_GROUPS } from '@/hooks/useSymbol'
import type { AppSymbolId } from '@/hooks/useSymbol'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/**
 * Multi-market picker (GoldCast Phase 15 Track C) — replaces the 2-button
 * SymbolToggle. Mobile-first: a single compact trigger (works in the Navbar
 * bar AND the mobile drawer at every viewport) opening a grouped dropdown
 * (Metals / Indices / Forex) built from SYMBOL_GROUPS — the same registry
 * order useSymbol resolves. Seven SHIP'ed markets only; nothing without a
 * real engine export is listed.
 *
 * Honesty affordances, all registry-driven:
 *  - XAUUSD carries a live dot (the only live-feed market).
 *  - Every static market carries a STATIC chip (no live feed, engine
 *    verified OOS) — in the trigger and per dropdown item.
 *  - Item sublabels name the engine timeframe set (H1+H4 vs H1 only).
 */

function StaticChip({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'rounded border px-1 py-px font-mono text-[8px] font-bold tracking-[0.06em]',
        active ? 'border-gold/40 text-gold' : 'border-line text-text3',
      )}
    >
      STATIC
    </span>
  )
}

function itemSub(id: AppSymbolId): string {
  const e = SYMBOL_REGISTRY[id]
  const tfs = e.h4 != null ? 'H1 + H4' : 'H1 only'
  return `${e.displayName} · ${tfs} · M15 clock`
}

export default memo(function SymbolPicker({ className }: { className?: string }) {
  const { symbol, entry, setSymbol } = useSymbol()
  const isLive = entry.h1.hasLiveFeed

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Symbol — ${entry.id} (${entry.group})`}
        title={`${entry.id} — ${entry.displayName}${isLive ? ' (live engine)' : ' (static export, no live feed)'}`}
        className={cn(
          'flex items-center gap-1.5 rounded-md border border-line bg-bg3/80 px-2 py-1.5 font-mono text-[11px] font-semibold tracking-[0.05em] text-gold shadow-[inset_0_0_0_1px_rgba(232,178,58,0.5)] transition-colors duration-150 hover:text-goldhi focus:outline-none',
          className,
        )}
      >
        {isLive ? (
          <span className="h-1.5 w-1.5 rounded-full bg-up animate-pulse-dot" aria-hidden="true" />
        ) : null}
        {entry.id}
        {!isLive && <StaticChip active />}
        <ChevronDown size={12} className="text-text2" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[270px] border-line bg-bg1 font-mono">
        {SYMBOL_GROUPS.map(({ group, symbols }, gi) => (
          <div key={group}>
            {gi > 0 && <DropdownMenuSeparator className="bg-line" />}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="label-caps px-2 py-1.5 text-[10px] text-text3">
                {group}
              </DropdownMenuLabel>
              {symbols.map((id) => {
                const e = SYMBOL_REGISTRY[id]
                const active = id === symbol
                const live = e.h1.hasLiveFeed
                return (
                  <DropdownMenuItem
                    key={id}
                    onSelect={() => setSymbol(id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex cursor-pointer items-start gap-2 px-2 py-2 text-[12px]',
                      active ? 'text-gold' : 'text-text1',
                    )}
                  >
                    <span className="mt-0.5 w-3 shrink-0" aria-hidden="true">
                      {active && <Check size={12} className="text-gold" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold tracking-[0.04em]">{id}</span>
                        <span className="text-[10px] text-text2">{e.label !== id ? e.label : e.group}</span>
                        {live ? (
                          <span className="flex items-center gap-1 rounded border border-up/40 px-1 py-px text-[8px] font-bold tracking-[0.06em] text-up">
                            <span className="h-1 w-1 rounded-full bg-up animate-pulse-dot" aria-hidden="true" />
                            LIVE
                          </span>
                        ) : (
                          <StaticChip active={active} />
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] font-normal text-text2">
                        {itemSub(id)}
                      </span>
                    </span>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
