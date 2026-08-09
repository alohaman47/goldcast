import { motion } from 'framer-motion'
import { useLatest, useSessions, useTruth } from '@/hooks/useData'
import { SYMBOL_REGISTRY, type AppSymbolId } from '@/hooks/useSymbol'
import Toc from '@/components/methodology/Toc'
import PipelineDiagram from '@/components/methodology/PipelineDiagram'
import DataSection from '@/components/methodology/DataSection'
import FeaturesSection from '@/components/methodology/FeaturesSection'
import ModelCard from '@/components/methodology/ModelCard'
import WalkForwardSection from '@/components/methodology/WalkForwardSection'
import ConesSection from '@/components/methodology/ConesSection'
import DataDictionary from '@/components/methodology/DataDictionary'
import LimitationsSection from '@/components/methodology/LimitationsSection'
import { Eyebrow, SectionTitle } from '@/components/truth/shared'
import { useLenis } from '@/components/truth/motion'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

/** Markets whose research reaches the UI only as static MT5 exports (H1
 *  engines + M15 scalper clocks) — everything except live-feed XAUUSD.
 *  Derived from SYMBOL_REGISTRY.dataSource, not hardcoded (Phase 15). */
const STATIC_RESEARCH_MARKETS = (Object.keys(SYMBOL_REGISTRY) as AppSymbolId[]).filter(
  (id) => SYMBOL_REGISTRY[id].dataSource === 'MT5',
)

function Hero() {
  const words = 'An engine you can audit.'.split(' ')
  return (
    <div>
      <Eyebrow>METHODOLOGY</Eyebrow>
      <h1 className="mt-5 font-display text-[40px] font-bold leading-[46px] tracking-[-0.015em] text-text0">
        {words.map((w, i) => (
          <motion.span
            key={i}
            className="inline-block"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.06, ease: EASE }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        ))}
      </h1>
      <motion.p
        className="mt-5 max-w-[620px] font-body text-[15px] leading-6 text-text1"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5, ease: EASE }}
      >
        GoldCast&apos;s forecasts are precomputed by a production scikit-learn gradient-boosting engine and exported
        as JSON. No live black box, no hidden overrides. Here&apos;s exactly what&apos;s inside.
      </motion.p>
      {/* honesty caption: this audit documents the XAUUSD engine; the
          static-market list is derived from the registry (every MT5-sourced
          market) so a new market can't leave this caption stale */}
      <p className="micro-mono mt-4">
        Research shown for XAUUSD (live OANDA feed) — {STATIC_RESEARCH_MARKETS.join(' · ')} ship as static MT5
        research exports (H1 engines + M15 scalper clocks).
      </p>
    </div>
  )
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <SectionTitle>{title}</SectionTitle>
      {sub && <p className="mt-2 max-w-[620px] font-body text-[15px] leading-6 text-text1">{sub}</p>}
    </div>
  )
}

interface Hvol {
  accuracy?: number
  auc?: number
  baseline_class_prior_auc?: number
}
interface Hrange {
  mae?: number
  r2?: number
  baseline_mae?: number
}

/**
 * Methodology — /methodology (design/methodology.md).
 * Framer Motion page (no GSAP in this tree — see react-dev.md isolation rule).
 */
export default function Methodology() {
  const { data: truth } = useTruth()
  const { data: latest } = useLatest()
  const { data: sessions } = useSessions()
  useLenis()

  const hvol = (truth?.phase2.h1_hvol ?? {}) as Hvol
  const hrange = (truth?.phase2.h1_range ?? {}) as Hrange

  return (
    <div className="w-full">
      <div className="mx-auto flex w-full max-w-[1180px] gap-12 px-6 py-16">
        {/* Main column */}
        <div className="min-w-0 flex-1">
          <Hero />

          {/* Pipeline overview */}
          <div className="mt-14">
            <SectionHead title="THE PIPELINE" sub="Five deterministic steps from raw bars to the JSON this site renders." />
            <PipelineDiagram />
          </div>

          {/* Data & provenance */}
          <section id="data" className="mt-20 scroll-mt-24 border-t border-line pt-14">
            <SectionHead title="DATA & PROVENANCE" />
            <DataSection data={truth} />
          </section>

          {/* Features */}
          <section id="features" className="mt-20 scroll-mt-24 border-t border-line pt-14">
            <SectionHead title="FEATURES" />
            <FeaturesSection data={truth} />
          </section>

          {/* Model */}
          <section id="model" className="mt-20 scroll-mt-24 border-t border-line pt-14">
            <SectionHead title="THE MODEL" />
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="flex flex-col gap-5 font-body text-[15px] leading-6 text-text1">
                <p>Two heads on one engine — both predict volatility, neither predicts direction.</p>
                <div className="panel border-l-2 border-l-gold p-4">
                  <span className="label-caps !text-gold">Classifier — HistGradientBoosting</span>
                  <p className="mt-2 text-[14px] leading-6">
                    <span className="font-mono text-[13px] text-text0">P(next-bar range &gt; 1.2 × ATR14)</span> — the
                    high-vol probability. OOS:{' '}
                    <span className="font-mono text-[13px] font-semibold text-text0">
                      {((hvol.accuracy ?? 0.8003) * 100).toFixed(2)}% accuracy, AUC {(hvol.auc ?? 0.777).toFixed(3)}
                    </span>{' '}
                    vs {(hvol.baseline_class_prior_auc ?? 0.7419).toFixed(4)} class-prior baseline.
                  </p>
                </div>
                <div className="panel border-l-2 border-l-gold p-4">
                  <span className="label-caps !text-gold">Regressor — GBM</span>
                  <p className="mt-2 text-[14px] leading-6">
                    Expected next-bar range in ATR units —{' '}
                    <span className="font-mono text-[13px] font-semibold text-text0">
                      MAE {(hrange.mae ?? 0.3457).toFixed(3)}
                    </span>{' '}
                    vs {(hrange.baseline_mae ?? 0.431).toFixed(4)} baseline,{' '}
                    <span className="font-mono text-[13px] font-semibold text-text0">
                      R² {(hrange.r2 ?? 0.289).toFixed(3)}
                    </span>
                    .
                  </p>
                </div>
              </div>
              <ModelCard />
            </div>
          </section>

          {/* Walk-forward */}
          <section id="walkforward" className="mt-20 scroll-mt-24 border-t border-line pt-14">
            <SectionHead title="WALK-FORWARD & NO LOOK-AHEAD" />
            <WalkForwardSection />
          </section>

          {/* Cones */}
          <section id="cones" className="mt-20 scroll-mt-24 border-t border-line pt-14">
            <SectionHead
              title="CONES & GHOST CANDLES"
              sub="The dashboard's signature visual — an honest envelope, not a price target."
            />
            <ConesSection latest={latest} />
          </section>

          {/* Data dictionary */}
          <section id="dictionary" className="mt-20 scroll-mt-24 border-t border-line pt-14">
            <SectionHead title="DATA DICTIONARY" sub="Every field in every export, defined." />
            <DataDictionary sessions={sessions} />
          </section>

          {/* Limitations */}
          <div className="mt-20 border-t border-line pt-14">
            <LimitationsSection />
          </div>
        </div>

        {/* Right rail TOC */}
        <Toc />
      </div>
    </div>
  )
}
