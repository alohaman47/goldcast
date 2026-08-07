import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Database, Clock3 } from 'lucide-react'
import { useScalperClock, scalperClockFile } from '@/hooks/useData'
import type { ScalperClockData } from '@/hooks/useData'
import { useSymbol } from '@/hooks/useSymbol'
import SlotGrid from '@/components/scalper/SlotGrid'
import HotCards from '@/components/scalper/HotCards'
import EconPanel from '@/components/scalper/EconPanel'
import GuidancePanel from '@/components/scalper/GuidancePanel'
import HourlyStrip from '@/components/scalper/HourlyStrip'
import {
  TERMINAL_EASE,
  SCALPER_VERDICT_CHIP,
  SCALPER_VERDICT_CHIP_FALLBACK,
  fmtAtr,
  fmtUsd,
  fmtPct,
  fmtInt,
} from '@/components/scalper/utils'

const HEADLINE = "Scalper's Clock"

/**
 * M15 slot seasonality for the ACTIVE symbol (XAUUSD gold + NAS100) — 96
 * fifteen-minute slots of the UTC day, empirical over the full export. Every
 * value on the page renders from the fetched JSON; static research export:
 * no model, no forecast.
 */
export default function ScalperClock() {
  const { data, loading, error } = useScalperClock()
  const { symbol } = useSymbol()

  // Live UTC clock (1s tick) — drives the hero chip and the NOW slot marker.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="mx-auto w-full max-w-[1180px] px-6 pb-24 pt-14">
      <Hero data={data} now={now} loading={loading} />

      {error && (
        <div className="panel mt-10 border-l-2 border-l-down p-5 font-mono text-[13px] text-down">
          Failed to load {scalperClockFile(symbol)} — {error}
        </div>
      )}

      {loading && !data && <PageSkeleton />}

      {data && (
        <div className="mt-14 flex flex-col gap-14">
          <SlotGrid slots={data.slots} hottestSlotIdx={data.highlights.hottest_slot.slot} now={now} />
          <HotCards highlights={data.highlights} />
          <EconPanel econ={data.econ} symbol={data.meta.symbol} />
          <GuidancePanel guidance={data.guidance} />
          <HourlyStrip hourly={data.hourly} now={now} />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero({ data, now, loading }: { data: ScalperClockData | null; now: Date; loading: boolean }) {
  const reducedMotion = useReducedMotion()

  const clock = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`
  const nowSlotIdx = now.getUTCHours() * 4 + Math.floor(now.getUTCMinutes() / 15)
  const nowSlot = data?.slots[nowSlotIdx]

  return (
    <header className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_340px]">
      <div>
        <p className="label-caps text-gold">
          {data ? `${data.meta.symbol} · ${data.meta.timeframe} · ${fmtInt(data.meta.bar_count)} bars` : 'M15 slot map'}
          <span className="ml-2 text-text2">· static research export</span>
        </p>
        <h1 className="mt-3 font-display text-[34px] font-bold leading-[42px] tracking-[-0.015em] text-text0 sm:text-[40px] sm:leading-[46px]">
          {HEADLINE.split(' ').map((word, i) => (
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
                {i < HEADLINE.split(' ').length - 1 ? ' ' : ''}
              </motion.span>
            </span>
          ))}
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reducedMotion ? 0 : 0.3, duration: reducedMotion ? 0 : 0.5, ease: TERMINAL_EASE }}
          className="mt-4 max-w-[640px] font-body text-[15px] leading-6 text-text1"
        >
          Every 15-minute slot of the {data ? `${data.meta.symbol} ` : ''}day, measured — not modeled. The clock tells
          you when the market moves and how far. It has never once told you which way.
        </motion.p>

        {/* Honest badge row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reducedMotion ? 0 : 0.45, duration: reducedMotion ? 0 : 0.4 }}
          className="mt-5 flex flex-wrap items-center gap-2"
        >
          <span className="inline-flex items-center gap-1.5 rounded border border-up/50 bg-up/10 px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.04em] text-up">
            <Database size={10} />
            REAL DATA — no model
          </span>
          <span className="inline-flex items-center gap-1.5 rounded border border-linestrong bg-bg1 px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.04em] text-text2">
            <Clock3 size={10} />
            {/* meta.note verbatim: "data ends YYYY-MM-DD — static research export, no model, no live feed" */}
            {data ? data.meta.note : 'static export'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded border border-warn/50 bg-warn/10 px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.04em] text-warn">
            <AlertTriangle size={10} />
            {data ? SCALPER_VERDICT_CHIP[data.meta.symbol] ?? SCALPER_VERDICT_CHIP_FALLBACK : SCALPER_VERDICT_CHIP_FALLBACK}
          </span>
        </motion.div>
      </div>

      {/* Current-slot card */}
      <motion.aside
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.5, ease: TERMINAL_EASE, delay: reducedMotion ? 0 : 0.15 }}
        className="panel panel-gold p-5"
        aria-label="Current slot"
      >
        <div className="flex items-center justify-between">
          <span className="label-caps">Now</span>
          <span className="inline-flex items-center gap-2 font-mono text-[13px] tnum text-text0">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-up" />
            {clock} UTC
          </span>
        </div>
        {loading || !data ? (
          <div className="mt-4 space-y-3">
            <div className="h-7 w-3/4 animate-pulse rounded bg-bg3" />
            <div className="h-9 w-1/2 animate-pulse rounded bg-bg3" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-bg3" />
          </div>
        ) : (
          <>
            <p className="mt-3 font-mono text-[20px] font-bold leading-7 tracking-[0.02em] text-text0">
              slot {nowSlot?.label ?? '—'} UTC
            </p>
            {nowSlot && (nowSlot.avg_range_atr == null || nowSlot.bar_count === 0) ? (
              <p className="mt-4 font-mono text-[12px] leading-5 text-honest">
                session break — no bars in this slot. The clock resumes at 01:00 UTC.
              </p>
            ) : (
              <>
                <p className="mt-4">
                  <span className="label-caps block">avg range this slot</span>
                  <span className="stat-glow font-mono text-[28px] font-semibold leading-8 tnum text-gold">
                    {fmtAtr(nowSlot?.avg_range_atr ?? null)}ATR
                  </span>
                </p>
                <p className="mt-3 font-mono text-[12px] leading-5 text-text1">
                  ≈ ${fmtUsd(nowSlot?.avg_range_usd ?? null)} per M15 bar
                  <span className="text-text2"> · P(high-vol) </span>
                  {fmtPct(nowSlot?.p_high_vol_empirical ?? null)}
                  <span className="text-text2"> · n=</span>
                  {fmtInt(nowSlot?.bar_count ?? 0)}
                </p>
              </>
            )}
            <p className="micro-mono mt-4">{data.meta.date_range} · {data.meta.atr}</p>
          </>
        )}
      </motion.aside>
    </header>
  )
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function PageSkeleton() {
  return (
    <div className="mt-14 flex flex-col gap-14" aria-busy="true" aria-label="Loading scalper clock data">
      <div className="panel h-[320px] animate-pulse bg-bg1" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="panel h-[180px] animate-pulse bg-bg1" />
        ))}
      </div>
      <div className="panel h-[420px] animate-pulse bg-bg1" />
    </div>
  )
}
