import { useCallback, useEffect, useRef, useState } from 'react'
import type { LiveTick } from '@/engine/liveBars'

/**
 * Live spot price for XAU from the public gold-api (CORS-open, no key).
 * Polls every 60s; on failure retries with exponential backoff (5s → 60s cap)
 * and keeps the last good tick visible with an honest stale/error status.
 */

const PRICE_URL = 'https://api.gold-api.com/price/XAU'
const POLL_MS = 60_000
export const STALE_AFTER_MS = 90_000
const RETRY_MIN_MS = 5_000
const RETRY_MAX_MS = 60_000
const MAX_TICKS = 240

export type LivePriceStatus = 'connecting' | 'live' | 'stale' | 'error'

export interface LivePriceState {
  /** Latest spot price (USD/oz), or null before the first successful fetch. */
  price: number | null
  /** Recent successful ticks, oldest → newest (for the forming-bar builder). */
  ticks: LiveTick[]
  /** Receipt time of the last successful tick, epoch ms. */
  tickAtMs: number | null
  /** updatedAt string reported by the API for the last tick. */
  apiUpdatedAt: string | null
  status: LivePriceStatus
  error: string | null
  /** Manual refresh: fetches immediately and resets the poll cadence. */
  refresh: () => void
}

interface ApiShape {
  price?: unknown
  updatedAt?: unknown
}

export function useLivePrice(): LivePriceState {
  const [ticks, setTicks] = useState<LiveTick[]>([])
  const [apiUpdatedAt, setApiUpdatedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [refreshTick, setRefreshTick] = useState(0)
  const timerRef = useRef<number | null>(null)
  const backoffRef = useRef(RETRY_MIN_MS)

  const refresh = useCallback(() => setRefreshTick((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    const clearTimer = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
    const schedule = (wait: number) => {
      clearTimer()
      timerRef.current = window.setTimeout(() => void load(), wait)
    }
    const load = async () => {
      try {
        const res = await fetch(PRICE_URL, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as ApiShape
        const price = typeof json.price === 'number' ? json.price : Number(json.price)
        if (!Number.isFinite(price) || price <= 0) throw new Error('bad price payload')
        if (cancelled) return
        const atMs = Date.now()
        setTicks((prev) => [...prev.slice(-(MAX_TICKS - 1)), { price, atMs }])
        setApiUpdatedAt(typeof json.updatedAt === 'string' ? json.updatedAt : null)
        setError(null)
        backoffRef.current = RETRY_MIN_MS
        schedule(POLL_MS)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        const wait = backoffRef.current
        backoffRef.current = Math.min(backoffRef.current * 2, RETRY_MAX_MS)
        schedule(wait)
      }
    }
    void load()
    return () => {
      cancelled = true
      clearTimer()
    }
  }, [refreshTick])

  /* staleness clock */
  useEffect(() => {
    const iv = window.setInterval(() => setNowMs(Date.now()), 10_000)
    return () => window.clearInterval(iv)
  }, [])

  const last = ticks.length > 0 ? ticks[ticks.length - 1] : null
  const tickAtMs = last?.atMs ?? null
  const status: LivePriceStatus =
    tickAtMs == null
      ? error != null
        ? 'error'
        : 'connecting'
      : error != null
        ? 'error'
        : nowMs - tickAtMs > STALE_AFTER_MS
          ? 'stale'
          : 'live'

  return {
    price: last?.price ?? null,
    ticks,
    tickAtMs,
    apiUpdatedAt,
    status,
    error,
    refresh,
  }
}
