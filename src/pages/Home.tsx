import { motion } from 'framer-motion'
import { useSymbolData } from '@/hooks/useData'
import type { Bar, LatestData, SessionsData } from '@/hooks/useData'
import { useSymbol, fmtSymPrice, dataSourceLabel, sessionsReusedFromGold } from '@/hooks/useSymbol'
import type { SymbolConfig } from '@/engine/symbols'
import { useLivePrice } from '@/hooks/useLivePrice'
import { useLivePrediction } from '@/hooks/useLivePrediction'
import type { LivePredictionState } from '@/hooks/useLivePrediction'
import CandlestickChart from '@/components/dashboard/CandlestickChart'
import EvidencePanel from '@/components/dashboard/EvidencePanel'
import ForecastStrip from '@/components/dashboard/ForecastStrip'
import SessionStrip from '@/components/dashboard/SessionStrip'
import OntologyMap from '@/components/dashboard/OntologyMap'
import QuoteList from '@/components/dashboard/QuoteList'
import LiveBadge, { type LiveBadgeProps, type LiveBadgeStatus } from '@/components/live/LiveBadge'
import AlertCenter from '@/components/live/AlertCenter'
import BarCloseCountdown from '@/components/live/BarCloseCountdown'
import GapBanner from '@/components/live/GapBanner'
import StaticBadge from '@/components/symbol/StaticBadge'
import SymbolSessionStrip from '@/components/symbol/SymbolSessionStrip'
import SymbolStatusBar from '@/components/symbol/SymbolStatusBar'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

/**
 * Verified bar count behind the active config's OOS metrics (gold/NAS100-H1:
 * sum of sessions.json bar_count; NAS100-H4: the H4 dataset). Rendered with
 * en-US grouping — identical strings to the old per-symbol map.
 */
function barsVerified(config: SymbolConfig): string {
  return config.validation.bars.toLocaleString('en-US')
}

/** Chart header timeframe label — keeps the legacy "1H" styling for H1. */
function chartTfLabel(config: SymbolConfig): string {
  return config.timeframe === 'H4' ? '4H' : '1H'
}

/**
 * Alert watcher state passed to AlertCenter when the symbol has no live feed:
 * never 'live', so the panel honestly reports "alerts paused — not live".
 */
const NO_FEED_ALERTS_STATE: LivePredictionState = {
  data: null,
  raw: null,
  forming: null,
  gapHours: 0,
  farGap: false,
  status: 'stale',
  error: 'no live feed for this symbol',
  computedAtMs: null,
}

function DashboardSkeleton() {
  return (
    <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[1fr_380px]">
      <div className="panel order-1 flex h-[560px] items-center justify-center xl:row-start-1">
        <span className="font-mono text-[13px] text-text2 animate-pulse">Loading engine export…</span>
      </div>
      <div className="panel order-3 h-[560px] xl:col-start-2 xl:row-start-1" />
      <div className="panel order-2 h-[120px] xl:row-start-2" />
      <div className="panel order-4 h-[110px] xl:row-start-3" />
    </div>
  )
}

export default function Home() {
  const { config } = useSymbol()
  const { latest, bars, sessions } = useSymbolData()

  const loading = latest.loading || bars.loading || sessions.loading
  const error = latest.error || bars.error || sessions.error
  const ready = latest.data && bars.data && sessions.data && bars.data.length > 0
  const statusBar = <SymbolStatusBar latest={null} config={config} barsVerified={barsVerified(config)} />

  if (loading) {
    return (
      <>
        <DashboardSkeleton />
        {statusBar}
      </>
    )
  }

  if (error || !ready) {
    return (
      <>
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="panel max-w-md p-6 text-center">
            <p className="font-display text-[18px] font-semibold text-down">Engine export unavailable</p>
            <p className="mt-2 font-mono text-[12px] text-text2">{error ?? 'No data in /data/.'}</p>
          </div>
        </div>
        {statusBar}
      </>
    )
  }

  return config.hasLiveFeed ? (
    <LiveDashboard latest={latest.data!} bars={bars.data!} sessions={sessions.data!} config={config} />
  ) : (
    <StaticDashboard latest={latest.data!} bars={bars.data!} sessions={sessions.data!} config={config} />
  )
}

/* ------------------------------------------------------------------ */
/* LIVE dashboard — XAUUSD (live price feed + browser GBM engine)      */
/* ------------------------------------------------------------------ */

