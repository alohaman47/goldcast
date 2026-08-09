import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import type { TruthData } from '@/hooks/useData'
import { CustomChip, Eyebrow } from './shared'
import { useReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger, useGSAP)

interface HvolMetrics {
  accuracy?: number
  auc?: number
  baseline_class_prior_auc?: number
}

/* Rank-proportional bar widths (no numeric importance values exist in the data;
   width encodes rank only, per methodology.md §4 "width ∝ rank"). */
const FEATURE_WIDTHS = [100, 92, 64, 48, 36]

const STEPS = [
  {
    key: 'pivot',
    title: 'THE PIVOT',
    body: "If we can't say which way, can we say how far? Target: next-candle range and high-volatility classification.",
  },
  {
    key: 'result',
    title: 'THE RESULT',
    body: 'High-vol classifier: 80.03% accuracy, AUC 0.777 vs 74.19% baseline. Range regression: R² 0.289, MAE 0.346 ATR vs 0.4310 baseline. Real, learnable, out-of-sample.',
  },
  {
    key: 'catch',
    title: 'THE CATCH (WE PUBLISH THOSE TOO)',
    body: 'Feature attribution: hour_sin, hour_cos, ret3, macd_hist_raw, rv20. ~97% of the edge is time-of-day seasonality. Fundamentals added +0.0 on top of price. The edge is a calendar, not a crystal ball.',
  },
]

/**
 * Phase 2 (truth.md §4): pinned scroll story, mirrored layout — volatility is learnable.
 * Gauge sweeps to AUC 0.777 (baseline 0.7419 marked), feature bars prove the edge is the clock.
 */
