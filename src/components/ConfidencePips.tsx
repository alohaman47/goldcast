import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * Confidence Pips (design.md §7.5): 5 rounded squares, filled = green with glow,
 * animate left→right 80ms stagger from latest.confidence (0–5).
 */
export default function ConfidencePips({ confidence, className }: { confidence: number; className?: string }) {
  const n = Math.max(0, Math.min(5, Math.round(confidence)))
  return (
    <div className={cn('flex items-center gap-1.5', className)} role="img" aria-label={`Confidence ${n} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.08, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'h-3 w-3 rounded-[3px]',
            i < n ? 'bg-up shadow-[0_0_8px_rgba(46,189,133,0.55)]' : 'bg-bg3',
          )}
        />
      ))}
    </div>
  )
}
