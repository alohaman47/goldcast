import type { LatestData } from '@/hooks/useData'
import type { SymbolConfig } from '@/engine/symbols'

/**
 * Symbol-aware Status Bar (dashboard.md §G) — replaces the footer on the
 * dashboard. Identical copy to the gold StatusBar when config is XAUUSD;
 * for NAS100 the instrument label and verified-bar count follow the symbol.
 */
export default function SymbolStatusBar({
  latest,
  liveActive = false,
  config,
  barsVerified,
}: {
  latest: LatestData | null
  liveActive?: boolean
  config: SymbolConfig
  /** Pre-formatted verified H1 bar count for the active symbol's dataset. */
  barsVerified: string
}) {
  return (
    <div className="flex h-10 flex-wrap items-center justify-between gap-x-4 border-t border-line bg-bg0 px-4">
      <span className="micro-mono truncate">
        Data: OANDA {config.symbol} H1 ·{' '}
        {liveActive ? (
          <>
            <span className="text-down">LIVE</span> browser engine asof {latest?.asof ?? '—'} UTC · LIVE ENGINE:
            browser GBM (parity ✓) ·{' '}
          </>
        ) : (
          <>Engine export asof {latest?.asof ?? '—'} UTC · </>
        )}
        {barsVerified} bars verified
      </span>
      <span className="micro-mono hidden sm:inline">GoldCast shows risk, not signals · Not investment advice</span>
    </div>
  )
}