export default function Phase2Section({ data }: { data: TruthData | null }) {
  const root = useRef<HTMLElement | null>(null)
  const reduced = useReducedMotion()

  const hvol = (data?.phase2.h1_hvol ?? {}) as HvolMetrics
  const auc = hvol.auc ?? 0.777
  const baselineAuc = hvol.baseline_class_prior_auc ?? 0.7419
  const topFeatures = data?.phase2.top_features ?? ['hour_sin', 'hour_cos', 'ret3', 'macd_hist_raw', 'rv20']

  // Gauge maps AUC ∈ [0.5, 1.0] onto the 180° semicircle (pathLength 100).
  const frac = (v: number) => Math.max(0, Math.min(1, (v - 0.5) / 0.5))
  const aucFrac = frac(auc)
  const baseFrac = frac(baselineAuc)
  // needle angle: 0 = straight up (AUC 1.0); -90 = left (AUC 0.5)
  const needleDeg = -90 + aucFrac * 180
  // baseline tick position on the arc (cx 100, cy 100, r 80)
  const theta = Math.PI * (1 - baseFrac)
  const bx1 = 100 + 68 * Math.cos(theta)
  const by1 = 100 - 68 * Math.sin(theta)
  const bx2 = 100 + 92 * Math.cos(theta)
  const by2 = 100 - 92 * Math.sin(theta)

  useGSAP(
    () => {
      if (reduced) return
      const mm = gsap.matchMedia()
      mm.add('(min-width: 768px)', () => {
        const steps = gsap.utils.toArray<HTMLElement>('[data-p2-step]')
        gsap.set(steps.slice(1), { opacity: 0, y: 20 })
        gsap.set('[data-p2-stamp]', { opacity: 0, scale: 1.8 })
        gsap.set('[data-p2-chip]', { opacity: 0, scale: 0.9 })

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

        tl.from('[data-p2-arcbg]', { opacity: 0, duration: 0.15 }, 0)
          // → step 2 (THE RESULT): needle sweeps to the real AUC
          .to(steps[0], { opacity: 0, y: -20, duration: 0.1 }, 0.26)
          .to(steps[1], { opacity: 1, y: 0, duration: 0.1 }, 0.33)
          .fromTo(
            '[data-p2-needle]',
            { rotation: -90, svgOrigin: '100 100' },
            { rotation: needleDeg, svgOrigin: '100 100', duration: 0.25, ease: 'power3.inOut' },
            0.36,
          )
          .fromTo(
            '[data-p2-arc]',
            { strokeDashoffset: aucFrac * 100 },
            { strokeDashoffset: 0, duration: 0.25, ease: 'power3.inOut' },
            0.36,
          )
          .to('[data-p2-stamp]', { opacity: 1, scale: 1, duration: 0.08, ease: 'power4.in' }, 0.56)
          // → step 3 (THE CATCH): feature bars grow, proving the edge is the clock
          .to(steps[1], { opacity: 0, y: -20, duration: 0.1 }, 0.62)
          .to(steps[2], { opacity: 1, y: 0, duration: 0.1 }, 0.69)
          .from('[data-p2-fbar]', { scaleX: 0, duration: 0.16, stagger: 0.05, ease: 'power3.out' }, 0.7)
          .to('[data-p2-chip]', { opacity: 1, scale: 1, duration: 0.1 }, 0.86)
        return () => {
          tl.scrollTrigger?.kill()
          tl.kill()
        }
      })
      return () => mm.revert()
    },
    { scope: root, dependencies: [reduced, data, needleDeg, aucFrac] },
  )

  return (
    <section ref={root} className="relative border-t border-line bg-bg0">
      <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-6 py-20 md:min-h-[100dvh] md:grid-cols-2 md:items-center md:py-0">
        {/* Left: gauge + feature importance card */}
        <div className="relative order-2 md:order-1">
          <div className="panel panel-gold relative p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="panel-title">Volatility model, OOS</span>
              <span className="micro-mono">walk-forward</span>
            </div>

            {/* Gauge */}
            <div className="relative mx-auto w-full max-w-[320px]">
              <svg viewBox="0 0 200 118" className="w-full" role="img" aria-label={`AUC gauge showing ${auc}`}>
                {/* track */}
                <path
                  data-p2-arcbg
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="#2A3542"
                  strokeWidth={10}
                  strokeLinecap="round"
                />
                {/* gold value arc */}
                <path
                  data-p2-arc
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="#E8B23A"
                  strokeWidth={10}
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={`${aucFrac * 100} 100`}
                  strokeDashoffset={0}
                  style={{ filter: 'drop-shadow(0 0 6px rgba(232,178,58,0.45))' }}
                />
                {/* baseline tick */}
                <line x1={bx1} y1={by1} x2={bx2} y2={by2} stroke="#8A93A3" strokeWidth={2} strokeDasharray="3 2" />
                {/* needle */}
                <g data-p2-needle style={{ transform: `rotate(${needleDeg}deg)`, transformOrigin: '100px 100px' }}>
                  <line x1={100} y1={100} x2={100} y2={34} stroke="#EAEEF3" strokeWidth={2.5} strokeLinecap="round" />
                  <circle cx={100} cy={100} r={5} fill="#EAEEF3" />
                </g>
              </svg>
              <div className="mt-[-34px] text-center">
                <div className="stat-glow font-mono text-[36px] font-bold leading-10 text-gold">
                  AUC {auc.toFixed(3)}
                </div>
                <div className="micro-mono mt-1">
                  baseline {baselineAuc.toFixed(4)} (dashed) · accuracy 80.03%
                </div>
              </div>
              <div
                data-p2-stamp
                className="absolute right-0 top-2 rounded-md border-2 border-up bg-bg0/95 px-3 py-1.5 font-mono text-[12px] font-bold tracking-[0.08em] text-up shadow-[0_0_28px_rgba(46,189,133,0.25)]"
              >
                ✓ VERIFIED OOS
              </div>
            </div>

            {/* Feature importance */}
            <div className="mt-8 border-t border-line pt-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="label-caps">Feature attribution (ranked)</span>
                <span data-p2-chip>
                  <CustomChip label="~97% = SESSION SEASONALITY" tone="warn" className="!px-2" />
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {topFeatures.map((f, i) => {
                  const isClock = f === 'hour_cos' || f === 'hour_sin'
                  return (
                    <div key={f} className="flex items-center gap-3">
                      <span className="w-[72px] shrink-0 font-mono text-[11px] text-text1">{f}</span>
                      <div className="h-4 flex-1 rounded-sm bg-bg3">
                        <div
                          data-p2-fbar
                          className={`h-full origin-left rounded-sm ${isClock ? 'bg-gold shadow-[0_0_8px_rgba(232,178,58,0.4)]' : 'bg-text2/70'}`}
                          style={{ width: `${FEATURE_WIDTHS[i] ?? 30}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="micro-mono mt-3">gold = time-of-day features · gray = price features. The edge is the clock.</p>
            </div>
          </div>
        </div>

        {/* Right: swapping text steps */}
        <div className="order-1 md:order-2">
          <Eyebrow>PHASE 2 — VOLATILITY</Eyebrow>
          <div className="mt-6 md:relative md:h-[240px]">
            {STEPS.map((s, i) => (
              <div key={s.key} data-p2-step className={i === 0 ? '' : 'mt-10 md:mt-0 md:absolute md:inset-0'}>
                <h3 className="font-display text-[28px] font-semibold leading-[34px] tracking-[-0.01em] text-text0">
                  {s.title}
                </h3>
                <p className="mt-4 max-w-[480px] font-body text-[15px] leading-6 text-text1">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
