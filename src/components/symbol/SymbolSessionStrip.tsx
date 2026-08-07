import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router'
import type { LatestData, SessionsData } from '@/hooks/useData'
import type { SymbolConfig } from '@/engine/symbols'
import { priceUnit, rangeDigits } from '@/hooks/useSymbol'
import { contiguousRuns, formatRuns } from '@/components/sessions/utils'
import { cn } from '@/lib/utils'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

const SESSION_NAMES: Record<string, string> = {
  asia: 'Asia',
  london: 'London',
  ny: 'NY',
  off: 'Off',
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

const QUIET: [number, number, number] = [26, 23, 18] // #1a1712
const HOT: [number, number, number] = [245, 166, 35] // #F5A623

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * Symbol-aware Session Strip (dashboard.md §D variant for non-gold symbols).
 * Same 24h mini-heatmap as the gold SessionStrip, but band hour labels come
 * from the active SymbolConfig.sessionBands (NAS100 London runs 07–12) and
 * range readouts use the symbol's unit + price decimals (NAS100: pts, 1dp).
 * Gold keeps the original dashboard/SessionStrip untouched.
 */
export default function SymbolSessionStrip({
  sessions,
  latest,
  config,
}: {
  sessions: SessionsData
  latest: LatestData
  config: SymbolConfig
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  /* current UTC hour, kept live so the "now" cell follows the clock */
  const [nowUtcHour, setNowUtcHour] = useState(() => new Date().getUTCHours())
  useEffect(() => {
    const iv = window.setInterval(() => setNowUtcHour(new Date().getUTCHours()), 30_000)
    return () => window.clearInterval(iv)
  }, [])

  const unit = priceUnit(config)
  const digits = rangeDigits(config, 2)

  const ranges = sessions.hours.map((h) => h.avg_range_price)
  const valid = ranges.filter((v): v is number => v != null)
  const max = valid.length ? Math.max(...valid) : 1
  const min = valid.length ? Math.min(...valid) : 0

  const curSession = SESSION_NAMES[latest.session] ?? latest.session
  const curHourData = sessions.hours[nowUtcHour]
  const nyHours = sessions.hours.filter((h) => h.hour_utc >= 12 && h.hour_utc <= 17 && h.avg_range_price != null)
  const nyMin = nyHours.length ? Math.min(...nyHours.map((h) => h.avg_range_price!)) : null
  const nyMax = nyHours.length ? Math.max(...nyHours.map((h) => h.avg_range_price!)) : null

  /* band hour labels from the active symbol's session bands */
  const bandLabel = (id: 'asia' | 'london' | 'ny', name: string) => {
    const runs = contiguousRuns(config.sessionBands[id].hours)
    return `${name} ${formatRuns(runs)}`
  }

  return (
    <section className="panel p-4" aria-label="Session volatility — today's position">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-title">Session Volatility — Today&apos;s Position</h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] tnum text-text1">
            Now: <span className="text-gold">{curSession}</span>
            {nyMin != null && nyMax != null && latest.session === 'ny' && (
              <span className="text-text2">
                {' '}
                — hottest window (avg range {nyMin.toFixed(digits)}–{nyMax.toFixed(digits)} {unit})
              </span>
            )}
          </span>
          <Link to="/sessions" className="text-[12px] font-medium text-info transition-colors hover:text-gold">
            Full radar →
          </Link>
        </div>
      </div>

      <div className="relative mt-3">
        <div className="flex items-end gap-[3px]" style={{ height: 56 }}>
          {sessions.hours.map((h) => {
            const has = h.avg_range_price != null && max > min
            const t = has ? (h.avg_range_price! - min) / (max - min) : 0
            const heightPct = has ? 18 + t * 82 : 12
            const isNow = h.hour_utc === nowUtcHour
            return (
              <motion.div
                key={h.hour_utc}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: h.hour_utc * 0.04, ease: EASE }}
                className="relative flex-1"
                style={{ height: `${heightPct}%` }}
                onMouseEnter={() => setHovered(h.hour_utc)}
                onMouseLeave={() => setHovered(null)}
              >
                {isNow && (
                  <span className="absolute -top-2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-gold animate-pulse-dot" />
                )}
                <div
                  className={cn(
                    'h-full w-full rounded-[3px] transition-transform duration-150 hover:scale-y-110',
                    isNow && 'outline outline-1 outline-gold',
                  )}
                  style={{ background: has ? lerpColor(QUIET, HOT, t) : '#171E27' }}
                />
              </motion.div>
            )
          })}
        </div>

        {/* hover tooltip */}
        {hovered != null && (
          <div
            className="pointer-events-none absolute -top-9 left-0 z-10 rounded border border-linestrong bg-bg3 px-2 py-1 font-mono text-[10px] tnum text-text0"
            style={{ left: `${(hovered / 24) * 100}%` }}
          >
            {pad2(hovered)}:00 UTC
            {sessions.hours[hovered].avg_range_price != null ? (
              <>
                {' '}
                · avg range {sessions.hours[hovered].avg_range_price!.toFixed(digits)} {unit} · P(high-vol){' '}
                {sessions.hours[hovered].p_high_vol_empirical != null
                  ? `${(sessions.hours[hovered].p_high_vol_empirical! * 100).toFixed(1)}%`
                  : '—'}
              </>
            ) : (
              <span className="text-text2"> · no data (hour 0)</span>
            )}
          </div>
        )}

        {/* band labels (active symbol's session bands) */}
        <div className="mt-2 flex items-center gap-3 font-mono text-[10px] tracking-[0.04em] text-text2">
          <span>{bandLabel('asia', 'ASIA')}</span>
          <span className="text-info underline decoration-info/50 underline-offset-2">{bandLabel('london', 'LONDON')}</span>
          <span className="text-gold underline decoration-gold/50 underline-offset-2">{bandLabel('ny', 'NY/OVERLAP')}</span>
          <span>OFF</span>
          {curHourData?.avg_range_price != null && (
            <span className="ml-auto hidden tnum sm:inline">
              {pad2(nowUtcHour)}:00 UTC avg range {curHourData.avg_range_price.toFixed(digits)} {unit}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
