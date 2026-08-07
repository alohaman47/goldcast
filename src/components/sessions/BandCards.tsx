import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { SessionsData } from '@/hooks/useData'
import { GOLD_CONFIG, type SymbolConfig } from '@/engine/symbols'
import {
  BAND_META,
  BAND_ORDER,
  TERMINAL_EASE,
  computeBandStats,
  fmtPct,
  fmtUsd,
  pad2,
  rangeDigits,
  rangeUnit,
} from './utils'
import type { BandStats } from './utils'

export default function BandCards({ data, config = GOLD_CONFIG }: { data: SessionsData; config?: SymbolConfig }) {
  const reducedMotion = useReducedMotion()
  const stats = useMemo(
    () => BAND_ORDER.map((id) => computeBandStats(data, id)).filter((s): s is BandStats => !!s),
    [data],
  )

  return (
    <section aria-label="Session bands">
      <h2 className="panel-title mb-4">Session Bands — When the Market Breathes</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {stats.map((s, i) => (
          <BandCard key={s.id} stats={s} data={data} index={i} instant={!!reducedMotion} config={config} />
        ))}
      </div>
    </section>
  )
}

function BandCard({
  stats,
  data,
  index,
  instant,
  config,
}: {
  stats: BandStats
  data: SessionsData
  index: number
  instant: boolean
  config: SymbolConfig
}) {
  const meta = BAND_META[stats.id]
  const unit = rangeUnit(config)
  const digits = rangeDigits(config, 1)
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ delay: instant ? 0 : index * 0.1, duration: instant ? 0 : 0.5, ease: TERMINAL_EASE }}
      className="panel overflow-hidden"
    >
      {/* colored top hairline */}
      <div className="h-[2px] w-full" style={{ background: meta.tone }} />
      <div className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-[15px] font-semibold uppercase tracking-[0.08em] text-text0">
            {meta.name}
          </h3>
          <span className="font-mono text-[11px] text-text2">{stats.hoursLabel}</span>
        </div>

        <MiniSparkline data={data} highlightRuns={stats.runs} color={meta.tone} instant={instant} />

        <dl className="mt-3 space-y-1 font-mono text-[12px] leading-5">
          <div className="flex justify-between">
            <dt className="text-text2">avg range</dt>
            <dd className="text-text0">
              {fmtUsd(stats.rangeMin, digits)}–{fmtUsd(stats.rangeMax, digits)} {unit}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text2">P(high-vol)</dt>
            <dd className="text-text0">
              {fmtPct(stats.pMin)}–{fmtPct(stats.pMax)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text2">peak</dt>
            <dd className="text-gold">
              {fmtPct(stats.peakP)} @ {pad2(stats.peakHour)}:00 UTC
            </dd>
          </div>
        </dl>

        <p className="mt-3 border-t border-line pt-3 font-body text-[14px] italic leading-6 text-text1">
          <span
            className="mr-1.5 font-mono not-italic"
            style={{ color: meta.glyphTone === 'risk' ? '#F5A623' : '#8A93A3' }}
          >
            {meta.glyph}
          </span>
          {meta.verdict}
        </p>
      </div>
    </motion.article>
  )
}

/** 24h avg-range sparkline; the band's own hours are redrawn in the band color. */
function MiniSparkline({
  data,
  highlightRuns,
  color,
  instant,
}: {
  data: SessionsData
  highlightRuns: number[][]
  color: string
  instant: boolean
}) {
  const W = 220
  const H = 44
  const PAD = 2

  const { basePoints, maxV, minV } = useMemo(() => {
    const vals = data.hours.map((h) => h.avg_range_price)
    const valid = vals.filter((v): v is number => v != null)
    const min = Math.min(...valid)
    const max = Math.max(...valid)
    const pts = (hours: number[]) =>
      hours
        .filter((h) => data.hours[h]?.avg_range_price != null)
        .map((h) => {
          const v = data.hours[h].avg_range_price!
          const x = PAD + (h / 23) * (W - 2 * PAD)
          const y = H - PAD - ((v - min) / (max - min || 1)) * (H - 2 * PAD)
          return `${x.toFixed(1)},${y.toFixed(1)}`
        })
        .join(' ')
    return { basePoints: pts(data.hours.map((h) => h.hour_utc)), maxV: max, minV: min }
  }, [data])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-11 w-full" role="img" aria-label="24h average range sparkline">
      <polyline points={basePoints} fill="none" stroke="#454F5B" strokeWidth={1.2} strokeLinejoin="round" />
      {highlightRuns.map((run) => {
        const hours = run.length === 1 ? [run[0] - 1, ...run, run[0] + 1].filter((h) => h >= 0 && h <= 23) : run
        const pts = hours
          .filter((h) => data.hours[h]?.avg_range_price != null)
          .map((h) => {
            const v = data.hours[h].avg_range_price!
            const x = PAD + (h / 23) * (W - 2 * PAD)
            const y = H - PAD - ((v - minV) / (maxV - minV || 1)) * (H - 2 * PAD)
            return `${x.toFixed(1)},${y.toFixed(1)}`
          })
          .join(' ')
        return (
          <motion.polyline
            key={run[0]}
            points={pts}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: instant ? 0 : 0.6, ease: TERMINAL_EASE }}
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        )
      })}
    </svg>
  )
}
