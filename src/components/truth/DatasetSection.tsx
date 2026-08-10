import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import HonestyBadge from '@/components/HonestyBadge'
import type { TruthData } from '@/hooks/useData'
import { Counter, SectionTitle } from './shared'
import { useInView, useReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger, useGSAP)

function StatBlock({
  value,
  format,
  label,
  sub,
  badge,
  started,
}: {
  value: number | string
  format?: (v: number) => string
  label: string
  sub: string
  badge?: boolean
  started: boolean
}) {
  return (
    <div
      data-stat
      className="panel group flex flex-col gap-1.5 p-4 transition-colors duration-150 hover:border-linestrong"
    >
      <span className="label-caps">{label}</span>
      <span className="font-mono text-[28px] font-semibold leading-8 text-text0 transition-shadow group-hover:[text-shadow:0_0_24px_rgba(232,178,58,0.25)]">
        {typeof value === 'number' ? (
          <Counter value={value} format={format ?? ((v) => String(Math.round(v)))} started={started} />
        ) : (
          value
        )}
      </span>
      <span className="micro-mono">{sub}</span>
      {badge && <HonestyBadge kind="verified-oos" tooltip="Walk-forward OOS, verified twice" className="mt-1 w-fit" />}
    </div>
  )
}

/**
 * The Dataset (truth.md §2): provenance stat blocks + walk-forward timeline strip.
 */
export default function DatasetSection({ data }: { data: TruthData | null }) {
  const root = useRef<HTMLElement | null>(null)
  const reduced = useReducedMotion()
  const { ref: statsRef, inView: statsInView } = useInView<HTMLDivElement>(0.2)

  useGSAP(
    () => {
      if (reduced) return
      gsap.from('[data-stat]', {
        opacity: 0,
        y: 20,
        duration: 0.5,
        stagger: 0.08,
        ease: 'power4.out',
        scrollTrigger: { trigger: root.current, start: 'top 80%', once: true },
      })
      gsap.from('[data-timeline-line]', {
        strokeDashoffset: 100,
        duration: 1.2,
        ease: 'power3.out',
        scrollTrigger: { trigger: '[data-timeline]', start: 'top 85%', once: true },
      })
      gsap.from('[data-tl-band]', {
        opacity: 0,
        scaleX: 0,
        transformOrigin: 'left center',
        duration: 0.5,
        stagger: 0.09,
        ease: 'power4.out',
        scrollTrigger: { trigger: '[data-timeline]', start: 'top 85%', once: true },
      })
    },
    { scope: root, dependencies: [reduced] },
  )

  const h1 = data?.dataset.h1
  const d1 = data?.dataset.d1

  // Timeline geometry: 2020-01 → 2026-07 mapped to x 0..100 (percent-ish units in viewBox 1000)
  const x0 = 2020.0
  const x1 = 2026.55 // 2026-07
  const sx = (yr: number) => ((yr - x0) / (x1 - x0)) * 1000
  const h1Start = sx(2022.0)

  // Walk-forward windows: train (gold) + test (blue) bands sliding across the H1 window
  const windows = [
    { train: [2022.0, 2023.0], test: [2023.0, 2023.5] },
    { train: [2022.0, 2023.75], test: [2023.75, 2024.25] },
    { train: [2022.0, 2024.5], test: [2024.5, 2025.0] },
    { train: [2022.0, 2025.25], test: [2025.25, 2025.75] },
    { train: [2022.0, 2026.0], test: [2026.0, 2026.55] },
  ]

  return (
    <section ref={root} className="mx-auto w-full max-w-[1180px] px-6 py-20">
      <SectionTitle>THE DATASET</SectionTitle>
      <p className="mt-3 max-w-[640px] font-body text-[15px] leading-6 text-text1">
        Real MT5 XAUUSD data. No synthetic fills, no cherry-picked windows.
      </p>

      <div ref={statsRef} className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatBlock
          value={h1?.bars ?? 27737}
          format={(v) => Math.round(v).toLocaleString('en-US')}
          label="H1 bars"
          sub={h1 ? `${h1.start} → ${h1.end}` : '2021-12-01 → 2026-08-10'}
          started={statsInView}
        />
        <StatBlock
          value={d1?.bars ?? 1184}
          format={(v) => Math.round(v).toLocaleString('en-US')}
          label="D1 bars"
          sub={d1 ? `${d1.start} → ${d1.end}` : '2022-01-03 → 2026-08-04'}
          started={statsInView}
        />
        <StatBlock value="H1 + D1" label="Timeframes" sub="Hourly engine + daily context" started={statsInView} />
        <StatBlock value="0" label="Look-ahead bars" sub="Features ≤ t, targets strictly t+1" badge started={statsInView} />
      </div>

      {/* Walk-forward timeline strip */}
      <div data-timeline className="panel panel-gold mt-8 overflow-hidden p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="label-caps">Walk-forward validation windows</span>
          <span className="micro-mono">
            <span className="text-gold">▓ train</span>
            <span className="ml-3 text-info">░ test (out-of-sample)</span>
          </span>
        </div>
        <svg viewBox="0 0 1000 120" className="h-auto w-full" role="img" aria-label="Timeline 2020 to 2026 with walk-forward train and test windows">
          {/* baseline */}
          <line
            data-timeline-line
            x1={0}
            y1={96}
            x2={1000}
            y2={96}
            stroke="#8A6A2A"
            strokeWidth={1.5}
            pathLength={100}
            strokeDasharray={100}
          />
          {/* D1 window */}
          <rect x={0} y={90} width={1000} height={12} fill="rgba(91,141,239,0.06)" />
          {/* H1 window highlight */}
          <rect x={h1Start} y={90} width={1000 - h1Start} height={12} fill="rgba(232,178,58,0.12)" />
          <line x1={h1Start} y1={88} x2={1000} y2={88} stroke="#E8B23A" strokeWidth={1.5} />
          {/* walk-forward bands */}
          {windows.map((w, i) => {
            const tx = sx(w.train[0])
            const tw = sx(w.train[1]) - tx
            const ex = sx(w.test[0])
            const ew = sx(w.test[1]) - ex
            const y = 18 + i * 13
            return (
              <g key={i}>
                <rect data-tl-band x={tx} y={y} width={tw} height={8} fill="rgba(232,178,58,0.35)" rx={1.5} />
                <rect data-tl-band x={ex} y={y} width={ew} height={8} fill="rgba(91,141,239,0.55)" rx={1.5} />
              </g>
            )
          })}
          {/* year ticks */}
          {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map((yr) => (
            <g key={yr}>
              <line x1={sx(yr)} y1={96} x2={sx(yr)} y2={104} stroke="#2A3542" strokeWidth={1} />
              <text x={sx(yr)} y={116} fill="#6B7684" fontSize={11} fontFamily="JetBrains Mono, monospace" textAnchor="middle">
                {yr}
              </text>
            </g>
          ))}
          <text x={h1Start + 4} y={84} fill="#E8B23A" fontSize={10} fontFamily="JetBrains Mono, monospace">
            H1 window
          </text>
          <text x={6} y={84} fill="#5B8DEF" fontSize={10} fontFamily="JetBrains Mono, monospace">
            D1 window
          </text>
        </svg>
      </div>
    </section>
  )
}
