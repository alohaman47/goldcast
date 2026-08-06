/**
 * EXACT TypeScript port of vol_engine.predict() (goldcast_phase1/src/vol_engine.py),
 * driving the classic-GBM JS models exported via m2cgen (modelHvol.js / modelRange.js).
 *
 * Inputs: recent H1 bars (>= MIN_BARS), daily bars, optional forming live bar.
 * Output: same JSON shape as Python predict().
 *
 * DEVIATION (documented, mirrors src/retrain_gbm_classic.py): classic GBM has no
 * native NaN support, so NaN features are imputed to 0.0 before scoring — the
 * exact same imputation used when training models/gbm_classic.pkl.
 */
import { buildFeatures } from "./features";
import { regimeLabel } from "./filters";
import { ema } from "./indicators";
import { dayKey, hourOf, type Bar, type DailyBar } from "./bars";
import { score as scoreHvolModel } from "./modelHvol.js";
import { score as scoreRangeModel } from "./modelRange.js";

export const MIN_BARS = 250;
export const ENGINE_VERSION = "goldcast-gbm-classic/6.0 (live-engine port)";

export interface PredictResult {
  asof: string;
  session: string;
  regime: string;
  p_high_vol: number;
  expected_range_atr: number;
  expected_range_price: number;
  cone: { T1: { half_width: number }; T2: { half_width: number }; T3: { half_width: number } };
  direction_policy: "drift";
  drift_sign: 1 | -1;
  confidence: number;
}

/** asia 0-6, london 7-10, ny 12-16 (Phase-1 session windows), else off. */
export function sessionName(hour: number): string {
  if (hour >= 0 && hour <= 6) return "asia";
  if (hour >= 7 && hour <= 10) return "london";
  if (hour >= 12 && hour <= 16) return "ny";
  return "off";
}

/** 0-5 conviction from |p - 0.5| in 0.05-wide bins (Python int() truncation). */
export function confidenceFromProb(p: number): number {
  return Math.min(5, Math.trunc(Math.abs(p - 0.5) / 0.05));
}

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

export interface PredictOptions {
  /** Optional forming (incomplete) live bar: replaces the last bar if same
   *  timestamp, otherwise appended. Python predict() has no such input; the
   *  parity path never uses it (documented extension). */
  liveBar?: Bar;
  /** Injectable scorers (tests/parity). Defaults to the shipped JS models. */
  scoreHvol?: (x: number[]) => number;
  scoreRange?: (x: number[]) => number;
}

/** Predict for the LAST bar of `bars` (>= MIN_BARS rows, features <= t). */
export function predict(
  barsIn: Bar[],
  dailyIn: DailyBar[],
  opts: PredictOptions = {}
): PredictResult {
  let bars = barsIn;
  if (opts.liveBar) {
    const lb = opts.liveBar;
    bars =
      barsIn.length > 0 && barsIn[barsIn.length - 1].t === lb.t
        ? [...barsIn.slice(0, -1), lb]
        : [...barsIn, lb];
  }
  if (bars.length < MIN_BARS) {
    throw new Error(`predict() needs >= ${MIN_BARS} H1 bars, got ${bars.length}`);
  }

  const lastDay = dayKey(bars[bars.length - 1].t);
  // causal guard: only daily bars with day <= last bar's day
  const daily = dailyIn.filter((d) => dayKey(d.t) <= lastDay);

  const { rows, scores } = buildFeatures(bars, daily);
  const xLast = rows[rows.length - 1].map((v) => (Number.isNaN(v) ? 0.0 : v)); // NaN->0 (documented)

  const scoreHvol = opts.scoreHvol ?? scoreHvolModel;
  const scoreRange = opts.scoreRange ?? scoreRangeModel;

  const pHvol = scoreHvol(xLast);
  const expRngAtr = Math.max(0.0, scoreRange(xLast));
  const atrT = scores.atr[scores.atr.length - 1];
  const expRngPrice = expRngAtr * atrT;

  const regLabel = regimeLabel(scores.adx[scores.adx.length - 1]);

  // drift_sign: sign of D1 close - EMA20 at the last COMPLETED daily bar
  const dHist = daily.filter((d) => dayKey(d.t) < lastDay).map((d) => d.c);
  let drift: 1 | -1 = 1;
  if (dHist.length >= 21) {
    const e20 = ema(dHist, 20);
    const dev = dHist[dHist.length - 1] - e20[e20.length - 1];
    drift = dev >= 0 ? 1 : -1;
  }

  const t = bars[bars.length - 1].t;
  return {
    asof: t,
    session: sessionName(hourOf(t)),
    regime: regLabel,
    p_high_vol: round4(pHvol),
    expected_range_atr: round4(expRngAtr),
    expected_range_price: round4(expRngPrice),
    cone: {
      T1: { half_width: round4(expRngPrice * Math.sqrt(1)) },
      T2: { half_width: round4(expRngPrice * Math.sqrt(2)) },
      T3: { half_width: round4(expRngPrice * Math.sqrt(3)) },
    },
    direction_policy: "drift",
    drift_sign: drift,
    confidence: confidenceFromProb(pHvol),
  };
}
