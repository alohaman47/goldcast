import { motion, useReducedMotion } from 'framer-motion'
import { Scale } from 'lucide-react'
import type { ScalperEcon } from '@/hooks/useData'
import { TERMINAL_EASE } from './utils'

/**
 * "The honest math of scalping" — verified economics, framed exactly as the
 * research states it: the spread is NOT the killer — the missing edge is.
 */
export default function EconPanel({ econ }: { econ: ScalperEcon }) {
  const reducedMotion = useReducedMotion()
  const spreadPct = (econ.median_spread_atr * 100).toFixed(1)
  const gap = (econ.breakeven_win_pct_median - econ.gold_reference_win_pct).toFixed(1)

  const stats = [
    { label: 'median spread', value: `$${econ.median_spread_usd.toFixed(2)}`, sub: 'per round trip, at entry' },
    { label: 'median ATR(14)', value: `$${econ.median_atr_usd.toFixed(2)}`, sub: 'M15 bar, full history' },
    { label: 'spread / ATR', value: `${spreadPct}%`, sub: 'the tax as a share of the move' },
    {
      label: 'bars where spread > 25% ATR',
      value: `${econ.pct_bars_spread_gt_25pct_atr.toFixed(1)}%`,
      sub: 'trade dies at entry',
    },
  ]

  return (
    <section aria-label="The honest math of scalping">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: reducedMotion ? 0 : 0.5, ease: TERMINAL_EASE }}
        className="panel panel-gold p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="panel-title">The Honest Math of Scalping</h2>
          <Scale size={16} className="shrink-0 text-gold" />
        </div>

        <p className="mt-3 max-w-[720px] font-body text-[14px] leading-6 text-text1">
          The spread is <span className="font-semibold text-text0">NOT</span> the killer — the missing edge is. At{' '}
          {spreadPct}% of ATR the cost is real but small; the problem is that no measured directional edge survives it.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: reducedMotion ? 0 : 0.4, ease: TERMINAL_EASE, delay: reducedMotion ? 0 : i * 0.07 }}
              className="rounded-md border border-line bg-bg2 p-4"
            >
              <span className="label-caps block">{s.label}</span>
              <span className="stat-glow mt-2 block font-mono text-[24px] font-semibold leading-7 tnum text-gold">
                {s.value}
              </span>
              <span className="micro-mono mt-1.5 block">{s.sub}</span>
            </motion.div>
          ))}
        </div>

        {/* Breakeven vs best verified system */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-md border border-warn/40 bg-warn/5 p-4">
            <span className="label-caps text-warn">breakeven win rate (1:2 RR)</span>
            <p className="mt-2 font-mono text-[28px] font-bold leading-8 tnum text-warn">
              {econ.breakeven_win_pct_median.toFixed(1)}%
            </p>
            <p className="micro-mono mt-1">what the spread tax demands of you</p>
          </div>
          <div className="rounded-md border border-line bg-bg2 p-4">
            <span className="label-caps">best verified system (gold reference)</span>
            <p className="mt-2 font-mono text-[28px] font-bold leading-8 tnum text-text0">
              {econ.gold_reference_win_pct.toFixed(1)}%
            </p>
            <p className="micro-mono mt-1">
              what was actually achieved — <span className="text-down">−{gap}pp short</span>
            </p>
          </div>
        </div>

        {/* Verdict — verbatim from the research export */}
        <div className="mt-4 rounded-md border-l-[3px] border-l-warn border border-line bg-bg2 p-4">
          <span className="label-caps text-warn">Verdict — M15 no-ship</span>
          <p className="mt-2 font-mono text-[12px] leading-5 text-text1">{econ.verdict}</p>
        </div>

        <p className="micro-mono mt-4">Trade model: {econ.trade_model}</p>
        <p className="micro-mono mt-1">Source: {econ.source}</p>
      </motion.div>
    </section>
  )
}
