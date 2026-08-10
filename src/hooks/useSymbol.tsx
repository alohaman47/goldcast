import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { SYMBOL_CONFIGS, VARIANT_CONFIGS } from '@/engine/symbols'
import type { SymbolConfig, SymbolId, Phase15SymbolId } from '@/engine/symbols'

/**
 * Active symbol state (GoldCast Phase 9 Stage 2 — Symbol Switcher;
 * Phase 15 Track C — multi-market registry).
 *
 * Backed by the `?symbol=<param>` URL search param (default: XAUUSD),
 * so every Navbar link / internal navigation that carries the current search
 * string preserves the selection, and a refresh / shared link restores it.
 * No provider at App level — the param IS the store. Backward compatible:
 * the legacy values `xauusd` and `nas100` resolve exactly as before.
 *
 * XAUUSD is the default and its H1 engine has a live feed; every other
 * market (NAS100, the gold H4 variant, and the five Phase-15 SHIP'ed H1
 * markets US30/GER40/EURUSD/GBPUSD/USDJPY) is STATIC (no feed — the UI
 * shows honest static states, see hasLiveFeed on the config).
 *
 * Phase 11 (Track B2) + Phase 12: `?tf=h1|h4` selects the engine timeframe
 * (default h1). tf=h4 resolves config to the symbol's H4 variant — only
 * XAUUSD and NAS100 have H4 engines; the Phase-15 markets are H1-only, so
 * their tf param is ignored and dropped (data-driven via entry.h4).
 *
 * Phase 15 Track C: SYMBOL_REGISTRY is the single source of truth for every
 * market the UI can surface — engine config pointers, scalper-clock exports,
 * display decimals/units, data-source provenance, footer strings, and
 * economics honesty notes. Per-market ENGINE config (point size, decimals,
 * validation metrics, data files) comes from src/engine/symbols.ts ONLY;
 * this registry adds display/provenance metadata and pins every rendered
 * number to a static JSON export (symbol_check.mjs verifies the pinning).
 */

export type TimeframeId = 'H1' | 'H4'

/** Every market the UI can surface (legacy SymbolId ∪ Phase-15 SHIP'ed ids). */
export type AppSymbolId = SymbolId | Phase15SymbolId

export type SymbolGroup = 'Metals' | 'Indices' | 'Forex'

/** Economics family of the symbol's scalper-clock export (EconPanel schema). */
export type EconKind = 'spread' | 'commission' | 'commission-analogy'

export interface SymbolRegistryEntry {
  id: AppSymbolId
  /** lowercase ?symbol= URL value ('xauusd' is the default — omitted from URLs). */
  param: string
  /** Short picker label (matches config.symbol). */
  label: string
  group: SymbolGroup
  /** H1 engine config from src/engine/symbols.ts (single source of engine truth). */
  h1: SymbolConfig
  /** H4 variant key into VARIANT_CONFIGS; null = H1-only market. */
  h4: keyof typeof VARIANT_CONFIGS | null
  /** Scalper's Clock slot-map exports under /data/ (M15 always; M5 gold-only). */
  scalperM15: string
  scalperM5: string | null
  /** Unit suffix for range/price-delta readouts (priceUnit). */
  rangeUnit: 'USD' | 'pts' | 'JPY'
  /** Short human name for the instrument (Navbar / headings). */
  displayName: string
  /** Engine data source for chart headers / status bars / Footer matrix.
   *  Phase 19 R3: every market — gold included — is trained from the user's
   *  own MT5 broker exports, so this is 'MT5' everywhere today. Widen the
   *  union if a market with a different source is ever added. */
  dataSource: 'MT5'
  /** Scalper economics family (drives the EconPanel schema + honesty notes). */
  econKind: EconKind
  /**
   * Currencies whose scheduled news moves this market (Phase 17 Track B —
   * NewsWarningBar filter). Matched case-insensitively against the
   * /api/economic-calendar event `currency` codes; the feed covers
   * USD/EUR/GBP/JPY. Gold and the U.S. indices are USD-priced and USD-driven;
   * GER40 is EUR-denominated but answers to both EUR and USD releases; FX
   * pairs answer to both legs (USD first — the dollar leg dominates).
   */
  newsCurrencies: string[]
  /**
   * EconPanel honesty note for commission-modeled markets (spec §7): the FX
   * economics are user-provided account economics, not broker-recorded spreads.
   */
  econNote: string | null
  /**
   * Engine range-model honesty note (spec §6): shown where range metrics are
   * displayed. USDJPY's classic-GBM range R² is WEAK — it was NEGATIVE
   * (-0.1852 vs HGB 0.1255) pre-Phase-19 and improved to barely positive
   * (+0.0103 vs HGB 0.1298) at the 2026-08-10 R1b refresh — SHIP'ed per the
   * Track-A verdict but honestly disclosed.
   */
  engineRangeNote: string | null
  /**
   * Footer dataLine strings (the provenance matrix). Every number in these
   * strings mirrors a static JSON export's meta exactly — symbol_check.mjs
   * pins each string against the JSON so nothing is invented.
   */
  footer: {
    /** /scalper-clock M15 line. */
    scalperM15: string
    /** /scalper-clock M5 line (gold only). */
    scalperM5?: string
    /** Engine H1 line (all other routes). */
    engineH1: string
    /** Engine H4 line (symbols with an H4 variant). */
    engineH4?: string
  }
  /** Session Radar hero headline. */
  headline: string
}

