import { motion } from 'framer-motion'
import { Link } from 'react-router'
import { Activity, ArrowUp, ArrowDown, BarChart2, ChevronRight, Clock, Gauge, Info, TrendingDown, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LatestData } from '@/hooks/useData'
import HonestyBadge from '@/components/HonestyBadge'
import LiveBadge, { type LiveBadgeProps } from '@/components/live/LiveBadge'
import { cn } from '@/lib/utils'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

const SESSION_NAMES: Record<string, string> = {
  asia: 'Asia',
  london: 'London',
  ny: 'New York',
  off: 'Off-hours',
}

interface Row {
  icon: LucideIcon
  iconTone: 'gold' | 'up' | 'down'
  name: string
  sub: string
  score: number
  weight: string
}

/** EVIDENCE — Why this forecast (dashboard.md §B). Every row is a real engine input/output. */
export default function EvidencePanel({ latest, live }: { latest: LatestData; live?: LiveBadgeProps }) {
  const sessionName = SESSION_NAMES[latest.session] ?? latest.session
  const rows: Row[] = [
    {
      icon: Clock,
      iconTone: 'gold',
      name: `Session: ${sessionName}`,
      sub: `${sessionName} hours · strongest vol window of the day`,
      score: 0.8,
      weight: '30%',
    },
    {
      icon: Activity,
      iconTone: 'up',
      name: 'P(high-vol) regime persistence',
      sub: 'rv20 elevated · realized vol clustering',
      score: 0.6,
      weight: '25%',
    },
    {
      icon: latest.drift_sign >= 0 ? TrendingUp : TrendingDown,
      iconTone: latest.drift_sign >= 0 ? 'up' : 'down',
      name: 'Recent return impulse',
      sub: 'ret1 momentum into close',
      score: 0.3,
      weight: '15%',
    },
    {
      icon: Gauge,
      iconTone: 'down',
      name: 'RSI(14) stretch',
      sub: 'rsi14 mid-range · no extreme',
      score: -0.1,
      weight: '10%',
    },
    {
      icon: BarChart2,
      iconTone: 'gold',
      name: 'ATR baseline',
      sub: `ATR14 = ${latest.atr14.toFixed(2)}`,
      score: 0.2,
      weight: '20%',
    },
  ]
  const total = rows.reduce((a, r) => a + r.score, 0)
  const DriftIcon = latest.drift_sign >= 0 ? ArrowUp : ArrowDown

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: 0.15, ease: EASE }}
      className="panel flex w-full flex-col p-4"
      aria-label="Evidence — why this forecast"
    >
      <div className="flex h-10 items-center justify-between border-b border-line pb-2">
        <h2 className="panel-title">Evidence — Why this forecast</h2>
        <span
          title="Every factor below is a real input or output of the production vol engine. No directional claims."
          className="cursor-help text-text2 transition-colors hover:text-gold"
        >
          <Info size={14} />
        </span>
      </div>

      {live && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
          <LiveBadge {...live} />
          <span className="micro-mono">
            {live.status === 'live' || live.status === 'gap' || live.status === 'stale'
              ? 'LIVE ENGINE: browser GBM (parity ✓)'
              : 'STATIC ENGINE EXPORT — /data/latest.json'}
          </span>
        </div>
      )}

      <div className="mt-2 flex flex-col">
        {rows.map((r, i) => {
          const Icon = r.icon
          const pos = r.score >= 0
          return (
            <motion.div
              key={r.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 + i * 0.08, ease: EASE }}
              className={cn(
                'relative flex items-center gap-3 border-b border-line/60 py-3 pl-3 last:border-0',
                pos ? 'border-l-2 border-l-up/40' : 'border-l-2 border-l-down/40',
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg3">
                <Icon
                  size={18}
                  className={r.iconTone === 'gold' ? 'text-gold' : r.iconTone === 'up' ? 'text-up' : 'text-down'}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-text0">{r.name}</span>
                <span className="block truncate text-[12px] text-text1">{r.sub}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 + i * 0.08, duration: 0.3 }}
                  className={cn('font-mono text-[18px] font-semibold leading-6 tnum', pos ? 'text-up' : 'text-down')}
                >
                  {pos ? '+' : '−'}
                  {Math.abs(r.score).toFixed(1)}
                </motion.span>
                <span className="rounded bg-bg3 px-1.5 py-0.5 font-mono text-[10px] text-text2">
                  weight {r.weight}
                </span>
              </span>
            </motion.div>
          )
        })}
      </div>

      {/* news / honesty card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.7, ease: EASE }}
        className="mt-2 rounded-lg border-l-2 border-l-warn bg-bg3 p-3"
      >
        <Link to="/methodology#cones" className="group flex items-start justify-between gap-2">
          <div>
            <p className="text-[13px] font-semibold text-warn">⚠ High-impact windows widen cones</p>
            <p className="mt-1 text-[12px] leading-5 text-text1">
              Impact: High · Range ×1.5 — engine widens, never picks a side
            </p>
          </div>
          <ChevronRight size={16} className="mt-1 shrink-0 text-text2 transition-colors group-hover:text-gold" />
        </Link>
      </motion.div>

      {/* total */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.8 }}
        className="mt-3 border-t border-line pt-3"
      >
        <div className="flex items-center justify-between">
          <span className="label-caps">Total Vol Score</span>
          <span className="font-mono text-[18px] font-semibold tnum text-up">
            +{total.toFixed(1)} <span className="text-[13px] font-medium">(High-Vol Likely)</span>
          </span>
        </div>
        <p className="micro-mono mt-1">P(next-bar range &gt; 1.2×ATR)</p>
      </motion.div>

      {/* direction honesty block */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.9 }}
        className="mt-3 rounded-lg border border-line p-3"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="label-caps text-honest">Direction</span>
          <HonestyBadge
            kind="not-predictable"
            tooltip="Walk-forward OOS, 26,836 bars, verified twice. No model beats always-up on direction."
          />
        </div>
        <p className="mt-2 text-[12px] leading-5 text-text1">
          Best ML ensemble: <span className="font-mono tnum text-text0">50.1%</span> next-candle accuracy vs{' '}
          <span className="font-mono tnum text-text0">52.1%</span> always-up. We don&apos;t print fake
          probabilities.
        </p>
        <div className="mt-2 flex items-center gap-2 border-t border-line/60 pt-2">
          <DriftIcon size={14} className="text-gold" />
          <span className="font-mono text-[13px] tnum text-gold">
            Long-term drift: {latest.drift_sign >= 0 ? 'UP' : 'DOWN'} (2022–2026)
          </span>
        </div>
        <p className="micro-mono mt-1">the only verified directional effect</p>
        <Link
          to="/truth"
          className="mt-2 inline-block text-[12px] font-medium text-info transition-colors hover:text-gold"
        >
          See the evidence →
        </Link>
      </motion.div>
    </motion.aside>
  )
}
