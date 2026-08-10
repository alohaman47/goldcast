import { motion } from 'framer-motion'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

const STEPS = [
  { n: '1', name: 'RAW BARS', caption: 'MT5 XAUUSD, H1 + D1' },
  { n: '2', name: 'FEATURES', caption: 'time, returns, RV, RSI, ATR' },
  { n: '3', name: 'GBM ENGINE', caption: 'HistGradientBoosting' },
  { n: '4', name: 'WALK-FORWARD', caption: 'out-of-sample validation' },
  { n: '5', name: 'JSON EXPORT', caption: '/data/*.json' },
]

function Arrow() {
  return (
    <svg
      viewBox="0 0 48 16"
      className="pipeline-arrow mx-1 h-4 w-10 shrink-0 rotate-90 md:rotate-0"
      aria-hidden
    >
      <line x1={2} y1={8} x2={38} y2={8} stroke="#E8B23A" strokeWidth={1.5} strokeDasharray="5 4" />
      <path d="M 38 3 L 46 8 L 38 13 Z" fill="#E8B23A" />
    </svg>
  )
}

/**
 * Pipeline overview (methodology.md §2): 5-step diagram, gold dashed arrows,
 * pops in staggered; hover a step to lift it and animate the arrow dash-flow.
 */
export default function PipelineDiagram() {
  return (
    <div>
      <style>{`
        @keyframes pipe-dash-flow { to { stroke-dashoffset: -18; } }
        .pipeline-step:hover + .pipeline-arrow line { animation: pipe-dash-flow 0.6s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .pipeline-step:hover + .pipeline-arrow line { animation: none; }
        }
      `}</style>
      <motion.div
        className="flex flex-col items-stretch md:flex-row md:items-center"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        variants={{ show: { transition: { staggerChildren: 0.09 } } }}
      >
        {STEPS.map((s, i) => (
          <div key={s.n} className="contents">
            <motion.div
              variants={{ hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: EASE } } }}
              className="pipeline-step panel flex-1 p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-gold/60"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-gold/50 bg-gold/10 font-mono text-[12px] font-bold text-gold">
                {s.n}
              </span>
              <div className="mt-3 font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-text0">
                {s.name}
              </div>
              <div className="mt-1 text-[12px] leading-4 text-text1">{s.caption}</div>
            </motion.div>
            {i < STEPS.length - 1 && <Arrow />}
          </div>
        ))}
      </motion.div>
    </div>
  )
}
