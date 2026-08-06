/**
 * EXACT TypeScript port of goldcast_phase1/src/indicators.py.
 *
 * All series are plain number[] with NaN for pandas-NaN. Warmup semantics and
 * Wilder smoothing (EMA with alpha = 1/n) match the Python code, including the
 * ewm(adjust=False) update order `(1 - alpha) * prev + alpha * x` (mirrors the
 * pandas Cython kernel so results are bit-comparable within fp tolerance).
 *
 * ewm NaN semantics needed here: only LEADING NaNs occur in the ported call
 * sites (e.g. gain/loss from diff()); pandas skips them and seeds at the first
 * non-NaN observation. That is what `ewmAdjustFalse` implements.
 */

/** Standard EMA (adjust=False, alpha = 2/(span+1)). Leading NaNs are skipped. */
export function ema(x: ArrayLike<number>, span: number): number[] {
  return ewmAdjustFalse(x, 2.0 / (span + 1));
}

/** Wilder's smoothing: EMA with alpha = 1/n (adjust=False). */
export function wilderEma(x: ArrayLike<number>, n: number): number[] {
  return ewmAdjustFalse(x, 1.0 / n);
}

function ewmAdjustFalse(x: ArrayLike<number>, alpha: number): number[] {
  const n = x.length;
  const out = new Array<number>(n).fill(NaN);
  const oldWt = 1.0 - alpha;
  let prev = NaN;
  for (let i = 0; i < n; i++) {
    const v = x[i];
    if (Number.isNaN(v)) {
      out[i] = prev; // pandas: no observation -> weighted avg unchanged
      continue;
    }
    prev = Number.isNaN(prev) ? v : oldWt * prev + alpha * v;
    out[i] = prev;
  }
  return out;
}

/** RSI with Wilder smoothing. First `n` values are NaN. avg_loss == 0 -> 100. */
export function rsi(close: ArrayLike<number>, n = 14): number[] {
  const len = close.length;
  const gain = new Array<number>(len).fill(NaN);
  const loss = new Array<number>(len).fill(NaN);
  for (let i = 1; i < len; i++) {
    const d = close[i] - close[i - 1];
    gain[i] = d > 0 ? d : 0.0;
    loss[i] = d < 0 ? -d : 0.0;
  }
  const avgGain = wilderEma(gain, n);
  const avgLoss = wilderEma(loss, n);
  const out = new Array<number>(len).fill(NaN);
  for (let i = 0; i < len; i++) {
    if (Number.isNaN(avgGain[i]) || Number.isNaN(avgLoss[i])) {
      out[i] = NaN;
      continue;
    }
    let v: number;
    if (avgLoss[i] !== 0) {
      const rs = avgGain[i] / avgLoss[i];
      v = 100.0 - 100.0 / (1.0 + rs);
    } else {
      v = NaN; // rs = ag/0 -> inf or NaN; both collapse to the where() below
    }
    // pandas: out.where(avg_loss != 0, 100.0)
    out[i] = avgLoss[i] !== 0 ? v : 100.0;
  }
  for (let i = 0; i < Math.min(n, len); i++) out[i] = NaN;
  return out;
}

/** MACD line, signal line, histogram (12/26/9, all adjust=False EMAs). */
export function macd(
  close: ArrayLike<number>,
  fast = 12,
  slow = 26,
  signal = 9
): { macdLine: number[]; signalLine: number[]; hist: number[] } {
  const ef = ema(close, fast);
  const es = ema(close, slow);
  const macdLine = ef.map((v, i) => v - es[i]);
  const signalLine = ema(macdLine, signal);
  const hist = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, hist };
}

/** True Range series (pandas .max(axis=1) skips NaN -> tr[0] = h - l). */
export function trueRange(
  high: ArrayLike<number>,
  low: ArrayLike<number>,
  close: ArrayLike<number>
): number[] {
  const n = high.length;
  const tr = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const a = high[i] - low[i];
    if (i === 0) {
      tr[i] = a;
      continue;
    }
    const pc = close[i - 1];
    const b = Math.abs(high[i] - pc);
    const c = Math.abs(low[i] - pc);
    tr[i] = Math.max(a, b, c);
  }
  return tr;
}

