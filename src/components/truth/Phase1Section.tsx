import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import type { TruthData } from '@/hooks/useData'
import { Eyebrow } from './shared'
import { fmtPct } from './format'
import { useReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger, useGSAP)

interface DirRow {
  label: string
  value: number // 0..1
}

function BarGroup({ title, rows, group }: { title: string; rows: DirRow[]; group: string }) {
  // Scale: 40% → 60% accuracy mapped to 0 → 100% of the track; coin flip (50%) sits at 50%.
  return (
    <div data-bargroup={group}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="label-caps">{title}</span>
        <span className="micro-mono">scale 40–60%</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const w = Math.max(0, Math.min(1, (r.value * 100 - 40) / 20)) * 100
          return (
            <div key={r.label} className="flex items-center gap-3">
              <span className="w-[86px] shrink-0 font-mono text-[11px] text-text1">{r.label}</span>
              <div className="relative h-5 flex-1 rounded-sm bg-bg3">
                <div
                  data-bar
                  className="absolute inset-y-0 left-0 origin-left rounded-sm bg-up/80"
                  style={{ width: `${w}%` }}
                />
                {/* coin-flip line */}
                <div className="absolute inset-y-[-3px] left-1/2 border-l border-dashed border-honest/70" />
              </div>
              <span className="w-[52px] shrink-0 text-right font-mono text-[12px] font-semibold text-text0">
                {fmtPct(r.value, r.value * 100 < 51 ? 1 : 2)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const STEPS = [
  {
    key: 'hypothesis',
    title: 'THE HYPOTHESIS',
    body: 'ML ensembles, gradient boosting, every technical filter combination we could build. Target: next-candle direction.',
  },
  {
    key: 'result',
    title: 'THE RESULT',
    body: "Out-of-sample, the best ensemble hit 50.1% on H1. A naive 'always say up' did 52.13%. Correlation with the next candle: −0.008. A coin flip, minus fees.",
  },
  {
    key: 'verdict',
    title: 'THE VERDICT',
    body: 'Direction is not predictable with anything we tested. So GoldCast will never show you a direction probability. Ever.',
  },
]

/**
 * Phase 1 (truth.md §3): pinned scroll story — direction prediction failed.
 * Left column swaps three text steps; right verdict card grows bars, then the
 * ⚠ NOT PREDICTABLE rubber stamp slams in at the final step.
 */
export default function Phase1Section({ data }: { data: TruthData | null }) {
  const root = useRef<HTMLElement | null>(null)
  const reduced = useReducedMotion()

  const p1 = data?.phase1
  const h1Rows: DirRow[] = [
    { label: 'Ensemble', value: p1?.h1_t1.ensemble ?? 0.501 },
    { label: 'Model C', value: p1?.h1_t1.model_c ?? 0.5038 },
    { label: 'Always-up', value: p1?.h1_t1.always_up ?? 0.5213 },
  ]
  const d1Rows: DirRow[] = [
    { label: 'Ensemble', value: p1?.d1_t1.ensemble ?? 0.5191 },
    { label: 'Model C', value: p1?.d1_t1.model_c ?? 0.5239 },
    { label: 'Always-up', value: p1?.d1_t1.always_up ?? 0.5418 },
  ]

  useGSAP(
    () => {
      if (reduced) return
      const mm = gsap.matchMedia()
      mm.add('(min-width: 768px)', () => {
        const steps = gsap.utils.toArray<HTMLElement>('[data-p1-step]')
        // steps 2 & 3 start hidden (they overlay step 1 absolutely on desktop)
        gsap.set(steps.slice(1), { opacity: 0, y: 20 })
        gsap.set('[data-p1-stamp]', { opacity: 0, scale: 2.2, rotate: -6 })

        const tl = gsap.timeline({
          defaults: { ease: 'power4.out' },
          scrollTrigger: {
            trigger: root.current,
            start: 'top top',
            end: '+=180%',
            pin: true,
            scrub: 0.4,
            anticipatePin: 1,
          },
        })

        // step 1 visible: H1 bars grow
        tl.from('[data-bargroup="h1"] [data-bar]', { scaleX: 0, duration: 0.22, stagger: 0.05, ease: 'power3.out' }, 0)
          // → step 2
          .to(steps[0], { opacity: 0, y: -20, duration: 0.1 }, 0.26)
          .to(steps[1], { opacity: 1, y: 0, duration: 0.1 }, 0.33)
          .from(
            '[data-bargroup="d1"] [data-bar]',
            { scaleX: 0, duration: 0.22, stagger: 0.05, ease: 'power3.out' },
            0.36,
          )
          // → step 3
          .to(steps[1], { opacity: 0, y: -20, duration: 0.1 }, 0.6)
          .to(steps[2], { opacity: 1, y: 0, duration: 0.1 }, 0.67)
          // rubber stamp slam
          .to('[data-p1-stamp]', { opacity: 1, scale: 1, rotate: -6, duration: 0.08, ease: 'power4.in' }, 0.74)
          .to('[data-p1-card]', { x: 2, duration: 0.015, repeat: 5, yoyo: true, ease: 'none' }, 0.82)
          .to('[data-p1-card]', { x: 0, duration: 0.02 }, 0.92)
        return () => {
          tl.scrollTrigger?.kill()
          tl.kill()
        }
      })
      return () => mm.revert()
    },
    { scope: root, dependencies: [reduced, data] },
  )

  return (
    <section ref={root} className="relative border-t border-line bg-bg0">
      <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-6 py-20 md:min-h-[100dvh] md:grid-cols-2 md:items-center md:py-0">
        {/* Left: swapping text steps */}
        <div>
          <Eyebrow>PHASE 1 — DIRECTION</Eyebrow>
          <div className="mt-6 md:relative md:h-[240px]">
            {STEPS.map((s, i) => (
              <div key={s.key} data-p1-step className={i === 0 ? '' : 'mt-10 md:mt-0 md:absolute md:inset-0'}>
                <h3 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.01em] text-text0">
                  {s.title}
                </h3>
                <p className="mt-4 max-w-[480px] font-body text-[15px] leading-6 text-text1">{s.body}</p>
              </div>
            ))}
          </div>
          <p className="micro-mono mt-6 max-w-[480px]">
            Every technical filter combination ≈ coin flip (corr −0.008). Source: truth.json phase1.
          </p>
        </div>

        {/* Right: verdict card */}
        <div className="relative">
          <div data-p1-card className="panel panel-gold relative p-5">
            <div className="mb-5 flex items-center justify-between">
              <span className="panel-title">Direction accuracy, OOS</span>
              <span className="micro-mono">dashed = coin flip</span>
            </div>
            <div className="flex flex-col gap-6">
              <BarGroup title="H1 · next bar (T+1)" rows={h1Rows} group="h1" />
              <BarGroup title="D1 · next day (T+1)" rows={d1Rows} group="d1" />
            </div>

            {/* Rubber stamp */}
            <div
              data-p1-stamp
              className="absolute -top-4 right-4 rounded-md border-2 border-warn bg-bg0/95 px-4 py-2 font-mono text-[16px] font-bold tracking-[0.08em] text-warn shadow-[0_0_32px_rgba(245,166,35,0.25)]"
            >
              ⚠ NOT PREDICTABLE
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
