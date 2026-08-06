import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './motion'

/** Animated counter ("Counter tick", design.md §5): counts up 800ms, terminal ease. */
export function Counter({
  value,
  format,
  duration = 800,
  className,
  started = true,
}: {
  value: number
  format: (v: number) => string
  duration?: number
  className?: string
  started?: boolean
}) {
  const reduced = useReducedMotion()
  const [animVal, setAnimVal] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (reduced || !started) return
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 4)
      setAnimVal(value * eased)
      if (p < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration, reduced, started])

  const display = reduced ? value : started ? animVal : 0
  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {format(display)}
    </span>
  )
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="label-caps !text-gold">{children}</span>
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={
        'font-display text-[28px] font-semibold leading-[34px] tracking-[-0.01em] text-text0 ' + (className ?? '')
      }
    >
      {children}
    </h2>
  )
}

/** Amber honesty chip with a custom label (shared HonestyBadge has fixed labels). */
export function CustomChip({
  label,
  tone,
  className,
}: {
  label: string
  tone: 'warn' | 'ok' | 'neutral'
  className?: string
}) {
  const tones = {
    warn: 'border-warn/50 bg-warn/10 text-warn',
    ok: 'border-up/50 bg-up/10 text-up',
    neutral: 'border-honest/40 bg-honest/10 text-honest',
  } as const
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.04em] ${tones[tone]} ${className ?? ''}`}
    >
      {label}
    </span>
  )
}