/** ATR with Wilder smoothing. First `n` values NaN. */
export function atr(
  high: ArrayLike<number>,
  low: ArrayLike<number>,
  close: ArrayLike<number>,
  n = 14
): number[] {
  const out = wilderEma(trueRange(high, low, close), n);
  for (let i = 0; i < Math.min(n, out.length); i++) out[i] = NaN;
  return out;
}

/** ADX with Wilder smoothing. First `2*n` values NaN. */
export function adx(
  high: ArrayLike<number>,
  low: ArrayLike<number>,
  close: ArrayLike<number>,
  n = 14
): number[] {
  const len = high.length;
  const plusDm = new Array<number>(len).fill(0);
  const minusDm = new Array<number>(len).fill(0);
  for (let i = 1; i < len; i++) {
    const up = high[i] - high[i - 1];
    const down = low[i - 1] - low[i];
    plusDm[i] = up > down && up > 0 ? up : 0.0;
    minusDm[i] = down > up && down > 0 ? down : 0.0;
  }
  const atrW = wilderEma(trueRange(high, low, close), n);
  const plusDi = new Array<number>(len).fill(NaN);
  const minusDi = new Array<number>(len).fill(NaN);
  const pSm = wilderEma(plusDm, n);
  const mSm = wilderEma(minusDm, n);
  for (let i = 0; i < len; i++) {
    plusDi[i] = (100.0 * pSm[i]) / atrW[i];
    minusDi[i] = (100.0 * mSm[i]) / atrW[i];
  }
  const dx = new Array<number>(len).fill(NaN);
  for (let i = 0; i < len; i++) {
    const s = plusDi[i] + minusDi[i];
    dx[i] = s !== 0 ? (100.0 * Math.abs(plusDi[i] - minusDi[i])) / s : 0.0;
  }
  const out = wilderEma(dx, n);
  for (let i = 0; i < Math.min(2 * n, len); i++) out[i] = NaN;
  return out;
}

/** Bollinger Bands: mid (SMA20), upper, lower (k * POPULATION std, ddof=0). */
export function bollinger(
  close: ArrayLike<number>,
  n = 20,
  k = 2.0
): { mid: number[]; upper: number[]; lower: number[] } {
  const len = close.length;
  const mid = new Array<number>(len).fill(NaN);
  const upper = new Array<number>(len).fill(NaN);
  const lower = new Array<number>(len).fill(NaN);
  for (let i = n - 1; i < len; i++) {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += close[j];
    const m = s / n;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const d = close[j] - m;
      v += d * d;
    }
    const sd = Math.sqrt(v / n); // ddof=0
    mid[i] = m;
    upper[i] = m + k * sd;
    lower[i] = m - k * sd;
  }
  return { mid, upper, lower };
}

/** Rolling SAMPLE std (ddof=1), NaN until `window` non-NaN values available. */
export function rollingStd(x: ArrayLike<number>, window: number): number[] {
  const len = x.length;
  const out = new Array<number>(len).fill(NaN);
  for (let i = window - 1; i < len; i++) {
    let cnt = 0;
    let s = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const v = x[j];
      if (!Number.isNaN(v)) {
        s += v;
        cnt++;
      }
    }
    if (cnt < window) continue; // pandas default min_periods=window
    const m = s / cnt;
    let vv = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const d = x[j] - m;
      vv += d * d;
    }
    out[i] = Math.sqrt(vv / (cnt - 1)); // ddof=1 (pandas rolling.std default)
  }
  return out;
}

/**
 * Rolling quantile with pandas 'linear' interpolation, min_periods=window.
 * Window covers x[i-window .. i-1] (caller applies the shift(1) by indexing).
 */
export function rollingQuantile(
  x: ArrayLike<number>,
  window: number,
  q: number
): number[] {
  const len = x.length;
  const out = new Array<number>(len).fill(NaN);
  const buf = new Array<number>(window);
  for (let i = window; i < len; i++) {
    let ok = true;
    for (let j = 0; j < window; j++) {
      const v = x[i - window + j];
      if (Number.isNaN(v)) {
        ok = false;
        break;
      }
      buf[j] = v;
    }
    if (!ok) continue;
    const s = Array.from(buf).sort((a, b) => a - b);
    const h = q * (window - 1);
    const lo = Math.floor(h);
    const frac = h - lo;
    out[i] = lo + 1 < window ? s[lo] + frac * (s[lo + 1] - s[lo]) : s[lo];
  }
  return out;
}
