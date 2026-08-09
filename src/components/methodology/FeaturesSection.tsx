import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { TruthData } from '@/hooks/useData'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

const DESCRIPTIONS: Record<string, string> = {
  hour_cos: 'the clock, encoded as a circle — where in the 24h day this bar sits',
  hour_sin: 'the clock, encoded as a circle — where in the 24h day this bar sits',
  ret1: "last bar's return — short-term impulse",
  rv20: '20-bar realized volatility — vol clustering',
  rsi14: '14-bar RSI — stretch vs. recent range',
}

/* width ∝ rank (methodology.md §4) — no numeric importances exist in the data */
const RANK_WIDTHS = [100, 88, 60, 44, 32]

/**
 * Features (methodology.md §4): five survivor cards in real ranking order,
 * plus the rejected list, deliberately demoted in gray.
 */
export default function FeaturesSection({ data }: { data: TruthData | null }) {
  const features = data?.phase2.top_features ?? ['hour_sin', 'hour_cos', 'ret3', 'macd_hist_raw', 'rv20']
  const fundamentalsDelta = typeof data?.phase2.fundamentals_delta === 'number' ? data.phase2.fundamentals_delta : 0.0

  return (
    <div>
      <p className="font-body text-[15px] leading-6 text-text1">
        Ten candidate feature families went in. <span className="font-semibold text-text0">Five survived</span>{' '}
        out-of-sample.
      </p>

      <motion.div
        className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      >
        {features.map((f, i) => {
          const isClock = f === 'hour_cos' || f === 'hour_sin'
          return (
            <motion.div
              key={f}
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } }}
              className="panel flex flex-col p-4"
            >
              <span className="font-mono text-[14px] font-semibold text-gold">{f}</span>
              <p className="mt-2 flex-1 text-[12px] leading-4 text-text1">{DESCRIPTIONS[f] ?? f}</p>
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg3">
                  <motion.div
                    className={`h-full rounded-full ${isClock ? 'bg-gold' : 'bg-text2/60'}`}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${RANK_WIDTHS[i] ?? 24}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, ease: EASE, delay: 0.2 + i * 0.08 }}
                  />
                </div>
                <span className="micro-mono mt-1.5 block">rank #{i + 1}</span>
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Rejected list — deliberately gray and desaturated */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="mt-6 rounded-[10px] border border-line bg-bg2/50 p-4 saturate-50"
      >
        <span className="label-caps">Rejected inputs</span>
        <div className="mt-3 flex items-start gap-2.5">
          <X size={13} className="mt-0.5 shrink-0 text-down" />
          <p className="text-[13px] leading-5 text-text2">
            <span className="font-mono text-text1">fundamental overlays (DXY, rates, news flags)</span> — added{' '}
            <span className="font-mono text-text1">+{fundamentalsDelta.toFixed(1)}</span> accuracy over price-only
            features (Phase 2). Kept on the dashboard as <em>context</em>, never as inputs to the score.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
