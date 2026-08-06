import { memo, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

function msToNextHour(): number {
  return 3_600_000 - (Date.now() % 3_600_000)
}

/** Bar-close countdown (mm:ss to the next UTC hour). Text-only, 1s tick. */
export default memo(function BarCloseCountdown({ className }: { className?: string }) {
  const [ms, setMs] = useState(msToNextHour)
  useEffect(() => {
    const iv = window.setInterval(() => setMs(msToNextHour()), 1_000)
    return () => window.clearInterval(iv)
  }, [])
  const mm = String(Math.floor(ms / 60_000)).padStart(2, '0')
  const ss = String(Math.floor((ms % 60_000) / 1_000)).padStart(2, '0')
  return (
    <span className={cn('font-mono tnum', className)} aria-label={`current bar closes in ${mm} minutes ${ss} seconds`}>
      {mm}:{ss}
    </span>
  )
})
