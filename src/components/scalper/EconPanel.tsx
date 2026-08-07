import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Scale } from 'lucide-react'
import type { ScalperEcon } from '@/hooks/useData'
import { TERMINAL_EASE, fmtPctAdaptive } from './utils'

/**
 * Framed punchline + verdict label — keyed by meta.symbol. The JSON carries
 * every number plus the long-form econ.verdict verbatim, but no short
 * headline, so these live here as constants from the research findings:
 *  - NAS100 (results/nas100_m15_findings.md): the spread is NOT the killer —
 *    the missing edge is (+1.9pp breakeven tax over the 33.4% reference).
 *  - XAUUSD (results/xauusd_m15_findings.md): the spread tax is survivable
 *    (+0.7pp) — the missing directional edge is still the binding constraint.
 */
const PUNCHLINE: Record<string, (spreadPct: string) => ReactNode> = {
  NAS100: (spreadPct) => (
    <>
      The spread is <span className="font-semibold text-text0">NOT</span> the killer — the missing edge is. At{' '}
      {spreadPct}% of ATR the cost is real but small; the problem is that no measured directional edge survives it.
    </>
  ),
  XAUUSD: (spreadPct) => (
    <>
      The spread is survivable — the missing edge is still the binding constraint. At {spreadPct}% of ATR the tax
      barely moves breakeven; the problem is that this clock carries no directional edge to spend it on.
    </>
  ),
}
const PUNCHLINE_FALLBACK: (spreadPct: string) => ReactNode = PUNCHLINE.NAS100

const VERDICT_LABEL: Record<string, string> = {
  NAS100: 'Verdict — M15 no-ship',
  XAUUSD: 'Verdict — M15 econ survivable',
}
const VERDICT_LABEL_FALLBACK = 'Verdict — M15 scalping'

/**
 * "The honest math of scalping" — verified economics from the active
 * symbol's econ block, framed exactly as that symbol's research states it.
 */
export default function EconPanel({ econ, symbol }: { econ: ScalperEcon; symbol: string }) {
  const reducedMotion = useReducedMotion()
  const spreadPct = (econ.median_spread_atr * 100).toFixed(1)
  /* Research-cited breakeven gap (pp), rounded half-to-even at 1dp from the
     UNROUNDED inputs of the research CSVs (this export only carries the
     1dp-rounded fields: 34.2 − 33.4 would give 0.8, contradicting the cited
     +0.7pp for gold), so the econ block carries the cited value explicitly
     as breakeven_gap_pp. NAS100's cited 1.9 equals 35.3 − 33.4 exactly, so
     its rendering stays byte-identical. */
  const gap = econ.breakeven_gap_pp.toFixed(1)
  const punchline = (PUNCHLINE[symbol] ?? PUNCHLINE_FALLBACK)(spreadPct)

  const stats = [
    { label: 'median spread', value: `$${econ.median_spread_usd.toFixed(2)}`, sub: 'per round trip, at entry' },
    { label: 'median ATR(14)', value: `$${econ.median_atr_usd.toFixed(2)}`, sub: 'M15 bar, full history' },
    { label: 'spread / ATR', value: `${spreadPct}%`, sub: 'the tax as a share of the move' },
    {
      label: 'bars where spread > 25% ATR',
      value: `${fmtPctAdaptive(econ.pct_bars_spread_gt_25pct_atr)}%`,
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

        <p className="mt-3 max-w-[720px] font-body text-[14px] leading-6 text-text1">{punchline}</p>

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
              what was actually achieved —{' '}
              {symbol === 'XAUUSD' ? (
                /* gold research framing: the tax ADDS +0.7pp to breakeven */
                <span className="text-down">+{gap}pp spread tax</span>
              ) : (
                /* NAS100 framing stays byte-identical: −1.9pp short */
                <span className="text-down">−{gap}pp short</span>
              )}
            </p>
          </div>
        </div>

        {/* Verdict — verbatim from the research export */}
        <div className="mt-4 rounded-md border-l-[3px] border-l-warn border border-line bg-bg2 p-4">
          <span className="label-caps text-warn">{VERDICT_LABEL[symbol] ?? VERDICT_LABEL_FALLBACK}</span>
          <p className="mt-2 font-mono text-[12px] leading-5 text-text1">{econ.verdict}</p>
        </div>

        <p className="micro-mono mt-4">Trade model: {econ.trade_model}</p>
        <p className="micro-mono mt-1">Source: {econ.source}</p>
      </motion.div>
    </section>
  )
}
