/**
 * EXACT TypeScript port of goldcast_phase1/src/filters.py (H1 path).
 *
 * Each filter returns number[] scores in [-1, 1] with NaN during warmup,
 * matching the pandas semantics of the Python original.
 */
import {
  ema,
  rsi,
  macd,
  atr,
  adx,
  bollinger,
  rollingQuantile,
} from "./indicators";
import { hourOf, dayKey, type Bar, type DailyBar } from "./bars";

export interface FilterScores {
  ema_stack: number[];
  rsi_momentum: number[];
  macd_hist: number[];
  market_structure: number[];
  bb_squeeze: number[];
  session_filter: number[];
  mtf_daily_trend: number[];
  candle_momentum: number[];
  /** Not a filter — carried for regime reporting / log_atr14 (scores["atr"]). */
  atr: number[];
  /** Not a filter — carried for regime reporting / adx14 (scores["adx"]). */
  adx: number[];
}

function clip1(v: number): number {
  if (Number.isNaN(v)) return NaN;
  return v > 1 ? 1 : v < -1 ? -1 : v;
}

function sign(v: number): number {
  if (Number.isNaN(v)) return NaN;
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** (n_bull - n_bear)/3 over C>EMA20, EMA20>EMA50, EMA50>EMA200. Warmup 200. */
export function emaStack(close: ArrayLike<number>): number[] {
  const e20 = ema(close, 20);
  const e50 = ema(close, 50);
  const e200 = ema(close, 200);
  const n = close.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = 200; i < n; i++) {
    const bull =
      (close[i] > e20[i] ? 1 : 0) +
      (e20[i] > e50[i] ? 1 : 0) +
      (e50[i] > e200[i] ? 1 : 0);
    const bear =
      (close[i] < e20[i] ? 1 : 0) +
      (e20[i] < e50[i] ? 1 : 0) +
      (e50[i] < e200[i] ? 1 : 0);
    out[i] = clip1((bull - bear) / 3.0);
  }
  return out;
}

/** Regime label from ADX: >25 trending, <20 ranging, else neutral (NaN -> neutral). */
export function regimeLabel(a: number): "trending" | "ranging" | "neutral" {
  if (!Number.isNaN(a) && a > 25) return "trending";
  if (!Number.isNaN(a) && a < 20) return "ranging";
  return "neutral";
}

/** Regime-aware RSI momentum: trend-follow when trending, fade when ranging. */
export function rsiMomentum(
  close: ArrayLike<number>,
  adxSeries: ArrayLike<number>
): number[] {
  const r = rsi(close, 14);
  const n = close.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(r[i]) || Number.isNaN(adxSeries[i])) {
      out[i] = NaN;
      continue;
    }
    const base = clip1((r[i] - 50.0) / 50.0);
    const reg = regimeLabel(adxSeries[i]);
    const v = reg === "trending" ? base : reg === "ranging" ? -base : 0.5 * base;
    out[i] = clip1(v);
  }
  return out;
}

/** tanh(hist / (0.1 * ATR)). NaN where ATR is NaN (or 0). */
export function macdHist(
  close: ArrayLike<number>,
  atrSeries: ArrayLike<number>
): number[] {
  const { hist } = macd(close);
  const n = close.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const norm = 0.1 * atrSeries[i];
    if (Number.isNaN(atrSeries[i]) || norm === 0) {
      out[i] = NaN;
      continue;
    }
    out[i] = clip1(Math.tanh(hist[i] / norm));
  }
  return out;
}

/**
 * 5-bar fractal swing structure; confirmation of a swing at bar i is written
 * to bar i+2 (no look-ahead). HH+HL -> +1, LH+LL -> -1, single -> ±0.5.
 * Score held constant between confirmations. First 10 bars NaN.
 */
export function marketStructure(
  high: ArrayLike<number>,
  low: ArrayLike<number>
): number[] {
  const n = high.length;
  const confIdx: number[] = [];
  const swingType: string[] = [];
  const swingVal: number[] = [];
  for (let i = 2; i < n - 2; i++) {
    if (
      high[i] > high[i - 1] &&
      high[i] > high[i - 2] &&
      high[i] >= high[i + 1] &&
      high[i] >= high[i + 2]
    ) {
      confIdx.push(i + 2);
      swingType.push("H");
      swingVal.push(high[i]);
    }
    if (
      low[i] < low[i - 1] &&
      low[i] < low[i - 2] &&
      low[i] <= low[i + 1] &&
      low[i] <= low[i + 2]
    ) {
      confIdx.push(i + 2);
      swingType.push("L");
      swingVal.push(low[i]);
    }
  }

  const score = new Array<number>(n).fill(0);
  const lastHi: number[] = [];
  const lastLo: number[] = [];
  let cur = 0.0;
  let k = 0; // pointer into confIdx (strictly increasing)
  for (let j = 0; j < n; j++) {
    while (k < confIdx.length && confIdx[k] === j) {
      const t = swingType[k];
      const v = swingVal[k];
      if (t === "H") {
        lastHi.push(v);
        if (lastHi.length > 2) lastHi.shift();
      } else {
        lastLo.push(v);
        if (lastLo.length > 2) lastLo.shift();
      }
      if (lastHi.length === 2 && lastLo.length === 2) {
        const hh = lastHi[1] > lastHi[0];
        const lh = lastHi[1] < lastHi[0];
        const hl = lastLo[1] > lastLo[0];
        const ll = lastLo[1] < lastLo[0];
        if (hh && hl) cur = 1.0;
        else if (lh && ll) cur = -1.0;
        else if (hh || hl) cur = 0.5;
        else if (lh || ll) cur = -0.5;
        else cur = 0.0;
      }
      k++;
    }
    score[j] = cur;
  }
  const out = score.map(clip1);
  for (let i = 0; i < Math.min(10, n); i++) out[i] = NaN;
  return out;
}

