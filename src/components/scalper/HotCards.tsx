import { motion, useReducedMotion } from 'framer-motion'
import { Flame, Snowflake } from 'lucide-react'
import type { ScalperClockData, ScalperHighlightSlot } from '@/hooks/useData'
import { useTimezone, tzSuffix, utcLabelToTz } from '@/hooks/useTimezone'
import { cn } from '@/lib/utils'
import { TERMINAL_EASE, fmtAtr, fmtInt, fmtPct, fmtSlotRange } from './utils'

type Highlights = ScalperClockData['highlights']

/** Top-5 hottest slot stat cards + the quietest-slot honesty card. */
export default function HotCards({ highlights, symbol }: { highlights: Highlights; symbol: string }) {
  const reducedMotion = useReducedMotion()
  const { tz } = useTimezone()

  return (
    <section aria-label="Hottest and quietest slots">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="panel-title">Where the Range Lives</h2>
        <span className="micro-mono hidden sm:inline">
          NY vs Asia: {highlights.ny_vs_asia_vol_ratio.toFixed(2)}× avg range
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {highlights.top5_hottest_slots.map((s, i) => (
          <SlotCard key={s.slot} slot={s} rank={i + 1} top={i === 0} delay={reducedMotion ? 0 : i * 0.08} symbol={symbol} />
        ))}
      </div>

      {/* Quietest slot — the other end of the clock, with the honest filter note */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: reducedMotion ? 0 : 0.45, ease: TERMINAL_EASE, delay: reducedMotion ? 0 : 0.3 }}
        className="panel mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-l-2 border-l-info/70 p-4"
      >
        <span className="flex items-center gap-2">
          <Snowflake size={15} className="text-info" />
          <span className="label-caps">Quietest slot</span>
        </span>
        <span className="font-mono text-[16px] font-semibold tnum text-text0">
          {utcLabelToTz(highlights.quietest_slot.label, tz)} {tzSuffix(tz)}
        </span>
        <span className="font-mono text-[13px] tnum text-text1">{fmtAtr(highlights.quietest_slot.avg_range_atr)}ATR</span>
        <span className="font-mono text-[13px] tnum text-text1">
          range {fmtSlotRange(highlights.quietest_slot.avg_range_usd, symbol)}
        </span>
        <span className="font-mono text-[13px] tnum text-text1">
          P(high-vol) {fmtPct(highlights.quietest_slot.p_high_vol_empirical)}
        </span>
        <span className="font-mono text-[13px] tnum text-text2">n={fmtInt(highlights.quietest_slot.bar_count)}</span>
        <span className="micro-mono w-full sm:ml-auto sm:w-auto">{highlights.quietest_slot_note}</span>
      </motion.div>
    </section>
  )
}

function SlotCard({
  slot,
  rank,
  top,
  delay,
  symbol,
}: {
  slot: ScalperHighlightSlot
  rank: number
  top: boolean
  delay: number
  symbol: string
}) {
  const reducedMotion = useReducedMotion()
  const { tz } = useTimezone()
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: reducedMotion ? 0 : 0.45, ease: TERMINAL_EASE, delay }}
      className={cn('panel p-4', top && 'panel-gold border-gold/60')}
    >
      <div className="flex items-center justify-between">
        <span className={cn('micro-mono', top ? 'text-gold' : undefined)}>#{rank}</span>
        {top && <Flame size={14} className="text-gold" />}
      </div>
      <p className={cn('mt-2 font-mono text-[20px] font-bold leading-6 tnum', top ? 'stat-glow text-gold' : 'text-text0')}>
        {utcLabelToTz(slot.label, tz)}
        <span className="ml-1 text-[12px] font-medium text-text2">{tzSuffix(tz)}</span>
      </p>
      <p className="mt-1 font-mono text-[13px] tnum text-warn">{fmtAtr(slot.avg_range_atr)}ATR</p>
      <dl className="mt-3 space-y-1 font-mono text-[11px] leading-[16px] tnum">
        <div className="flex justify-between">
          <dt className="text-text2">range</dt>
          <dd className="text-text1">{fmtSlotRange(slot.avg_range_usd, symbol)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text2">P(high-vol)</dt>
          <dd className="text-text1">{fmtPct(slot.p_high_vol_empirical)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text2">bars</dt>
          <dd className="text-text1">{fmtInt(slot.bar_count)}</dd>
        </div>
      </dl>
    </motion.div>
  )
}
