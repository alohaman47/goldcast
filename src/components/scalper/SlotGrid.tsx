import { memo, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import type { ScalperSlot } from '@/hooks/useData'
import { useTimezone, fmtWallClock, tzSuffix, utcHourInTz, utcLabelToTz } from '@/hooks/useTimezone'
import { cn } from '@/lib/utils'
import {
  TERMINAL_EASE,
  fmtAtr,
  fmtInt,
  fmtPct,
  fmtSlotRange,
  pad2,
  slotAtrExtent,
  slotFill,
  slotIndexFor,
} from './utils'

interface HoverState {
  idx: number
  x: number
  y: number
}

/**
 * Gold pulse ring for the single hottest slot (driven by
 * highlights.hottest_slot.slot — 16:30 UTC on NAS100 M15, 15:30 UTC on gold
 * M15 and gold M5). Isolated + memoized so the perpetual boxShadow loop
 * never re-renders the slot grid.
 */
const HotPulse = memo(function HotPulse({ reduced }: { reduced: boolean }) {
  if (reduced) {
    return <span className="pointer-events-none absolute -inset-[3px] rounded-[6px] border-2 border-goldhi" aria-hidden />
  }
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute -inset-[3px] rounded-[6px] border-2 border-goldhi"
      animate={{
        boxShadow: [
          '0 0 0 0 rgba(245,205,107,0.55)',
          '0 0 0 7px rgba(245,205,107,0)',
        ],
      }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
    />
  )
})

interface SlotGridProps {
  slots: ScalperSlot[]
  hottestSlotIdx: number
  now: Date
  /** meta.symbol of the active export — per-market range units/decimals. */
  symbol: string
}

/**
 * Slot heatmap: 24 hour columns × (slots.length/24) slot rows — 4 quarter
 * rows at M15 (96 slots), 12 five-minute rows at M5 (288 slots). Fully
 * length-agnostic: no 96/288 constants; slot-minutes derive from
 * 1440/slots.length. Thermal fill is avg_range_atr normalized per dataset;
 * null slots (00:xx session break) render hollow/dashed.
 */
export default function SlotGrid({ slots, hottestSlotIdx, now, symbol }: SlotGridProps) {
  const [hover, setHover] = useState<HoverState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inView = useInView(containerRef, { once: true, amount: 0.2 })
  const reducedMotion = useReducedMotion()
  /* Phase 14: display tz for labels only — slot order/identity stays UTC.
     `now` is the DST reference for America/New_York conversion. */
  const { tz } = useTimezone()

  const extent = useMemo(() => slotAtrExtent(slots), [slots])
  const byIdx = useMemo(() => {
    const m = new Map<number, ScalperSlot>()
    for (const s of slots) m.set(s.slot, s)
    return m
  }, [slots])

  /* Grid geometry derived from the dataset itself (Phase 13 — M5 = 288). */
  const slotsPerDay = slots.length
  const rowsPerHour = Math.max(1, Math.round(slotsPerDay / 24))
  const rowMinutes = useMemo(
    () => Array.from({ length: rowsPerHour }, (_, r) => Math.round((r * 60) / rowsPerHour)),
    [rowsPerHour],
  )
  const dense = rowsPerHour > 4

  const nowIdx = slotIndexFor(now, slotsPerDay)
  const hoverSlot = hover ? byIdx.get(hover.idx) : undefined
  /* Session-break presence is data-driven (gold/NAS100/GER40 break at
     00:xx; US30 + FX trade 24h) — the legend never claims a break that
     isn't in the JSON. */
  const hasBreak = slots.some((s) => s.avg_range_atr == null || s.bar_count === 0)

  const handleMove = (idx: number) => (e: MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({ idx, x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const clock = fmtWallClock(now, tz)

  return (
    <section aria-label={`${slotsPerDay}-slot volatility heatmap`}>
      <div className="panel panel-gold relative overflow-hidden p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="panel-title">The {slotsPerDay}-Slot Map — avg range in ATR</h2>
          <span className="inline-flex items-center gap-2 rounded-md border border-linestrong bg-bg2 px-2.5 py-1 font-mono text-[12px] tnum text-text0">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-up" />
            {clock} {tzSuffix(tz)}
          </span>
        </div>

        <div ref={containerRef} className="relative mt-4">
          {/* header row: hour labels (every 2h) + now caret */}
          <div className="grid" style={{ gridTemplateColumns: '44px repeat(24, minmax(0,1fr))' }}>
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="relative pb-1 text-center">
                <span className={cn('micro-mono', h % 2 === 0 ? 'text-text2' : 'text-transparent select-none')}>
                  {utcHourInTz(h, tz, now)}
                </span>
                {nowIdx >= h * rowsPerHour && nowIdx < (h + 1) * rowsPerHour && (
                  <span
                    aria-hidden
                    className="absolute -bottom-[3px] h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-goldhi"
                    style={{ left: `calc(${((nowIdx % rowsPerHour) + 0.5) * (100 / rowsPerHour)}% - 5px)` }}
                  />
                )}
              </span>
            ))}
          </div>

          {/* rowsPerHour slot rows × 24 hour columns (4 at M15, 12 at M5) */}
          {rowMinutes.map((minute, row) => (
            <div
              key={minute}
              className={cn('grid gap-[3px]', dense && row > 0 && 'mt-[2px]')}
              style={{ gridTemplateColumns: '44px repeat(24, minmax(0,1fr))' }}
              role="row"
            >
              <span className="micro-mono flex items-center justify-end pr-2">:{pad2(minute)}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const idx = h * rowsPerHour + row
                const s = byIdx.get(idx)
                const isNull = !s || s.avg_range_atr == null || s.bar_count === 0
                const isHottest = idx === hottestSlotIdx
                const isNow = idx === nowIdx
                const dimmed = hover != null && hover.idx !== idx
                return (
                  <motion.div
                    key={idx}
                    role="gridcell"
                    aria-label={
                      isNull
                        ? `${utcLabelToTz(s?.label ?? `${pad2(h)}:${pad2(minute)}`, tz, now)} ${tzSuffix(tz)} — session break, no bars`
                        : `${utcLabelToTz(s.label, tz, now)} ${tzSuffix(tz)} · ${fmtAtr(s.avg_range_atr)}ATR · range ${fmtSlotRange(s.avg_range_usd, symbol)} · P(high-vol) ${fmtPct(s.p_high_vol_empirical)} · n=${fmtInt(s.bar_count)}`
                    }
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={inView ? { opacity: dimmed ? 0.35 : 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
                    transition={{
                      /* denser grids stagger faster so the reveal stays snappy */
                      delay: reducedMotion ? 0 : idx * (dense ? 0.002 : 0.006),
                      duration: reducedMotion ? 0 : 0.3,
                      ease: TERMINAL_EASE,
                      opacity: dimmed ? { duration: 0.12, delay: 0 } : undefined,
                    }}
                    className={cn(
                      'relative cursor-crosshair rounded-[4px]',
                      dense ? 'h-4 sm:h-5' : 'h-8 sm:h-9',
                      isNull && 'border border-dashed border-text3/80 bg-transparent',
                      isNow && 'outline outline-1 outline-offset-1 outline-goldhi',
                      isHottest && 'z-10',
                    )}
                    style={{
                      backgroundColor: isNull ? undefined : slotFill(s.avg_range_atr, extent),
                      transition: 'opacity 120ms ease',
                    }}
                    onMouseMove={handleMove(idx)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {isHottest && <HotPulse reduced={reducedMotion ?? false} />}
                  </motion.div>
                )
              })}
            </div>
          ))}

          {/* mono hover tooltip */}
          {hover && hoverSlot && (
            <div
              className="pointer-events-none absolute z-20 rounded-md border border-linestrong bg-bg3 px-3 py-2 font-mono text-[11px] leading-[18px] text-text0 shadow-lg"
              style={{
                left: Math.min(Math.max(hover.x + 14, 8), (containerRef.current?.clientWidth ?? 600) - 250),
                top: Math.max(hover.y - 16, 8),
              }}
            >
              {hoverSlot.avg_range_atr == null || hoverSlot.bar_count === 0 ? (
                <span className="text-honest">
                  {utcLabelToTz(hoverSlot.label, tz, now)} {tzSuffix(tz)} — session break, no bars
                </span>
              ) : (
                <>
                  <span className="text-gold">
                    {utcLabelToTz(hoverSlot.label, tz, now)} {tzSuffix(tz)}
                  </span>
                  <span className="text-text2"> · </span>
                  {fmtAtr(hoverSlot.avg_range_atr)}ATR
                  <span className="text-text2"> · range </span>
                  {fmtSlotRange(hoverSlot.avg_range_usd, symbol)}
                  <span className="text-text2"> · P(high-vol) </span>
                  {fmtPct(hoverSlot.p_high_vol_empirical)}
                  <span className="text-text2"> · n=</span>
                  {fmtInt(hoverSlot.bar_count)}
                </>
              )}
            </div>
          )}

          {/* legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-24 rounded-sm"
                style={{ background: 'linear-gradient(90deg, #241b0e, #F5A623)' }}
              />
              <span className="micro-mono">
                {fmtAtr(extent[0])} → {fmtAtr(extent[1])} ATR
              </span>
            </span>
            {/* session-break legend only when the dataset HAS a break —
                US30 + the FX markets trade all 24 hours (no hollow slots) */}
            {hasBreak && (
              <span className="micro-mono flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-[3px] border border-dashed border-text3/80" />
                {tz === 'NY' ? `${utcHourInTz(0, tz, now)}:xx NY` : '00:xx'} hollow = session break (no bars)
              </span>
            )}
            <span className="micro-mono flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-[3px] border-2 border-goldhi" />
              gold ring = hottest slot · outline = now
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
