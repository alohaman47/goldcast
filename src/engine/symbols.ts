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

export type SymbolId = "XAUUSD" | "NAS100";

export interface SessionBand {
  hours: number[];
  label: string;
}

export interface SymbolConfig {
  symbol: SymbolId;
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
    hvolAccuracyPct: 80.08,
    hvolAuc: 0.778,
    hvolAucDecimals: 3,
    bars: 26836,
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

/** Timeframe/variant engine configs keyed separately from SYMBOL_CONFIGS. */
export const VARIANT_CONFIGS: Record<"nas100-h4", SymbolConfig> = {
  "nas100-h4": NAS100_H4_CONFIG,
};
