import { motion } from 'framer-motion'
import { useReducedMotion } from '@/components/truth/motion'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

const GUARANTEES = [
  { title: 'No look-ahead', body: 'features at bar t use only data ≤ t; targets are strictly t+1.' },
  { title: 'No survivorship tricks', body: 'the full 2022–2026 window, including the ugly regimes.' },
  { title: 'Verified twice', body: 'backtests independently re-run and reconciled before a single number reached this site.' },
]

function CheckDraw({ delay }: { delay: number }) {
  const reduced = useReducedMotion()
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden>
      <circle cx={10} cy={10} r={9} fill="none" stroke="#2EBD85" strokeOpacity={0.35} strokeWidth={1.5} />
      <motion.path
        d="M 5.5 10.5 L 8.5 13.5 L 14.5 6.5"
        fill="none"
        stroke="#2EBD85"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: reduced ? 1 : 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3, delay, ease: EASE }}
      />
    </svg>
  )
}

/**
 * Walk-forward & no look-ahead (methodology.md §6): sliding train/test window
 * diagram, three guarantee rows, amber paranoia note.
 */
export default function WalkForwardSection() {
  const reduced = useReducedMotion()

  // three windows: train grows, test slides forward (viewBox 1000 x 140)
  const windows = [
    { train: [40, 420], test: [420, 560] },
    { train: [180, 560], test: [560, 700] },
    { train: [320, 700], test: [700, 840] },
  ]

  return (
    <div>
      <div className="panel panel-gold overflow-hidden p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="label-caps">Expanding train · sliding test</span>
          <span className="micro-mono">
            <span className="text-gold">▓ TRAIN</span>
            <span className="ml-3 text-info">░ TEST (never seen)</span>
          </span>
        </div>
        <svg viewBox="0 0 1000 150" className="w-full" role="img" aria-label="Walk-forward windows sliding forward in time">
          <defs>
            <marker id="wf-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 Z" fill="#6B7684" />
            </marker>
          </defs>
          <g className={reduced ? undefined : 'wf-drift'}>
            {windows.map((w, i) => {
              const y = 20 + i * 34
              return (
                <g key={i}>
                  <text x={4} y={y + 13} fill="#6B7684" fontSize={10} fontFamily="JetBrains Mono, monospace">
                    W{i + 1}
                  </text>
                  <rect x={w.train[0]} y={y} width={w.train[1] - w.train[0]} height={20} rx={3} fill="rgba(232,178,58,0.30)" stroke="rgba(232,178,58,0.5)" strokeWidth={1} />
                  <rect x={w.test[0]} y={y} width={w.test[1] - w.test[0]} height={20} rx={3} fill="rgba(91,141,239,0.35)" stroke="rgba(91,141,239,0.6)" strokeWidth={1} strokeDasharray="4 3" />
                </g>
              )
            })}
          </g>
          <line x1={40} y1={134} x2={950} y2={134} stroke="#6B7684" strokeWidth={1.5} markerEnd="url(#wf-arrow)" />
          <text x={905} y={126} fill="#6B7684" fontSize={11} fontFamily="JetBrains Mono, monospace" textAnchor="end">
            time →
          </text>
        </svg>
        <style>{`
          .wf-drift { animation: wf-drift-anim 3s ease-in-out infinite alternate; }
          @keyframes wf-drift-anim { from { transform: translateX(0); } to { transform: translateX(28px); } }
          @media (prefers-reduced-motion: reduce) { .wf-drift { animation: none; } }
        `}</style>
        <p className="micro-mono mt-2">
          Models train only on the past; every reported metric comes from bars the model never saw.
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <ul className="flex flex-col gap-3">
          {GUARANTEES.map((g, i) => (
            <li key={g.title} className="panel flex items-start gap-3 p-4">
              <CheckDraw delay={0.15 + i * 0.12} />
              <div>
                <span className="font-mono text-[13px] font-semibold text-text0">{g.title}</span>
                <p className="mt-1 text-[13px] leading-5 text-text1">{g.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <aside className="rounded-[10px] border border-warn/40 bg-warn/[0.05] p-4">
          <span className="label-caps !text-warn">Why we&apos;re paranoid</span>
          <p className="mt-2 text-[13px] leading-5 text-text1">
            Overfitting is the default failure mode of trading ML. Phase 1 is what overfitting looks like when
            you&apos;re honest about it.
          </p>
        </aside>
      </div>
    </div>
  )
}