/**
 * BB squeeze: bandwidth in lowest 20th pct of trailing 120 values (PAST ONLY,
 * shift(1) — the rolling window excludes the current bar) -> sign(C-mid)*0.5.
 */
export function bbSqueeze(close: ArrayLike<number>, window = 120): number[] {
  const { mid, upper, lower } = bollinger(close, 20, 2.0);
  const n = close.length;
  const bw = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(mid[i]) || mid[i] === 0) {
      bw[i] = NaN;
    } else {
      bw[i] = (upper[i] - lower[i]) / mid[i];
    }
  }
  // thresh[i] = quantile over bw[i-window .. i-1] == shift(1).rolling(window)
  const thresh = rollingQuantile(bw, window, 0.2);
  const out = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(bw[i]) || Number.isNaN(thresh[i])) {
      out[i] = NaN;
      continue;
    }
    const inSqueeze = bw[i] < thresh[i];
    const v = inSqueeze ? sign(close[i] - mid[i]) * 0.5 : 0.0;
    out[i] = clip1(v);
  }
  return out;
}

/** H1 session filter: sign of 3-bar momentum scaled by session weight. */
export function sessionFilter(bars: Bar[]): number[] {
  const n = bars.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = 3; i < n; i++) {
    const mom = bars[i].c - bars[i - 3].c;
    const h = hourOf(bars[i].t);
    let w: number;
    if (h >= 7 && h <= 10) w = 0.3;
    else if (h >= 12 && h <= 16) w = 0.3;
    else if (h >= 0 && h <= 6) w = 0.1;
    else w = 0.15;
    out[i] = clip1(sign(mom) * w);
  }
  return out;
}

/** Daily trend: (n_bull - n_bear)/3 * 0.8 over C>EMA20, EMA20>EMA50. Warmup 50. */
function trendFromHtf(dailyClose: ArrayLike<number>): number[] {
  const e20 = ema(dailyClose, 20);
  const e50 = ema(dailyClose, 50);
  const n = dailyClose.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = 50; i < n; i++) {
    const bull = (dailyClose[i] > e20[i] ? 1 : 0) + (e20[i] > e50[i] ? 1 : 0);
    const bear = (dailyClose[i] < e20[i] ? 1 : 0) + (e20[i] < e50[i] ? 1 : 0);
    out[i] = clip1(((bull - bear) / 3.0) * 0.8);
  }
  return out;
}

/**
 * Map daily trend onto H1 bars using the PREVIOUS COMPLETED daily bar:
 * for an H1 bar on day D use the trend of the daily bar one position before
 * the daily bar of day D (pandas: bar_day.map(trend_by_day.shift(1))).
 * Days missing from the daily series map to NaN.
 */
export function mtfDailyTrend(bars: Bar[], daily: DailyBar[]): number[] {
  const trend = trendFromHtf(daily.map((d) => d.c));
  const prevByDay = new Map<string, number>();
  for (let i = 0; i < daily.length; i++) {
    prevByDay.set(dayKey(daily[i].t), i - 1 >= 0 ? trend[i - 1] : NaN);
  }
  return bars.map((b) => {
    const v = prevByDay.get(dayKey(b.t));
    return v === undefined ? NaN : v;
  });
}

/** (C - C[-3]) / ATR14, tanh-normalized. First 3 bars NaN; NaN where ATR NaN/0. */
export function candleMomentum(
  close: ArrayLike<number>,
  atrSeries: ArrayLike<number>
): number[] {
  const n = close.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = 3; i < n; i++) {
    const a = atrSeries[i];
    if (Number.isNaN(a) || a === 0) {
      out[i] = NaN;
      continue;
    }
    out[i] = clip1(Math.tanh((close[i] - close[i - 3]) / a));
  }
  return out;
}

/** All H1 filter scores (port of compute_filters(df, "H1", daily_close=...)). */
export function computeFilters(bars: Bar[], daily: DailyBar[]): FilterScores {
  const high = bars.map((b) => b.h);
  const low = bars.map((b) => b.l);
  const close = bars.map((b) => b.c);
  const atrS = atr(high, low, close, 14);
  const adxS = adx(high, low, close, 14);
  return {
    ema_stack: emaStack(close),
    rsi_momentum: rsiMomentum(close, adxS),
    macd_hist: macdHist(close, atrS),
    market_structure: marketStructure(high, low),
    bb_squeeze: bbSqueeze(close),
    session_filter: sessionFilter(bars),
    mtf_daily_trend: mtfDailyTrend(bars, daily),
    candle_momentum: candleMomentum(close, atrS),
    atr: atrS,
    adx: adxS,
  };
}
