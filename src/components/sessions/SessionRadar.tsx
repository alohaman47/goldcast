import { useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import type { SessionHour, SessionsData } from '@/hooks/useData'
import { GOLD_CONFIG, type SymbolConfig } from '@/engine/symbols'
import { useTimezone, tzSuffix, utcHhMmToTz, utcHourInTz } from '@/hooks/useTimezone'
import {
  BAND_META,
  BAND_ORDER,
  COLOR_MODES,
  TERMINAL_EASE,
  bandHours,
  contiguousRuns,
  fmtAtr,
  fmtInt,
  fmtPct,
  fmtUsd,
  modeExtent,
  rangeDigits,
  rangeUnit,
  wedgeFill,
} from './utils'
import type { ColorMode } from './utils'

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

const CX = 320
const CY = 300
const R_INNER = 80
const R_OUTER = 212
const R_BAND = 58
const R_LABEL = R_OUTER + 26
const STEP = 15 // degrees per hour
const GAP = 1.1 // degrees of gap on each side of a wedge

function polar(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180
  return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)]
}

/** Annular sector path from angle a0→a1 (deg, clockwise from top), radii r0 (inner) → r1 (outer). */
function wedgePath(a0: number, a1: number, r0: number, r1: number): string {
  const [x1, y1] = polar(a0, r1)
  const [x2, y2] = polar(a1, r1)
  const [x3, y3] = polar(a1, r0)
  const [x4, y4] = polar(a0, r0)
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${r1} ${r1} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A ${r0} ${r0} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    'Z',
  ].join(' ')
}