const ORDERED_GROUPS: SymbolGroup[] = ['Metals', 'Indices', 'Forex']

export const SYMBOL_REGISTRY: Record<AppSymbolId, SymbolRegistryEntry> = {
  XAUUSD: {
    id: 'XAUUSD',
    newsCurrencies: ['USD'],
    param: 'xauusd',
    label: 'Gold',
    group: 'Metals',
    h1: SYMBOL_CONFIGS.XAUUSD,
    h4: 'xauusd-h4',
    scalperM15: '/data/xauusd_m15_slots.json',
    scalperM5: '/data/xauusd_m5_slots.json',
    rangeUnit: 'USD',
    displayName: 'Gold / U.S. Dollar',
    dataSource: 'MT5',
    econKind: 'spread',
    econNote: null,
    engineRangeNote: null,
    footer: {
      scalperM15: 'Data: MT5 XAUUSD M15 · 110,882 bars · Static research export · As of 2026-08-10 20:15 UTC',
      scalperM5: 'Data: MT5 XAUUSD M5 · 325,160 bars · Static research export · As of 2026-08-04 16:00 UTC',
      engineH1: 'Data: MT5 XAUUSD H1/D1 · Precomputed engine export · As of 2026-08-10 19:00 UTC',
      engineH4: 'Data: MT5 XAUUSD H4/D1 · Precomputed engine export · As of 2026-07-03 16:00 UTC',
    },
    headline: 'Gold has a schedule. Volatility keeps it.',
  },
  NAS100: {
    id: 'NAS100',
    newsCurrencies: ['USD'],
    param: 'nas100',
    label: 'US100',
    group: 'Indices',
    h1: SYMBOL_CONFIGS.NAS100,
    h4: 'nas100-h4',
    scalperM15: '/data/nas100_m15_slots.json',
    scalperM5: null,
    rangeUnit: 'pts',
    displayName: 'Nasdaq 100 Index',
    dataSource: 'MT5',
    econKind: 'spread',
    econNote: null,
    engineRangeNote: null,
    footer: {
      scalperM15: 'Data: MT5 NAS100 M15 · 110,699 bars · Static research export · As of 2026-08-10 20:15 UTC',
      engineH1: 'Data: MT5 NAS100 H1/D1 · Precomputed engine export · As of 2026-08-07 22:00 UTC',
      engineH4: 'Data: MT5 NAS100 H4/D1 · Precomputed engine export · As of 2026-07-03 16:00 UTC',
    },
    headline: 'Nasdaq has a schedule. Volatility keeps it.',
  },
  US30: {
    id: 'US30',
    newsCurrencies: ['USD'],
    param: 'us30',
    label: 'US30',
    group: 'Indices',
    h1: VARIANT_CONFIGS['us30-h1'],
    h4: null,
    scalperM15: '/data/us30_m15_slots.json',
    scalperM5: null,
    rangeUnit: 'pts',
    displayName: 'Dow Jones 30 Index',
    dataSource: 'MT5',
    econKind: 'spread',
    econNote: null,
    engineRangeNote: null,
    footer: {
      scalperM15: 'Data: MT5 US30 M15 · 111,958 bars · Static research export · As of 2026-08-10 20:15 UTC',
      engineH1: 'Data: MT5 US30 H1/D1 · Precomputed engine export · As of 2026-08-10 19:00 UTC',
    },
    headline: 'US30 has a schedule. Volatility keeps it.',
  },
  GER40: {
    id: 'GER40',
    newsCurrencies: ['EUR', 'USD'],
    param: 'ger40',
    label: 'GER40',
    group: 'Indices',
    h1: VARIANT_CONFIGS['ger40-h1'],
    h4: null,
    scalperM15: '/data/ger40_m15_slots.json',
    scalperM5: null,
    rangeUnit: 'pts',
    displayName: 'DAX 40 Index',
    dataSource: 'MT5',
    econKind: 'spread',
    econNote: null,
    engineRangeNote: null,
    footer: {
      scalperM15: 'Data: MT5 GER40 M15 · 102,427 bars · Static research export · As of 2026-08-10 20:15 UTC',
      engineH1: 'Data: MT5 GER40 H1/D1 · Precomputed engine export · As of 2026-08-10 19:00 UTC',
    },
    headline: 'GER40 has a schedule. Volatility keeps it.',
  },
  EURUSD: {
    id: 'EURUSD',
    newsCurrencies: ['EUR', 'USD'],
    param: 'eurusd',
    label: 'EURUSD',
    group: 'Forex',
    h1: VARIANT_CONFIGS['eurusd-h1'],
    h4: null,
    scalperM15: '/data/eurusd_m15_slots.json',
    scalperM5: null,
    rangeUnit: 'USD',
    displayName: 'Euro / U.S. Dollar',
    dataSource: 'MT5',
    econKind: 'commission',
    econNote: 'commission $7/lot (user account)',
    engineRangeNote: null,
    footer: {
      scalperM15: 'Data: MT5 EURUSD M15 · 116,749 bars · Static research export · As of 2026-08-10 20:15 UTC',
      engineH1: 'Data: MT5 EURUSD H1/D1 · Precomputed engine export · As of 2026-08-10 19:00 UTC',
    },
    headline: 'EURUSD has a schedule. Volatility keeps it.',
  },
  GBPUSD: {
    id: 'GBPUSD',
    newsCurrencies: ['GBP', 'USD'],
    param: 'gbpusd',
    label: 'GBPUSD',
    group: 'Forex',
    h1: VARIANT_CONFIGS['gbpusd-h1'],
    h4: null,
    scalperM15: '/data/gbpusd_m15_slots.json',
    scalperM5: null,
    rangeUnit: 'USD',
    displayName: 'British Pound / U.S. Dollar',
    dataSource: 'MT5',
    econKind: 'commission',
    econNote: 'commission $7/lot (user account)',
    engineRangeNote: null,
    footer: {
      scalperM15: 'Data: MT5 GBPUSD M15 · 116,743 bars · Static research export · As of 2026-08-10 20:15 UTC',
      engineH1: 'Data: MT5 GBPUSD H1/D1 · Precomputed engine export · As of 2026-08-10 19:00 UTC',
    },
    headline: 'GBPUSD has a schedule. Volatility keeps it.',
  },
  USDJPY: {
    id: 'USDJPY',
    newsCurrencies: ['USD', 'JPY'],
    param: 'usdjpy',
    label: 'USDJPY',
    group: 'Forex',
    h1: VARIANT_CONFIGS['usdjpy-h1'],
    h4: null,
    scalperM15: '/data/usdjpy_m15_slots.json',
    scalperM5: null,
    rangeUnit: 'JPY',
    displayName: 'U.S. Dollar / Japanese Yen',
    dataSource: 'MT5',
    econKind: 'commission-analogy',
    econNote: 'commission $7/lot (user account) — applied to USDJPY by analogy',
    engineRangeNote:
      'range model weak on USDJPY: classic-GBM OOS R² = +0.010 (HGB reference 0.130; was −0.185 before the 2026-08-10 refresh) — shipped per the research verdict, honestly disclosed',
    footer: {
      scalperM15: 'Data: MT5 USDJPY M15 · 116,728 bars · Static research export · As of 2026-08-10 20:15 UTC',
      engineH1: 'Data: MT5 USDJPY H1/D1 · Precomputed engine export · As of 2026-08-10 19:00 UTC',
    },
    headline: 'USDJPY has a schedule. Volatility keeps it.',
  },
}

