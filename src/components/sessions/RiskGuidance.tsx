import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { SessionsData } from '@/hooks/useData'
import { GOLD_CONFIG, type SymbolConfig } from '@/engine/symbols'
import { TERMINAL_EASE, fmtInt, pad2 } from './utils'

export default function RiskGuidance({ data, config = GOLD_CONFIG }: { data: SessionsData; config?: SymbolConfig }) {
  const reducedMotion = useReducedMotion()

  // Honest ratio computed from the real data: widest hour vs 23:00 UTC.
  const { peakHour, ratio, totalBars } = useMemo(() => {
    let peak = 0
    let peakV = 0
    let v23 = 0
    let total = 0
    for (const h of data.hours) {
      total += h.bar_count
      if (h.avg_range_price == null) continue
      if (h.avg_range_price > peakV) {
        peakV = h.avg_range_price
        peak = h.hour_utc
      }
      if (h.hour_utc === 23) v23 = h.avg_range_price
    }
    return { peakHour: peak, ratio: v23 > 0 ? peakV / v23 : 0, totalBars: total }
  }, [data.hours])

  const isGold = config.symbol === 'XAUUSD'
  const columns = [
    {
      kind: 'do' as const,
      title: 'DO',
      body: `Size positions by session. A stop that's safe in Asia is noise in New York. Expect ranges ~${ratio.toFixed(1)}× wider at ${pad2(peakHour)}:00 UTC than 23:00 UTC.`,
    },
    {
      kind: 'do' as const,
      title: 'DO',
      body: 'Use the cone. T+1..T+3 half-widths scale with session — plan exits around them.',
    },
    {
      kind: 'dont' as const,
      title: "DON'T",
      body: isGold
        ? "Don't read direction into this. Hot hours mean movement, not up. Direction stayed a coin flip in every test (50.1% vs 52.1% always-up). Session tells you how far, never which way."
        : "Don't read direction into this. Hot hours mean movement, not up. Direction was a coin flip in every XAUUSD test — no direction edge is claimed for this symbol either. Session tells you how far, never which way.",
    },
  ]

  return (
    <section aria-label="What this means for risk">
      <div className="panel border-l-[3px] border-l-gold p-5 sm:p-6">
        <h2 className="panel-title">How to Use This (and How Not To)</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {columns.map((c, i) => (
            <motion.div
              key={c.title + i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: reducedMotion ? 0 : i * 0.12, duration: reducedMotion ? 0 : 0.45, ease: TERMINAL_EASE }}
              className={
                c.kind === 'do'
                  ? 'rounded-md border border-line border-l-2 border-l-up/70 bg-bg2 p-4'
                  : 'rounded-md border border-line border-l-2 border-l-down/80 bg-bg2 p-4'
              }
            >
              {/* one-time red pulse on the DON'T column — the honesty beat */}
              {c.kind === 'dont' ? (
                <motion.div
                  initial={{ boxShadow: '0 0 0 rgba(242,73,63,0)' }}
                  whileInView={{
                    boxShadow: [
                      '0 0 0 rgba(242,73,63,0)',
                      '0 0 22px rgba(242,73,63,0.45)',
                      '0 0 0 rgba(242,73,63,0)',
                    ],
                  }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: reducedMotion ? 0 : 0.6, delay: reducedMotion ? 0 : i * 0.12 + 0.2 }}
                  className="-m-4 rounded-md p-4"
                >
                  <ColumnBody kind={c.kind} title={c.title} body={c.body} />
                </motion.div>
              ) : (
                <ColumnBody kind={c.kind} title={c.title} body={c.body} />
              )}
            </motion.div>
          ))}
        </div>
        <p className="micro-mono mt-5">
          Source: {config.dataFiles.sessions.split('/').pop()} — empirical stats over {fmtInt(totalBars)} H1 bars
          {isGold ? ', 2022-01 → 2026-07' : ''}.
        </p>
      </div>
    </section>
  )
}

function ColumnBody({ kind, title, body }: { kind: 'do' | 'dont'; title: string; body: string }) {
  return (
    <>
      <div className="flex items-center gap-2">
        {kind === 'do' ? (
          <CheckCircle2 size={15} className="shrink-0 text-up" />
        ) : (
          <XCircle size={15} className="shrink-0 text-down" />
        )}
        <span
          className={
            kind === 'do'
              ? 'font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-up'
              : 'font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-down'
          }
        >
          {title}
        </span>
      </div>
      <p className="mt-2.5 font-body text-[14px] leading-6 text-text1">{body}</p>
    </>
  )
}
