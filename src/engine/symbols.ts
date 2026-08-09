/**
 * Per-symbol engine configuration (GoldCast Phase 9 Stage 1).
 *
 * The engine itself (features/filters/indicators/predict) is symbol-agnostic:
 * the gbm_price 20-feature set is price-only and computed identically for any
 * instrument. This module centralizes everything that DIFFERS per symbol
 * (contract sizes, session bands, static data files, model modules, live-feed
 * availability) so the engine consumes a config instead of hardcoded gold
 * constants. GOLD is the default everywhere — gold outputs stay bit-identical.
 *
 * NOTE: `sessionBands` are the sessions.json display bands. The engine's
 * predict() `session` field uses vol_engine.session_name's fixed windows
 * (asia 0-6, london 7-10, ny 12-16, else off) for BOTH symbols — that is the
 * verified Python engine definition and the parity gate pins it.
 */
import { score as goldHvol } from "./modelHvol.js";
import { score as goldRange } from "./modelRange.js";
import { score as nas100Hvol } from "./modelHvolNas100.js";
import { score as nas100Range } from "./modelRangeNas100.js";
import { score as nas100H4Hvol } from "./modelHvolNas100H4.js";
import { score as nas100H4Range } from "./modelRangeNas100H4.js";
import { score as goldH4Hvol } from "./modelHvolGoldH4.js";
import { score as goldH4Range } from "./modelRangeGoldH4.js";
import { score as us30H1Hvol } from "./modelHvolUs30H1.js";
import { score as us30H1Range } from "./modelRangeUs30H1.js";
import { score as ger40H1Hvol } from "./modelHvolGer40H1.js";
import { score as ger40H1Range } from "./modelRangeGer40H1.js";
import { score as eurusdH1Hvol } from "./modelHvolEurusdH1.js";
import { score as eurusdH1Range } from "./modelRangeEurusdH1.js";
import { score as gbpusdH1Hvol } from "./modelHvolGbpusdH1.js";
import { score as gbpusdH1Range } from "./modelRangeGbpusdH1.js";
import { score as usdjpyH1Hvol } from "./modelHvolUsdjpyH1.js";
import { score as usdjpyH1Range } from "./modelRangeUsdjpyH1.js";

export type SymbolId = "XAUUSD" | "NAS100";

/**
 * Phase 15 Track B — the five newly SHIP'ed H1 markets. Kept OUT of
 * `SymbolId` so the existing switcher/H4-variant wiring (keyed on SymbolId)
 * stays byte-identical; these ids appear only on the new configs below.
 */
export type Phase15SymbolId = "US30" | "GER40" | "EURUSD" | "GBPUSD" | "USDJPY";

export interface SessionBand {
  hours: number[];
  label: string;
}

export interface SymbolConfig {
  symbol: SymbolId | Phase15SymbolId;
  /** MT5 point size (XAUUSD 0.01, NAS100 0.1). */
  pointSize: number;
  /** Pip size (XAUUSD 0.10, NAS100 1.0 = 10 points — documented convention). */
  pipSize: number;
  /** Display price decimals (metadata for the UI layer). */
  priceDecimals: number;
  /** sessions.json display bands (see header note vs engine session_name). */
  sessionBands: Record<"asia" | "london" | "ny" | "off", SessionBand>;
  /** Static data files under public/. */
  dataFiles: { bars: string; daily: string; sessions: string; latest: string };
  /** Generated model modules under src/engine/ (m2cgen tree-assembler export). */
  modelModules: { hvol: string; range: string };
  /** XAUUSD has a live price feed; NAS100 is STATIC mode (no feed — honest). */
  hasLiveFeed: boolean;
  /**
   * Engine timeframe ("H1" default; "H4" for the Phase-11 NAS100 H4 variant).
   * Optional so the existing H1 configs stay byte-identical.
   */
  timeframe?: "H1" | "H4";
  /**
   * Walk-forward OOS validation metrics (verified research numbers — additive
   * display metadata for the UI layer; nothing here feeds the engine).
   */
  validation: {
    /** hvol classifier OOS accuracy in % (rendered with 2 decimals). */
    hvolAccuracyPct: number;
    /** hvol classifier OOS AUC (rendered with hvolAucDecimals decimals). */
    hvolAuc: number;
    /** decimals used to render hvolAuc (gold 3dp, NAS100 4dp). */
    hvolAucDecimals: number;
    /** verified H1 bar count behind the OOS metrics. */
    bars: number;
    /** best direction model next-candle OOS accuracy in % (1dp display). */
    directionModelPct: number;
    /** always-up baseline next-candle accuracy in % (1dp display). */
    directionAlwaysUpPct: number;
    /** long-term drift study window label (H1 dataset range). */
    driftPeriod: string;
  };
  /** Bound scorers from modelModules (NaN->0 imputation applied by predict). */
  scoreHvol: (x: number[]) => number;
  scoreRange: (x: number[]) => number;
}