/** Picker order: group blocks (Metals → Indices → Forex), registry order inside. */
export const SYMBOL_GROUPS: { group: SymbolGroup; symbols: AppSymbolId[] }[] = ORDERED_GROUPS.map((group) => ({
  group,
  symbols: (Object.keys(SYMBOL_REGISTRY) as AppSymbolId[]).filter((id) => SYMBOL_REGISTRY[id].group === group),
}))

export interface SymbolState {
  /** Active market (legacy ids unchanged; Phase-15 ids added). */
  symbol: AppSymbolId
  /** Registry entry for the active market (display/provenance metadata). */
  entry: SymbolRegistryEntry
  /** Active engine config (tf-aware: H4 variant when resolved). */
  config: SymbolConfig
  /** True when the active config has a live price feed (XAUUSD H1 only). */
  isLive: boolean
  /** Active engine timeframe (H4 where the symbol has an H4 variant; H1 elsewhere). */
  tf: TimeframeId
  setSymbol: (next: AppSymbolId) => void
  setTf: (next: TimeframeId) => void
}

/** Legacy parser — kept for the H1/H4 tf wiring and backward compatibility. */
export function parseSymbolParam(raw: string | null): SymbolId {
  return raw != null && raw.toLowerCase() === 'nas100' ? 'NAS100' : 'XAUUSD'
}

