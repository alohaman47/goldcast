import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import HonestyBadge from '@/components/HonestyBadge'
import { CustomChip } from '@/components/truth/shared'
import { useReducedMotion } from '@/components/truth/motion'

const LINES = [
  ['engine:', 'vol_engine.pkl (sklearn HistGradientBoosting)'],
  ['classifier:', 'P(range[t+1] > 1.2 × ATR14[t])'],
  ['regressor:', 'E[range[t+1] / ATR14[t]]'],
  ['features:', 'hour_sin, hour_cos, ret3, macd_hist_raw, rv20, ...'],
  ['validation:', 'walk-forward, out-of-sample only'],
  ['export:', 'latest.json · bars.json · sessions.json · truth.json'],
  ['direction:', 'NOT MODELLED — see /truth'],
]

/**
 * Model card (methodology.md §5): terminal-style config dump that types in
 * line-by-line when it enters view; honesty badges stamp after the last line.
 */
export default function ModelCard() {
  const root = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()
  const [started, setStarted] = useState(false)
  const [shown, setShown] = useState(0)
  const visible = reduced ? LINES.length : shown
  const done = visible >= LINES.length

  useEffect(() => {
    const el = root.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true)
          obs.disconnect()
        }
      },
      { threshold: 0.4 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!started || reduced) return
    if (shown >= LINES.length) return
    const id = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 250 : 120)
    return () => clearTimeout(id)
  }, [started, shown, reduced])

  return (
    <div ref={root}>
      <div className="rounded-[10px] border border-line bg-bg3 p-4 font-mono text-[12px] leading-6">
        <div className="mb-3 flex items-center gap-1.5 border-b border-line pb-2">
          <span className="h-2 w-2 rounded-full bg-down/70" />
          <span className="h-2 w-2 rounded-full bg-warn/70" />
          <span className="h-2 w-2 rounded-full bg-up/70" />
          <span className="micro-mono ml-2">cat model_card.txt</span>
        </div>
        {LINES.slice(0, visible).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[92px_1fr] gap-2">
            <span className="text-golddim">{k}</span>
            <span className={k === 'direction:' ? 'font-semibold text-honest' : 'text-text0'}>{v}</span>
          </div>
        ))}
        {!done && started && <span className="inline-block h-4 w-2 animate-pulse bg-gold align-middle" />}
        {!started && <div className="h-[168px]" aria-hidden />}
      </div>

      <motion.div
        className="mt-3 flex flex-wrap gap-2"
        initial={false}
        animate={done ? { opacity: 1, scale: 1 } : { opacity: reduced ? 1 : 0, scale: reduced ? 1 : 1.4 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <HonestyBadge kind="verified-oos" tooltip="Walk-forward OOS, verified twice" />
        <CustomChip label="⚠ NO DIRECTION HEAD" tone="warn" />
      </motion.div>
    </div>
  )
}
