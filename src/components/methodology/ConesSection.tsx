import { motion } from 'framer-motion'
import ConfidencePips from '@/components/ConfidencePips'
import type { LatestData } from '@/hooks/useData'
import { fmtFixed, fmtPct } from '@/components/truth/format'
import { useReducedMotion } from '@/components/truth/motion'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

const FALLBACK: Pick<LatestData, 'price' | 'cone' | 'p_high_vol' | 'regime' | 'session' | 'confidence' | 'drift_sign'> = {
  price: 3970.83,
  cone: { T1: { half_width: 29.0242 }, T2: { half_width: 41.0464 }, T3: { half_width: 50.2713 } },
  p_high_vol: 0.7991,
  regime: 'ranging',
  session: 'ny',
  confidence: 5,
  drift_sign: 1,
}

/**
 * Cones & ghost candles (methodology.md §7): the √-time cone math as a worked
 * example built from the LIVE latest.json values, with a mini ghost-candle
 * reproduction using the actual export.
 */
export default function ConesSection({ latest }: { latest: LatestData | null }) {
  const reduced = useReducedMotion()
  const d = latest ?? (FALLBACK as LatestData)
  const hw = [d.cone.T1.half_width, d.cone.T2.half_width, d.cone.T3.half_width]
  const up = d.drift_sign >= 0
  const ghost = up ? '#2EBD85' : '#F2493F'
  const confFrac = Math.max(0, Math.min(5, d.confidence)) / 5
  const fillOpacity = 0.18 + 0.17 * confFrac // ghost fill 18–35% ∝ confidence

  // geometry: last candle at x0, ghosts at 3 steps; price scale fits ±55 USD
  const x0 = 70
  const stepX = 86
  const midY = 118
  const scale = 84 / 55
  const Y = (v: number) => midY - (v - d.price) * scale
  const driftStep = up ? 5 : -5 // illustrative drift slope; color/label carry the meaning

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div>
        <p className="font-body text-[15px] leading-6 text-text1">
          The expected T+1 range comes from the regressor (in ATR units, converted to price:{' '}
          <span className="font-mono text-[13px] text-text0">expected_range_price</span>). T+2 and T+3 half-widths
          scale by <span className="font-semibold text-text0">√time</span>:
        </p>
        <div className="panel mt-4 p-4">
          <span className="label-caps">Worked example — live export</span>
          <div className="mt-2 font-mono text-[15px] font-semibold text-text0">
            {fmtFixed(hw[0], 2)} → {fmtFixed(hw[1], 2)} → {fmtFixed(hw[2], 2)}{' '}
            <span className="text-text2">USD</span>
          </div>
          <div className="micro-mono mt-1">
            hw(T+n) = hw(T+1) × √n &nbsp;·&nbsp; {fmtFixed(hw[0], 2)} × √2 = {fmtFixed(hw[0] * Math.SQRT2, 2)}
            &nbsp;·&nbsp; {fmtFixed(hw[0], 2)} × √3 = {fmtFixed(hw[0] * Math.sqrt(3), 2)}
          </div>
        </div>
        <ul className="mt-5 flex flex-col gap-3">
          {[
            'The cone is a range envelope, symmetric — it deliberately says nothing about direction.',
            'Ghost-candle opacity = confidence (0–5); color = drift sign only (the long-term 2022–2026 uptrend), and both are labeled as such on the chart.',
            'High-impact windows widen cones by a fixed multiplier (×1.5) — the engine widens risk, never picks a side.',
          ].map((t) => (
            <li key={t.slice(0, 24)} className="flex items-start gap-2.5 text-[14px] leading-5 text-text1">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      {/* Worked example card */}
      <div className="panel panel-gold p-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="panel-title">Ghost cone — live values</span>
        </div>
        <svg viewBox="0 0 360 230" className="w-full" role="img" aria-label="Forecast cone with three ghost candles from the live export">
          {/* cone envelope */}
          {[0, 1, 2].map((i) => {
            const x1 = x0 + i * stepX
            const x2 = x0 + (i + 1) * stepX
            return (
              <g key={i}>
                <motion.path
                  d={`M ${x1} ${Y(d.price + (i === 0 ? 0 : hw[i - 1]))} L ${x2} ${Y(d.price + hw[i])}`}
                  fill="none"
                  stroke="rgba(232,178,58,0.6)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  initial={{ pathLength: reduced ? 1 : 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: i * 0.18, ease: EASE }}
                />
                <motion.path
                  d={`M ${x1} ${Y(d.price - (i === 0 ? 0 : hw[i - 1]))} L ${x2} ${Y(d.price - hw[i])}`}
                  fill="none"
                  stroke="rgba(232,178,58,0.6)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  initial={{ pathLength: reduced ? 1 : 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: i * 0.18, ease: EASE }}
                />
              </g>
            )
          })}
          {/* cone fill */}
          <path
            d={`M ${x0} ${midY} L ${x0 + stepX} ${Y(d.price + hw[0])} L ${x0 + 2 * stepX} ${Y(d.price + hw[1])} L ${x0 + 3 * stepX} ${Y(d.price + hw[2])} L ${x0 + 3 * stepX} ${Y(d.price - hw[2])} L ${x0 + 2 * stepX} ${Y(d.price - hw[1])} L ${x0 + stepX} ${Y(d.price - hw[0])} Z`}
            fill="rgba(232,178,58,0.06)"
          />
          {/* last real candle */}
          <line x1={x0} y1={Y(d.price + 14)} x2={x0} y2={Y(d.price - 14)} stroke="#2EBD85" strokeWidth={1.5} opacity={0.8} />
          <rect x={x0 - 9} y={Y(d.price + 9)} width={18} height={(18) * scale} fill="#2EBD85" rx={1} />
          {/* ghost candles T+1..T+3 */}
          {hw.map((h, i) => {
            const cx = x0 + (i + 1) * stepX
            const center = d.price + driftStep * (i + 1)
            const bodyH = h * 0.4
            return (
              <motion.g
                key={i}
                initial={{ opacity: 0, y: reduced ? 0 : 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: 0.5 + i * 0.12, ease: EASE }}
              >
                <line x1={cx} y1={Y(center + h)} x2={cx} y2={Y(center - h)} stroke={ghost} strokeWidth={1.5} opacity={0.8} />
                <rect
                  x={cx - 9}
                  y={Y(center + bodyH)}
                  width={18}
                  height={Math.max(4, 2 * bodyH * scale)}
                  fill={ghost}
                  fillOpacity={fillOpacity}
                  stroke={ghost}
                  strokeOpacity={0.7}
                  strokeWidth={1}
                  rx={1}
                  style={{ filter: `drop-shadow(0 0 6px ${up ? 'rgba(46,189,133,0.4)' : 'rgba(242,73,63,0.4)'})` }}
                />
                <text x={cx} y={224} fill="#6B7684" fontSize={10} fontFamily="JetBrains Mono, monospace" textAnchor="middle">
                  T+{i + 1} ±{fmtFixed(h, 1)}
                </text>
              </motion.g>
            )
          })}
          {/* forecast divider */}
          <line x1={x0 + 34} y1={16} x2={x0 + 34} y2={204} stroke="rgba(234,238,243,0.35)" strokeWidth={1} strokeDasharray="4 4" />
          <text x={x0 + 40} y={26} fill="#A9B4C0" fontSize={9} fontFamily="JetBrains Mono, monospace">
            FORECAST
          </text>
        </svg>
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3">
          <div>
            <span className="label-caps !text-[10px]">P(high-vol)</span>
            <div className="font-mono text-[14px] font-semibold text-gold">{fmtPct(d.p_high_vol, 1)}</div>
          </div>
          <div>
            <span className="label-caps !text-[10px]">Confidence</span>
            <ConfidencePips confidence={d.confidence} className="mt-1" />
          </div>
          <div>
            <span className="label-caps !text-[10px]">Regime</span>
            <div className="font-mono text-[12px] text-text0">{d.regime}</div>
          </div>
          <div>
            <span className="label-caps !text-[10px]">Session</span>
            <div className="font-mono text-[12px] text-text0">{d.session}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
