import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, AlertTriangle, Newspaper } from 'lucide-react'
import { useEconCalendar } from '@/hooks/useEconCalendar'
import type { EconEvent } from '@/hooks/useEconCalendar'
import { useSymbol } from '@/hooks/useSymbol'
import { useTimezone, fmtWallClock, tzSuffix, wallParts } from '@/hooks/useTimezone'
import type { DisplayTz } from '@/hooks/useTimezone'

/**
 * GoldCast Phase 17 Track B — scheduled-news warning bar.
 *
 * Renders the active market's upcoming High/Medium-impact releases from
 * /api/economic-calendar (currencies from SYMBOL_REGISTRY.newsCurrencies) as
 * a slim, tz-aware banner on the Scalper's Clock and the dashboard. This is
 * a SCHEDULE display: times come from the feed, no direction is implied —
 * the honest framing is "news moves these markets; know when it lands".
 *
 * States:
 *  - loading  → quiet skeleton line (bar space reserved, no flash)
 *  - error    → honest muted strip (calendar unreachable — check manually)
 *  - empty    → quiet "no high-impact news in the window" strip
 *  - events   → chips with countdown + tz-converted time; releases within
 *               IMMINENT_MINUTES are flagged red (warn otherwise)
 * Source badge always names the origin (forexfactory live / static fallback).
 */

/** Look-ahead window for listed events. */
const WINDOW_HOURS = 48
/** A release this close (or this recently landed) gets the red treatment. */
const IMMINENT_MINUTES = 30
/** A past release stays visible this long as "just landed". */
const RECENT_MINUTES = 15
/** Max chips rendered. */
const MAX_EVENTS = 4

function countdown(at: Date, now: Date): { label: string; imminent: boolean } {
  const diffMin = Math.round((at.getTime() - now.getTime()) / 60000)
  if (diffMin < 0) return { label: `landed ${-diffMin}m ago`, imminent: -diffMin <= IMMINENT_MINUTES }
  if (diffMin < 60) return { label: `in ${diffMin}m`, imminent: diffMin <= IMMINENT_MINUTES }
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  return { label: m === 0 ? `in ${h}h` : `in ${h}h ${String(m).padStart(2, '0')}m`, imminent: false }
}

/** "HH:MM" today, "MM-DD HH:MM" on other days — in the display tz. */
function fmtEventTime(at: Date, tz: DisplayTz, now: Date): string {
  const clock = fmtWallClock(at, tz, false)
  const a = wallParts(at, tz)
  const n = wallParts(now, tz)
  return a.day === n.day && a.month === n.month ? clock : `${String(a.month + 1).padStart(2, '0')}-${String(a.day).padStart(2, '0')} ${clock}`
}

function EventChip({ event, now, tz }: { event: EconEvent; now: Date; tz: DisplayTz }) {
  const cd = countdown(event.at, now)
  const high = event.impact === 'High'
  const tone = cd.imminent
    ? 'border-down/50 bg-down/10 text-down'
    : high
      ? 'border-warn/50 bg-warn/10 text-warn'
      : 'border-linestrong bg-bg1 text-text2'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.04em] ${tone}`}
      title={[event.forecast != null ? `forecast ${event.forecast}` : null, event.previous != null ? `previous ${event.previous}` : null]
        .filter(Boolean)
        .join(' · ') || undefined}
    >
      {cd.imminent && <AlertTriangle size={10} />}
      <span className="tnum">{cd.label}</span>
      <span className="text-text2">·</span>
      <span>
        {fmtEventTime(event.at, tz, now)} {tzSuffix(tz)}
      </span>
      <span className="rounded-sm bg-bg3 px-1 text-[9px] tracking-[0.08em] text-text1">{event.currency}</span>
      <span className="max-w-[260px] truncate font-normal text-text1">{event.title}</span>
      {!high && <span className="text-[9px] uppercase tracking-[0.08em] text-text2">{event.impact}</span>}
    </span>
  )
}

export default function NewsWarningBar({ className = '' }: { className?: string }) {
  const { entry } = useSymbol()
  const { tz } = useTimezone()
  const { events, source, loading, error } = useEconCalendar(entry.newsCurrencies)

  /* 30s tick drives countdowns / the recent-release window. */
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const visible = useMemo(() => {
    const t = now.getTime()
    return events
      .filter((e) => e.impact === 'High' || e.impact === 'Medium')
      .filter((e) => e.at.getTime() >= t - RECENT_MINUTES * 60000 && e.at.getTime() <= t + WINDOW_HOURS * 3600000)
      .slice(0, MAX_EVENTS)
  }, [events, now])

  const ccys = entry.newsCurrencies.join('/')

  if (loading && events.length === 0) {
    return (
      <div className={`flex items-center gap-2 rounded-[10px] border border-line bg-bg1 px-4 py-2 ${className}`} aria-busy="true">
        <CalendarClock size={13} className="shrink-0 text-text2" />
        <span className="font-mono text-[11px] text-text2 animate-pulse">loading scheduled news…</span>
      </div>
    )
  }

  if (error != null) {
    return (
      <div className={`flex items-center gap-2 rounded-[10px] border border-line bg-bg1 px-4 py-2 ${className}`} role="status">
        <CalendarClock size={13} className="shrink-0 text-text2" />
        <p className="font-mono text-[11px] leading-4 text-text2">
          scheduled-news calendar unavailable ({error}) — no events shown; check today's {ccys} releases manually.
        </p>
      </div>
    )
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-[10px] border px-4 py-2 ${
      visible.some((e) => countdown(e.at, now).imminent)
        ? 'border-down/40 bg-down/5'
        : visible.length > 0
          ? 'border-warn/40 bg-warn/5'
          : 'border-line bg-bg1'
    } ${className}`} role="status">
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-text2">
        <Newspaper size={12} className="text-gold" />
        Scheduled news · {ccys}
      </span>
      {visible.length === 0 ? (
        <span className="font-mono text-[11px] text-text2">
          no high/medium-impact releases in the next {WINDOW_HOURS}h
        </span>
      ) : (
        visible.map((e) => <EventChip key={`${e.currency}-${e.at.toISOString()}-${e.title}`} event={e} now={now} tz={tz} />)
      )}
      <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.08em] text-text2">
        {source === 'forexfactory' ? 'calendar: ForexFactory live' : source === 'static-fallback' ? 'calendar: static fallback (central-bank schedule)' : 'calendar: source unknown'} · times scheduled, not a signal
      </span>
    </div>
  )
}
