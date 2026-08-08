import { AlertTriangle } from 'lucide-react'
import { useTimezone, fmtTimestampInTz, tzSuffix } from '@/hooks/useTimezone'

/**
 * GAP banner: static chart history ends > 48h before now. History is frozen;
 * the live prediction still runs on the current forming bar. Intermediate
 * candles are never fabricated.
 */
export default function GapBanner({ gapHours, lastStaticT }: { gapHours: number; lastStaticT: string }) {
  const { tz } = useTimezone()
  return (
    <div
      className="mx-4 mb-0 mt-4 flex items-start gap-3 rounded-[10px] border border-warn/40 bg-warn/5 px-4 py-3"
      role="status"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
      <p className="font-mono text-[12px] leading-5 text-text1">
        <span className="font-semibold text-warn">DATA GAP — </span>
        chart history is frozen at{' '}
        <span className="tnum text-text0">
          {fmtTimestampInTz(lastStaticT, tz)} {tzSuffix(tz)}
        </span>{' '}
        (last completed H1 bar, <span className="tnum text-text0">{gapHours}h</span> ago). The live prediction still
        runs in your browser on the current forming bar — intermediate candles are not fabricated.
      </p>
    </div>
  )
}
