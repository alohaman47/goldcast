import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import type { TruthData } from '@/hooks/useData'
import EquityChart from './EquityChart'
import { CustomChip, SectionTitle } from './shared'
import { fmtInt, fmtPct, fmtSigned } from './format'
import { useReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger, useGSAP)

interface Strategy {
  n_trades?: number
  win_rate?: number
  pips_per_trade?: number
  total_pips?: number
  profit_factor?: number
  max_drawdown_pips?: number
}

/**
 * Phase 3 (truth.md §5): the trading test — comparison table, bootstrap verdict
 * banner, and the real dual equity curves.
 */
export default function Phase3Section({ data }: { data: TruthData | null }) {
  const root = useRef<HTMLElement | null>(null)
  const reduced = useReducedMotion()

  const fixed = (data?.phase3.fixed ?? {}) as Strategy
  const vol = (data?.phase3.vol_aware ?? {}) as Strategy
  const bootstrapP = data?.phase3.bootstrap_p ?? 0.7898
  const curves = data?.phase3.equity_curve_pips

  const rows: { metric: string; a: string; b: string; bad?: 'a' | 'b' }[] = [
    { metric: 'Trades', a: fmtInt(fixed.n_trades ?? 290), b: fmtInt(vol.n_trades ?? 253) },
    { metric: 'Win rate', a: fmtPct(fixed.win_rate ?? 0.334, 1), b: fmtPct(vol.win_rate ?? 0.328, 1) },
    {
      metric: 'Pips / trade',
      a: fmtSigned(fixed.pips_per_trade ?? 4.1, 1),
      b: fmtSigned(vol.pips_per_trade ?? -0.82, 2),
    },
    { metric: 'Total pips', a: fmtSigned(fixed.total_pips ?? 1189.9, 1), b: fmtSigned(vol.total_pips ?? -206.6, 1) },
    {
      metric: 'Profit factor',
      a: String(fixed.profit_factor ?? 1.052),
      b: String(vol.profit_factor ?? 0.99),
    },
    {
      metric: 'Max drawdown',
      a: `${fmtInt(fixed.max_drawdown_pips ?? 3776)} pips`,
      b: `${fmtInt(vol.max_drawdown_pips ?? 4149)} pips`,
    },
  ]

  useGSAP(
    () => {
      if (reduced) return
      gsap.from('[data-p3-row]', {
        opacity: 0,
        y: 16,
        duration: 0.4,
        stagger: 0.06,
        ease: 'power4.out',
        scrollTrigger: { trigger: '[data-p3-table]', start: 'top 80%', once: true },
      })
      gsap.from('[data-p3-banner]', {
        scale: 0.96,
        opacity: 0,
        duration: 0.5,
        ease: 'power4.out',
        scrollTrigger: { trigger: '[data-p3-banner]', start: 'top 85%', once: true },
        onComplete: () => {
          gsap.fromTo(
            '[data-p3-banner]',
            { boxShadow: '0 0 0 rgba(242,73,63,0)' },
            { boxShadow: '0 0 28px rgba(242,73,63,0.18)', duration: 0.6, yoyo: true, repeat: 1 },
          )
        },
      })
    },
    { scope: root, dependencies: [reduced, data] },
  )

  return (
    <section ref={root} className="border-t border-line bg-bg0">
      <div className="mx-auto w-full max-w-[1180px] px-6 py-20">
        <SectionTitle>PHASE 3 — &ldquo;Fine. But does it make money?&rdquo;</SectionTitle>
        <p className="mt-3 max-w-[640px] font-body text-[15px] leading-6 text-text1">
          We ran both strategies walk-forward, in pips: fixed sizing vs vol-aware overlays.
        </p>

        {/* Comparison table */}
        <div data-p3-table className="panel mt-10 overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_120px] sm:grid-cols-[1fr_160px_160px]">
            <div className="border-b border-line px-4 py-3" />
            <div className="border-b border-line border-l px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-up shadow-[inset_0_2px_0_rgba(46,189,133,0.6)]">
              Fixed
            </div>
            <div className="border-b border-line border-l px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-down shadow-[inset_0_2px_0_rgba(242,73,63,0.6)]">
              Vol-aware
            </div>
            {rows.map((r) => (
              <div key={r.metric} data-p3-row className="contents">
                <div className="border-b border-line px-4 py-3 text-[13px] text-text1 last:border-0">{r.metric}</div>
                <div className="border-b border-line border-l bg-up/[0.03] px-4 py-3 text-right font-mono text-[15px] font-semibold text-text0">
                  {r.a}
                </div>
                <div className="border-b border-line border-l bg-down/[0.03] px-4 py-3 text-right font-mono text-[15px] font-semibold text-text0">
                  {r.b}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bootstrap verdict banner */}
        <div data-p3-banner className="panel mt-6 border-down/40 p-6">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div>
              <span className="label-caps">Bootstrap verdict</span>
              <div className="mt-1 font-mono text-[28px] font-bold leading-8 text-text0">
                P(vol-aware beats fixed) = <span className="text-down">{bootstrapP.toFixed(4)}</span>
              </div>
            </div>
            <p className="max-w-[460px] font-body text-[15px] leading-6 text-text1">
              Not significant. Not better. The overlay <em>lost</em> money. So GoldCast is a risk display — we will not
              sell you a signal.
            </p>
            <CustomChip label="⚠ OVERLAYS DON'T ADD PROFIT" tone="warn" className="ml-auto !px-3 !py-1.5 !text-[12px]" />
          </div>
        </div>

        {/* Equity curves */}
        <div className="panel panel-gold mt-6 p-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="panel-title">Cumulative pips — walk-forward OOS</span>
            <span className="micro-mono">200 exits · 2023-11 → 2026-05</span>
          </div>
          {curves ? (
            <EquityChart fixed={curves.fixed} volAware={curves.vol_aware} />
          ) : (
            <div className="flex h-[420px] items-center justify-center font-mono text-[12px] text-text2">
              Loading equity curves…
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
