import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router'
import type { LatestData, SessionsData } from '@/hooks/useData'
import { useTimezone, formatRunsInTz, tzSuffix, utcHhMmToTz } from '@/hooks/useTimezone'
import { bandHours, contiguousRuns } from '@/components/sessions/utils'
import type { BandId } from '@/components/sessions/utils'
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

/** D. Session Strip — 24h mini heatmap (dashboard.md §D). */
export default function SessionStrip({ sessions, latest }: { sessions: SessionsData; latest: LatestData }) {
  const [hovered, setHovered] = useState<number | null>(null)
  /* current UTC hour, kept live so the "now" cell follows the clock */
  const [nowUtcHour, setNowUtcHour] = useState(() => new Date().getUTCHours())
  useEffect(() => {
    const iv = window.setInterval(() => setNowUtcHour(new Date().getUTCHours()), 30_000)
    return () => window.clearInterval(iv)
  }, [])
  /* Phase 14: now-cell identity stays the UTC hour; labels convert. */
  const { tz } = useTimezone()

  const ranges = sessions.hours.map((h) => h.avg_range_price)
  const valid = ranges.filter((v): v is number => v != null)
  const max = valid.length ? Math.max(...valid) : 1
  const min = valid.length ? Math.min(...valid) : 0

  const curSession = SESSION_NAMES[latest.session] ?? latest.session
  const curHourData = sessions.hours[nowUtcHour]
  const nyHours = sessions.hours.filter((h) => h.hour_utc >= 12 && h.hour_utc <= 17 && h.avg_range_price != null)
  const nyMin = nyHours.length ? Math.min(...nyHours.map((h) => h.avg_range_price!)) : null
  const nyMax = nyHours.length ? Math.max(...nyHours.map((h) => h.avg_range_price!)) : null

  return (
    <section className="panel p-4" aria-label="Session volatility — today's position">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-title">Session Volatility — Today&apos;s Position</h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] tnum text-text1">
            Now: <span className="text-gold">{curSession}</span>
            {nyMin != null && nyMax != null && latest.session === 'ny' && (
              <span className="text-text2"> — hottest window (avg range {nyMin.toFixed(1)}–{nyMax.toFixed(1)} USD)</span>
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
          <div className="pointer-events-none absolute -top-9 left-0 z-10 rounded border border-linestrong bg-bg3 px-2 py-1 font-mono text-[10px] tnum text-text0"
            style={{ left: `${(hovered / 24) * 100}%` }}
          >
            {utcHhMmToTz(hovered, 0, tz)} {tzSuffix(tz)}
            {sessions.hours[hovered].avg_range_price != null ? (
              <>
                {' '}· avg range {sessions.hours[hovered].avg_range_price!.toFixed(2)} USD · P(high-vol){' '}
                {sessions.hours[hovered].p_high_vol_empirical != null
                  ? `${(sessions.hours[hovered].p_high_vol_empirical! * 100).toFixed(1)}%`
                  : '—'}
              </>
            ) : (
              <span className="text-text2"> · no data (hour 0)</span>
            )}
          </div>
        )}

        {/* band labels — UTC strings are the research-native defaults; NY mode
            converts the ranges from the sessions data bands */}
        <div className="mt-2 flex items-center gap-3 font-mono text-[10px] tracking-[0.04em] text-text2">
          {(
            [
              ['asia', 'ASIA 00–07', 'ASIA', ''],
              ['london', 'LONDON 07–11', 'LONDON', 'text-info underline decoration-info/50 underline-offset-2'],
              ['ny', 'NY/OVERLAP 12–17', 'NY/OVERLAP', 'text-gold underline decoration-gold/50 underline-offset-2'],
            ] as [BandId, string, string, string][]
          ).map(([id, utcText, name, cls]) => (
            <span key={id} className={cls || undefined}>
              {tz === 'NY' ? `${name} ${formatRunsInTz(contiguousRuns(bandHours(sessions, id)), tz)}` : utcText}
            </span>
          ))}
          <span>OFF</span>
          {curHourData?.avg_range_price != null && (
            <span className="ml-auto hidden tnum sm:inline">
              {utcHhMmToTz(nowUtcHour, 0, tz)} {tzSuffix(tz)} avg range {curHourData.avg_range_price.toFixed(2)} USD
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