/** Open arc path (for the band ring). */
function arcPath(a0: number, a1: number, r: number): string {
  const [x1, y1] = polar(a0, r)
  const [x2, y2] = polar(a1, r)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

interface HoverState {
  hour: number
  x: number
  y: number
}

interface SessionRadarProps {
  data: SessionsData
  now: Date
  onSelectHour: (hour: number) => void
  config?: SymbolConfig
}

export default function SessionRadar({ data, now, onSelectHour, config = GOLD_CONFIG }: SessionRadarProps) {
  const [colorMode, setColorMode] = useState<ColorMode>('pvol')
  const [hover, setHover] = useState<HoverState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inView = useInView(containerRef, { once: true, amount: 0.2 })
  const reducedMotion = useReducedMotion()
  const unit = rangeUnit(config)
  const digits = rangeDigits(config, 2)
  /* Phase 14: needle/wedge identity stays UTC; only labels convert. */
  const { tz } = useTimezone()

  const utcHour = now.getUTCHours()
  const utcMinute = now.getUTCMinutes()
  const needleDeg = (utcHour + utcMinute / 60) * STEP

  const extent = useMemo(() => modeExtent(data.hours, colorMode), [data.hours, colorMode])

  const { rMin, rMax } = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const h of data.hours) {
      if (h.avg_range_price == null) continue
      lo = Math.min(lo, h.avg_range_price)
      hi = Math.max(hi, h.avg_range_price)
    }
    return { rMin: lo, rMax: hi }
  }, [data.hours])

  const radiusFor = (h: SessionHour): number => {
    if (h.avg_range_price == null) return R_INNER + (R_OUTER - R_INNER) * 0.42
    const t = rMax > rMin ? (h.avg_range_price - rMin) / (rMax - rMin) : 0.5
    return R_INNER + t * (R_OUTER - R_INNER)
  }

  const bandArcs = useMemo(() => {
    const arcs: { d: string; color: string; label: string; lx: number; ly: number; key: string }[] = []
    for (const id of BAND_ORDER) {
      const runs = contiguousRuns(bandHours(data, id))
      const meta = BAND_META[id]
      for (const run of runs) {
        const a0 = run[0] * STEP - STEP / 2 + 1.5
        const a1 = run[run.length - 1] * STEP + STEP / 2 - 1.5
        const mid = (a0 + a1) / 2
        const [lx, ly] = polar(mid, R_BAND)
        const label = run.length <= 1 ? (id === 'off' ? 'OFF' : meta.name) : meta.name
        arcs.push({
          d: arcPath(a0, a1, R_BAND),
          color: meta.tone,
          label,
          lx,
          ly,
          key: `${id}-${run[0]}`,
        })
      }
    }
    return arcs
  }, [data])

  const handleMove = (h: SessionHour) => (e: MouseEvent<SVGPathElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({ hour: h.hour_utc, x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const staggerDelay = (h: number) => (reducedMotion ? 0 : h * 0.035)
  const animDuration = reducedMotion ? 0 : 0.5

  const hoverRow = hover ? data.hours.find((r) => r.hour_utc === hover.hour) : undefined

  return (
    <section aria-label="24 hour volatility radar">
      <div className="panel panel-gold relative overflow-hidden p-4 sm:p-5">
        <div className="flex h-10 items-center justify-between gap-3">
          <h2 className="panel-title">24H Volatility Radar — {tzSuffix(tz)}</h2>
          {/* Color-mode toggle chips */}
          <div className="flex items-center gap-1.5" role="group" aria-label="Wedge color mode">
            <span className="label-caps mr-1 hidden sm:inline">Color:</span>
            {COLOR_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setColorMode(m.id)}
                aria-pressed={colorMode === m.id}
                className={
                  colorMode === m.id
                    ? 'rounded-md border border-gold/70 bg-gold/10 px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.04em] text-gold transition-colors duration-150'
                    : 'rounded-md border border-linestrong px-2 py-1 font-mono text-[10px] font-medium tracking-[0.04em] text-text2 transition-colors duration-150 hover:border-gold/60 hover:text-gold'
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div ref={containerRef} className="relative mt-1 h-[420px] sm:h-[560px]">
          <svg
            viewBox="0 0 640 600"
            className="h-full w-full"
            role="img"
            aria-label={`Radial heatmap of ${config.symbol} hourly volatility. Wedge length is average range in ${unit}; color is the selected heat metric. Hour 00 is hollow: daily break, no bars.`}
          >
            {/* Session band arcs (inner ring) */}
            <g>
              {bandArcs.map((a) => (
                <g key={a.key}>
                  <path d={a.d} fill="none" stroke={a.color} strokeWidth={11} strokeOpacity={0.38} strokeLinecap="butt" />
                  <text
                    x={a.lx}
                    y={a.ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fontSize: 8.5, letterSpacing: '0.08em', fill: a.color, opacity: 0.95, fontFamily: '"JetBrains Mono", monospace' }}
                  >
                    {a.label}
                  </text>
                </g>
              ))}
            </g>

            {/* Wedges */}
            {data.hours.map((h) => {
              const isNull = h.bar_count === 0 || h.avg_range_price == null
              const a0 = h.hour_utc * STEP - STEP / 2 + GAP
              const a1 = h.hour_utc * STEP + STEP / 2 - GAP
              const hovered = hover?.hour === h.hour_utc
              const r1 = radiusFor(h) + (hovered ? 4 : 0)
              const fill = isNull ? 'none' : wedgeFill(h, colorMode, extent)
              const hot =
                colorMode === 'pvol' && h.p_high_vol_empirical != null && h.p_high_vol_empirical > 0.7
              const dimmed = hover != null && !hovered
              return (
                <motion.path
                  key={h.hour_utc}
                  d={wedgePath(a0, a1, R_INNER, r1)}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    inView
                      ? { scale: 1, opacity: dimmed ? 0.4 : 1 }
                      : { scale: 0, opacity: 0 }
                  }
                  transition={{
                    scale: { delay: staggerDelay(h.hour_utc), duration: animDuration, ease: TERMINAL_EASE },
                    opacity: dimmed
                      ? { duration: 0.15 }
                      : { delay: staggerDelay(h.hour_utc) + (reducedMotion ? 0 : 0.2), duration: animDuration, ease: TERMINAL_EASE },
                  }}
                  style={{
                    transformOrigin: `${CX}px ${CY}px`,
                    fill,
                    stroke: isNull ? '#6B7684' : h.hour_utc === utcHour ? '#F5CD6B' : 'rgba(7,9,12,0.9)',
                    strokeWidth: isNull ? 1.2 : h.hour_utc === utcHour ? 1.6 : 1,
                    strokeDasharray: isNull ? '4 4' : undefined,
                    filter: hot ? 'drop-shadow(0 0 16px rgba(245,166,35,0.55))' : undefined,
                    transition: 'fill 400ms ease, d 150ms ease, opacity 150ms ease',
                    cursor: 'pointer',
                  }}
                  onMouseMove={handleMove(h)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onSelectHour(h.hour_utc)}
                >
                  <title>
                    {isNull
                      ? `${utcHhMmToTz(0, 0, tz, now)} ${tzSuffix(tz)} — daily break, no bars`
                      : `${utcHhMmToTz(h.hour_utc, 0, tz, now)} ${tzSuffix(tz)} · avg range ${fmtUsd(h.avg_range_price, digits)} ${unit} · ${fmtAtr(h.avg_range_atr)}ATR · P(high-vol) ${fmtPct(h.p_high_vol_empirical)} · n=${fmtInt(h.bar_count)} bars`}
                  </title>
                </motion.path>
              )
            })}

            {/* Hour numerals (outer ring, every 2h) */}
            <g>
              {data.hours
                .filter((h) => h.hour_utc % 2 === 0)
                .map((h) => {
                  const [x, y] = polar(h.hour_utc * STEP, R_LABEL)
                  return (
                    <text
                      key={h.hour_utc}
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ fontSize: 10, fill: '#6B7684', fontFamily: '"JetBrains Mono", monospace' }}
                    >
                      {utcHourInTz(h.hour_utc, tz, now)}
                    </text>
                  )
                })}
            </g>

            {/* Current-hour needle */}
            <motion.g
              initial={{ rotate: 0, opacity: 0 }}
              animate={inView ? { rotate: needleDeg, opacity: 1 } : { rotate: 0, opacity: 0 }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : {
                      rotate: { type: 'spring', stiffness: 120, damping: 12, delay: 0.35 },
                      opacity: { duration: 0.3, delay: 0.35 },
                    }
              }
              style={{ transformOrigin: `${CX}px ${CY}px` }}
            >
              <line x1={CX} y1={CY} x2={CX} y2={CY - R_OUTER - 8} stroke="#E8B23A" strokeWidth={1.5} />
              <circle cx={CX} cy={CY - R_OUTER - 8} r={2.5} fill="#E8B23A" />
            </motion.g>

            {/* Center hub */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ delay: reducedMotion ? 0 : 24 * 0.035 + 0.25, duration: reducedMotion ? 0 : 0.4 }}
            >
              <circle cx={CX} cy={CY} r={34} fill="#0C1015" stroke="#1E2732" />
              <text
                x={CX}
                y={CY - 4}
                textAnchor="middle"
                style={{ fontSize: 13, fontWeight: 700, fill: '#E8B23A', fontFamily: '"Space Grotesk", sans-serif' }}
              >
                {config.symbol}
              </text>
              <text
                x={CX}
                y={CY + 12}
                textAnchor="middle"
                style={{ fontSize: 7.5, letterSpacing: '0.14em', fill: '#6B7684', fontFamily: '"JetBrains Mono", monospace' }}
              >
                24H VOLATILITY
              </text>
            </motion.g>
          </svg>

          {/* Hover tooltip */}
          {hover && hoverRow && (
            <div
              className="pointer-events-none absolute z-10 rounded-md border border-linestrong bg-bg3 px-3 py-2 font-mono text-[11px] leading-[18px] text-text0 shadow-lg"
              style={{
                left: Math.min(Math.max(hover.x + 14, 8), (containerRef.current?.clientWidth ?? 400) - 230),
                top: Math.max(hover.y - 14, 8),
              }}
            >
              {hoverRow.bar_count === 0 || hoverRow.avg_range_price == null ? (
                <span className="text-honest">
                  {utcHhMmToTz(0, 0, tz, now)} {tzSuffix(tz)} — daily break, no bars
                </span>
              ) : (
                <>
                  <span className="text-gold">
                    {utcHhMmToTz(hoverRow.hour_utc, 0, tz, now)} {tzSuffix(tz)}
                  </span>
                  <span className="text-text2"> · avg range </span>
                  {fmtUsd(hoverRow.avg_range_price, digits)} {unit}
                  <span className="text-text2"> · </span>
                  {fmtAtr(hoverRow.avg_range_atr)}ATR
                  <span className="text-text2"> · P(high-vol) </span>
                  {fmtPct(hoverRow.p_high_vol_empirical)}
                  <span className="text-text2"> · n=</span>
                  {fmtInt(hoverRow.bar_count)} <span className="text-text2">bars</span>
                </>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-1 left-1 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-24 rounded-sm"
                style={{ background: 'linear-gradient(90deg, #241b0e, #F5A623)' }}
              />
              <span className="micro-mono">
                quiet → hot ({COLOR_MODES.find((m) => m.id === colorMode)?.label})
              </span>
            </div>
            <span className="micro-mono">
              wedge length = avg range ({unit}) ·{' '}
              {tz === 'NY' ? `${utcHhMmToTz(0, 0, tz, now)} NY` : '00:00'} hollow = daily break
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
