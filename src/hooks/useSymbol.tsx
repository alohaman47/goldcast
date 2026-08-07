import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { getSymbolConfig, VARIANT_CONFIGS } from '@/engine/symbols'
import type { SymbolConfig, SymbolId } from '@/engine/symbols'

/**
 * Active symbol state (GoldCast Phase 9 Stage 2 — Symbol Switcher).
 *
 * Backed by the `?symbol=nas100|xauusd` URL search param (default: XAUUSD),
 * so every Navbar link / internal navigation that carries the current search
 * string preserves the selection, and a refresh / shared link restores it.
 * No provider at App level — the param IS the store.
 *
 * XAUUSD is the default and its H1 engine has a live feed; NAS100 and the
 * gold H4 variant are STATIC (no feed — the UI must show honest static
 * states, see hasLiveFeed on the config).
 *
 * Phase 11 (Track B2) + Phase 12: `?tf=h1|h4` selects the engine timeframe
 * (default h1). tf=h4 resolves config to the symbol's H4 variant
 * (VARIANT_CONFIGS["xauusd-h4"] for gold, ["nas100-h4"] for NAS100) — both
 * symbols have H4 engines now. The lookup is data-driven (H4_VARIANTS), so a
 * future symbol without an H4 variant still can't reach a broken state: its
 * tf param is ignored and dropped.
 */

export type TimeframeId = 'H1' | 'H4'

/**
 * Per-symbol H4 variant keys into VARIANT_CONFIGS. `null` = the symbol has
 * no H4 engine, so `tf=h4` can never resolve for it (guard stays data-driven).
 */
const H4_VARIANTS: Record<SymbolId, keyof typeof VARIANT_CONFIGS | null> = {
  XAUUSD: 'xauusd-h4',
  NAS100: 'nas100-h4',
}

export interface SymbolState {
  symbol: SymbolId
  config: SymbolConfig
  /** True when the active config has a live price feed (XAUUSD H1 only). */
  isLive: boolean
  /** Active engine timeframe (H4 where the symbol has an H4 variant; H1 elsewhere). */
  tf: TimeframeId
  setSymbol: (next: SymbolId) => void
  setTf: (next: TimeframeId) => void
}

export function parseSymbolParam(raw: string | null): SymbolId {
  return raw != null && raw.toLowerCase() === 'nas100' ? 'NAS100' : 'XAUUSD'
}

export function useSymbol(): SymbolState {
  const [params, setParams] = useSearchParams()
  const symbol = parseSymbolParam(params.get('symbol'))
  /* tf=h4 takes effect only for symbols with an H4 variant (both today) */
  const variantKey = H4_VARIANTS[symbol]
  const tf: TimeframeId = variantKey != null && params.get('tf')?.toLowerCase() === 'h4' ? 'H4' : 'H1'
  const config = tf === 'H4' && variantKey != null ? VARIANT_CONFIGS[variantKey] : getSymbolConfig(symbol)

  const setSymbol = useCallback(
    (next: SymbolId) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'XAUUSD') p.delete('symbol') // default — keep URLs clean
        else p.set('symbol', 'nas100')
        if (H4_VARIANTS[next] == null) p.delete('tf') // target has no H4 engine
        return p
      })
    },
    [setParams],
  )

  const setTf = useCallback(
    (next: TimeframeId) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev)
        /* default h1 keeps URLs clean; h4 only for symbols with an H4 variant */
        if (next === 'H1' || H4_VARIANTS[parseSymbolParam(p.get('symbol'))] == null) p.delete('tf')
        else p.set('tf', 'h4')
        return p
      })
    },
    [setParams],
  )

  return { symbol, config, isLive: config.hasLiveFeed, tf, setSymbol, setTf }
}

/* ------------------------------------------------------------------ */
/* Display helpers (respect config.priceDecimals / pip conventions)    */
/* ------------------------------------------------------------------ */

/** Price string honoring the symbol's display decimals (XAUUSD 2, NAS100 1). */
export function fmtSymPrice(v: number, config: SymbolConfig): string {
  return v.toLocaleString('en-US', {
    minimumFractionDigits: config.priceDecimals,
    maximumFractionDigits: config.priceDecimals,
  })
}

/**
 * Unit suffix for range/price-delta readouts. Gold research labels ranges in
 * USD; NAS100 ranges are index points (pip = 1.0 pt per engine convention).
 */
export function priceUnit(config: SymbolConfig): string {
  return config.symbol === 'NAS100' ? 'pts' : 'USD'
}

/**
 * Decimals for avg-range readouts in the sessions views. Gold output must
 * stay byte-identical to the research export, so XAUUSD keeps the call-site
 * fallback; other symbols follow config.priceDecimals.
 */
export function rangeDigits(config: SymbolConfig, goldFallback: number): number {
  return config.symbol === 'XAUUSD' ? goldFallback : config.priceDecimals
}

/** Short human name for the instrument (Navbar / headings). */
export function symbolDisplayName(config: SymbolConfig): string {
  return config.symbol === 'NAS100' ? 'Nasdaq 100 Index' : 'Gold / U.S. Dollar'
}
