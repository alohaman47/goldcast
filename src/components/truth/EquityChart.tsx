import { useCallback, useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { fmtSigned } from './format'
import { useReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Trade exit window per design (truth.md §5): 2023-11 → 2026-05
const START_Y = 2023
const START_M = 10 // November (0-based)
const TOTAL_MONTHS = 30

function idxDate(i: number, n: number): string {
  const months = (i / (n - 1)) * TOTAL_MONTHS
  const m0 = START_Y * 12 + START_M + months
  const y = Math.floor(m0 / 12)
  const m = Math.floor(m0 % 12)
  return `${MONTHS[m]} ${y}`
}

/** nice round step for y ticks */
function niceStep(range: number, target: number): number {
  const raw = range / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag
  return 10 * mag
}

const COLORS = {
  fixed: '#E8B23A',
  vol: '#B0564F',
  grid: '#151C24',
  axis: '#6B7684',
  zero: '#8A93A3',
}

/**
 * Dual equity curves (truth.md §5): REAL 200-point cumulative-pip series from
 * truth.json.phase3.equity_curve_pips. Fixed = gold, vol-aware = muted red-gray.
 * Lines draw across on scroll; hover crosshair reads both equities + exit date.
 */
export default function EquityChart({ fixed, volAware }: { fixed: number[]; volAware: number[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const prog = useRef({ p: 1 })
  const hover = useRef<number | null>(null)
  const reduced = useReducedMotion()
  const geom = useRef({ l: 64, r: 20, t: 28, b: 36, w: 0, h: 420, ymin: 0, ymax: 1 })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const n = fixed.length
    if (n < 2 || volAware.length < 2) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = wrap.clientWidth
    const h = 420
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const { l, r, t, b } = geom.current
    const all = [...fixed, ...volAware]
    let ymin = Math.min(0, ...all)
    let ymax = Math.max(0, ...all)
    const pad = (ymax - ymin) * 0.08 || 1
    ymin -= pad
    ymax += pad
    geom.current = { ...geom.current, w, h, ymin, ymax }

    const X = (i: number) => l + (i / (n - 1)) * (w - l - r)
    const Y = (v: number) => t + (1 - (v - ymin) / (ymax - ymin)) * (h - t - b)

    // horizontal gridlines + y labels
    const step = niceStep(ymax - ymin, 5)
    ctx.font = '11px "JetBrains Mono", monospace'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let v = Math.ceil(ymin / step) * step; v <= ymax; v += step) {
      const y = Y(v)
      ctx.strokeStyle = COLORS.grid
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(l, y)
      ctx.lineTo(w - r, y)
      ctx.stroke()
      ctx.fillStyle = COLORS.axis
      ctx.fillText(Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)), l - 8, y)
    }

    // x labels (exit dates)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let mth = 0; mth <= TOTAL_MONTHS; mth += 6) {
      const i = (mth / TOTAL_MONTHS) * (n - 1)
      ctx.fillStyle = COLORS.axis
      ctx.fillText(idxDate(i, n), X(i), h - b + 10)
    }

    // zero line (dashed)
    const zy = Y(0)
    ctx.strokeStyle = COLORS.zero
    ctx.setLineDash([5, 4])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(l, zy)
    ctx.lineTo(w - r, zy)
    ctx.stroke()
    ctx.setLineDash([])

    // series — fixed leads, vol-aware trails 200ms behind (1400ms total sweep)
    const drawLine = (series: number[], p: number, color: string, width: number, glow: boolean) => {
      const upto = Math.max(1, Math.floor(p * (n - 1)))
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.shadowColor = glow ? 'rgba(232,178,58,0.45)' : 'transparent'
      ctx.shadowBlur = glow ? 8 : 0
      ctx.beginPath()
      for (let i = 0; i <= upto; i++) {
        const x = X(i)
        const y = Y(series[i])
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
    }
    const pFixed = prog.current.p
    const pVol = Math.max(0, Math.min(1, (prog.current.p * 1400 - 200) / 1200))
    drawLine(volAware, pVol, COLORS.vol, 1.5, false)
    drawLine(fixed, pFixed, COLORS.fixed, 2, true)

    // hover crosshair
    if (hover.current !== null) {
      const i = hover.current
      const x = X(i)
      ctx.strokeStyle = 'rgba(234,238,243,0.25)'
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, t)
      ctx.lineTo(x, h - b)
      ctx.stroke()
      ctx.setLineDash([])
      for (const [series, color] of [
        [fixed, COLORS.fixed],
        [volAware, COLORS.vol],
      ] as const) {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, Y(series[i]), 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#07090C'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
  }, [fixed, volAware])

  // draw-on-scroll + resize
  useEffect(() => {
    if (reduced) {
      prog.current.p = 1
      draw()
      return
    }
    prog.current.p = 0
    draw()
    const st = ScrollTrigger.create({
      trigger: wrapRef.current,
      start: 'top 80%',
      once: true,
      onEnter: () => {
        gsap.to(prog.current, {
          p: 1,
          duration: 1.4,
          ease: 'power3.inOut',
          onUpdate: draw,
        })
      },
    })
    return () => st.kill()
  }, [draw, reduced])

  useEffect(() => {
    const ro = new ResizeObserver(() => draw())
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [draw])

  // hover → crosshair + tooltip
  useEffect(() => {
    const canvas = canvasRef.current
    const tip = tipRef.current
    if (!canvas || !tip) return
    const n = fixed.length
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const { l, r, w } = geom.current
      const fx = (e.clientX - rect.left - l) / Math.max(1, w - l - r)
      const i = Math.round(Math.max(0, Math.min(1, fx)) * (n - 1))
      hover.current = i
      draw()
      const X = l + (i / (n - 1)) * (w - l - r)
      tip.style.opacity = '1'
      tip.style.left = `${Math.min(Math.max(X + 12, 8), w - 190)}px`
      tip.style.top = '36px'
      tip.innerHTML = `
        <div style="color:#A9B4C0;font-size:10px;letter-spacing:0.04em">${idxDate(i, n)} · EXIT</div>
        <div style="margin-top:4px;font-size:12px"><span style="color:${COLORS.fixed}">Fixed</span>
          <span style="float:right;margin-left:16px;font-weight:600">${fmtSigned(fixed[i], 1)}</span></div>
        <div style="margin-top:2px;font-size:12px"><span style="color:${COLORS.vol}">Vol-aware</span>
          <span style="float:right;margin-left:16px;font-weight:600">${fmtSigned(volAware[i], 1)}</span></div>`
    }
    const onLeave = () => {
      hover.current = null
      tip.style.opacity = '0'
      draw()
    }
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseleave', onLeave)
    return () => {
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseleave', onLeave)
    }
  }, [draw, fixed, volAware])

  return (
    <div ref={wrapRef} className="relative">
      {/* legend */}
      <div className="absolute left-16 top-1 z-10 flex items-center gap-4">
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-text1">
          <span className="inline-block h-[2px] w-5 bg-gold shadow-[0_0_6px_rgba(232,178,58,0.6)]" /> Fixed sizing
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-text1">
          <span className="inline-block h-[2px] w-5" style={{ background: COLORS.vol }} /> Vol-aware overlay
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '420px', cursor: 'crosshair', display: 'block' }}
        role="img"
        aria-label="Equity curves: fixed sizing ends at +1,189.9 pips, vol-aware overlay ends at −206.6 pips"
      />
      <div
        ref={tipRef}
        className="pointer-events-none absolute z-20 w-[180px] rounded-md border border-linestrong bg-bg3/95 px-3 py-2 font-mono text-text0 opacity-0 transition-opacity duration-150"
        style={{ top: 36, left: 0 }}
      />
    </div>
  )
}
