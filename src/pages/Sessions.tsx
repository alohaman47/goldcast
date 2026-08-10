import { useCallback, useEffect, useRef, useState } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import Lenis from 'lenis'
import HonestyBadge from '@/components/HonestyBadge'
import { useSymbolData } from '@/hooks/useData'
import type { LatestData, SessionsData } from '@/hooks/useData'
import { useSymbol, entryForSymbol, sessionsReusedFromGold } from '@/hooks/useSymbol'
import { useTimezone, fmtWallClock, tzSuffix, utcHhMmToTz, utcHourInTz } from '@/hooks/useTimezone'
import type { DisplayTz } from '@/hooks/useTimezone'
import type { SymbolConfig } from '@/engine/symbols'
import BandCards from '@/components/sessions/BandCards'
import HourlyDetail from '@/components/sessions/HourlyDetail'
import RiskGuidance from '@/components/sessions/RiskGuidance'
import SessionRadar from '@/components/sessions/SessionRadar'
import { TERMINAL_EASE, bandForHour, fmtUsd, sessionDisplayName, rangeDigits, rangeUnit } from '@/components/sessions/utils'

/* Hero headline + verified bar count now come from the SYMBOL_REGISTRY /
 * engine config (Phase 15): entry.headline matches the legacy strings for
 * XAUUSD ("Gold has a schedule…") and NAS100 ("Nasdaq has a schedule…")
 * byte-for-byte; config.validation.bars equals the sum of sessions bar_count
 * for every dataset (27,737 gold · 27,679 NAS100), so the en-US grouping
 * below reproduces the old per-symbol map exactly. */

