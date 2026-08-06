/**
 * EXACT TypeScript port of backtest_phase2.build_features for the H1
 * `gbm_price` 20-feature set (same ORDER as models/feature_meta.json /
 * feature_groups(X, "H1") price_feats):
 *
 *   8 filter scores (FILTER_NAMES order)
 *   + rsi14, log_atr14, adx14, bb_bandwidth, macd_hist_raw, ret1, ret3, rv20
 *   + hour_sin, hour_cos, dow_sin, dow_cos
 */
import { rsi, bollinger, macd, rollingStd } from "./indicators";
import { computeFilters, type FilterScores } from "./filters";
import { hourOf, dowOf, type Bar, type DailyBar } from "./bars";

export const FEATURE_NAMES = [
  "ema_stack",
  "rsi_momentum",
  "macd_hist",
  "market_structure",
  "bb_squeeze",
  "session_filter",
  "mtf_daily_trend",
  "candle_momentum",
  "rsi14",
  "log_atr14",
  "adx14",
  "bb_bandwidth",
  "macd_hist_raw",
  "ret1",
  "ret3",
  "rv20",
  "hour_sin",
  "hour_cos",
  "dow_sin",
  "dow_cos",
] as const;

export interface FeatureFrame {
  names: readonly string[];
  /** rows[i] = 20-feature vector for bar i (NaN during warmup, like pandas). */
  rows: number[][];
  scores: FilterScores;
}

/** Build the 20-feature matrix for H1 bars (port of build_features, H1). */
export function buildFeatures(bars: Bar[], daily: DailyBar[]): FeatureFrame {
  const n = bars.length;
  const close = bars.map((b) => b.c);
  const scores = computeFilters(bars, daily);

  const cols: number[][] = [];

  // 8 filter scores in FILTER_NAMES order
  cols.push(scores.ema_stack);
  cols.push(scores.rsi_momentum);
  cols.push(scores.macd_hist);
  cols.push(scores.market_structure);
  cols.push(scores.bb_squeeze);
  cols.push(scores.session_filter);
  cols.push(scores.mtf_daily_trend);
  cols.push(scores.candle_momentum);

  // raw price-derived features
  cols.push(rsi(close, 14)); // rsi14
  const logAtr = scores.atr.map((a) => (a === 0 ? NaN : Math.log(a)));
  cols.push(logAtr); // log_atr14
  cols.push(scores.adx.slice()); // adx14
  const { mid, upper, lower } = bollinger(close, 20, 2.0);
  const bbw = mid.map((m, i) =>
    Number.isNaN(m) || m === 0 ? NaN : (upper[i] - lower[i]) / m
  );
  cols.push(bbw); // bb_bandwidth
  cols.push(macd(close).hist); // macd_hist_raw
  const logc = close.map((c) => Math.log(c));
  const ret1 = new Array<number>(n).fill(NaN);
  const ret3 = new Array<number>(n).fill(NaN);
  for (let i = 1; i < n; i++) ret1[i] = logc[i] - logc[i - 1];
  for (let i = 3; i < n; i++) ret3[i] = logc[i] - logc[i - 3];
  cols.push(ret1); // ret1
  cols.push(ret3); // ret3
  cols.push(rollingStd(ret1, 20)); // rv20 (pandas rolling.std -> ddof=1)

  // time encodings (UTC hour / Monday=0 dow, like pandas index.hour/dayofweek)
  const hourSin = new Array<number>(n);
  const hourCos = new Array<number>(n);
  const dowSin = new Array<number>(n);
  const dowCos = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const hr = hourOf(bars[i].t);
    const dw = dowOf(bars[i].t);
    hourSin[i] = Math.sin((2 * Math.PI * hr) / 24.0);
    hourCos[i] = Math.cos((2 * Math.PI * hr) / 24.0);
    dowSin[i] = Math.sin((2 * Math.PI * dw) / 7.0);
    dowCos[i] = Math.cos((2 * Math.PI * dw) / 7.0);
  }
  cols.push(hourSin, hourCos, dowSin, dowCos);

  const rows: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(FEATURE_NAMES.length);
    for (let j = 0; j < cols.length; j++) row[j] = cols[j][i];
    rows[i] = row;
  }
  return { names: FEATURE_NAMES, rows, scores };
}
