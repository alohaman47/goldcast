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

/** Markets whose research reaches the UI as static MT5 exports (H1 engines
 *  + M15 scalper clocks). Phase 19 R3: this is now EVERY market, gold
 *  included — all engine data is trained from the user's own MT5 broker
 *  exports and there is no live feed anywhere in the app. Derived from
 *  SYMBOL_REGISTRY.dataSource, not hardcoded (Phase 15). */
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
          market list is derived from the registry so a new market can't leave
          this caption stale. Every market — gold included — is a static MT5
          research export from the user's own broker data. Gold additionally
          polls a live spot price (gold-api.com) for its live browser engine. */}
      <p className="micro-mono mx-auto w-full max-w-[1180px] px-6 pt-5">
        Research shown for XAUUSD — every market ({STATIC_RESEARCH_MARKETS.join(' · ')}) ships as static MT5
        research exports from the user&apos;s own broker data (H1 engines + M15 scalper clocks). XAUUSD adds a live
        spot-price feed (gold-api.com, 60s poll) powering the live browser engine — no other market has a live feed.
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
