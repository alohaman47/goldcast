import { useEffect } from 'react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePhase5, useTruth } from '@/hooks/useData'
import { SYMBOL_REGISTRY, type AppSymbolId } from '@/hooks/useSymbol'
import TruthHero from '@/components/truth/TruthHero'
import DatasetSection from '@/components/truth/DatasetSection'
import Phase1Section from '@/components/truth/Phase1Section'
import Phase2Section from '@/components/truth/Phase2Section'
import Phase3Section from '@/components/truth/Phase3Section'
import Phase5Section from '@/components/truth/Phase5Section'
import LedgerSection from '@/components/truth/LedgerSection'
import PromiseSection from '@/components/truth/PromiseSection'
import { useLenis } from '@/components/truth/motion'

/** Markets whose research reaches the UI only as static MT5 exports (H1
 *  engines + M15 scalper clocks) — everything except live-feed XAUUSD.
 *  Derived from SYMBOL_REGISTRY.dataSource, not hardcoded (Phase 15). */
const STATIC_RESEARCH_MARKETS = (Object.keys(SYMBOL_REGISTRY) as AppSymbolId[]).filter(
  (id) => SYMBOL_REGISTRY[id].dataSource === 'MT5',
)

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
      {/* honesty caption: all research on this page is the XAUUSD record; the
          static-market list is derived from the registry (every MT5-sourced
          market) so a new market can't leave this caption stale */}
      <p className="micro-mono mx-auto w-full max-w-[1180px] px-6 pt-5">
        Research shown for XAUUSD (live OANDA feed) — {STATIC_RESEARCH_MARKETS.join(' · ')} ship as static MT5
        research exports (H1 engines + M15 scalper clocks).
      </p>
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
