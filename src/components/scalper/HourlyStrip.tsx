import { useMemo, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { useRef } from 'react'
import type { ScalperClockData, ScalperHour } from '@/hooks/useData'
import { useTimezone, tzSuffix, utcHhMmToTz, utcHourInTz } from '@/hooks/useTimezone'
import { cn } from '@/lib/utils'
import { TERMINAL_EASE, fmtAtr, fmtInt, fmtPct, fmtUsd } from './utils'
import { thermalColor } from '@/components/sessions/utils'

const STRIP_H = 120 // px, bar track height

interface HourlyStripProps {
  hourly: ScalperClockData['hourly']
  now: Date
  /** meta.timeframe of the active export — keeps the M15/M5 copy honest. */
  timeframe: string
}

/** Secondary overview: 24 hourly bars, height + thermal fill by avg_range_atr. */
export default function HourlyStrip({ hourly, now, timeframe }: HourlyStripProps) {
  const [hover, setHover] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inView = useInView(containerRef, { once: true, amount: 0.3 })
  const reducedMotion = useReducedMotion()
  /* Phase 14: NOW-marker identity stays the UTC hour; labels convert. */
  const { tz } = useTimezone()

  const utcHour = now.getUTCHours()

  const extent = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const h of hourly.hours) {
      if (h.avg_range_atr == null) continue
      if (h.avg_range_atr < min) min = h.avg_range_atr
      if (h.avg_range_atr > max) max = h.avg_range_atr
    }
    return min > max ? ([0, 1] as [number, number]) : ([min, max] as [number, number])
  }, [hourly.hours])

  const hoverRow: ScalperHour | undefined = hover != null ? hourly.hours.find((h) => h.hour_utc === hover) : undefined

  return (
    <section aria-label="Hourly volatility overview">
      <div className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="panel-title">Hourly Overview — 23 trading hours</h2>
          <span className="micro-mono max-w-[520px]">{hourly.note}</span>
        </div>

        <div ref={containerRef} className="relative mt-4">
          <div className="flex items-end gap-[3px]" style={{ height: STRIP_H }} role="img"
            aria-label={`Bar chart of average ${timeframe} range in ATR by ${tzSuffix(tz)} hour. Hour ${utcHourInTz(0, tz, now)} is hollow: session break.`}>
            {hourly.hours.map((h) => {
              const isNull = h.avg_range_atr == null || h.bar_count === 0
              const t = isNull ? 0 : extent[1] > extent[0] ? (h.avg_range_atr! - extent[0]) / (extent[1] - extent[0]) : 0.5
              const heightPct = isNull ? 0 : 12 + t * 88
              const isNow = h.hour_utc === utcHour
              return (
                <div
                  key={h.hour_utc}
                  className="relative flex h-full flex-1 cursor-crosshair flex-col justify-end"
                  onMouseEnter={() => setHover(h.hour_utc)}
                  onMouseLeave={() => setHover(null)}
                >
                  {isNull ? (
                    <div
                      className="w-full rounded-t-[3px] border border-dashed border-text3/80"
                      style={{ height: '18%' }}
                      title={`${utcHourInTz(0, tz, now)}:xx ${tzSuffix(tz)} — session break, no bars`}
                    />
                  ) : (
                    <motion.div
                      className={cn('w-full rounded-t-[3px]', isNow && 'outline outline-1 outline-offset-1 outline-goldhi')}
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: thermalColor(t),
                        transformOrigin: 'bottom',
                      }}
                      initial={{ scaleY: 0 }}
                      animate={inView ? { scaleY: 1 } : { scaleY: 0 }}
                      transition={{
                        delay: reducedMotion ? 0 : h.hour_utc * 0.03,
                        duration: reducedMotion ? 0 : 0.4,
                        ease: TERMINAL_EASE,
                      }}
                    />
                  )}
                  {isNow && (
                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 font-mono text-[9px] tracking-[0.08em] text-goldhi">
                      NOW
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* hour axis */}
          <div className="mt-1.5 flex gap-[3px]">
            {hourly.hours.map((h) => (
              <span key={h.hour_utc} className="micro-mono flex-1 text-center">
                {h.hour_utc % 2 === 0 ? utcHourInTz(h.hour_utc, tz, now) : ''}
              </span>
            ))}
          </div>

          {/* mono readout line */}
          <div className="mt-3 border-t border-line pt-3 font-mono text-[12px] leading-5 tnum">
            {hoverRow ? (
              hoverRow.avg_range_atr == null || hoverRow.bar_count === 0 ? (
                <span className="text-honest">
                  {utcHourInTz(0, tz, now)}:xx {tzSuffix(tz)} — session break, no bars
                </span>
              ) : (
                <span className="text-text1">
                  <span className="text-gold">
                    {utcHhMmToTz(hoverRow.hour_utc, 0, tz, now)} {tzSuffix(tz)}
                  </span>
                  <span className="text-text2"> · </span>
                  {fmtAtr(hoverRow.avg_range_atr)}ATR
                  <span className="text-text2"> · range $</span>
                  {fmtUsd(hoverRow.avg_range_price)}
                  <span className="text-text2"> · P(high-vol) </span>
                  {fmtPct(hoverRow.p_high_vol_empirical)}
                  <span className="text-text2"> · n=</span>
                  {fmtInt(hoverRow.bar_count)} <span className="text-text2">bars</span>
                </span>
              )
            ) : (
              <span className="text-text2">hover an hour — bar height &amp; color = avg {timeframe} range in ATR</span>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
