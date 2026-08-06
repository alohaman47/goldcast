import { useEffect, useState } from 'react'

/**
 * GoldCast data contract (design.md §6).
 * All data is real, precomputed engine output served statically from /data/.
 * No invented stats anywhere.
 */

export interface ConeStep {
  half_width: number
}

export interface LatestData {
  asof: string
  session: string
  regime: 'trending' | 'ranging' | string
  p_high_vol: number
  expected_range_atr: number
  expected_range_price: number
  cone: { T1: ConeStep; T2: ConeStep; T3: ConeStep }
  direction_policy: 'drift' | string
  drift_sign: 1 | -1 | number
  confidence: number // 0–5
  price: number
  atr14: number
}

export interface Bar {
  t: string
  o: number
  h: number
  l: number
  c: number
  p_high_vol: number | null
  exp_range_atr: number | null
  regime: string
  session: string
}

export interface SessionHour {
  hour_utc: number
  avg_range_price: number | null
  avg_range_atr: number | null
  avg_abs_ret: number | null
  p_high_vol_empirical: number | null
  bar_count: number
}

export interface SessionBands {
  asia: [number, number] | number[]
  london: [number, number] | number[]
  ny: [number, number] | number[]
  off: [number, number] | number[]
}

export interface SessionsData {
  hours: SessionHour[]
  bands: SessionBands
  definitions?: Record<string, string>
}

export interface TruthData {
  dataset: {
    h1: { bars: number; start: string; end: string; instrument: string; timeframe: string }
    d1: { bars: number; start: string; end: string; instrument: string; timeframe: string }
  }
  phase1: {
    description: string
    h1_t1: { ensemble: number; model_c: number; always_up: number }
    d1_t1: { ensemble: number; model_c: number; always_up: number }
  }
  phase2: {
    description: string
    h1_hvol: Record<string, unknown>
    h1_range: Record<string, unknown>
    fundamentals_delta: Record<string, unknown>
    top_features: string[]
  }
  phase3: {
    fixed: Record<string, unknown>
    vol_aware: Record<string, unknown>
    bootstrap_p: number
    equity_curve_pips: { fixed: number[]; vol_aware: number[] }
  }
}

export interface DataState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`)
  return (await res.json()) as T
}

function useJson<T>(path: string): DataState<T> {
  const [state, setState] = useState<DataState<T>>({ data: null, loading: true, error: null })
  useEffect(() => {
    let cancelled = false
    fetchJson<T>(path)
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

export function useLatest(): DataState<LatestData> {
  return useJson<LatestData>('/data/latest.json')
}

export function useBars(): DataState<Bar[]> {
  return useJson<Bar[]>('/data/bars.json')
}

export function useSessions(): DataState<SessionsData> {
  return useJson<SessionsData>('/data/sessions.json')
}

export function useTruth(): DataState<TruthData> {
  return useJson<TruthData>('/data/truth.json')
}
