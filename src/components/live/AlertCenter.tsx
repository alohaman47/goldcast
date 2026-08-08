import { memo, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellRing, Trash2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVolAlerts, type VolAlertType } from '@/hooks/useVolAlerts'
import { useTimezone, fmtWallClock, tzSuffix } from '@/hooks/useTimezone'
import type { DisplayTz } from '@/hooks/useTimezone'
import type { LivePredictionState } from '@/hooks/useLivePrediction'

/**
 * Vol Alert center: bell button (armed dot + unseen badge) next to the
 * LiveBadge, opening an honest control panel — armed toggle, threshold /
 * surge-Δ sliders, sound + browser-notification toggles (with real
 * permission states), alert log, and a dev-only test fire.
 *
 * Alerts fire ONLY while the engine reports status 'live'; any other state
 * (boot/stale/gap/error) is shown as "alerts paused — not live".
 */

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]
const FLASH_MS = 3_500

function fmtClock(ms: number, tz: DisplayTz): string {
  return `${fmtWallClock(new Date(ms), tz, false)} ${tzSuffix(tz)}`
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

const TYPE_LABEL: Record<VolAlertType, string> = {
  threshold: 'THRESHOLD',
  surge: 'SURGE',
  test: 'TEST',
}

const TYPE_CLS: Record<VolAlertType, string> = {
  threshold: 'border-gold/40 bg-gold/10 text-gold',
  surge: 'border-warn/40 bg-warn/10 text-warn',
  test: 'border-line bg-bg3 text-text2',
}

function Toggle({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[11px] font-medium text-text1">{label}</p>
        {hint && <p className="micro-mono mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={cn(
          'relative h-[18px] w-8 shrink-0 rounded-full border transition-colors duration-150',
          on ? 'border-gold/60 bg-gold/15' : 'border-line bg-bg3',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-all duration-150',
            on ? 'left-[16px] bg-gold' : 'left-[3px] bg-text2',
          )}
        />
      </button>
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="label-caps">{label}</span>
        <span className="font-mono text-[12px] font-semibold tnum text-gold">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-1.5 w-full accent-gold"
      />
      <div className="micro-mono flex justify-between">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  )
}

