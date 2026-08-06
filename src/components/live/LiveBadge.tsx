import { memo, useEffect, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Pulsing LIVE badge (with spot price + tick time) and its honest fallbacks:
 * STALE (tick older than 90s), GAP (history frozen, prediction live),
 * ERROR (fetch failing, retrying), STATIC (offline export), CONNECTING.
 */

export type LiveBadgeStatus = 'connecting' | 'live' | 'gap' | 'stale' | 'error' | 'static'

export interface LiveBadgeProps {
  status: LiveBadgeStatus
  price: number | null
  tickAtMs: number | null
  onRefresh?: () => void
  className?: string
}

const p2 = (n: number) => String(n).padStart(2, '0')

function fmtTickClock(ms: number): string {
  const d = new Date(ms)
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} UTC`
}

function fmtAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 90) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 90) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

export default memo(function LiveBadge({ status, price, tickAtMs, onRefresh, className }: LiveBadgeProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const iv = window.setInterval(() => setNowMs(Date.now()), 5_000)
    return () => window.clearInterval(iv)
  }, [])

  const dot = (cls: string, pulse = true) => (
    <span className={cn('h-2 w-2 shrink-0 rounded-full', cls, pulse && 'animate-pulse-dot')} aria-hidden="true" />
  )
  const priceEl = price != null && (
    <span className="font-mono text-[12px] font-semibold tnum text-text0">
      {price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  )
  const refreshEl = onRefresh && (status === 'error' || status === 'static' || status === 'stale') && (
    <button
      onClick={onRefresh}
      className="flex items-center gap-1 rounded border border-line bg-bg3/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-text2 transition-colors duration-150 hover:border-gold/50 hover:text-gold"
    >
      <RotateCw size={10} />
      refresh
    </button>
  )

  return (
    <span className={cn('flex items-center gap-2', className)} role="status" aria-live="polite">
      {status === 'live' && (
        <>
          {dot('bg-down')}
          <span className="font-mono text-[11px] font-bold tracking-[0.08em] text-down">LIVE</span>
          {priceEl}
          {tickAtMs != null && <span className="micro-mono">tick {fmtTickClock(tickAtMs)}</span>}
        </>
      )}
      {status === 'gap' && (
        <>
          {dot('bg-down')}
          <span className="font-mono text-[11px] font-bold tracking-[0.08em] text-down">LIVE</span>
          {priceEl}
          <span className="rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-warn">
            GAP
          </span>
          {tickAtMs != null && <span className="micro-mono">tick {fmtTickClock(tickAtMs)}</span>}
        </>
      )}
      {status === 'stale' && (
        <>
          {dot('bg-warn')}
          <span className="font-mono text-[11px] font-bold tracking-[0.08em] text-warn">STALE</span>
          {priceEl}
          {tickAtMs != null && <span className="micro-mono">last tick {fmtAge(nowMs - tickAtMs)}</span>}
          {refreshEl}
        </>
      )}
      {status === 'error' && (
        <>
          {dot('bg-down', false)}
          <span className="font-mono text-[11px] font-bold tracking-[0.08em] text-down">ERROR · retrying</span>
          {refreshEl}
        </>
      )}
      {status === 'static' && (
        <>
          {dot('bg-text2', false)}
          <span className="font-mono text-[11px] font-bold tracking-[0.08em] text-text2">STATIC — offline</span>
          {refreshEl}
        </>
      )}
      {status === 'connecting' && (
        <>
          {dot('bg-gold')}
          <span className="font-mono text-[11px] font-bold tracking-[0.08em] text-gold">CONNECTING…</span>
        </>
      )}
    </span>
  )
})
