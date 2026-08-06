import { useCallback, useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { Phase5EquityPoint } from '@/hooks/useData'
import { fmtSigned } from './format'
import { useReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface Phase5Series {
  key: string
  label: string
  color: string
  points: Phase5EquityPoint[]
}

const COLORS = {
  grid: '#151C24',
  axis: '#6B7684',
  zero: '#8A93A3',
}

function parseDt(s: string): number {
  // "2026-05-01 10:00:00" → ms
  return new Date(s.replace(' ', 'T')).getTime()
}

function fmtMonth(ms: number): string {
  const d = new Date(ms)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** nice round step for y ticks */
function niceStep(range: number, target: number): number {
  const raw = range / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag
  return 10 * mag
}

/**
 * Phase 5 equity curves (truth page): REAL cumulative-pip series from
 * phase5.json.equity for S1 / S2 / S3-VOL / S3-OFF. S1 is gold with a glow,
 * the others are muted. Dashed zero line; lines draw across on scroll;
 * hover crosshair reads every series.
 */
export default function Phase5EquityChart({ series }: { series: Phase5Series[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const prog = useRef({ p: 1 })
  const hover = useRef<number | null>(null)
  const reduced = useReducedMotion()
  const geom = useRef({ l: 64, r: 20, t: 40, b: 36, w: 0, h: 420, ymin: 0, ymax: 1 })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const valid = series.filter((s) => s.points.length >= 2)
    if (valid.length === 0) return
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
    let ymin = 0
    let ymax = 0
    let dmin = Infinity
    let dmax = -Infinity
    for (const s of valid) {
      for (const p of s.points) {
        ymin = Math.min(ymin, p.equity)
        ymax = Math.max(ymax, p.equity)
      }
      dmin = Math.min(dmin, parseDt(s.points[0].exit_dt))
      dmax = Math.max(dmax, parseDt(s.points[s.points.length - 1].exit_dt))
    }
    const pad = (ymax - ymin) * 0.08 || 1
    ymin -= pad
    ymax += pad
    geom.current = { ...geom.current, w, h, ymin, ymax }

    const Xf = (f: number) => l + f * (w - l - r)
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

    // x labels (exit-date span, ~6 month ticks)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const span = dmax - dmin
    const sixMonths = 1000 * 60 * 60 * 24 * 182
    const tickEvery = span > sixMonths * 6 ? sixMonths * 2 : sixMonths
    const firstTick = new Date(dmin)
    firstTick.setDate(1)
    firstTick.setHours(0, 0, 0, 0)
    for (let ms = firstTick.getTime(); ms <= dmax; ) {
      const f = (ms - dmin) / span
      if (f >= -0.02 && f <= 1.02) {
        ctx.fillStyle = COLORS.axis
        ctx.fillText(fmtMonth(ms), Xf(f), h - b + 10)
      }
      const d = new Date(ms)
      d.setMonth(d.getMonth() + Math.max(1, Math.round(tickEvery / (1000 * 60 * 60 * 24 * 30))))
      ms = d.getTime()
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

    // series — S1 (gold) leads, the rest trail behind (1400ms total sweep)
    valid.forEach((s, k) => {
      const n = s.points.length
      const p = Math.max(0, Math.min(1, (prog.current.p * 1400 - k * 150) / 1100))
      const upto = Math.max(1, Math.floor(p * (n - 1)))
      const isGold = s.key === 'S1-S1'
      ctx.strokeStyle = s.color
      ctx.lineWidth = isGold ? 2 : 1.5
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.shadowColor = isGold ? 'rgba(232,178,58,0.45)' : 'transparent'
      ctx.shadowBlur = isGold ? 8 : 0
      ctx.beginPath()
      for (let i = 0; i <= upto; i++) {
        const x = Xf(i / (n - 1))
        const y = Y(s.points[i].equity)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
    })

    // hover crosshair
    if (hover.current !== null) {
      const f = hover.current
      const x = Xf(f)
      ctx.strokeStyle = 'rgba(234,238,243,0.25)'
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, t)
      ctx.lineTo(x, h - b)
      ctx.stroke()
      ctx.setLineDash([])
      for (const s of valid) {
        const n = s.points.length
        const i = Math.round(f * (n - 1))
        ctx.fillStyle = s.color
        ctx.beginPath()
        ctx.arc(x, Y(s.points[i].equity), 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#07090C'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
  }, [series])

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
    const valid = series.filter((s) => s.points.length >= 2)
    if (valid.length === 0) return
    let dmin = Infinity
    let dmax = -Infinity
    for (const s of valid) {
      dmin = Math.min(dmin, parseDt(s.points[0].exit_dt))
      dmax = Math.max(dmax, parseDt(s.points[s.points.length - 1].exit_dt))
    }
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const { l, r, w } = geom.current
      const f = Math.max(0, Math.min(1, (e.clientX - rect.left - l) / Math.max(1, w - l - r)))
      hover.current = f
      draw()
      const x = l + f * (w - l - r)
      const ms = dmin + f * (dmax - dmin)
      const rows = valid
        .map((s) => {
          const i = Math.round(f * (s.points.length - 1))
          return `<div style="margin-top:2px;font-size:12px"><span style="color:${s.color}">${s.label}</span>
            <span style="float:right;margin-left:16px;font-weight:600">${fmtSigned(s.points[i].equity, 1)}</span></div>`
        })
        .join('')
      tip.style.opacity = '1'
      tip.style.left = `${Math.min(Math.max(x + 12, 8), w - 200)}px`
      tip.style.top = '48px'
      tip.innerHTML = `<div style="color:#A9B4C0;font-size:10px;letter-spacing:0.04em">${fmtMonth(ms).toUpperCase()} · EXIT</div>${rows}`
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
  }, [draw, series])

  const finalValues = series
    .filter((s) => s.points.length > 0)
    .map((s) => `${s.label} ends at ${fmtSigned(s.points[s.points.length - 1].equity, 1)} pips`)
    .join(', ')

  return (
    <div ref={wrapRef} className="relative">
      {/* legend */}
      <div className="absolute left-16 top-1 z-10 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 font-mono text-[11px] text-text1">
            <span
              className="inline-block h-[2px] w-5"
              style={{
                background: s.color,
                boxShadow: s.key === 'S1-S1' ? '0 0 6px rgba(232,178,58,0.6)' : undefined,
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '420px', cursor: 'crosshair', display: 'block' }}
        role="img"
        aria-label={`Phase 5 equity curves: ${finalValues}`}
      />
      <div
        ref={tipRef}
        className="pointer-events-none absolute z-20 w-[190px] rounded-md border border-linestrong bg-bg3/95 px-3 py-2 font-mono text-text0 opacity-0 transition-opacity duration-150"
        style={{ top: 48, left: 0 }}
      />
    </div>
  )
}
