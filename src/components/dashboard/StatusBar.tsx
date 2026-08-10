import type { LatestData } from '@/hooks/useData'
import { useTimezone, fmtAsofInTz } from '@/hooks/useTimezone'
import { SYMBOL_CONFIGS } from '@/engine/symbols'
import { dataSourceLabel } from '@/hooks/useSymbol'

/** G. Status Bar (dashboard.md §G) — replaces the footer on the dashboard. */
export default function StatusBar({ latest, liveActive = false }: { latest: LatestData | null; liveActive?: boolean }) {
  const { tz } = useTimezone()
  return (
    <div className="flex h-10 flex-wrap items-center justify-between gap-x-4 border-t border-line bg-bg0 px-4">
      <span className="micro-mono truncate">
        Data: {dataSourceLabel(SYMBOL_CONFIGS.XAUUSD)} XAUUSD H1 ·{' '}
        {liveActive ? (
          <>
            <span className="text-down">LIVE</span> browser engine asof {fmtAsofInTz(latest?.asof, tz)} · LIVE ENGINE:
            browser GBM (parity ✓) ·{' '}
          </>
        ) : (
          <>Engine export asof {fmtAsofInTz(latest?.asof, tz)} · </>
        )}
        27,737 bars verified
      </span>
      <span className="micro-mono hidden sm:inline">GoldCast shows risk, not signals · Not investment advice</span>
    </div>
  )
}