export default function Sessions() {
  const { config } = useSymbol()
  const { tz } = useTimezone()
  const { sessions: sessionsState, latest: latestState } = useSymbolData()
  const { data: sessions, loading: sessionsLoading, error: sessionsError } = sessionsState
  const { data: latest, loading: latestLoading } = latestState
  const reducedMotion = useReducedMotion()

  // Live UTC clock (1s tick) — drives hero chip, radar needle, current-hour highlights.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Lenis smooth scroll (editorial page), skipped under reduced motion.
  useEffect(() => {
    if (reducedMotion) return
    const lenis = new Lenis({ duration: 1.05, easing: (t) => 1 - Math.pow(1 - t, 3) })
    let raf = 0
    const loop = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [reducedMotion])

  // Radar wedge click → scroll to table row + gold flash.
  const [flashHour, setFlashHour] = useState<number | null>(null)
  const flashTimer = useRef<number | null>(null)
  const handleSelectHour = useCallback((hour: number) => {
    document.getElementById(`hour-row-${hour}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    setFlashHour(hour)
    flashTimer.current = window.setTimeout(() => setFlashHour(null), 1600)
  }, [])
  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
    },
    [],
  )

  const loading = sessionsLoading || latestLoading
  const utcHour = now.getUTCHours()

  return (
    <div className="mx-auto w-full max-w-[1180px] px-6 pb-24 pt-14">
      <Hero sessions={sessions} latest={latest} now={now} loading={loading} config={config} tz={tz} />

      {sessionsError && (
        <div className="panel mt-10 border-l-2 border-l-down p-5 font-mono text-[13px] text-down">
          Failed to load {config.dataFiles.sessions.split('/').pop()} — {sessionsError}
        </div>
      )}

      {loading && !sessions && <PageSkeleton />}

      {sessions && (
        <div className="mt-14 flex flex-col gap-14">
          <SessionRadar data={sessions} now={now} onSelectHour={handleSelectHour} config={config} />
          <HourlyDetail data={sessions} utcHour={utcHour} flashHour={flashHour} config={config} />
          <BandCards data={sessions} config={config} />
          <RiskGuidance data={sessions} config={config} />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero({
  sessions,
  latest,
  now,
  loading,
  config,
  tz,
}: {
  sessions: SessionsData | null
  latest: LatestData | null
  now: Date
  loading: boolean
  config: SymbolConfig
  tz: DisplayTz
}) {
  const reducedMotion = useReducedMotion()
  const utcHour = now.getUTCHours()
  const hourRow = sessions?.hours.find((h) => h.hour_utc === utcHour)
  const band = sessions ? bandForHour(sessions, utcHour) : null
  const headline = entryForSymbol(config.symbol).headline
  const totalBars = config.validation.bars.toLocaleString('en-US')
  /* sessions-sourced unit/digits (reuse-aware: markets on the shared gold
     H1 session profile render gold's values with gold's USD unit) */
  const unit = rangeUnit(config)
  const rangeD = rangeDigits(config, 1)

  /* Wall clock in the display tz; the hour lookup/marker stays UTC-slot-based. */
  const clock = fmtWallClock(now, tz)

  const markerText = (() => {
    if (utcHour === 0) return `daily break — no bars at ${utcHhMmToTz(0, 0, tz, now)} ${tzSuffix(tz)}`
    if (band === 'ny' && utcHour >= 14 && utcHour <= 16) return 'inside the hottest 3-hour window of the day'
    if (band === 'ny') return 'inside the New York / Overlap window'
    if (band === 'london') return 'inside the London session — range is building'
    if (band === 'asia') return 'Asia hours — the quiet stretch'
    if (band === 'off') return 'off-hours — volatility is decaying'
    return '—'
  })()

  return (
    <header className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_340px]">
      <div>
        <p className="label-caps text-gold">
          The One True Edge — {config.symbol}
          {!config.hasLiveFeed && <span className="ml-2 text-text2">· static export, no live feed</span>}
        </p>
        {/* H4 view reuses the H1-derived session profile (sessions_nas100.json) — say so quietly */}
        {config.timeframe === 'H4' && (
          <p className="micro-mono mt-2">session profile computed on H1 bars — H4 view reuses it</p>
        )}
        {/* Phase-15 markets share the XAUUSD H1 session profile (display-only
            — Track B); per-market session stats live on the Scalper's Clock.
            Say so loudly: the range values below are GOLD's, not this
            market's. */}
        {sessionsReusedFromGold(config) && (
          <p className="micro-mono mt-2 text-honest">
            session profile is the shared XAUUSD H1 profile (display-only) — ranges below are gold&apos;s, in USD.
            Per-market session stats: Scalper&apos;s Clock (M15, real export).
          </p>
        )}
        <h1 className="mt-3 font-display text-[34px] font-bold leading-[42px] tracking-[-0.015em] text-text0 sm:text-[40px] sm:leading-[46px]">
          {headline.split(' ').map((word, i) => (
            <span key={i} className="inline-block overflow-hidden pb-1 align-bottom">
              <motion.span
                className="inline-block"
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                  delay: reducedMotion ? 0 : i * 0.06,
                  duration: reducedMotion ? 0 : 0.5,
                  ease: TERMINAL_EASE,
                }}
              >
                {word}
                {i < headline.split(' ').length - 1 ? ' ' : ''}
              </motion.span>
            </span>
          ))}
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reducedMotion ? 0 : 0.35, duration: reducedMotion ? 0 : 0.5, ease: TERMINAL_EASE }}
          className="mt-4 max-w-[640px] font-body text-[15px] leading-6 text-text1"
        >
          Across {totalBars} hourly bars, when you trade matters more than any indicator we tested. London and New York
          hours run hot; Asia runs quiet. This is real, measurable, and verified out-of-sample.
        </motion.p>

        {/* Live UTC clock chip + hour marker */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reducedMotion ? 0 : 0.5, duration: reducedMotion ? 0 : 0.4 }}
          className="mt-5 flex flex-wrap items-center gap-3"
        >
          <span className="inline-flex items-center gap-2 rounded-md border border-linestrong bg-bg1 px-2.5 py-1.5 font-mono text-[13px] tnum text-text0">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-up" />
            {clock} {tzSuffix(tz)}
          </span>
          <span className="font-mono text-[12px] text-text2">
            {utcHourInTz(utcHour, tz, now)}:xx {tzSuffix(tz)} — {markerText}
          </span>
        </motion.div>
      </div>

      {/* Current-session card */}
      <motion.aside
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.5, ease: TERMINAL_EASE, delay: reducedMotion ? 0 : 0.15 }}
        className="panel panel-gold p-5"
        aria-label="Current session verdict"
      >
        <div className="flex items-center justify-between">
          <span className="label-caps">Now</span>
          <HonestyBadge kind="real-edge" tooltip={`Empirical session seasonality over ${totalBars} H1 bars, verified out-of-sample`} />
        </div>
        {loading ? (
          <div className="mt-4 space-y-3">
            <div className="h-7 w-3/4 animate-pulse rounded bg-bg3" />
            <div className="h-9 w-1/2 animate-pulse rounded bg-bg3" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-bg3" />
          </div>
        ) : (
          <>
            <p className="mt-3 font-mono text-[20px] font-bold leading-7 tracking-[0.02em] text-text0">
              {sessionDisplayName(latest?.session)}
            </p>
            <p className="mt-4">
              <span className="label-caps block">P(high-vol) now</span>
              <span className="stat-glow font-mono text-[28px] font-semibold leading-8 tnum text-gold">
                <CountUp target={latest != null ? latest.p_high_vol * 100 : 0} suffix="%" />
              </span>
            </p>
            <p className="mt-3 font-mono text-[12px] leading-5 text-text1">
              avg range this hour:{' '}
              <span className="text-text0">
                {utcHour === 0 || hourRow?.avg_range_price == null
                  ? 'daily break — no bars'
                  : `${fmtUsd(hourRow?.avg_range_price ?? null, rangeD)} ${unit}`}
              </span>
            </p>
          </>
        )}
      </motion.aside>
    </header>
  )
}

/** Counter tick — counts up from 0 over 800ms, then a soft gold glow pulse (design.md §5.3). */
function CountUp({ target, suffix = '' }: { target: number; suffix?: string }) {
  const reducedMotion = useReducedMotion()
  const [value, setValue] = useState(reducedMotion ? target : 0)

  useEffect(() => {
    if (reducedMotion) {
      setValue(target)
      return
    }
    const controls = animate(0, target, {
      duration: 0.8,
      ease: TERMINAL_EASE,
      onUpdate: (v) => setValue(v),
    })
    return () => controls.stop()
  }, [target, reducedMotion])

  return (
    <motion.span
      animate={{ textShadow: ['0 0 0 rgba(232,178,58,0)', '0 0 24px rgba(232,178,58,0.35)', '0 0 24px rgba(232,178,58,0.25)'] }}
      transition={{ duration: 0.9, delay: 0.8, times: [0, 0.4, 1] }}
    >
      {value.toFixed(1)}
      {suffix}
    </motion.span>
  )
}

function PageSkeleton() {
  return (
    <div className="mt-14 flex flex-col gap-14" aria-busy="true" aria-label="Loading session data">
      <div className="panel h-[560px] animate-pulse bg-bg1" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="panel h-[480px] animate-pulse bg-bg1" />
        <div className="panel h-[480px] animate-pulse bg-bg1" />
      </div>
    </div>
  )
}
