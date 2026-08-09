import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Scale } from 'lucide-react'
import type { ScalperEcon } from '@/hooks/useData'
import { entryForSymbol } from '@/hooks/useSymbol'
import { TERMINAL_EASE, fmtPctAdaptive } from './utils'

/**
 * Framed punchline + verdict label — keyed by meta.symbol + meta.timeframe
 * (`SYMBOL:TF`, bare `SYMBOL` = the M15 line). The JSON carries every number
 * plus the long-form econ.verdict verbatim, but no short headline, so these
 * live here as constants from the research findings:
 *  - NAS100 (results/nas100_m15_findings.md): the spread is NOT the killer —
 *    the missing edge is (+1.9pp breakeven tax over the 33.4% reference).
 *  - XAUUSD M15 (results/xauusd_m15_findings.md): the spread tax is
 *    survivable (+0.7pp) — the missing directional edge is still the binding
 *    constraint.
 *  - XAUUSD M5 (results/xauusd_m5_findings.md): the spread tax is NOT
 *    survivable (+1.5pp, spread is 4.8% of ATR — 1.9× the M15 ratio) —
 *    prefer M15 timing.
 *  - Phase 15 (econ blocks of the five new M15 exports, cited verbatim
 *    below each punchline): US30 spread tax +2.7pp vs the gold reference;
 *    GER40 spread tax +2.0pp over the zero-spread floor (no verified GER40
 *    reference system exists); the FX trio is COMMISSION-modeled on the
 *    user-provided ECN account ($7/lot RT) — EURUSD/GBPUSD confirmed,
 *    USDJPY applied by analogy.
 */
const PUNCHLINE: Record<string, (costPct: string) => ReactNode> = {
  NAS100: (costPct) => (
    <>
      The spread is <span className="font-semibold text-text0">NOT</span> the killer — the missing edge is. At{' '}
      {costPct}% of ATR the cost is real but small; the problem is that no measured directional edge survives it.
    </>
  ),
  XAUUSD: (costPct) => (
    <>
      The spread is survivable — the missing edge is still the binding constraint. At {costPct}% of ATR the tax
      barely moves breakeven; the problem is that this clock carries no directional edge to spend it on.
    </>
  ),
  'XAUUSD:M5': (costPct) => (
    <>
      The M5 spread tax is <span className="font-semibold text-text0">NOT</span> survivable on its own — prefer M15
      timing. At {costPct}% of ATR the cost bites 1.9× harder than at M15 and pushes breakeven +1.5pp past what the
      best verified gold system achieved; no measured directional edge pays it.
    </>
  ),
  US30: (costPct) => (
    <>
      The spread tax is real — and there is still no edge to pay it. At {costPct}% of ATR the recorded spread
      pushes the 1:2-RR breakeven +2.7pp past the verified gold reference; this clock carries no directional edge.
    </>
  ),
  GER40: (costPct) => (
    <>
      The spread tax is the whole story — GER40 has no verified system of its own to compare against. At {costPct}%
      of ATR the recorded spread pushes breakeven +2.0pp over the zero-spread floor; the clock carries no
      directional edge.
    </>
  ),
  EURUSD: (costPct) => (
    <>
      On this ECN account the cost is survivable — the missing edge is not. Commission $7/lot (user account) is{' '}
      {costPct}% of ATR, pushing breakeven +3.7pp over zero-cost; the clock carries no directional edge.
    </>
  ),
  GBPUSD: (costPct) => (
    <>
      Costs do not kill GBPUSD M15 on this ECN account — the missing edge is still the binding constraint.
      Commission $7/lot (user account) is {costPct}% of ATR, only +2.8pp over zero-cost; the clock carries no
      directional edge.
    </>
  ),
  USDJPY: (costPct) => (
    <>
      The cost is modeled, not measured — commission $7/lot (user account), applied to USDJPY by analogy. At{' '}
      {costPct}% of ATR it pushes breakeven +3.3pp over zero-cost; the clock carries no directional edge.
    </>
  ),
}
const PUNCHLINE_FALLBACK: (costPct: string) => ReactNode = PUNCHLINE.NAS100

