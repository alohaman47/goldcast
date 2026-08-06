import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type HonestyKind = 'not-predictable' | 'verified-oos' | 'real-edge'

const CONFIG: Record<HonestyKind, { label: string; tone: 'warn' | 'ok' }> = {
  'not-predictable': { label: '⚠ NOT PREDICTABLE', tone: 'warn' },
  'verified-oos': { label: '✓ VERIFIED OOS', tone: 'ok' },
  'real-edge': { label: '✓ REAL EDGE', tone: 'ok' },
}

/**
 * Signature honesty chip (design.md §7.3). Amber for warnings, green for verified.
 */
export default function HonestyBadge({
  kind,
  tooltip,
  className,
}: {
  kind: HonestyKind
  tooltip?: string
  className?: string
}) {
  const { label, tone } = CONFIG[kind]
  return (
    <span
      title={tooltip}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.04em]',
        tone === 'warn' ? 'border-warn/50 bg-warn/10 text-warn' : 'border-up/50 bg-up/10 text-up',
        className,
      )}
    >
      {tone === 'warn' ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
      {label.replace(/^[⚠✓]\s*/, '')}
    </span>
  )
}
