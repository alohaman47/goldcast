import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bar, LatestData } from '@/hooks/useData'
import type { Bar as EngineBar } from '@/engine/bars'
import { GOLD_CONFIG } from '@/engine/symbols'
import type { SymbolConfig } from '@/engine/symbols'
import { priceUnit } from '@/hooks/useSymbol'
import { cn } from '@/lib/utils'

/**
 * CandlestickChart (design.md §7.7 + dashboard.md §A).
 * Canvas renderer: candles, session bands, per-bar vol dots, last-price line,
 * FORECAST zone with ghost candles T+1–T+3 and √-time confidence cone,
 * crosshair with engine-values tooltip, drag-pan / wheel-zoom / dblclick-reset.
 */

const C = {
  up: '#2EBD85',
  down: '#F2493F',
  grid: '#151C24',
  axis: '#6B7684',
  gold: '#E8B23A',
  goldHi: '#F5CD6B',
  text3: '#454F5B',
  divider: 'rgba(255,255,255,0.35)',
  crosshair: 'rgba(169,180,192,0.5)',
  bandAsia: 'rgba(255,255,255,0.015)',
  bandLondon: 'rgba(91,141,239,0.04)',
  bandNy: 'rgba(232,178,58,0.045)',
}

const FORECAST_SLOTS = 4
const DEFAULT_VISIBLE = 120
const MIN_VISIBLE = 40
const AXIS_W = 64
const PAD_L = 8
const PAD_T = 16
const TIME_H = 28
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const easeOut = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3)

function parseT(t: string): Date {
  return new Date(t.replace(' ', 'T') + 'Z')
}

function fmtPrice(v: number, decimals = 2): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function niceStep(range: number, target: number): number {
  const raw = range / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * mag >= raw) return m * mag
  }
  return 10 * mag
}

interface Hover {
  x: number
  y: number
  barIdx: number | null // absolute index into bars
  ghostK: number | null // 1..3
}

/** Live overlay: forming H1 bar + live engine prediction (anchored at spot). */
export interface LiveOverlay {
  bar: EngineBar
  session: string
  latest: LatestData
  status: 'live' | 'stale' | 'gap' | 'error'
}

