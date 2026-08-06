import { useEffect, useRef, useState } from 'react'
import { predict, sessionName, type PredictResult } from '@/engine/predict'
import { hourOf, type DailyBar } from '@/engine/bars'
import { buildFormingBar } from '@/engine/liveBars'
import type { Bar, LatestData } from '@/hooks/useData'
import { STALE_AFTER_MS, type LivePriceState } from '@/hooks/useLivePrice'

/**
 * Live prediction: runs the parity-verified browser GBM engine (src/engine)
 * on [static bars.json + current forming H1 bar] + daily.json.
 * Recomputes on every new tick batch, throttled to 5s.
 *
 * Honest states:
 *  boot  — static data / daily bars / first tick not ready yet
 *  live  — fresh tick (< 90s) and static history continuous with now
 *  stale — last tick older than 90s (last computed prediction kept)
 *  gap   — static history ends > 48h before now (prediction still live)
 *  error — price feed failing (retrying) or engine threw
 */

export type LiveEngineStatus = 'boot' | 'live' | 'stale' | 'gap' | 'error'

export interface LivePredictionState {
  /** LatestData-shaped live prediction for the dashboard components. */
  data: LatestData | null
  /** Raw predict() output (same JSON shape as latest.json). */
  raw: PredictResult | null
  /** Current forming H1 bar, annotated with session/regime for the chart. */
  forming: Bar | null
  gapHours: number
  farGap: boolean
  status: LiveEngineStatus
  error: string | null
  computedAtMs: number | null
}

const THROTTLE_MS = 5_000

const IDLE: LivePredictionState = {
  data: null,
  raw: null,
  forming: null,
  gapHours: 0,
  farGap: false,
  status: 'boot',
  error: null,
  computedAtMs: null,
}

export function useLivePrediction(
  staticBars: Bar[] | null,
  price: LivePriceState,
): LivePredictionState {
  const [daily, setDaily] = useState<DailyBar[] | null>(null)
  const [dailyError, setDailyError] = useState<string | null>(null)
  const [state, setState] = useState<LivePredictionState>(IDLE)
  const lastRunRef = useRef(0)
  const timerRef = useRef<number | null>(null)

  /* daily bars (static export, same as research engine input) */
  useEffect(() => {
    let cancelled = false
    fetch('/data/daily.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load /data/daily.json: ${r.status}`)
        return r.json()
      })
      .then((d) => {
        if (!cancelled) setDaily(d as DailyBar[])
      })
      .catch((e: unknown) => {
        if (!cancelled) setDailyError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const { ticks, tickAtMs, status: priceStatus, price: spot, error: priceError } = price

  useEffect(() => {
    if (!staticBars || staticBars.length === 0 || !daily) return
    if (tickAtMs == null || spot == null) {
      setState({
        ...IDLE,
        status: priceStatus === 'error' ? 'error' : 'boot',
        error:
          priceStatus === 'error'
            ? (priceError ?? dailyError ?? 'live price unavailable')
            : (dailyError ?? null),
      })
      return
    }

    const run = () => {
      lastRunRef.current = Date.now()
      try {
        const nowMs = Date.now()
        const res = buildFormingBar(staticBars, ticks, nowMs)
        if (!res) return
        const raw = predict(staticBars, daily, { liveBar: res.forming })
        const sess = sessionName(hourOf(res.forming.t))
        const atr14 =
          raw.expected_range_atr > 0 ? raw.expected_range_price / raw.expected_range_atr : 0
        const data: LatestData = {
          ...raw,
          price: spot,
          atr14: Math.round(atr14 * 1000) / 1000,
        }
        const forming: Bar = {
          ...res.forming,
          p_high_vol: raw.p_high_vol,
          exp_range_atr: raw.expected_range_atr,
          regime: raw.regime,
          session: sess,
        }
        const status: LiveEngineStatus =
          priceStatus === 'error'
            ? 'error'
            : nowMs - tickAtMs > STALE_AFTER_MS
              ? 'stale'
              : res.farGap
                ? 'gap'
                : 'live'
        setState({
          data,
          raw,
          forming,
          gapHours: res.gapHours,
          farGap: res.farGap,
          status,
          error: priceStatus === 'error' ? (priceError ?? 'price feed error') : null,
          computedAtMs: nowMs,
        })
      } catch (e) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        }))
      }
    }

    const elapsed = Date.now() - lastRunRef.current
    if (elapsed >= THROTTLE_MS) {
      run()
    } else {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(run, THROTTLE_MS - elapsed)
    }
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [staticBars, daily, ticks, tickAtMs, priceStatus, spot, priceError, dailyError])

  return state
}
