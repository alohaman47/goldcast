import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * GoldCast Phase 17 Track B — economic calendar feed (frontend half).
 *
 * Fetches GET /api/economic-calendar (backend: server/calendar.js, Track A)
 * and normalizes the response into a typed, time-sorted event list. The
 * LOCKED contract (Phase 17, both tracks enforce):
 *
 *   200 → {
 *     events: [{ title: string, currency: string, timeUtc: string (ISO 8601),
 *                impact: "High"|"Medium"|"Low"|"Holiday",
 *                forecast: string|null, previous: string|null }],
 *     source: "forexfactory" | "static-fallback",
 *     fetchedAt: string (ISO)
 *   }
 *   500 → { error: string }  (only if live feed AND fallback both failed)
 *
 * Defensive extras beyond the contract: a bare top-level array is accepted
 * as the event list (source/fetchedAt then null), and malformed individual
 * events are dropped instead of failing the whole fetch.
 *
 * Caching: the response is module-level shared across every consumer (the
 * Scalper's Clock bar and both dashboards mount the hook simultaneously) and
 * reused for CACHE_TTL_MS; only one in-flight request at a time. Events are
 * filtered by the caller's currency codes (SYMBOL_REGISTRY newsCurrencies)
 * case-insensitively and sorted by time ascending. No direction, no forecast
 * of our own — this is a SCHEDULE display, honestly badged by source.
 */

export type EconImpact = 'High' | 'Medium' | 'Low' | 'Holiday'

export interface EconEvent {
  title: string
  /** ISO currency code as delivered by the feed (USD/EUR/GBP/JPY/…). */
  currency: string
  /** Scheduled release instant (parsed from the contract's ISO timeUtc). */
  at: Date
  impact: EconImpact
  forecast: string | null
  previous: string | null
}

export type EconCalendarSource = 'forexfactory' | 'static-fallback'

export interface EconCalendarState {
  /** Events for the requested currencies, sorted by time ascending. */
  events: EconEvent[]
  source: EconCalendarSource | null
  fetchedAt: string | null
  loading: boolean
  /** Human-readable failure (HTTP status / network) — null when healthy. */
  error: string | null
  refresh: () => void
}

const ENDPOINT = '/api/economic-calendar'
const CACHE_TTL_MS = 15 * 60 * 1000

interface CacheEntry {
  at: number
  events: EconEvent[]
  source: EconCalendarSource | null
  fetchedAt: string | null
}

let cache: CacheEntry | null = null
let inFlight: Promise<CacheEntry> | null = null

const IMPACTS: readonly string[] = ['High', 'Medium', 'Low', 'Holiday']

/** Defensive per-event normalizer — returns null for malformed rows. */
function normalizeEvent(raw: unknown): EconEvent | null {
  if (raw == null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.title !== 'string' || r.title.length === 0) return null
  if (typeof r.currency !== 'string' || r.currency.length === 0) return null
  if (typeof r.timeUtc !== 'string') return null
  const at = new Date(r.timeUtc)
  if (Number.isNaN(at.getTime())) return null
  const impact =
    typeof r.impact === 'string' && IMPACTS.includes(r.impact) ? (r.impact as EconImpact) : 'Low'
  return {
    title: r.title,
    currency: r.currency,
    at,
    impact,
    forecast: typeof r.forecast === 'string' ? r.forecast : null,
    previous: typeof r.previous === 'string' ? r.previous : null,
  }
}

async function fetchCalendar(): Promise<CacheEntry> {
  const res = await fetch(ENDPOINT, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: unknown }
      if (typeof body.error === 'string' && body.error.length > 0) detail = body.error
    } catch {
      /* non-JSON error body — keep the status line */
    }
    throw new Error(detail)
  }
  const body: unknown = await res.json()
  /* Contract shape; bare-array accepted defensively. */
  const rawEvents: unknown[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { events?: unknown })?.events)
      ? ((body as { events: unknown[] }).events)
      : []
  const events = rawEvents
    .map(normalizeEvent)
    .filter((e): e is EconEvent => e != null)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
  const src = Array.isArray(body) ? null : (body as { source?: unknown })?.source
  const fetched = Array.isArray(body) ? null : (body as { fetchedAt?: unknown })?.fetchedAt
  return {
    at: Date.now(),
    events,
    source: src === 'forexfactory' || src === 'static-fallback' ? src : null,
    fetchedAt: typeof fetched === 'string' ? fetched : null,
  }
}

async function loadCalendar(): Promise<CacheEntry> {
  if (cache != null && Date.now() - cache.at < CACHE_TTL_MS) return cache
  if (inFlight == null) {
    inFlight = fetchCalendar().finally(() => {
      inFlight = null
    })
  }
  const entry = await inFlight
  cache = entry
  return entry
}

/**
 * Scheduled economic events for the given currency codes (the registry's
 * newsCurrencies for the active market). Empty `currencies` returns every
 * event. Case-insensitive match against the feed's currency codes.
 */
export function useEconCalendar(currencies: readonly string[]): EconCalendarState {
  const [state, setState] = useState<Omit<EconCalendarState, 'refresh'>>({
    events: [],
    source: null,
    fetchedAt: null,
    loading: cache == null,
    error: null,
  })
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const run = useCallback(() => {
    loadCalendar()
      .then((entry) => {
        if (!alive.current) return
        setState({
          events: entry.events,
          source: entry.source,
          fetchedAt: entry.fetchedAt,
          loading: false,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (!alive.current) return
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'calendar fetch failed',
        }))
      })
  }, [])

  useEffect(() => {
    run()
    /* Re-poll on the cache TTL so the bar tracks the week automatically. */
    const id = window.setInterval(run, CACHE_TTL_MS)
    return () => window.clearInterval(id)
  }, [run])

  const wanted = currencies.map((c) => c.toUpperCase())
  const events =
    wanted.length === 0
      ? state.events
      : state.events.filter((e) => wanted.includes(e.currency.toUpperCase()))

  return { ...state, events, refresh: run }
}
