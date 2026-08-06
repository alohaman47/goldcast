import { useEffect } from 'react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePhase5, useTruth } from '@/hooks/useData'
import TruthHero from '@/components/truth/TruthHero'
import DatasetSection from '@/components/truth/DatasetSection'
import Phase1Section from '@/components/truth/Phase1Section'
import Phase2Section from '@/components/truth/Phase2Section'
import Phase3Section from '@/components/truth/Phase3Section'
import Phase5Section from '@/components/truth/Phase5Section'
import LedgerSection from '@/components/truth/LedgerSection'
import PromiseSection from '@/components/truth/PromiseSection'
import { useLenis } from '@/components/truth/motion'

/**
 * The Truth — /truth (design/truth.md).
 * GSAP pinned scroll stories for Phase 1 (direction failure) and Phase 2
 * (volatility success), real Phase 3 equity curves, ledger, honesty manifesto.
 * Lenis smooth scroll, prefers-reduced-motion honored throughout.
 */
export default function Truth() {
  const { data } = useTruth()
  const { data: phase5 } = usePhase5()
  useLenis()

  // Pinned sections change page height after data loads — keep triggers honest.
  useEffect(() => {
    if (data || phase5) ScrollTrigger.refresh()
  }, [data, phase5])

  return (
    <div className="w-full">
      <TruthHero data={data} />
      <DatasetSection data={data} />
      <Phase1Section data={data} />
      <Phase2Section data={data} />
      <Phase3Section data={data} />
      <Phase5Section data={phase5} />
      <LedgerSection />
      <PromiseSection />
    </div>
  )
}