export const GOLD_CONFIG: SymbolConfig = {
  symbol: "XAUUSD",
  pointSize: 0.01,
  pipSize: 0.1,
  priceDecimals: 2,
  sessionBands: {
    asia: { hours: [0, 1, 2, 3, 4, 5, 6], label: "Asia (00-07 UTC)" },
    london: { hours: [7, 8, 9, 10], label: "London (07-11 UTC)" },
    ny: { hours: [12, 13, 14, 15, 16], label: "Overlap / New York (12-17 UTC)" },
    off: { hours: [11, 17, 18, 19, 20, 21, 22, 23], label: "Off-hours" },
  },
  dataFiles: {
    bars: "data/bars.json",
    daily: "data/daily.json",
    sessions: "data/sessions.json",
    latest: "data/latest.json",
  },
  modelModules: { hvol: "./modelHvol.js", range: "./modelRange.js" },
  hasLiveFeed: true,
  validation: {
    // Phase 17 Track D3 refresh (data extended to 2026-08-04, 27,136 bars):
    // classic-GBM pooled OOS (results/phase17_gbm_classic_xauusd_oos.csv,
    // n_test 16,278): acc 0.7999 / AUC 0.7751 — vs the HGB revalidation on the
    // same refreshed data 0.8003 / 0.7767 and the pre-refresh verified
    // 0.8008 / 0.7783 (within the 0.01-AUC no-regression gate).
    // directionModelPct/directionAlwaysUpPct remain the published Phase-1
    // direction study numbers (direction NO-SHIP, display-only drift policy).
    hvolAccuracyPct: 79.99,
    hvolAuc: 0.775,
    hvolAucDecimals: 3,
    bars: 27136,
    directionModelPct: 50.1,
    directionAlwaysUpPct: 52.1,
    driftPeriod: "2022–2026",
  },
  scoreHvol: goldHvol,
  scoreRange: goldRange,
};

export const NAS100_CONFIG: SymbolConfig = {
  symbol: "NAS100",
  pointSize: 0.1,
  pipSize: 1.0,
  priceDecimals: 1,
  sessionBands: {
    asia: { hours: [0, 1, 2, 3, 4, 5, 6], label: "Asia (00-07 UTC)" },
    london: { hours: [7, 8, 9, 10, 11], label: "London (07-12 UTC)" },
    ny: { hours: [12, 13, 14, 15, 16], label: "Overlap / New York (12-17 UTC)" },
    off: { hours: [17, 18, 19, 20, 21, 22, 23], label: "Off-hours" },
  },
  dataFiles: {
    bars: "data/bars_nas100.json",
    daily: "data/daily_nas100.json",
    sessions: "data/sessions_nas100.json",
    latest: "data/latest_nas100.json",
  },
  modelModules: { hvol: "./modelHvolNas100.js", range: "./modelRangeNas100.js" },
  hasLiveFeed: false,
  validation: {
    hvolAccuracyPct: 82.98,
    hvolAuc: 0.8726,
    hvolAucDecimals: 4,
    bars: 26798,
    directionModelPct: 51.63,
    directionAlwaysUpPct: 52.91,
    driftPeriod: "2022–2026",
  },
  scoreHvol: nas100Hvol,
  scoreRange: nas100Range,
};

export const SYMBOL_CONFIGS: Record<SymbolId, SymbolConfig> = {
  XAUUSD: GOLD_CONFIG,
  NAS100: NAS100_CONFIG,
};

export function getSymbolConfig(symbol: SymbolId): SymbolConfig {
  return SYMBOL_CONFIGS[symbol];
}

/**
 * GoldCast Phase 11 — NAS100 H4 engine variant.
 *
 * Same instrument as NAS100_CONFIG (same point/pip/decimals, same STATIC
 * mode, same EXACT H1 20-feature gbm_price set — Phase 10 verified H4 uses
 * the H1 feature set with no minofday), but scored by the H4-trained classic
 * GBM (models/gbm_classic_nas100_h4.pkl -> modelHvolNas100H4/modelRangeNas100H4)
 * over H4 bars. `sessions` reuses the NAS100 H1 session profile (display
 * metadata only; nothing here feeds the engine). `daily` reuses
 * daily_nas100.json (identical D1 source/window).
 *
 * Registered as a SEPARATE variant key ("nas100-h4") so the existing
 * XAUUSD/NAS100 configs — and their parity — stay untouched.
 */
