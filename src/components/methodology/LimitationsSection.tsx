import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

const ROWS = [
  'R² 0.286 means most range variance is not explained — cones are envelopes, not promises.',
  'Regime shifts can degrade any statistical edge; session seasonality is stable but not a law of physics.',
  'Exports are snapshots (asof 2026-07-17 15:00 UTC), not a live feed.',
  'GoldCast is a risk display and research artifact. Nothing here is investment advice.',
]

/**
 * Limitations & disclaimers (methodology.md §9): amber-bordered panel,
 * rows fade up staggered, border pulses amber once on entry.
 */
export default function LimitationsSection() {
  return (
    <motion.div
      className="rounded-[10px] border border-line border-l-2 border-l-warn bg-bg1 p-5"
      initial={{ opacity: 0, boxShadow: '0 0 0 rgba(245,166,35,0)' }}
      whileInView={{ opacity: 1, boxShadow: ['0 0 0 rgba(245,166,35,0)', '0 0 24px rgba(245,166,35,0.2)', '0 0 0 rgba(245,166,35,0)'] }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 1.4, ease: EASE }}
    >
      <span className="label-caps !text-warn">Limitations &amp; disclaimers</span>
      <motion.ul
        className="mt-4 flex flex-col gap-3"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      >
        {ROWS.map((r) => (
          <motion.li
            key={r.slice(0, 24)}
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } }}
            className="flex items-start gap-2.5 text-[13px] leading-5 text-text1"
          >
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />
            {r}
          </motion.li>
        ))}
      </motion.ul>
    </motion.div>
  )
}
