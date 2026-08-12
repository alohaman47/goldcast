import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, Clock3, Newspaper } from 'lucide-react'
import HonestyBadge from '@/components/HonestyBadge'
import { scalperClockFile, useSymbolData } from '@/hooks/useData'
import type { Bar, DataState, ScalperClockData, ScalperSlot } from '@/hooks/useData'
import { sessionsReusedFromGold, useSymbol } from '@/hooks/useSymbol'
import type { AppSymbolId } from '@/hooks/useSymbol'
import { useEconCalendar } from '@/hooks/useEconCalendar'
import type { EconEvent, EconImpact } from '@/hooks/useEconCalendar'
import {
  fmtAsofInTz,
  fmtWallClock,
  pad2,
  tzSuffix,
  utcHhMmToTz,
  utcHourInTz,
  utcLabelToTz,
  useTimezone,
  wallParts,
} from '@/hooks/useTimezone'
import type { DisplayTz } from '@/hooks/useTimezone'
import { fmtAtr, fmtPct, fmtUsd, rangeDigits, rangeUnit } from '@/components/sessions/utils'
import { cn } from '@/lib/utils'
import type { SymbolConfig } from '@/engine/symbols'

/**
 * Daily Focus — "Should you sit at the screen today?"
 *
 * A pre-LONDON volatility briefing for the ACTIVE symbol. Three independent
 * real-data reads, side by side, no composite score:
 *   1. vol nowcast   — latest.json p_high_vol ranked against the last 400
 *                      H1 bars in bars.json (percentile, display convention)
 *   2. LONDON heat   — the market's own M15 slot map + the H1 session
 *                      profile for the LONDON band hours
 *   3. news risk     — today's scheduled releases from /api/economic-calendar
 *
 * Everything is volatility/schedule. Direction is not predictable, so this
 * page never shows any.
 */

/* ------------------------------------------------------------------ */
/* Local M15 slot-map fetch (Daily Focus always reads the M15 export — */
/* the page-local ?stf toggle belongs to the Scalper's Clock).         */
/* ------------------------------------------------------------------ */

function useM15Slots(symbol: AppSymbolId): DataState<ScalperClockData> {
  const path = scalperClockFile(symbol, 'M15')
  const [state, setState] = useState<DataState<ScalperClockData>>({ data: null, loading: true, error: null })
  useEffect(() => {
    let cancelled = false
    setState({ data: null, loading: true, error: null })
    fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`)
        return res.json() as Promise<ScalperClockData>
      })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({ data: null, loading: false, error: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [path])
  return state
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000

interface LondonClockState {
  kind: 'open' | 'before' | 'closed'
  /** ms until the band closes (kind === 'open'). */
  msToClose: number
  /** ms until the next band open (kind !== 'open'). */
  msToOpen: number
  /** ms since today's close (kind === 'closed'). */
  msSinceClose: number
}

/** Hour-granular band state — transitions happen on UTC hour boundaries. */
function londonClockState(now: Date, hours: number[]): LondonClockState {
  const start = Math.min(...hours)
  const end = Math.max(...hours) + 1 // exclusive close hour
  const h = now.getUTCHours()
  const openToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), start)
  const closeToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), end)
  if (hours.includes(h)) {
    return { kind: 'open', msToClose: closeToday - now.getTime(), msToOpen: 0, msSinceClose: 0 }
  }
  const nextOpen = h < start ? openToday : openToday + DAY_MS
  const closed = h >= end
  return {
    kind: closed ? 'closed' : 'before',
    msToClose: 0,
    msToOpen: nextOpen - now.getTime(),
    msSinceClose: closed ? now.getTime() - closeToday : 0,
  }
}

/** "H:MM:SS" countdown. */
function fmtHms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 3600)}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`
}

/** "H:MM" elapsed duration. */
function fmtHm(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000))
  return `${Math.floor(m / 60)}:${pad2(m % 60)}`
}

/**
 * Focus verdict: the percentile of the current p_high_vol within the last
 * 400 bars' p_high_vol distribution (share of bars with p ≤ current; nulls
 * ignored). Returns null when no history is available.
 */
