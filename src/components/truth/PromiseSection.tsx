import { useRef } from 'react'
import { Link } from 'react-router'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { ArrowRight } from 'lucide-react'
import { useReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const COMMITMENTS = [
  {
    n: '01',
    title: 'No fake probabilities.',
    body: "If a number isn't verified out-of-sample, it doesn't ship. Direction gets a gray label, not a percentage.",
  },
  {
    n: '02',
    title: 'We publish failures.',
    body: 'Phase 1 and Phase 3 are on this page because they happened. That\u2019s the deal.',
  },
  {
    n: '03',
    title: 'Risk, not signals.',
    body: 'GoldCast tells you how wild the next hours may be — so you can size risk like a professional. Which way gold goes is, honestly, nobody\u2019s to sell.',
  },
]

/**
 * The Promise (truth.md §7): honesty manifesto + CTAs.
 */
export default function PromiseSection() {
  const root = useRef<HTMLElement | null>(null)
  const reduced = useReducedMotion()

  useGSAP(
    () => {
      if (reduced) return
      gsap.from('[data-promise-num]', {
        opacity: 0,
        scale: 0.9,
        duration: 0.45,
        stagger: 0.15,
        ease: 'power4.out',
        scrollTrigger: { trigger: root.current, start: 'top 75%', once: true },
      })
      gsap.from('[data-promise-block]', {
        opacity: 0,
        y: 24,
        duration: 0.5,
        stagger: 0.15,
        ease: 'power4.out',
        scrollTrigger: { trigger: root.current, start: 'top 75%', once: true },
      })
      gsap.from('[data-promise-cta]', {
        opacity: 0,
        y: 16,
        duration: 0.45,
        stagger: 0.1,
        delay: 0.4,
        ease: 'power4.out',
        scrollTrigger: { trigger: root.current, start: 'top 75%', once: true },
        onComplete: () => {
          gsap.fromTo(
            '[data-promise-primary]',
            { boxShadow: '0 0 0 rgba(232,178,58,0)' },
            { boxShadow: '0 0 28px rgba(232,178,58,0.35)', duration: 0.7, yoyo: true, repeat: 1 },
          )
        },
      })
    },
    { scope: root, dependencies: [reduced] },
  )

  return (
    <section ref={root} className="border-t border-line bg-bg0">
      <div className="mx-auto w-full max-w-[720px] px-6 py-24 text-center">
        <span className="label-caps !text-gold">THE GOLDCAST PROMISE</span>

        <div className="mt-12 flex flex-col gap-10 text-left">
          {COMMITMENTS.map((c) => (
            <div key={c.n} className="flex gap-6">
              <span
                data-promise-num
                className="stat-glow shrink-0 font-display text-[40px] font-bold leading-none text-gold"
              >
                {c.n}
              </span>
              <div data-promise-block>
                <h3 className="font-display text-[20px] font-semibold leading-7 text-text0">{c.title}</h3>
                <p className="mt-2 font-body text-[15px] leading-6 text-text1">{c.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-center gap-4">
          <span data-promise-cta>
            <Link
              data-promise-primary
              to="/"
              className="inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-2.5 font-display text-[15px] font-semibold text-[#0C0F13] transition-all duration-150 hover:bg-goldhi active:translate-y-px"
            >
              Open the Dashboard <ArrowRight size={16} />
            </Link>
          </span>
          <span data-promise-cta>
            <Link
              to="/methodology"
              className="inline-flex items-center rounded-lg border border-linestrong px-5 py-2.5 font-display text-[15px] font-semibold text-text1 transition-colors duration-150 hover:border-gold hover:text-gold active:translate-y-px"
            >
              Read the Methodology
            </Link>
          </span>
        </div>

        <p className="micro-mono mt-12">
          All statistics: truth.json — walk-forward OOS, XAUUSD H1/D1, verified twice. Not investment advice.
        </p>
      </div>
    </section>
  )
}