export const NAS100_H4_CONFIG: SymbolConfig = {
  ...NAS100_CONFIG,
  timeframe: "H4",
  dataFiles: {
    bars: "data/bars_nas100_h4.json",
    daily: "data/daily_nas100.json", // reused: same D1 window as NAS100 H1
    sessions: "data/sessions_nas100.json", // reused: H1 session profile (display only)
    latest: "data/latest_nas100_h4.json",
  },
  modelModules: { hvol: "./modelHvolNas100H4.js", range: "./modelRangeNas100H4.js" },
  validation: {
    // Phase-10 verified HGB H4 numbers (results/nas100_tf_findings.md);
    // Phase-11 classic-GBM port OOS: acc 0.8318 / AUC 0.8715 (n_test 5100).
    ...NAS100_CONFIG.validation,
    hvolAccuracyPct: 83.18,
    hvolAuc: 0.8715,
    bars: 8509,
    directionModelPct: 52.35,
    directionAlwaysUpPct: 54.33,
    driftPeriod: "2021–2026",
  },
  scoreHvol: nas100H4Hvol,
  scoreRange: nas100H4Range,
};

/**
 * GoldCast Phase 12 — XAUUSD (GOLD) H4 engine variant.
 *
 * Same instrument as GOLD_CONFIG (same point/pip/decimals, same EXACT H1
 * 20-feature gbm_price set — the Phase-10 convention, re-validated for gold
 * in Phase 12: H4 uses the H1 feature set with no minofday), but scored by
 * the H4-trained classic GBM (models/gbm_classic_xauusd_h4.pkl ->
 * modelHvolGoldH4/modelRangeGoldH4) over H4 bars. `daily` reuses daily.json
 * (identical D1 source/window as gold H1). `sessions` reuses the gold H1
 * session profile (display metadata only; nothing here feeds the engine).
 *
 * *** hasLiveFeed: false — LOUD OVERRIDE *** GOLD_CONFIG has a live feed,
 * but the live feed drives GOLD H1 ONLY. The XAUUSD H4 engine is STATIC
 * (H4 bars are a fixed historical export, last bar 2026-07-03 16:00 UTC);
 * this field OVERRIDES the `true` inherited from the GOLD_CONFIG spread.
 *
 * Registered as a SEPARATE variant key ("xauusd-h4") so the existing
 * XAUUSD/NAS100/NAS100-H4 configs — and their parity — stay untouched.
 */
export const XAUUSD_H4_CONFIG: SymbolConfig = {
  ...GOLD_CONFIG,
  timeframe: "H4",
  dataFiles: {
    bars: "data/bars_xauusd_h4.json",
    daily: "data/daily.json", // reused: same D1 window as gold H1
    sessions: "data/sessions.json", // reused: H1 session profile (display only)
    latest: "data/latest_xauusd_h4.json",
  },
  modelModules: { hvol: "./modelHvolGoldH4.js", range: "./modelRangeGoldH4.js" },
  // STATIC — live feed drives gold H1 only; overrides GOLD_CONFIG's true.
  hasLiveFeed: false,
  validation: {
    // Phase-12 classic-GBM H4 OOS (results/phase12_gbm_classic_xauusd_h4_oos.csv,
    // n_test 4182): hvol acc 0.7614 / AUC 0.7352 (HGB reference 0.7585/0.7267).
    // Direction T+1 (Phase-12 research): Model C 52.21% vs always_up 53.98%
    // (best baseline htf_trend 54.27%) — NO-SHIP, display-only drift policy.
    ...GOLD_CONFIG.validation,
    hvolAccuracyPct: 76.14,
    hvolAuc: 0.735,
    bars: 6971,
    directionModelPct: 52.21,
    directionAlwaysUpPct: 53.98,
    driftPeriod: "2022–2026",
  },
  scoreHvol: goldH4Hvol,
  scoreRange: goldH4Range,
};