function pHighVolPercentile(bars: Bar[], current: number): { pct: number; n: number } | null {
  const vals: number[] = []
  for (const b of bars.slice(-400)) {
    if (b.p_high_vol != null) vals.push(b.p_high_vol)
  }
  if (vals.length === 0) return null
  const le = vals.reduce((acc, v) => acc + (v <= current ? 1 : 0), 0)
  return { pct: le / vals.length, n: vals.length }
}

type FocusVerdict = 'HOT' | 'NORMAL' | 'QUIET'

/** Display thresholds — a convention for reading the percentile, not a rule. */
export function verdictForPercentile(pct: number): FocusVerdict {
  return pct >= 0.7 ? 'HOT' : pct < 0.4 ? 'QUIET' : 'NORMAL'
}

const VERDICT_TONE: Record<FocusVerdict, string> = {
  HOT: 'border-gold/60 bg-gold/10 text-gold',
  NORMAL: 'border-up/50 bg-up/10 text-up',
  QUIET: 'border-linestrong bg-bg1 text-text2',
}

const IMPACT_TONE: Record<EconImpact, string> = {
  High: 'border-down/50 bg-down/10 text-down',
  Medium: 'border-warn/50 bg-warn/10 text-warn',
  Low: 'border-linestrong bg-bg1 text-text2',
  Holiday: 'border-linestrong bg-bg1 text-text2',
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function DailyFocus() {
  const { symbol, config, tf } = useSymbol()
  const { tz } = useTimezone()
  const { latest: latestState, bars: barsState, sessions: sessionsState } = useSymbolData()
  const slotsState = useM15Slots(symbol)

  // Live 1s clock — drives the LONDON countdown strip.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const londonHours = useMemo(() => [...config.sessionBands.london.hours].sort((a, b) => a - b), [config])
  const clock = londonClockState(now, londonHours)

  const latest = latestState.data
  const percentile = useMemo(
    () => (latest != null && barsState.data != null ? pHighVolPercentile(barsState.data, latest.p_high_vol) : null),
    [barsState.data, latest],
  )
  const verdict = percentile != null ? verdictForPercentile(percentile.pct) : null
  const verdictUnavailable =
    !latestState.loading && !barsState.loading && (latestState.error != null || barsState.error != null)

  return (
    <div className="mx-auto w-full max-w-[1180px] px-6 pb-24 pt-14">
      {/* 1 — Header */}
      <header>
        <p className="label-caps text-gold">
          Daily Focus — {config.symbol} {config.timeframe ?? 'H1'}
          {!config.hasLiveFeed && <span className="ml-2 text-text2">· static export, no live feed</span>}
        </p>
        <h1 className="mt-3 font-display text-[34px] font-bold leading-[42px] tracking-[-0.015em] text-text0 sm:text-[40px] sm:leading-[46px]">
          Should you sit at the screen today?
        </h1>
        <p className="mt-4 max-w-[640px] font-body text-[15px] leading-6 text-text1">
          A volatility briefing before the LONDON window — never a direction call. Three independent real-data reads,
          side by side; nothing is averaged, weighted, or invented.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <HonestyBadge
            kind="not-predictable"
            tooltip="Direction is not predictable with anything tested — this page shows volatility and schedule only"
          />
          <span className="font-mono text-[12px] text-text2">
            engine data as of {fmtAsofInTz(latest?.asof, tz)}
            {latestState.error != null && <span className="text-down"> — latest export failed to load</span>}
          </span>
        </div>
      </header>

      {/* 2 — LONDON countdown strip */}
      <LondonStrip config={config} londonHours={londonHours} clock={clock} now={now} tz={tz} />

      {/* 3 — Focus verdict chip */}
      <section className="mt-6 flex flex-wrap items-center gap-3" aria-label="Focus verdict">
        <span className="label-caps">Today&apos;s focus</span>
        {latestState.loading || barsState.loading ? (
          <span className="h-7 w-24 animate-pulse rounded bg-bg3" />
        ) : verdict != null && percentile != null ? (
          <>
            <span
              className={cn(
                'inline-flex items-center rounded-md border px-3 py-1 font-mono text-[14px] font-bold tracking-[0.08em]',
                VERDICT_TONE[verdict],
              )}
            >
              {verdict}
            </span>
            <span className="font-mono text-[12px] tnum text-text1">
              p(high-vol) percentile {(percentile.pct * 100).toFixed(0)}%
            </span>
          </>
        ) : (
          <span className="font-mono text-[12px] text-text2">
            — {verdictUnavailable ? 'vol data failed to load' : 'no p(high-vol) history in the export'}
          </span>
        )}
        <span className="micro-mono">
          percentile vs the last 400 H1 bars · display convention, not a trading rule
        </span>
      </section>

      {/* 4 — Three signal cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <VolNowcastCard
          latestState={latestState}
          barsState={barsState}
          percentile={percentile}
          config={config}
          tz={tz}
        />
        <LondonHeatCard
          slotsState={slotsState}
          sessionsState={sessionsState}
          londonHours={londonHours}
          config={config}
          now={now}
          tz={tz}
          symbol={symbol}
        />
        <NewsRiskCard now={now} tz={tz} />
      </div>

      {/* 5 — Standing rules */}
      <StandingRules symbol={symbol} tf={tf} />

      {/* 6 — Methodology footnote */}
      <footer className="mt-10 border-t border-line pt-5">
        <p className="micro-mono max-w-[860px] leading-[16px]">
          Methodology — the focus verdict ranks the latest p(high-vol) from {config.dataFiles.latest.split('/').pop()}{' '}
          against the p(high-vol) values of the last 400 H1 bars in {config.dataFiles.bars.split('/').pop()} (nulls
          ignored): percentile = share of those bars with p ≤ the current value. ≥ 0.70 renders HOT, &lt; 0.40 renders
          QUIET, otherwise NORMAL — fixed display thresholds, not a fitted rule. The LONDON heat card reads the
          market&apos;s own M15 slot map and the H1 session profile; the news card reads the scheduled-event feed. No
          composite score, no invented weights — three independent real-data signals shown side by side. Volatility
          and schedule only: nothing on this page implies where price goes next.
        </p>
      </footer>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 2 — LONDON countdown strip                                          */
/* ------------------------------------------------------------------ */

function LondonStrip({
  config,
  londonHours,
  clock,
  now,
  tz,
}: {
  config: SymbolConfig
  londonHours: number[]
  clock: LondonClockState
  now: Date
  tz: DisplayTz
}) {
  const start = Math.min(...londonHours)
  const end = (Math.max(...londonHours) + 1) % 24
  const windowTz = `${utcHhMmToTz(start, 0, tz, now)}–${utcHhMmToTz(end, 0, tz, now)} ${tzSuffix(tz)}`
  const windowUtc = `${pad2(start)}:00–${pad2(end)}:00 UTC`

  return (
    <section className="panel panel-gold mt-10 p-5" aria-label="LONDON session countdown">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="panel-title">LONDON window</span>
          <p className="mt-2 font-mono text-[12px] text-text2">
            {config.sessionBands.london.label} · {windowTz}
            {tz === 'NY' && <span> ({windowUtc})</span>}
          </p>
          <p className="micro-mono mt-1">bands are hour-granular — state flips on the UTC hour boundary</p>
        </div>
        <div className="text-right">
          {clock.kind === 'open' && (
            <>
              <p className="flex items-center justify-end gap-2 font-mono text-[15px] font-bold tracking-[0.08em] text-up">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-up" />
                LONDON IS OPEN
              </p>
              <p className="stat-glow mt-1 font-mono text-[30px] font-semibold leading-9 tnum text-gold">
                {fmtHms(clock.msToClose)}
              </p>
              <p className="micro-mono mt-1">until the window closes · {fmtWallClock(now, tz)} {tzSuffix(tz)}</p>
            </>
          )}
          {clock.kind === 'before' && (
            <>
              <p className="font-mono text-[15px] font-bold tracking-[0.08em] text-text0">LONDON OPENS IN</p>
              <p className="stat-glow mt-1 font-mono text-[30px] font-semibold leading-9 tnum text-gold">
                {fmtHms(clock.msToOpen)}
              </p>
              <p className="micro-mono mt-1">
                opens {utcHhMmToTz(start, 0, tz, now)} {tzSuffix(tz)} · now {fmtWallClock(now, tz)} {tzSuffix(tz)}
              </p>
            </>
          )}
          {clock.kind === 'closed' && (
            <>
              <p className="font-mono text-[15px] font-bold tracking-[0.08em] text-text2">
                LONDON CLOSED {fmtHm(clock.msSinceClose)} AGO
              </p>
              <p className="mt-1 font-mono text-[24px] font-semibold leading-8 tnum text-text0">
                next opens in {fmtHms(clock.msToOpen)}
              </p>
              <p className="micro-mono mt-1">
                opens {utcHhMmToTz(start, 0, tz, now)} {tzSuffix(tz)} · now {fmtWallClock(now, tz)} {tzSuffix(tz)}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 4a — Vol nowcast                                                    */
/* ------------------------------------------------------------------ */

function VolNowcastCard({
  latestState,
  barsState,
  percentile,
  config,
  tz,
}: {
  latestState: DataState<{ p_high_vol: number; expected_range_atr: number; expected_range_price: number; regime: string; asof: string }>
  barsState: DataState<Bar[]>
  percentile: { pct: number; n: number } | null
  config: SymbolConfig
  tz: DisplayTz
}) {
  const latest = latestState.data
  const rangeD = rangeDigits(config, 2)
  const unit = rangeUnit(config)
  const trending = latest?.regime === 'trending'

  return (
    <section className="panel p-5" aria-label="Vol nowcast">
      <div className="flex items-center justify-between">
        <span className="panel-title">Vol nowcast</span>
        <Clock3 size={14} className="text-text2" />
      </div>
      {latestState.loading || barsState.loading ? (
        <CardSkeleton />
      ) : latestState.error != null || latest == null ? (
        <p className="mt-4 font-mono text-[12px] text-down">
          engine export unavailable — {latestState.error ?? 'no data'}; nowcast hidden, nothing substituted.
        </p>
      ) : (
        <>
          <p className="mt-4">
            <span className="label-caps block">P(high-vol) now</span>
            <span className="stat-glow font-mono text-[30px] font-semibold leading-9 tnum text-gold">
              {(latest.p_high_vol * 100).toFixed(1)}%
            </span>
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between font-mono text-[10px] text-text2">
              <span>percentile vs last 400 H1 bars</span>
              <span className="tnum text-text1">{percentile != null ? `${(percentile.pct * 100).toFixed(0)}%` : '—'}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded bg-bg3" aria-hidden="true">
              <div
                className="h-full rounded bg-gold transition-[width] duration-700"
                style={{ width: `${Math.round((percentile?.pct ?? 0) * 100)}%` }}
              />
            </div>
            {barsState.error != null && (
              <p className="micro-mono mt-1 text-warn">bars export failed to load — percentile unavailable</p>
            )}
          </div>
          <p className="mt-4 font-mono text-[13px] leading-5 text-text1">
            expected range T+1:{' '}
            <span className="tnum text-text0">{fmtAtr(latest.expected_range_atr)} ATR</span>
            {' ≈ '}
            <span className="tnum text-text0">
              {fmtUsd(latest.expected_range_price, rangeD)} {unit}
            </span>
          </p>
          <p className="mt-2 flex items-center gap-2">
            <span className="label-caps">Regime</span>
            <span
              className={cn(
                'rounded border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase',
                trending ? 'border-up/40 bg-up/10 text-up' : 'border-warn/40 bg-warn/10 text-warn',
              )}
            >
              {latest.regime}
            </span>
          </p>
          {!config.hasLiveFeed && (
            <p className="micro-mono mt-3">Static export as of {fmtAsofInTz(latest.asof, tz)}</p>
          )}
        </>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 4b — LONDON window heat                                             */
/* ------------------------------------------------------------------ */

function LondonHeatCard({
  slotsState,
  sessionsState,
  londonHours,
  config,
  now,
  tz,
  symbol,
}: {
  slotsState: DataState<ScalperClockData>
  sessionsState: ReturnType<typeof useSymbolData>['sessions']
  londonHours: number[]
  config: SymbolConfig
  now: Date
  tz: DisplayTz
  symbol: AppSymbolId
}) {
  const slots = slotsState.data
  const sessions = sessionsState.data

  const londonSlots: ScalperSlot[] = slots != null ? slots.slots.filter((s) => londonHours.includes(s.utc_hour)) : []
  const hottest = londonSlots
    .filter((s) => s.avg_range_atr != null)
    .reduce<ScalperSlot | null>((best, s) => (best == null || (s.avg_range_atr ?? 0) > (best.avg_range_atr ?? 0) ? s : best), null)

  return (
    <section className="panel p-5" aria-label="LONDON window heat">
      <div className="flex items-center justify-between">
        <span className="panel-title">LONDON window heat</span>
        <span className="micro-mono">M15 slot map</span>
      </div>
      {slotsState.loading ? (
        <CardSkeleton />
      ) : slotsState.error != null || slots == null ? (
        <p className="mt-4 font-mono text-[12px] text-down">
          slot map unavailable — {slotsState.error ?? 'no data'} ({scalperClockFile(symbol, 'M15').split('/').pop()});
          heat read hidden, nothing substituted.
        </p>
      ) : (
        <>
          {hottest != null ? (
            <p className="mt-4">
              <span className="label-caps block">Hottest slot in the window</span>
              <span className="font-mono text-[22px] font-semibold leading-8 tnum text-text0">
                {utcLabelToTz(hottest.label, tz, now)} {tzSuffix(tz)}
              </span>
              <span className="ml-2 font-mono text-[13px] tnum text-gold">{fmtAtr(hottest.avg_range_atr)} ATR</span>
              <span className="micro-mono ml-2">empirical, {hottest.bar_count.toLocaleString('en-US')} bars</span>
            </p>
          ) : (
            <p className="mt-4 font-mono text-[12px] text-text2">
              <AlertTriangle size={11} className="mr-1 inline text-warn" />
              no slot stats cover the LONDON hours in this export — nothing shown.
            </p>
          )}
          {sessionsReusedFromGold(config) && (
            <p className="micro-mono mt-3 text-honest">
              per-hour strip is the shared XAUUSD H1 session profile (display-only) — values are gold&apos;s; the slot
              read above is this market&apos;s own M15 export.
            </p>
          )}
          <div className="mt-4">
            <span className="label-caps">Per-hour strip (H1 profile)</span>
            {sessionsState.loading ? (
              <div className="mt-2 h-10 w-full animate-pulse rounded bg-bg3" />
            ) : sessionsState.error != null || sessions == null ? (
              <p className="micro-mono mt-2 text-down">session profile failed to load — strip hidden.</p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                {londonHours.map((h) => {
                  const row = sessions.hours.find((r) => r.hour_utc === h)
                  return (
                    <div key={h} className="rounded border border-line bg-bg0 px-2 py-1.5">
                      <p className="font-mono text-[11px] font-semibold tnum text-text0">
                        {utcHourInTz(h, tz, now)}:00
                      </p>
                      <p className="font-mono text-[10px] tnum text-text1">{fmtAtr(row?.avg_range_atr ?? null)}</p>
                      <p className="font-mono text-[10px] tnum text-text2">
                        p {fmtPct(row?.p_high_vol_empirical ?? null)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 4c — News risk                                                      */
/* ------------------------------------------------------------------ */

function NewsRiskCard({ now, tz }: { now: Date; tz: DisplayTz }) {
  const { entry } = useSymbol()
  const { events, source, loading, error } = useEconCalendar(entry.newsCurrencies)
  const ccys = entry.newsCurrencies.join('/')

  /* full calendar-date match in the display tz — year included so a stale
     cross-year fallback can never render an old event as "today" */
  const dayKey = (d: Date): string => {
    const w = wallParts(d, tz)
    const y =
      tz === 'NY'
        ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(d)
        : String(d.getUTCFullYear())
    return `${y}-${w.month}-${w.day}`
  }
  const todayKey = dayKey(now)
  const todayEvents = events.filter((e) => e.impact !== 'Holiday' && dayKey(e.at) === todayKey)

  return (
    <section className="panel p-5" aria-label="News risk">
      <div className="flex items-center justify-between">
        <span className="panel-title">News risk</span>
        <Newspaper size={14} className="text-gold" />
      </div>
      {loading && events.length === 0 ? (
        <CardSkeleton />
      ) : error != null ? (
        <p className="mt-4 flex items-start gap-1.5 font-mono text-[12px] leading-5 text-text2">
          <CalendarClock size={12} className="mt-0.5 shrink-0 text-warn" />
          scheduled-news calendar unavailable ({error}) — check today&apos;s {ccys} releases manually; nothing shown.
        </p>
      ) : todayEvents.length === 0 ? (
        <p className="mt-4 font-mono text-[12px] leading-5 text-text2">
          no scheduled {ccys} releases today in the feed
          {source === 'static-fallback' && ' (static central-bank schedule fallback)'} — a quiet calendar is not a
          quiet-market promise.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {todayEvents.map((e) => (
            <NewsRow key={`${e.currency}-${e.at.toISOString()}-${e.title}`} event={e} tz={tz} />
          ))}
        </ul>
      )}
      <p className="micro-mono mt-4 leading-[15px]">
        High-impact releases inject volatility regardless of the engine&apos;s schedule view. Times are scheduled, in{' '}
        {tzSuffix(tz)}
        {source != null && (
          <>
            {' '}
            · calendar: {source === 'forexfactory' ? 'ForexFactory live' : 'static fallback (central-bank schedule)'}
          </>
        )}
        .
      </p>
    </section>
  )
}

function NewsRow({ event, tz }: { event: EconEvent; tz: DisplayTz }) {
  return (
    <li className="flex items-center gap-2 rounded border border-line bg-bg0 px-2 py-1.5">
      <span className="font-mono text-[11px] font-semibold tnum text-text0">
        {fmtWallClock(event.at, tz, false)}
      </span>
      <span className="rounded-sm bg-bg3 px-1 font-mono text-[9px] tracking-[0.08em] text-text1">{event.currency}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text1" title={event.title}>
        {event.title}
      </span>
      <span
        className={cn(
          'shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em]',
          IMPACT_TONE[event.impact],
        )}
      >
        {event.impact}
      </span>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* 5 — Standing rules (verified numbers: XAUUSD H1 only)               */
/* ------------------------------------------------------------------ */

const GOLD_H1_RULES: string[] = [
  'LONDON is the only session with a verified edge: +20.0R, PF 1.62 over the 136-trade SMC backtest.',
  'NY killzone LOST money in the same test: −12.7R, PF 0.70.',
  "Risk ≤1% per trade, always set a stop — the user's own journal shows oversize and missing stops were the biggest leaks.",
  'M15 timing is survivable (+0.7pp spread tax); M5 is not (+1.5pp).',
  'Direction is NOT predictable (51.3% model vs 52.1% always-up baseline) — this page will never tell you up or down.',
]

function StandingRules({ symbol, tf }: { symbol: AppSymbolId; tf: 'H1' | 'H4' }) {
  const goldH1 = symbol === 'XAUUSD' && tf === 'H1'
  return (
    <section className="panel mt-8 p-5" aria-label="Standing rules">
      {goldH1 ? (
        <>
          <div className="flex items-center justify-between">
            <span className="panel-title">What the research actually says</span>
            <HonestyBadge kind="verified-oos" tooltip="Numbers verified in the SMC session backtest and the user's trading journal" />
          </div>
          <ul className="mt-4 flex flex-col gap-2.5">
            {GOLD_H1_RULES.map((rule) => (
              <li key={rule} className="flex items-start gap-2 font-body text-[13px] leading-5 text-text1">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold" />
                {rule}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="panel-title">Honesty note for this market</span>
            <HonestyBadge kind="not-predictable" tooltip="No session-level trading edge has been verified for this market/timeframe" />
          </div>
          <p className="mt-4 max-w-[720px] font-body text-[13px] leading-5 text-text1">
            Volatility is predictable here (see The Truth); direction is not. No session-level trading edge has been
            verified for this market.
          </p>
        </>
      )}
    </section>
  )
}

function CardSkeleton() {
  return (
    <div className="mt-4 space-y-3" aria-busy="true">
      <div className="h-8 w-1/2 animate-pulse rounded bg-bg3" />
      <div className="h-4 w-3/4 animate-pulse rounded bg-bg3" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-bg3" />
    </div>
  )
}
