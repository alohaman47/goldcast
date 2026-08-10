import { useEffect } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Crosshair } from 'lucide-react'
import type { LatestData } from '@/hooks/useData'
import type { SymbolConfig } from '@/engine/symbols'
import { priceUnit, rangeDigits, entryForSymbol } from '@/hooks/useSymbol'
import HonestyBadge from '@/components/HonestyBadge'
import ConfidencePips from '@/components/ConfidencePips'
import LiveBadge, { type LiveBadgeProps } from '@/components/live/LiveBadge'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

function CountUp({
  to,
  format,
  delay = 0,
  duration = 0.8,
  className,
}: {
  to: number
  format: (v: number) => string
  delay?: number
  duration?: number
  className?: string
}) {
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => format(v))
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      mv.set(to)
      return
    }
    const controls = animate(mv, to, { duration, delay, ease: EASE })
    return () => controls.stop()
  }, [mv, to, delay, duration])
  return <motion.span className={className}>{text}</motion.span>
}

/** C. Forecast Strip — 3 stat blocks under the chart (dashboard.md §C). */
export default function ForecastStrip({
  latest,
  live,
  config,
}: {
  latest: LatestData
  live?: LiveBadgeProps
  config: SymbolConfig
}) {
  const pVol = latest.p_high_vol * 100
  const conf = Math.max(0, Math.min(5, Math.round(latest.confidence)))
  const isLive = live != null && (live.status === 'live' || live.status === 'gap' || live.status === 'stale')
  const v = config.validation
  const barsText = v.bars.toLocaleString('en-US')
  const accText = v.hvolAccuracyPct.toFixed(2)
  const aucText = v.hvolAuc.toFixed(v.hvolAucDecimals)
  const unit = priceUnit(config)
  /* Range readouts honor per-market decimals: gold keeps the legacy 1dp
     (byte-identical), NAS100 1dp, indices 1dp, FX 5/3dp — a 0.0005 EURUSD
     cone must never collapse to "± 0.0". */
  const rd = rangeDigits(config, 1)
  /* Engine range-model honesty note (spec §6): USDJPY's classic-GBM range
     R² is WEAK (negative −0.185 pre-Phase-19, barely positive +0.010 after
     the 2026-08-10 R1b refresh) — SHIP'ed per the research verdict,
     disclosed wherever range metrics are shown. Null for every other
     market (no UI change). */
  const rangeNote = entryForSymbol(config.symbol).engineRangeNote

  return (
    <section className="panel" aria-label="Forecast summary">
      {live && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
          <LiveBadge {...live} />
          <span className="micro-mono">
            {isLive ? 'LIVE ENGINE: browser GBM (parity ✓)' : 'STATIC ENGINE EXPORT — /data/latest.json'}
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {/* Volatility */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3, ease: EASE }}
        className="p-4"
      >
        <div className="flex items-center gap-2">
          <span className="label-caps">Volatility (Next Candle)</span>
          <HonestyBadge
            kind="verified-oos"
            tooltip={`Walk-forward OOS, ${barsText} bars, verified twice. ${accText}% accuracy, AUC ${aucText}.`}
          />
        </div>
        <div className="mt-2 font-mono text-[32px] font-bold leading-9 tnum text-gold stat-glow md:text-[38px]">
          <CountUp to={pVol} format={(v) => `P(HIGH-VOL) = ${v.toFixed(1)}%`} delay={0.4} />
        </div>
        <p className="micro-mono mt-1">{accText}% OOS accuracy · AUC {aucText}</p>
      </motion.div>

      {/* Expected range */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4, ease: EASE }}
        className="p-4"
      >
        <div className="flex items-center gap-2">
          <span className="label-caps">Expected Range (T+1)</span>
          <Crosshair size={14} className="text-gold" />
        </div>
        <div className="mt-2 font-mono text-[32px] font-bold leading-9 tnum text-gold stat-glow md:text-[38px]">
          <CountUp to={latest.expected_range_price} format={(v) => `± ${v.toFixed(rd)}`} delay={0.5} />{' '}
          <span className="text-[16px] font-semibold text-golddim">{unit}</span>
        </div>
        <p className="micro-mono mt-1">
          {latest.expected_range_atr.toFixed(2)} × ATR14 · cone T+3 ±{latest.cone.T3.half_width.toFixed(rd)}
        </p>
        {rangeNote != null && <p className="micro-mono mt-1 text-honest">{rangeNote}</p>}
      </motion.div>

      {/* Confidence */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5, ease: EASE }}
        className="p-4"
      >
        <span className="label-caps">Confidence</span>
        <div className="mt-3 flex items-center gap-3">
          <ConfidencePips confidence={conf} />
          <span className="font-mono text-[28px] font-semibold tnum text-text0">{conf}/5</span>
        </div>
        <p className="micro-mono mt-2">engine self-rated · session + persistence aligned</p>
      </motion.div>
      </div>
    </section>
  )
}