/**
 * GoldCast Phase 15 Track B — five newly SHIP'ed H1 engines.
 *
 * Each uses the EXACT H1 20-feature gbm_price set (price-only, computed
 * identically for any instrument) scored by its own H1-trained classic GBM
 * (models/gbm_classic_<sym>_h1.pkl -> modelHvol<Sym>H1/modelRange<Sym>H1,
 * m2cgen tree-assembler export, same path as gold/NAS100). Validation
 * numbers below are the Phase-15 classic-GBM pooled-OOS numbers from
 * results/phase15_gbm_classic_<sym>_h1_oos.csv (NOT the HGB research
 * reference). Direction is NO-SHIP on all five (display-only drift policy;
 * directionModelPct/directionAlwaysUpPct are the Phase-15 research numbers,
 * display metadata only).
 *
 * ALL FIVE ARE STATIC: hasLiveFeed false (fixed historical exports; EURUSD
 * H1 ends 2026-07-03 16:00 UTC, the other four end 2026-08-04 16:00 UTC).
 * `sessions` reuses the gold H1 session profile (display metadata only;
 * nothing here feeds the engine — the engine's session field is pinned by
 * the parity gate to vol_engine.session_name's fixed windows).
 *
 * Registered as SEPARATE variant keys ("<sym>-h1") so the existing
 * XAUUSD/NAS100/H4 configs — and their parity — stay untouched. The UI
 * symbol switcher (keyed on SymbolId) does not surface these yet; Track C
 * owns the registry/switcher redesign.
 */
export const US30_H1_CONFIG: SymbolConfig = {
  symbol: "US30",
  pointSize: 0.1, // Track A verified (data, not the 1.0 prior)
  pipSize: 1.0,   // 1 index point = 10 MT5 points (mirrors gold)
  priceDecimals: 1,
  sessionBands: GOLD_CONFIG.sessionBands, // display only
  timeframe: "H1",
  dataFiles: {
    bars: "data/bars_us30_h1.json",
    daily: "data/daily_us30.json",
    sessions: "data/sessions.json", // reused: display only
    latest: "data/latest_us30_h1.json",
  },
  modelModules: { hvol: "./modelHvolUs30H1.js", range: "./modelRangeUs30H1.js" },
  hasLiveFeed: false,
  validation: {
    // Phase-15 classic-GBM OOS (n_test 16434): acc 0.8320 / AUC 0.8887
    // (HGB reference 0.8316 / 0.8876).
    hvolAccuracyPct: 83.20,
    hvolAuc: 0.8887,
    hvolAucDecimals: 4,
    bars: 27396,
    directionModelPct: 50.62,     // research Model C T+1 — NO-SHIP
    directionAlwaysUpPct: 51.92,
    driftPeriod: "2022–2026",
  },
  scoreHvol: us30H1Hvol,
  scoreRange: us30H1Range,
};

export const GER40_H1_CONFIG: SymbolConfig = {
  symbol: "GER40",
  pointSize: 0.1, // Track A verified
  pipSize: 1.0,
  priceDecimals: 1,
  sessionBands: GOLD_CONFIG.sessionBands, // display only
  timeframe: "H1",
  dataFiles: {
    bars: "data/bars_ger40_h1.json",
    daily: "data/daily_ger40.json",
    sessions: "data/sessions.json", // reused: display only
    latest: "data/latest_ger40_h1.json",
  },
  modelModules: { hvol: "./modelHvolGer40H1.js", range: "./modelRangeGer40H1.js" },
  hasLiveFeed: false,
  validation: {
    // Phase-15 classic-GBM OOS (n_test 15198): acc 0.7965 / AUC 0.8353
    // (HGB reference 0.7982 / 0.8345).
    hvolAccuracyPct: 79.65,
    hvolAuc: 0.8353,
    hvolAucDecimals: 4,
    bars: 25332,
    directionModelPct: 50.41,     // research Model C T+1 — NO-SHIP
    directionAlwaysUpPct: 52.42,
    driftPeriod: "2022–2026",
  },
  scoreHvol: ger40H1Hvol,
  scoreRange: ger40H1Range,
};