export default memo(function AlertCenter({ live }: { live: LivePredictionState }) {
  const alerts = useVolAlerts(live)
  const { tz } = useTimezone()
  const [open, setOpen] = useState(false)
  const [flashing, setFlashing] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)

  /* gold pulse flash on the bell after a fire */
  useEffect(() => {
    if (alerts.lastFiredAtMs == null) return
    setFlashing(true)
    const t = window.setTimeout(() => setFlashing(false), FLASH_MS)
    return () => window.clearTimeout(t)
  }, [alerts.lastFiredAtMs])

  /* close on outside click / Escape */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggleOpen = () => {
    setOpen((o) => {
      if (!o) alerts.markSeen()
      return !o
    })
  }

  const notifyHint =
    alerts.notifyPermission === 'unsupported'
      ? 'unsupported in this browser'
      : alerts.notifyPermission === 'granted'
        ? 'permission granted'
        : alerts.notifyPermission === 'denied'
          ? 'permission denied by browser'
          : 'permission not requested'

  const pulse = !reducedMotion && alerts.isLive && alerts.armed

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-label={`Vol alerts ${alerts.armed ? 'armed' : 'disarmed'}`}
        title="Vol alerts"
        className={cn(
          'relative flex items-center gap-1.5 rounded border px-2 py-1 transition-colors duration-150',
          open || alerts.armed
            ? 'border-gold/50 bg-gold/10 text-gold'
            : 'border-line bg-bg3/80 text-text2 hover:border-gold/50 hover:text-gold',
        )}
      >
        {/* firing flash ring (honors reduced motion) */}
        {flashing && !reducedMotion && (
          <span className="pointer-events-none absolute inset-0 rounded border border-gold shadow-gold-glow animate-pulse-dot" aria-hidden="true" />
        )}
        {alerts.armed ? <BellRing size={13} /> : <Bell size={13} />}
        <span className="font-mono text-[10px] font-semibold tracking-[0.06em]">
          {alerts.armed ? 'ARMED' : 'ALERTS'}
        </span>
        {/* armed state dot */}
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            alerts.armed && alerts.isLive ? 'bg-gold' : alerts.armed ? 'bg-warn' : 'bg-text3',
            pulse && 'animate-pulse-dot',
          )}
          aria-hidden="true"
        />
        {/* unseen count badge */}
        {alerts.unseen > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 font-mono text-[9px] font-bold leading-none text-bg0">
            {alerts.unseen > 9 ? '9+' : alerts.unseen}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
            transition={{ duration: reducedMotion ? 0 : 0.16, ease: EASE }}
            className="panel panel-gold absolute right-0 top-full z-50 mt-2 w-[320px] p-3"
            role="dialog"
            aria-label="Vol alert settings"
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="panel-title text-[13px]">Vol alerts</h2>
              {import.meta.env.DEV && (
                <button
                  type="button"
                  onClick={alerts.testFire}
                  className="flex items-center gap-1 rounded border border-line bg-bg3/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-text2 transition-colors duration-150 hover:border-gold/50 hover:text-gold"
                  title="Fire a synthetic test alert (dev only)"
                >
                  <Zap size={10} />
                  test
                </button>
              )}
            </div>

            {/* live/paused honesty line */}
            <p
              className={cn(
                'mt-2 font-mono text-[10px] font-medium tracking-[0.04em]',
                alerts.isLive ? 'text-up' : 'text-warn',
              )}
              role="status"
            >
              {alerts.isLive
                ? `watching p_high_vol · live`
                : `alerts paused — not live (${alerts.status})`}
            </p>

            <div className="mt-3 flex flex-col gap-3">
              <Toggle on={alerts.armed} onChange={alerts.setArmed} label="Armed" hint="rising edge + surge detection" />

              <SliderRow
                label="Threshold p"
                value={alerts.settings.threshold}
                min={0.5}
                max={0.95}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => alerts.setSettings({ threshold: v })}
              />

              <SliderRow
                label="Surge Δ / 10 min"
                value={alerts.settings.delta}
                min={0.05}
                max={0.3}
                step={0.05}
                format={(v) => `Δ ${v.toFixed(2)}`}
                onChange={(v) => alerts.setSettings({ delta: v })}
              />

              <Toggle
                on={alerts.settings.soundOn}
                onChange={(v) => alerts.setSettings({ soundOn: v })}
                label="Sound"
                hint="two-tone beep on fire"
              />

              <Toggle
                on={alerts.settings.notifyOn}
                onChange={(v) => alerts.setSettings({ notifyOn: v })}
                label="Notifications"
                hint={notifyHint}
              />
            </div>

            {/* alert log */}
            <div className="mt-3 border-t border-line pt-2">
              <div className="flex items-center justify-between">
                <span className="label-caps">Alert log</span>
                <button
                  type="button"
                  onClick={alerts.clearLog}
                  disabled={alerts.log.length === 0}
                  className="flex items-center gap-1 rounded border border-line bg-bg3/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-text2 transition-colors duration-150 hover:border-down/50 hover:text-down disabled:cursor-default disabled:opacity-40 disabled:hover:border-line disabled:hover:text-text2"
                >
                  <Trash2 size={10} />
                  clear
                </button>
              </div>
              {alerts.log.length === 0 ? (
                <p className="micro-mono mt-2">no alerts yet — quiet is honest</p>
              ) : (
                <ul className="mt-2 flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
                  {alerts.log.map((e, i) => (
                    <li
                      key={`${e.time}-${e.type}-${i}`}
                      className="flex items-center justify-between gap-2 rounded border border-line bg-bg2/60 px-2 py-1"
                    >
                      <span className="micro-mono shrink-0">{fmtClock(e.time, tz)}</span>
                      <span
                        className={cn(
                          'shrink-0 rounded border px-1 py-px font-mono text-[9px] font-semibold tracking-[0.05em]',
                          TYPE_CLS[e.type],
                        )}
                      >
                        {TYPE_LABEL[e.type]}
                      </span>
                      <span className="ml-auto font-mono text-[11px] tnum text-text0">
                        p {e.value.toFixed(2)}
                      </span>
                      {e.previous != null && (
                        <span className="micro-mono shrink-0">← {e.previous.toFixed(2)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
