/* Number formatting — all values originate in /data JSON or the design docs. */

export const MINUS = '−'

export function fmtInt(x: number): string {
  return Math.round(x).toLocaleString('en-US')
}

export function fmtFixed(x: number, digits = 1): string {
  return x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** signed, thousands-separated, e.g. +1,189.9 / −206.6 */
export function fmtSigned(x: number, digits = 1): string {
  const sign = x >= 0 ? '+' : MINUS
  return sign + fmtFixed(Math.abs(x), digits)
}

/** 0.8008 → "80.08%" */
export function fmtPct(x: number, digits = 2): string {
  return `${(x * 100).toFixed(digits)}%`
}