export const EURUSD_H1_CONFIG: SymbolConfig = {
  symbol: "EURUSD",
  pointSize: 0.00001, // Track A verified (5-digit quoting)
  pipSize: 0.0001,    // 1 pip = 10 points for 5-digit FX
  priceDecimals: 5,
  sessionBands: GOLD_CONFIG.sessionBands, // display only
  timeframe: "H1",
  dataFiles: {
    bars: "data/bars_eurusd_h1.json",
    daily: "data/daily_eurusd.json",
    sessions: "data/sessions.json", // reused: display only
    latest: "data/latest_eurusd_h1.json",
  },
  modelModules: { hvol: "./modelHvolEurusdH1.js", range: "./modelRangeEurusdH1.js" },
  hasLiveFeed: false,
  validation: {
    // Phase-15 classic-GBM OOS (n_test 16805): acc 0.7989 / AUC 0.8303
    // (HGB reference 0.8032 / 0.8349).
    hvolAccuracyPct: 79.89,
    hvolAuc: 0.8303,
    hvolAucDecimals: 4,
    bars: 28010,
    directionModelPct: 48.63,     // research Model C T+1 — NO-SHIP
    directionAlwaysUpPct: 49.59,
    driftPeriod: "2022–2026",
  },
  scoreHvol: eurusdH1Hvol,
  scoreRange: eurusdH1Range,
};

export const GBPUSD_H1_CONFIG: SymbolConfig = {
  symbol: "GBPUSD",
  pointSize: 0.00001,
  pipSize: 0.0001,
  priceDecimals: 5,
  sessionBands: GOLD_CONFIG.sessionBands, // display only
  timeframe: "H1",
  dataFiles: {
    bars: "data/bars_gbpusd_h1.json",
    daily: "data/daily_gbpusd.json",
    sessions: "data/sessions.json", // reused: display only
    latest: "data/latest_gbpusd_h1.json",
  },
  modelModules: { hvol: "./modelHvolGbpusdH1.js", range: "./modelRangeGbpusdH1.js" },
  hasLiveFeed: false,
  validation: {
    // Phase-15 classic-GBM OOS (n_test 17118): acc 0.7947 / AUC 0.8374
    // (HGB reference 0.7945 / 0.8409).
    hvolAccuracyPct: 79.47,
    hvolAuc: 0.8374,
    hvolAucDecimals: 4,
    bars: 28538,
    directionModelPct: 48.66,     // research Model C T+1 — NO-SHIP
    directionAlwaysUpPct: 49.81,
    driftPeriod: "2022–2026",
  },
  scoreHvol: gbpusdH1Hvol,
  scoreRange: gbpusdH1Range,
};

export const USDJPY_H1_CONFIG: SymbolConfig = {
  symbol: "USDJPY",
  pointSize: 0.001, // Track A verified (3-digit quoting)
  pipSize: 0.01,    // 1 pip = 10 points for 3-digit FX
  priceDecimals: 3,
  sessionBands: GOLD_CONFIG.sessionBands, // display only
  timeframe: "H1",
  dataFiles: {
    bars: "data/bars_usdjpy_h1.json",
    daily: "data/daily_usdjpy.json",
    sessions: "data/sessions.json", // reused: display only
    latest: "data/latest_usdjpy_h1.json",
  },
  modelModules: { hvol: "./modelHvolUsdjpyH1.js", range: "./modelRangeUsdjpyH1.js" },
  hasLiveFeed: false,
  validation: {
    // Phase-15 classic-GBM OOS (n_test 17118): acc 0.7784 / AUC 0.7683
    // (HGB reference 0.7794 / 0.7685). Range R2 is weak on USDJPY
    // (classic -0.1852 vs HGB 0.1255) — shipped per Track-A SHIP verdict
    // but honestly disclosed.
    hvolAccuracyPct: 77.84,
    hvolAuc: 0.7683,
    hvolAucDecimals: 4,
    bars: 28538,
    directionModelPct: 50.69,     // research Model C T+1 — NO-SHIP
    directionAlwaysUpPct: 51.54,
    driftPeriod: "2022–2026",
  },
  scoreHvol: usdjpyH1Hvol,
  scoreRange: usdjpyH1Range,
};

/** Timeframe/variant engine configs keyed separately from SYMBOL_CONFIGS. */
export const VARIANT_CONFIGS: Record<
  "nas100-h4" | "xauusd-h4" | "us30-h1" | "ger40-h1" | "eurusd-h1" | "gbpusd-h1" | "usdjpy-h1",
  SymbolConfig
> = {
  "nas100-h4": NAS100_H4_CONFIG,
  "xauusd-h4": XAUUSD_H4_CONFIG,
  "us30-h1": US30_H1_CONFIG,
  "ger40-h1": GER40_H1_CONFIG,
  "eurusd-h1": EURUSD_H1_CONFIG,
  "gbpusd-h1": GBPUSD_H1_CONFIG,
  "usdjpy-h1": USDJPY_H1_CONFIG,
};
