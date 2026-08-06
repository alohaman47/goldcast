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

export interface Phase5Strategy {
  key: string
  strategy: string
  variant: string
  n_trades: number
  win_rate: number
  avg_pips: number
  total_pips: number
  profit_factor: number
  max_dd: number
  expectancy: number
  bootstrap_p: number | null
  bootstrap_test: string | null
}

export interface Phase5EquityPoint {
  trade_idx: number
  equity: number
  exit_dt: string
}

export interface Phase5Data {
  phase: number
  title: string
  source: string
  strategies: Phase5Strategy[]
  s3_vol_off: {
    vol_avg_pips: number
    off_avg_pips: number
    diff_vol_minus_off: number
    bootstrap_p: number
    ci_5_95: [number, number] | number[]
    rerun_check?: { bootstrap_p: number; ci_5_95: [number, number] | number[] } | null
    resamples: number
    seed: number
    test: string
  }
  equity: Record<string, Phase5EquityPoint[]>
  knockout_fact: {
    strategy: string
    n_trades_total: number
    mean_pips_all_trades: number
    winners_removed: number
    top3_winners_pips_total: number
    share_of_total_pips_from_top3: number
    mean_pips_after_removal: number
    n_trades_after_removal: number
    top3_winners: { exit_dt: string; entry_dt: string; pnl_pips: number; fold: number; year: number }[]
    interpretation: string
  }
  verdicts: Record<string, string>
  protocol: Record<string, string>
}

export function usePhase5(): DataState<Phase5Data> {
  return useJson<Phase5Data>('/data/phase5.json')
}