export default function CandlestickChart({
  bars,
  latest,
  live = null,
  config = GOLD_CONFIG,
}: {
  bars: Bar[]
  latest: LatestData
  live?: LiveOverlay | null
  config?: SymbolConfig
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef({ end: bars.length, count: Math.min(DEFAULT_VISIBLE, bars.length) })

  /* effective series: static bars + (optional) forming live bar.
     Same-hour case: the forming bar replaces the last static bar (same timestamp)
     instead of duplicating it — mirrors the engine's replace semantics. */
  const effBars = useMemo<Bar[]>(() => {
    if (!live) return bars
    const forming: Bar = {
      ...live.bar,
      p_high_vol: live.latest.p_high_vol,
      exp_range_atr: live.latest.expected_range_atr,
      regime: live.latest.regime,
      session: live.session,
    }
    if (bars.length > 0 && bars[bars.length - 1].t === forming.t) {
      return [...bars.slice(0, -1), forming]
    }
    return [...bars, forming]
  }, [bars, live])
  const effLatest = live?.latest ?? latest
  const formingAbs = live ? effBars.length - 1 : -1
  const priceDecimals = config.priceDecimals
  const [toggles, setToggles] = useState({ volDots: true, sessions: true, cone: true })
  const [hover, setHover] = useState<Hover | null>(null)
  const dragRef = useRef<{ startX: number; startEnd: number } | null>(null)
  const animStartRef = useRef<number>(performance.now())
  const reducedRef = useRef<boolean>(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const togglesRef = useRef(toggles)
  togglesRef.current = toggles
  const hoverRef = useRef(hover)
  hoverRef.current = hover
  const liveActiveRef = useRef(live != null)
  liveActiveRef.current = live != null

  const maxBars = effBars.length

  /* ---------- geometry ---------- */
  const layout = useMemo(() => {
    return (w: number, h: number) => {
      const plotW = w - PAD_L - AXIS_W
      const plotH = h - PAD_T - TIME_H
      const { end, count } = viewRef.current
      const first = Math.max(0, end - count)
      const visible = effBars.slice(first, end)
      const totalSlots = count + FORECAST_SLOTS
      const spacing = plotW / totalSlots
      const xOf = (absIdx: number) => PAD_L + (absIdx - first + 0.5) * spacing
      const ghostX = (k: number) => PAD_L + (count + k + 0.5) * spacing
      const dividerX = PAD_L + count * spacing

      let lo = Infinity
      let hi = -Infinity
      for (const b of visible) {
        if (b.l < lo) lo = b.l
        if (b.h > hi) hi = b.h
      }
      if (togglesRef.current.cone) {
        const t3 = effLatest.cone.T3.half_width
        lo = Math.min(lo, effLatest.price - t3)
        hi = Math.max(hi, effLatest.price + t3)
      }
      const pad = (hi - lo) * 0.05 || 1
      lo -= pad
      hi += pad
      const yOf = (p: number) => PAD_T + (1 - (p - lo) / (hi - lo)) * plotH

      return { plotW, plotH, first, visible, spacing, xOf, ghostX, dividerX, yOf, lo, hi, count, end }
    }
  }, [effBars, effLatest])

  /* ---------- draw ---------- */
  const draw = useMemo(() => {
    return () => {
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      if (!canvas || !wrap) return
      const dpr = window.devicePixelRatio || 1
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (w === 0 || h === 0) return
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const g = layout(w, h)
      const t = togglesRef.current
      const reduced = reducedRef.current
      const elapsed = performance.now() - animStartRef.current
      const wipeP = reduced ? 1 : easeOut(elapsed / 600)
      const coneP = reduced ? 1 : easeOut((elapsed - 600) / 900)
      const tagP = reduced ? 1 : easeOut((elapsed - 1500) / 250)

      /* session bands */
      if (t.sessions) {
        let runStart = 0
        const paintRun = (a: number, b: number, sess: string) => {
          const fill =
            sess === 'london' ? C.bandLondon : sess === 'ny' ? C.bandNy : sess === 'asia' ? C.bandAsia : null
          if (!fill) return
          ctx.fillStyle = fill
          const x1 = g.xOf(g.first + a) - g.spacing / 2
          const x2 = g.xOf(g.first + b - 1) + g.spacing / 2
          ctx.fillRect(x1, PAD_T, x2 - x1, g.plotH)
        }
        for (let i = 1; i <= g.visible.length; i++) {
          const cur = i < g.visible.length ? g.visible[i].session : null
          const prev = g.visible[i - 1].session
          if (cur !== prev) {
            paintRun(runStart, i, prev)
            runStart = i
          }
        }
      }

      /* gridlines + price axis */
      const step = niceStep(g.hi - g.lo, 5)
      ctx.font = '500 11px "JetBrains Mono", monospace'
      ctx.textBaseline = 'middle'
      for (let p = Math.ceil(g.lo / step) * step; p <= g.hi; p += step) {
        const y = g.yOf(p)
        ctx.strokeStyle = C.grid
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(PAD_L, y)
        ctx.lineTo(PAD_L + g.plotW, y)
        ctx.stroke()
        ctx.fillStyle = C.axis
        ctx.textAlign = 'left'
        ctx.fillText(fmtPrice(p, priceDecimals), PAD_L + g.plotW + 6, y)
      }

      /* time axis */
      const skip = Math.max(1, Math.ceil(90 / g.spacing))
      ctx.textAlign = 'center'
      ctx.fillStyle = C.axis
      for (let i = 0; i < g.visible.length; i += skip) {
        const d = parseT(g.visible[i].t)
        const isDayStart =
          d.getUTCHours() === 0 ||
          (i > 0 && parseT(g.visible[i - 1].t).getUTCDate() !== d.getUTCDate()) ||
          i === 0
        const label = isDayStart
          ? `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`
          : `${String(d.getUTCHours()).padStart(2, '0')}:00`
        ctx.fillText(label, g.xOf(g.first + i), PAD_T + g.plotH + TIME_H / 2)
      }

      /* candles (wipe reveal) */
      const revealCount = Math.ceil(wipeP * g.visible.length)
      const bodyW = Math.max(2, Math.min(g.spacing * 0.62, 14))
      for (let i = 0; i < revealCount; i++) {
        const b = g.visible[i]
        const x = g.xOf(g.first + i)
        const up = b.c >= b.o
        const col = up ? C.up : C.down
        const yo = g.yOf(b.o)
        const yc = g.yOf(b.c)
        const top = Math.min(yo, yc)
        const hgt = Math.max(1, Math.abs(yc - yo))
        const isForming = g.first + i === formingAbs

        if (isForming) {
          /* forming live bar: pulsing semi-transparent candle + dashed gold frame */
          const pulse = reduced ? 0.6 : 0.5 + 0.3 * Math.sin(performance.now() / 350)
          ctx.save()
          ctx.globalAlpha = Math.max(0.25, pulse)
          ctx.strokeStyle = up ? 'rgba(46,189,133,0.8)' : 'rgba(242,73,63,0.8)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x, g.yOf(b.h))
          ctx.lineTo(x, g.yOf(b.l))
          ctx.stroke()
          ctx.fillStyle = col
          ctx.fillRect(x - bodyW / 2, top, bodyW, hgt)
          ctx.restore()
          ctx.save()
          ctx.globalAlpha = reduced ? 0.55 : Math.min(1, pulse + 0.25)
          ctx.strokeStyle = C.gold
          ctx.setLineDash([3, 3])
          ctx.lineWidth = 1
          ctx.strokeRect(x - bodyW / 2 - 1.5, top - 1.5, bodyW + 3, hgt + 3)
          ctx.restore()
        } else {
          ctx.strokeStyle = up ? 'rgba(46,189,133,0.8)' : 'rgba(242,73,63,0.8)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x, g.yOf(b.h))
          ctx.lineTo(x, g.yOf(b.l))
          ctx.stroke()
          ctx.fillStyle = col
          ctx.fillRect(x - bodyW / 2, top, bodyW, hgt)
        }

        /* vol dot */
        if (t.volDots && b.p_high_vol != null && b.p_high_vol >= 0.5) {
          const r = 1.5 + ((b.p_high_vol - 0.5) / 0.5) * 2
          ctx.fillStyle = C.gold
          ctx.beginPath()
          ctx.arc(x, PAD_T + g.plotH - 6, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      /* forecast zone */
      const lastBar = effBars[g.end - 1]
      if (t.cone && coneP > 0 && lastBar) {
        const centers = [1, 2, 3].map((k) => g.ghostX(k))
        const halves = [effLatest.cone.T1.half_width, effLatest.cone.T2.half_width, effLatest.cone.T3.half_width]
        const xLast = g.xOf(g.end - 1)
        const yClose = g.yOf(lastBar.c)

        /* divider + tag */
        ctx.strokeStyle = C.divider
        ctx.setLineDash([5, 4])
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(g.dividerX, PAD_T)
        ctx.lineTo(g.dividerX, PAD_T + g.plotH)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.font = '500 10px "JetBrains Mono", monospace'
        const tagW = ctx.measureText('FORECAST').width + 12
        ctx.fillStyle = '#171E27'
        ctx.strokeStyle = '#2A3542'
        ctx.beginPath()
        ctx.roundRect(g.dividerX - tagW / 2, PAD_T + 6, tagW, 16, 3)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#A9B4C0'
        ctx.textAlign = 'center'
        ctx.fillText('FORECAST', g.dividerX, PAD_T + 14)

        /* cone fill */
        const xs = [xLast, ...centers]
        const upper = [yClose, ...halves.map((hw) => g.yOf(effLatest.price + hw * coneP))]
        const lower = [yClose, ...halves.map((hw) => g.yOf(effLatest.price - hw * coneP))]
        const grad = ctx.createLinearGradient(xLast, 0, centers[2], 0)
        grad.addColorStop(0, 'rgba(232,178,58,0.07)')
        grad.addColorStop(1, 'rgba(232,178,58,0.01)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.moveTo(xs[0], upper[0])
        for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], upper[i])
        for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(xs[i], lower[i])
        ctx.closePath()
        ctx.fill()

        /* cone dashed edges */
        ctx.strokeStyle = 'rgba(232,178,58,0.6)'
        ctx.setLineDash([5, 4])
        ctx.lineWidth = 1
        for (const edge of [upper, lower]) {
          ctx.beginPath()
          ctx.moveTo(xs[0], edge[0])
          for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], edge[i])
          ctx.stroke()
        }
        ctx.setLineDash([])

        /* cone end labels at right edge */
        ctx.font = '500 11px "JetBrains Mono", monospace'
        ctx.fillStyle = C.gold
        ctx.textAlign = 'right'
        const labelX = PAD_L + g.plotW - 4
        halves.forEach((hw, i) => {
          ctx.fillText(`T+${i + 1} ±${hw.toFixed(1)}`, labelX, g.yOf(effLatest.price + hw * coneP) - 6)
        })

        /* ghost candles T+1..T+3 */
        const driftCol = effLatest.drift_sign >= 0 ? C.up : C.down
        const opacBase = effLatest.confidence / 5
        const ghostBodyW = Math.max(3, Math.min(g.spacing * 0.55, 13))
        ;[0.34, 0.26, 0.2].forEach((op, i) => {
          const k = i + 1
          const gp = reduced ? 1 : easeOut((elapsed - 900 - i * 120) / 300)
          if (gp <= 0) return
          const hw = halves[i] * coneP
          const nudge = effLatest.drift_sign * k * effLatest.cone.T1.half_width * 0.04
          const cx = centers[i]
          const cy = g.yOf(effLatest.price + nudge) + (1 - gp) * 8
          const alpha = op * opacBase * gp
          ctx.save()
          ctx.globalAlpha = alpha
          ctx.shadowColor = driftCol
          ctx.shadowBlur = 12
          ctx.fillStyle = driftCol
          /* body spans ±0.55*hw around center; wicks to ±hw */
          const yTop = g.yOf(effLatest.price + nudge + hw * 0.55) + (1 - gp) * 8
          const yBot = g.yOf(effLatest.price + nudge - hw * 0.55) + (1 - gp) * 8
          ctx.fillRect(cx - ghostBodyW / 2, yTop, ghostBodyW, Math.max(2, yBot - yTop))
          ctx.restore()
          /* border at 70% */
          ctx.save()
          ctx.globalAlpha = 0.7 * gp
          ctx.strokeStyle = driftCol
          ctx.lineWidth = 1
          ctx.strokeRect(cx - ghostBodyW / 2, yTop, ghostBodyW, Math.max(2, yBot - yTop))
          /* wicks */
          const wickHalf = g.yOf(effLatest.price + nudge - hw) - g.yOf(effLatest.price + nudge)
          ctx.beginPath()
          ctx.moveTo(cx, cy - wickHalf)
          ctx.lineTo(cx, cy + wickHalf)
          ctx.stroke()
          ctx.restore()
        })

        /* honesty watermark */
        ctx.font = '500 11px "JetBrains Mono", monospace'
        ctx.fillStyle = C.text3
        ctx.textAlign = 'center'
        const zoneMid = (g.dividerX + PAD_L + g.plotW) / 2
        ctx.fillText('range forecast only — direction not predicted', zoneMid, PAD_T + g.plotH - 16)
      }

      /* last price line + tag + countdown */
      if (tagP > 0) {
        const y = g.yOf(effLatest.price)
        ctx.save()
        ctx.globalAlpha = tagP
        ctx.strokeStyle = C.gold
        ctx.setLineDash([3, 4])
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(PAD_L, y)
        ctx.lineTo(PAD_L + g.plotW, y)
        ctx.stroke()
        ctx.setLineDash([])
        /* tag pill on right axis */
        const label = fmtPrice(effLatest.price, priceDecimals)
        ctx.font = '600 11px "JetBrains Mono", monospace'
        const tw = ctx.measureText(label).width + 12
        const th = 18
        const tx = PAD_L + g.plotW + 2
        ctx.fillStyle = C.gold
        ctx.beginPath()
        ctx.roundRect(tx, y - th / 2, tw, th, 4)
        ctx.fill()
        ctx.fillStyle = '#0C0F13'
        ctx.textAlign = 'center'
        ctx.fillText(label, tx + tw / 2, y + 0.5)
        /* countdown chip — only when a live forming bar exists (static
           symbols show no ticking close timer) */
        if (live) {
          const now = Date.now()
          const msLeft = 3600000 - (now % 3600000)
          const mm = String(Math.floor(msLeft / 60000)).padStart(2, '0')
          const ss = String(Math.floor((msLeft % 60000) / 1000)).padStart(2, '0')
          ctx.font = '500 10px "JetBrains Mono", monospace'
          ctx.fillStyle = C.axis
          ctx.fillText(`closes ${mm}:${ss}`, tx + tw / 2, y + th / 2 + 12)
        }
        ctx.restore()
      }

      /* crosshair */
      const hv = hoverRef.current
      if (hv && hv.barIdx != null && hv.barIdx >= g.first && hv.barIdx < g.end) {
        const x = g.xOf(hv.barIdx)
        ctx.strokeStyle = C.crosshair
        ctx.setLineDash([4, 4])
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, PAD_T)
        ctx.lineTo(x, PAD_T + g.plotH)
        ctx.moveTo(PAD_L, hv.y)
        ctx.lineTo(PAD_L + g.plotW, hv.y)
        ctx.stroke()
        ctx.setLineDash([])
      } else if (hv && hv.ghostK != null) {
        const x = g.ghostX(hv.ghostK)
        ctx.strokeStyle = C.crosshair
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(x, PAD_T)
        ctx.lineTo(x, PAD_T + g.plotH)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }, [effBars, effLatest, live, layout, priceDecimals])

  const drawRef = useRef(draw)
  drawRef.current = draw

  /* ---------- intro animation + 1s countdown redraw ---------- */
  /* runs once: draw() reads live data via refs, so ticks/cone updates never
     replay the wipe. While a live forming bar is present (and motion is
     allowed) a rAF loop keeps the candle pulse smooth. */
  useEffect(() => {
    animStartRef.current = performance.now()
    let raf = 0
    const tick = () => {
      drawRef.current()
      const introRunning = performance.now() - animStartRef.current < 2200
      if (!reducedRef.current && (introRunning || liveActiveRef.current)) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    const iv = setInterval(() => drawRef.current(), 1000)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* extend the view to include a newly appended forming bar (unless panned) */
  const prevLenRef = useRef(effBars.length)
  useEffect(() => {
    const v = viewRef.current
    if (effBars.length === prevLenRef.current + 1 && v.end === prevLenRef.current) {
      v.end = effBars.length
      drawRef.current()
    }
    prevLenRef.current = effBars.length
  }, [effBars.length])

  /* redraw on toggle/hover change */
  useEffect(() => {
    drawRef.current()
  }, [toggles, hover])

  /* resize */
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => drawRef.current())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  /* wheel zoom (non-passive) */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = viewRef.current
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15
      const next = Math.round(Math.max(MIN_VISIBLE, Math.min(maxBars, v.count * factor)))
      if (next !== v.count) {
        v.count = next
        v.end = Math.min(maxBars, Math.max(next, v.end))
        drawRef.current()
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [maxBars])

  /* ---------- pointer handlers ---------- */
  const slotFromEvent = (e: React.PointerEvent): { abs: number | null; ghostK: number | null; x: number; y: number } => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const w = rect.width
    const g = layout(w, rect.height)
    const slot = Math.floor((x - PAD_L) / g.spacing)
    if (slot >= 0 && slot < g.count) return { abs: g.first + slot, ghostK: null, x, y }
    for (let k = 1; k <= 3; k++) {
      if (slot === g.count + k) return { abs: null, ghostK: k, x, y }
    }
    return { abs: null, ghostK: null, x, y }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startEnd: viewRef.current.end }
    canvasRef.current?.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current) {
      const rect = canvasRef.current!.getBoundingClientRect()
      const g = layout(rect.width, rect.height)
      const dx = dragRef.current.startX - e.clientX
      const dBars = Math.round(dx / g.spacing)
      const next = Math.min(maxBars, Math.max(viewRef.current.count, dragRef.current.startEnd + dBars))
      if (next !== viewRef.current.end) {
        viewRef.current.end = next
        drawRef.current()
      }
      return
    }
    const s = slotFromEvent(e)
    setHover((prev) => {
      const next: Hover | null =
        s.abs != null || s.ghostK != null ? { x: s.x, y: s.y, barIdx: s.abs, ghostK: s.ghostK } : null
      if (prev === next) return prev
      if (!prev || !next) return next
      if (prev.barIdx === next.barIdx && prev.ghostK === next.ghostK && Math.abs(prev.x - next.x) < 1 && Math.abs(prev.y - next.y) < 1) return prev
      return next
    })
  }
  const onPointerUp = () => {
    dragRef.current = null
  }
  const onDoubleClick = () => {
    viewRef.current = { end: maxBars, count: Math.min(DEFAULT_VISIBLE, maxBars) }
    drawRef.current()
  }

  const hoveredBar = hover?.barIdx != null ? effBars[hover.barIdx] : null
  const hoveringForming = hover?.barIdx != null && hover.barIdx === formingAbs
  const ghostHw = hover?.ghostK != null ? effLatest.cone[(`T${hover.ghostK}`) as 'T1' | 'T2' | 'T3'].half_width : null

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
        role="img"
        aria-label={`${config.symbol} H1 candlestick chart with T+1 to T+3 volatility cone forecast`}
        aria-describedby="chart-data-summary"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setHover(null)
          dragRef.current = null
        }}
        onDoubleClick={onDoubleClick}
      />

      {/* toggle chips + session legend */}
      <div className="absolute right-2 top-2 flex flex-wrap items-center gap-1.5">
        {(
          [
            ['volDots', 'Vol dots'],
            ['sessions', 'Sessions'],
            ['cone', 'Cone'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setToggles((t) => ({ ...t, [key]: !t[key] }))}
            className={cn(
              'rounded border px-2 py-0.5 font-mono text-[10px] font-medium transition-colors duration-150',
              toggles[key] ? 'border-gold/50 bg-gold/10 text-gold' : 'border-line bg-bg3/80 text-text2',
            )}
            aria-pressed={toggles[key]}
          >
            {label}
          </button>
        ))}
        {toggles.sessions && (
          <span className="ml-1 hidden items-center gap-2 sm:flex">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ background: 'rgba(255,255,255,0.15)' }} />
              <span className="micro-mono">Asia</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ background: 'rgba(91,141,239,0.5)' }} />
              <span className="micro-mono">London</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ background: 'rgba(232,178,58,0.55)' }} />
              <span className="micro-mono">NY</span>
            </span>
          </span>
        )}
      </div>

      {/* crosshair tooltip */}
      {hover && (hoveredBar || ghostHw != null) && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-linestrong bg-bg3 px-3 py-2 font-mono text-[11px] leading-5 text-text0 shadow-lg"
          style={{
            left: Math.min(hover.x + 14, (wrapRef.current?.clientWidth ?? 400) - 210),
            top: Math.max(hover.y - 10, 8),
          }}
        >
          {hoveredBar ? (
            <>
              <div className="text-text2">
                {hoveredBar.t} UTC
                {hoveringForming && <span className="text-gold"> · FORMING — live, not closed</span>}
              </div>
              <div>
                O <span className="tnum">{fmtPrice(hoveredBar.o, priceDecimals)}</span> H{' '}
                <span className="tnum">{fmtPrice(hoveredBar.h, priceDecimals)}</span>
              </div>
              <div>
                L <span className="tnum">{fmtPrice(hoveredBar.l, priceDecimals)}</span> C{' '}
                <span className={hoveredBar.c >= hoveredBar.o ? 'text-up' : 'text-down'}>
                  {fmtPrice(hoveredBar.c, priceDecimals)}
                </span>{' '}
                {hoveredBar.c >= hoveredBar.o ? '▲' : '▼'}
              </div>
              <div className="text-text1">
                P(high-vol) {hoveredBar.p_high_vol != null ? hoveredBar.p_high_vol.toFixed(2) : '—'} · Exp. range{' '}
                {hoveredBar.exp_range_atr != null ? `${hoveredBar.exp_range_atr.toFixed(2)} ATR` : '—'}
              </div>
              <div className="text-text2">
                {hoveredBar.regime} · {hoveredBar.session}
              </div>
            </>
          ) : (
            <>
              <div className="text-gold">T+{hover!.ghostK} cone half-width ±{ghostHw!.toFixed(2)}</div>
              <div className="text-text1">√-time scaling · not a direction call</div>
            </>
          )}
        </div>
      )}

      {/* data-table fallback summary (a11y) */}
      <p id="chart-data-summary" className="sr-only">
        {`Showing the last ${Math.min(viewRef.current.count, effBars.length)} of ${effBars.length} ${config.symbol} H1 bars. Latest price ${fmtPrice(effLatest.price, priceDecimals)}. Forecast cone half-widths: T+1 ±${effLatest.cone.T1.half_width.toFixed(1)}, T+2 ±${effLatest.cone.T2.half_width.toFixed(1)}, T+3 ±${effLatest.cone.T3.half_width.toFixed(1)} ${priceUnit(config)}. Range forecast only — direction not predicted.`}
      </p>
    </div>
  )
}
