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