function LiveDashboard({
  latest,
  bars,
  sessions,
  config,
}: {
  latest: LatestData
  bars: Bar[]
  sessions: SessionsData
  config: SymbolConfig
}) {
  const price = useLivePrice()
  const live = useLivePrediction(bars, price)

  const fmt = (v: number) => fmtSymPrice(v, config)

  const lastStatic = bars[bars.length - 1]
  const prev = bars[bars.length - 2]

  /* live source: browser engine prediction when available, static export otherwise */
  const effLatest = live.data ?? latest
  const liveActive = live.data != null
  const headerBar = live.forming ?? lastStatic
  const headerPrevClose = live.forming ? lastStatic.c : prev.c
  const delta = headerBar.c - headerPrevClose
  const deltaPct = (delta / headerPrevClose) * 100
  const up = delta >= 0

  const badgeStatus: LiveBadgeStatus = !liveActive
    ? live.status === 'error' || price.status === 'error'
      ? 'error'
      : price.status === 'connecting'
        ? 'connecting'
        : 'static'
    : live.status === 'gap'
      ? 'gap'
      : live.status === 'stale'
        ? 'stale'
        : live.status === 'error'
          ? 'error'
          : 'live'
  const badge: LiveBadgeProps = {
    status: badgeStatus,
    price: price.price,
    tickAtMs: price.tickAtMs,
    onRefresh: price.refresh,
  }

  return (
    <>
      {/* GAP banner: static history frozen, prediction still live */}
      {liveActive && live.farGap && <GapBanner gapHours={live.gapHours} lastStaticT={lastStatic.t} />}

      {/* terminal grid: chart + evidence rail / forecast / sessions */}
      <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[1fr_380px]">
        {/* A. Chart panel */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="panel panel-gold relative order-1 overflow-hidden xl:col-start-1 xl:row-start-1"
          aria-label={`${config.symbol} chart`}
        >
          {/* gold texture backdrop at 8% */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{ backgroundImage: 'url(/gold-texture-dark.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
          {/* scanline sweep (once) */}
          <motion.div
            initial={{ top: '0%', opacity: 1 }}
            animate={{ top: '100%', opacity: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
            className="pointer-events-none absolute left-0 h-px w-full bg-gold/60"
          />
          <div className="relative flex h-full flex-col">
            <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-1">
              <h1 className="panel-title flex items-center gap-2">
                {config.symbol} · 1H · {dataSourceLabel(config)}
                <span className="h-2 w-2 rounded-full bg-up animate-pulse-dot" aria-label="live" />
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <LiveBadge {...badge} />
                <AlertCenter live={live} />
                <span className="micro-mono hidden sm:inline">
                  bar close <BarCloseCountdown className="text-gold" />
                </span>
                <p className="font-mono text-[13px] tnum text-text1">
                  O {fmt(headerBar.o)}&nbsp;&nbsp;H {fmt(headerBar.h)}&nbsp;&nbsp;L {fmt(headerBar.l)}&nbsp;&nbsp;C{' '}
                  {fmt(headerBar.c)}{' '}
                  <span className={up ? 'text-up' : 'text-down'}>
                    {up ? '+' : '−'}
                    {fmt(Math.abs(delta))} ({up ? '+' : '−'}
                    {Math.abs(deltaPct).toFixed(2)}%)
                  </span>
                </p>
              </div>
            </div>
            <div className="relative min-h-[420px] flex-1 lg:min-h-[520px]">
              <CandlestickChart
                bars={bars}
                latest={latest}
                config={config}
                live={
                  live.data && live.forming
                    ? {
                        bar: live.forming,
                        session: live.forming.session,
                        latest: live.data,
                        status: live.status === 'boot' ? 'error' : live.status,
                      }
                    : null
                }
              />
            </div>
          </div>
        </motion.section>

        {/* B. Evidence panel (right rail) */}
        <div className="order-3 flex xl:order-none xl:col-start-2 xl:row-span-3 xl:row-start-1">
          <EvidencePanel latest={effLatest} live={badge} config={config} />
        </div>

        {/* C. Forecast strip */}
        <div className="order-2 xl:col-start-1 xl:row-start-2">
          <ForecastStrip latest={effLatest} live={badge} config={config} />
        </div>

        {/* D. Session strip */}
        <div className="order-4 xl:col-start-1 xl:row-start-3">
          <SessionStrip sessions={sessions} latest={effLatest} />
        </div>
      </div>

      {/* E. Ontology + F. Quotes */}
      <div className="grid gap-4 px-4 pb-4 lg:grid-cols-2">
        <OntologyMap />
        <QuoteList bars={bars} latest={effLatest} />
      </div>

      {/* G. Status bar */}
      <SymbolStatusBar latest={effLatest} liveActive={liveActive} config={config} barsVerified={barsVerified(config)} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* STATIC dashboard — NAS100 (no live feed; honest static states)      */
/* ------------------------------------------------------------------ */

function StaticDashboard({
  latest,
  bars,
  sessions,
  config,
}: {
  latest: LatestData
  bars: Bar[]
  sessions: SessionsData
  config: SymbolConfig
}) {
  const fmt = (v: number) => fmtSymPrice(v, config)

  const lastBar = bars[bars.length - 1]
  const prev = bars[bars.length - 2]
  const delta = lastBar.c - prev.c
  const deltaPct = (delta / prev.c) * 100
  const up = delta >= 0

  return (
    <>
      {/* terminal grid: chart + evidence rail / forecast / sessions */}
      <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[1fr_380px]">
        {/* A. Chart panel */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="panel panel-gold relative order-1 overflow-hidden xl:col-start-1 xl:row-start-1"
          aria-label={`${config.symbol} chart`}
        >
          {/* gold texture backdrop at 8% */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{ backgroundImage: 'url(/gold-texture-dark.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
          {/* scanline sweep (once) */}
          <motion.div
            initial={{ top: '0%', opacity: 1 }}
            animate={{ top: '100%', opacity: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
            className="pointer-events-none absolute left-0 h-px w-full bg-gold/60"
          />
          <div className="relative flex h-full flex-col">
            <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-1">
              <h1 className="panel-title flex items-center gap-2">{config.symbol} · {chartTfLabel(config)} · {dataSourceLabel(config)}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StaticBadge />
                <AlertCenter live={NO_FEED_ALERTS_STATE} />
                <p className="font-mono text-[13px] tnum text-text1">
                  O {fmt(lastBar.o)}&nbsp;&nbsp;H {fmt(lastBar.h)}&nbsp;&nbsp;L {fmt(lastBar.l)}&nbsp;&nbsp;C{' '}
                  {fmt(lastBar.c)}{' '}
                  <span className={up ? 'text-up' : 'text-down'}>
                    {up ? '+' : '−'}
                    {fmt(Math.abs(delta))} ({up ? '+' : '−'}
                    {Math.abs(deltaPct).toFixed(2)}%)
                  </span>
                </p>
              </div>
            </div>
            <div className="relative min-h-[420px] flex-1 lg:min-h-[520px]">
              <CandlestickChart bars={bars} latest={latest} live={null} config={config} />
            </div>
          </div>
        </motion.section>

        {/* B. Evidence panel (right rail) — static export, no live badge row */}
        <div className="order-3 flex xl:order-none xl:col-start-2 xl:row-span-3 xl:row-start-1">
          <EvidencePanel latest={latest} config={config} />
        </div>

        {/* C. Forecast strip */}
        <div className="order-2 xl:col-start-1 xl:row-start-2">
          <ForecastStrip latest={latest} config={config} />
        </div>

        {/* D. Session strip (symbol bands + units) */}
        <div className="order-4 xl:col-start-1 xl:row-start-3">
          <SymbolSessionStrip sessions={sessions} latest={latest} config={config} />
        </div>
      </div>

      {/* E/F. Market context is gold H1 research — say so honestly instead of
          rendering live/H1 XAUUSD context under a static dashboard. */}
      <div className="grid gap-4 px-4 pb-4">
        <section className="panel p-4" aria-label="Market context note">
          <h2 className="panel-title">Market Context — XAUUSD H1 research only</h2>
          <p className="mt-2 font-mono text-[12px] leading-5 text-text1">
            The ontology map and DXY / US10Y quote context are XAUUSD H1 research artifacts. The {config.symbol}{' '}
            {config.timeframe ?? 'H1'} export is static (no live feed, engine verified OOS) and covers the chart,
            forecast, and session stats above — nothing more is claimed.
            {sessionsReusedFromGold(config) &&
              ' Session stats are the shared XAUUSD H1 profile (display-only); the per-market session map is the Scalper’s Clock (M15, real export).'}
          </p>
        </section>
      </div>

      {/* G. Status bar */}
      <SymbolStatusBar latest={latest} liveActive={false} config={config} barsVerified={barsVerified(config)} />
    </>
  )
}