const VERDICT_LABEL: Record<string, string> = {
  NAS100: 'Verdict — M15 no-ship',
  XAUUSD: 'Verdict — M15 econ survivable',
  'XAUUSD:M5': 'Verdict — M5 econ NOT survivable',
  US30: 'Verdict — M15 no edge to pay the spread',
  GER40: 'Verdict — M15 spread tax only, no reference system',
  EURUSD: 'Verdict — M15 econ viable (user ECN account)',
  GBPUSD: 'Verdict — M15 econ cheap (user ECN account)',
  USDJPY: 'Verdict — M15 econ modeled (commission by analogy)',
}
const VERDICT_LABEL_FALLBACK = 'Verdict — scalping economics'

interface Stat {
  label: string
  value: string
  sub: string
}

/**
 * "The honest math of scalping" — verified economics from the active
 * export's econ block, framed exactly as that symbol+timeframe's research
 * states it. Two schema families, branched on field presence (data-driven):
 * SPREAD (broker-recorded: XAUUSD/NAS100/US30/GER40) and COMMISSION
 * (user-provided ECN account economics: EURUSD/GBPUSD/USDJPY).
 */
export default function EconPanel({
  econ,
  symbol,
  timeframe,
}: {
  econ: ScalperEcon
  symbol: string
  timeframe: string
}) {
  const reducedMotion = useReducedMotion()
  const isCommission = econ.median_cost_atr != null
  const entry = entryForSymbol(symbol)
  /* cost as a share of ATR: spread family reads median_spread_atr, the
     commission family reads median_cost_atr — both from the JSON. */
  const costPct = ((isCommission ? econ.median_cost_atr : econ.median_spread_atr) ?? 0) * 100
  const costPctText = costPct.toFixed(1)
  /* Research-cited breakeven gap (pp). Spread family: breakeven_gap_pp (see
     the type doc — cited value, not the 1dp-rounded-field difference).
     Commission family: the gap over the ZERO-COST 1:2-RR breakeven
     (breakeven_gap_pp / edge_over_zero_cost_pp /
     breakeven_gap_over_zero_cost_pp per export). */
  const gap =
    econ.breakeven_gap_pp ?? econ.edge_over_zero_cost_pp ?? econ.breakeven_gap_over_zero_cost_pp ?? 0
  const gapText = gap.toFixed(1)
  const punchline = (PUNCHLINE[`${symbol}:${timeframe}`] ?? PUNCHLINE[symbol] ?? PUNCHLINE_FALLBACK)(costPctText)

  const stats: Stat[] = isCommission
    ? commissionStats(econ, symbol, timeframe)
    : [
        { label: 'median spread', value: `$${(econ.median_spread_usd ?? 0).toFixed(2)}`, sub: 'per round trip, at entry' },
        { label: 'median ATR(14)', value: `$${(econ.median_atr_usd ?? 0).toFixed(2)}`, sub: `${timeframe} bar, full history` },
        { label: 'spread / ATR', value: `${costPctText}%`, sub: 'the tax as a share of the move' },
        {
          label: 'bars where spread > 25% ATR',
          value: `${fmtPctAdaptive(econ.pct_bars_spread_gt_25pct_atr ?? 0)}%`,
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

        {/* commission honesty note (spec §7): FX economics are user-provided
            account economics, not broker-recorded spreads — say so up front. */}
        {entry.econNote != null && (
          <p className="micro-mono mt-2 text-warn">cost basis: {entry.econNote}</p>
        )}

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

        {/* Breakeven vs reference */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-md border border-warn/40 bg-warn/5 p-4">
            <span className="label-caps text-warn">breakeven win rate (1:2 RR)</span>
            <p className="mt-2 font-mono text-[28px] font-bold leading-8 tnum text-warn">
              {econ.breakeven_win_pct_median.toFixed(1)}%
            </p>
            <p className="micro-mono mt-1">
              {isCommission ? 'what the commission tax demands of you' : 'what the spread tax demands of you'}
            </p>
          </div>
          {isCommission ? (
            <div className="rounded-md border border-line bg-bg2 p-4">
              <span className="label-caps">zero-cost 1:2-RR breakeven (no commission)</span>
              <p className="mt-2 font-mono text-[28px] font-bold leading-8 tnum text-text0">
                {(econ.zero_cost_breakeven_win_pct ?? econ.breakeven_win_pct_zero_cost ?? 0).toFixed(1)}%
              </p>
              <p className="micro-mono mt-1">
                the floor with no trading cost — <span className="text-down">+{gapText}pp cost tax</span>
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-line bg-bg2 p-4">
              <span className="label-caps">
                {econ.reference_note != null
                  ? 'zero-spread 1:2-RR breakeven floor'
                  : 'best verified system (gold reference)'}
              </span>
              <p className="mt-2 font-mono text-[28px] font-bold leading-8 tnum text-text0">
                {(econ.gold_reference_win_pct ?? 0).toFixed(1)}%
              </p>
              <p className="micro-mono mt-1">
                {econ.reference_note != null ? (
                  /* GER40 framing: the gap IS the pure spread tax over the
                     zero-spread floor (no verified reference system exists) */
                  <>
                    no verified GER40 system to beat — <span className="text-down">+{gapText}pp spread tax</span>
                  </>
                ) : symbol === 'XAUUSD' ? (
                  /* gold research framing (M15 + M5): the tax ADDS to breakeven
                     (+0.7pp at M15, +1.5pp at M5) */
                  <>
                    what was actually achieved — <span className="text-down">+{gapText}pp spread tax</span>
                  </>
                ) : (
                  /* NAS100 framing stays byte-identical: −1.9pp short. US30
                     shares it (same 33.4% gold reference): −2.7pp short. */
                  <>
                    what was actually achieved — <span className="text-down">−{gapText}pp short</span>
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Verdict — verbatim from the research export */}
        <div className="mt-4 rounded-md border-l-[3px] border-l-warn border border-line bg-bg2 p-4">
          <span className="label-caps text-warn">
            {VERDICT_LABEL[`${symbol}:${timeframe}`] ?? VERDICT_LABEL[symbol] ?? VERDICT_LABEL_FALLBACK}
          </span>
          <p className="mt-2 font-mono text-[12px] leading-5 text-text1">{econ.verdict}</p>
        </div>

        {/* JSON-carried honesty notes (verbatim, when the export has them):
            GER40 reference_note (zero-spread floor + EUR units), FX
            market_open_note (spread widening at rollover/open), USDJPY
            cost_provenance (commission by analogy). */}
        {econ.reference_note != null && <p className="micro-mono mt-4">Reference: {econ.reference_note}</p>}
        {econ.market_open_note != null && <p className="micro-mono mt-4">Market open: {econ.market_open_note}</p>}
        {econ.cost_provenance != null && <p className="micro-mono mt-4">Cost provenance: {econ.cost_provenance}</p>}

        <p className="micro-mono mt-4">Trade model: {econ.trade_model}</p>
        <p className="micro-mono mt-1">Source: {econ.source}</p>
      </motion.div>
    </section>
  )
}

/**
 * COMMISSION-family stat cards (EURUSD/GBPUSD/USDJPY). Every number comes
 * from the econ block; the per-market field differences (pips vs ¥, base vs
 * RT commission) follow field presence, never hardcoded values.
 */
function commissionStats(econ: ScalperEcon, symbol: string, timeframe: string): Stat[] {
  const costPips = econ.cost_pips_base ?? econ.cost_pips ?? econ.commission_assumption?.commission_pips_rt ?? 0
  const costSub =
    symbol === 'USDJPY'
      ? 'commission $7/lot RT — applied by analogy'
      : 'commission $7/lot round trip (user account)'
  const atr: Stat =
    econ.median_atr_pips != null
      ? { label: 'median ATR(14)', value: `${econ.median_atr_pips.toFixed(2)} pips`, sub: `${timeframe} bar, full history` }
      : { label: 'median ATR(14)', value: `¥${(econ.median_atr_yen ?? 0).toFixed(3)}`, sub: `${timeframe} bar, full history` }
  return [
    {
      label: 'median cost',
      /* 0.7 pips (EURUSD/GBPUSD) → "0.7"; 1.0168 (USDJPY RT) → "1.02" —
         enough precision to match the cited research numbers */
      value: `${costPips.toFixed(costPips < 1 ? 1 : 2)} pips`,
      sub: costSub,
    },
    atr,
    {
      label: 'cost / ATR',
      value: `${((econ.median_cost_atr ?? 0) * 100).toFixed(1)}%`,
      sub: 'the tax as a share of the move',
    },
    {
      label: 'bars where cost > 25% ATR',
      value: `${fmtPctAdaptive(econ.pct_bars_cost_gt_25pct_atr ?? 0)}%`,
      sub: 'trade dies at entry',
    },
  ]
}
