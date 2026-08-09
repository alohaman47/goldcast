import { useRef } from 'react'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'
import type { TruthData } from '@/hooks/useData'
import { Eyebrow } from './shared'
import { useReducedMotion } from './motion'
import { fmtInt } from './format'

gsap.registerPlugin(SplitText, useGSAP)

/**
 * Truth hero (truth.md §1): manifesto claim over the gold texture backdrop.
 * Headline char-split rise, sub fade, stat chips pop, bobbing scroll cue.
 */
export default function TruthHero({ data }: { data: TruthData | null }) {
  const root = useRef<HTMLElement | null>(null)
  const reduced = useReducedMotion()

  useGSAP(
    () => {
      if (reduced) return
      const headline = root.current?.querySelector<HTMLElement>('[data-hero-headline]')
      if (!headline) return
      const split = new SplitText(headline, { type: 'chars' })
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })
      tl.from(split.chars, { y: 30, opacity: 0, duration: 0.6, stagger: 0.018 })
        .from('[data-hero-sub]', { opacity: 0, y: 12, duration: 0.4 }, 0.4)
        .from('[data-hero-chip]', { opacity: 0, scale: 0.9, y: 8, duration: 0.35, stagger: 0.12 }, 0.6)
        .from('[data-hero-cue]', { opacity: 0, duration: 0.5 }, 1.0)
      return () => {
        split.revert()
      }
    },
    { scope: root, dependencies: [reduced] },
  )

  const h1Bars = data ? fmtInt(data.dataset.h1.bars) : '27,136'

  return (
    <section ref={root} className="relative overflow-hidden">
      {/* Backdrop: gold texture at 35% opacity, faded to --bg-0 at the bottom */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <img src="/gold-texture-dark.png" alt="" className="h-full w-full object-cover opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg0/40 via-transparent to-bg0" />
      </div>

      <div className="relative mx-auto flex min-h-[72dvh] w-full max-w-[1180px] flex-col justify-center px-6 py-24">
        <Eyebrow>THE TRUTH — VERIFIED RESEARCH</Eyebrow>
        <h1
          data-hero-headline
          className="mt-5 max-w-[900px] font-display text-[40px] font-bold leading-[1.08] tracking-[-0.02em] text-text0 md:text-[56px] md:leading-[60px]"
        >
          We show what we can prove. We label what we can&apos;t.
        </h1>
        <p data-hero-sub className="mt-6 max-w-[640px] font-body text-[17px] leading-7 text-text1">
          Every trading app claims an edge. We walked ours through walk-forward backtests, twice, and published
          everything — including the failures. This is the full record.
        </p>

        <div className="mt-10 flex flex-wrap items-stretch gap-3">
          {[
            { value: `${h1Bars} H1 bars`, label: 'Real OANDA XAUUSD data' },
            { value: '2× independently verified', label: 'Re-run and reconciled' },
            { value: 'Walk-forward OOS only', label: 'No in-sample bragging' },
          ].map((chip) => (
            <div
              key={chip.value}
              data-hero-chip
              className="panel panel-gold flex flex-col justify-center gap-1 px-4 py-3"
            >
              <span className="font-mono text-[15px] font-semibold text-gold">{chip.value}</span>
              <span className="micro-mono">{chip.label}</span>
            </div>
          ))}
        </div>

        {/* Scroll cue */}
        <div data-hero-cue className="mt-16 flex flex-col items-start gap-2">
          <span className="micro-mono !text-golddim">READ THE RECORD</span>
          <span className="block h-10 w-px animate-[truth-cue_2s_ease-in-out_infinite] bg-gold" aria-hidden />
          <style>{`@keyframes truth-cue { 0%,100% { transform: translateY(0); } 50% { transform: translateY(6px); } } @media (prefers-reduced-motion: reduce) { [data-hero-cue] span:last-child { animation: none; } }`}</style>
        </div>
      </div>
    </section>
  )
}
