import type { LatestData } from '@/hooks/useData'

/** G. Status Bar (dashboard.md §G) — replaces the footer on the dashboard. */
export default function StatusBar({ latest }: { latest: LatestData | null }) {
  return (
    <div className="flex h-10 flex-wrap items-center justify-between gap-x-4 border-t border-line bg-bg0 px-4">
      <span className="micro-mono truncate">
        Data: OANDA XAUUSD H1 · Engine export asof {latest?.asof ?? '—'} UTC · 26,836 bars verified
      </span>
      <span className="micro-mono hidden sm:inline">GoldCast shows risk, not signals · Not investment advice</span>
    </div>
  )
}
