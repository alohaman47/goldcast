import { memo } from 'react'

/**
 * Honest STATIC badge for symbols without a live feed (NAS100).
 * Shown in the chart header instead of the polling LiveBadge: no live price,
 * no forming bar — the data is the verified out-of-sample engine export.
 */
export default memo(function StaticBadge() {
  return (
    <span className="flex items-center gap-2" role="status" aria-live="polite">
      <span className="h-2 w-2 shrink-0 rounded-full bg-text2" aria-hidden="true" />
      <span className="font-mono text-[11px] font-bold tracking-[0.08em] text-text2">
        STATIC — no live feed · engine verified OOS
      </span>
    </span>
  )
})