/**
 * Phase-15 parser: any registry param resolves to its market; unknown/missing
 * values fall back to XAUUSD (the default). Legacy `xauusd`/`nas100` behave
 * exactly as before.
 */
export function parseAppSymbolParam(raw: string | null): AppSymbolId {
  if (raw != null) {
    const key = raw.toLowerCase()
    for (const id of Object.keys(SYMBOL_REGISTRY) as AppSymbolId[]) {
      if (SYMBOL_REGISTRY[id].param === key) return id
    }
  }
  return 'XAUUSD'
}

export function useSymbol(): SymbolState {
  const [params, setParams] = useSearchParams()
  const symbol = parseAppSymbolParam(params.get('symbol'))
  const entry = SYMBOL_REGISTRY[symbol]
  /* tf=h4 takes effect only for symbols with an H4 variant (XAUUSD/NAS100) */
  const tf: TimeframeId = entry.h4 != null && params.get('tf')?.toLowerCase() === 'h4' ? 'H4' : 'H1'
  const config = tf === 'H4' && entry.h4 != null ? VARIANT_CONFIGS[entry.h4] : entry.h1

  const setSymbol = useCallback(
    (next: AppSymbolId) => {
      setParams((prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'XAUUSD') p.delete('symbol') // default — keep URLs clean
        else p.set('symbol', SYMBOL_REGISTRY[next].param)
        if (SYMBOL_REGISTRY[next].h4 == null) p.delete('tf') // target has no H4 engine
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
        if (next === 'H1' || SYMBOL_REGISTRY[parseAppSymbolParam(p.get('symbol'))].h4 == null) p.delete('tf')
        else p.set('tf', 'h4')
        return p
      })
    },
    [setParams],
  )

  return { symbol, entry, config, isLive: config.hasLiveFeed, tf, setSymbol, setTf }
}

/* ------------------------------------------------------------------ */
/* Display helpers (respect the registry / config.priceDecimals)       */
/* ------------------------------------------------------------------ */

/** Registry lookup by engine symbol id (config.symbol) with a gold fallback. */
export function entryForSymbol(symbol: string): SymbolRegistryEntry {
  return SYMBOL_REGISTRY[symbol as AppSymbolId] ?? SYMBOL_REGISTRY.XAUUSD
}

/** Price string honoring the symbol's display decimals (XAUUSD 2, NAS100 1, FX 5/3). */
export function fmtSymPrice(v: number, config: SymbolConfig): string {
  return v.toLocaleString('en-US', {
    minimumFractionDigits: config.priceDecimals,
    maximumFractionDigits: config.priceDecimals,
  })
}

/**
 * Unit suffix for range/price-delta readouts, from the registry. Gold
 * research labels ranges in USD; indices are points; FX ranges are quote
 * currency (USD for EURUSD/GBPUSD, JPY for USDJPY). XAUUSD/NAS100 output is
 * byte-identical to the legacy hardcode.
 */
export function priceUnit(config: SymbolConfig): string {
  return entryForSymbol(config.symbol).rangeUnit
}

/**
 * Decimals for avg-range readouts in the sessions views. Gold output must
 * stay byte-identical to the research export, so XAUUSD keeps the call-site
 * fallback; NAS100 already followed config.priceDecimals (1dp) and the
 * Phase-15 markets do the same (indices 1dp, FX 5/3dp).
 */
export function rangeDigits(config: SymbolConfig, goldFallback: number): number {
  return config.symbol === 'XAUUSD' ? goldFallback : config.priceDecimals
}

/** Short human name for the instrument (Navbar / headings), from the registry. */
export function symbolDisplayName(config: SymbolConfig): string {
  return entryForSymbol(config.symbol).displayName
}

/**
 * Data-source label for chart headers / status bars, matching the Footer
 * provenance matrix. Phase 19 R3: every market is MT5 — gold's engine data
 * has been the user's MT5 broker export since v14/v16, so the label is
 * 'MT5' for every config.
 */
export function dataSourceLabel(config: SymbolConfig): string {
  return entryForSymbol(config.symbol).dataSource
}

/**
 * True when the config's sessions file is the SHARED XAUUSD H1 session
 * profile rather than the symbol's own dataset. Track B wired the five
 * Phase-15 markets to data/sessions.json as display-only metadata (nothing
 * feeds the engine), so their session BAND structure is real but the range
 * VALUES are gold's — sessions-sourced readouts must format with gold's
 * unit/digits and carry the reuse note, never pretend to be per-market
 * stats. Engine-sourced values (latest.json: expected range, ATR14, cones)
 * ARE per-market and keep config.priceDecimals via the helpers above.
 */
export function sessionsReusedFromGold(config: SymbolConfig): boolean {
  return config.symbol !== 'XAUUSD' && config.dataFiles.sessions === SYMBOL_CONFIGS.XAUUSD.dataFiles.sessions
}
