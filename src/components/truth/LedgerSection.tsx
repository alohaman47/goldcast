import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { Check, X } from 'lucide-react'
import { SectionTitle } from './shared'
import { useReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const WORKS = [
  { main: 'Next-candle volatility', detail: '80.03% acc, AUC 0.777' },
  { main: 'Range forecasting', detail: 'R² 0.289, cones T+1..T+3' },
  { main: 'Session seasonality', detail: 'the 24h volatility clock' },
  { main: 'Long-term drift display', detail: '2022–2026 uptrend, labeled as drift' },
]

const DOESNT = [
  { main: 'Direction prediction', detail: '50.1% vs 52.1% always-up' },
  { main: 'Technical filter combos', detail: 'corr −0.008, coin flips' },
  { main: 'Fundamental overlays', detail: '+0.0 accuracy over price' },
  { main: 'Vol-aware trade sizing', detail: 'p = 0.7898, −206.6 pips' },
]

/**
 * The Ledger (truth.md §6): what works / what doesn't.
 */
export default function LedgerSection() {
  const root = useRef<HTMLElement | null>(null)
  const reduced = useReducedMotion()

  useGSAP(
    () => {
      if (reduced) return
      gsap.from('[data-ledger-works]', {
        opacity: 0,
        x: -24,
        duration: 0.5,
        ease: 'power4.out',
        scrollTrigger: { trigger: root.current, start: 'top 75%', once: true },
      })
      gsap.from('[data-ledger-doesnt]', {
        opacity: 0,
        x: 24,
        duration: 0.5,
        ease: 'power4.out',
        scrollTrigger: { trigger: root.current, start: 'top 75%', once: true },
      })
      gsap.from('[data-ledger-row]', {
        opacity: 0,
        y: 12,
        duration: 0.35,
        stagger: 0.07,
        delay: 0.2,
        ease: 'power4.out',
        scrollTrigger: { trigger: root.current, start: 'top 75%', once: true },
      })
    },
    { scope: root, dependencies: [reduced] },
  )

  return (
    <section ref={root} className="border-t border-line bg-bg0">
      <div className="mx-auto w-full max-w-[1180px] px-6 py-20">
        <SectionTitle>THE LEDGER</SectionTitle>
        <p className="mt-3 max-w-[640px] font-body text-[15px] leading-6 text-text1">
          Every claim on this site resolves to one of these two columns.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {/* Works */}
          <div data-ledger-works className="panel border-up/30 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Check size={16} className="text-up" />
              <span className="panel-title !text-up">Works (and we ship it)</span>
            </div>
            <ul className="flex flex-col">
              {WORKS.map((r) => (
                <li key={r.main} data-ledger-row className="flex items-start gap-3 border-t border-line py-3">
                  <Check size={14} className="mt-1 shrink-0 text-up" />
                  <div>
                    <div className="text-[14px] font-semibold text-text0">{r.main}</div>
                    <div className="micro-mono mt-0.5">{r.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Doesn't */}
          <div data-ledger-doesnt className="panel border-down/30 p-5">
            <div className="mb-4 flex items-center gap-2">
              <X size={16} className="text-down" />
              <span className="panel-title !text-down">Doesn&apos;t (and we won&apos;t fake it)</span>
            </div>
            <ul className="flex flex-col">
              {DOESNT.map((r) => (
                <li key={r.main} data-ledger-row className="flex items-start gap-3 border-t border-line py-3">
                  <X size={14} className="mt-1 shrink-0 text-down" />
                  <div>
                    <div className="text-[14px] font-semibold text-text1">{r.main}</div>
                    <div className="micro-mono mt-0.5">{r.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
