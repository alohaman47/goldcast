import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { ScalperClockData } from '@/hooks/useData'
import { TERMINAL_EASE } from './utils'

type Guidance = ScalperClockData['guidance']

/**
 * DO / DON'T panel — bodies are the verbatim guidance strings from the
 * research export (no paraphrased advice).
 */
export default function GuidancePanel({ guidance }: { guidance: Guidance }) {
  const reducedMotion = useReducedMotion()

  const columns = [
    {
      kind: 'do' as const,
      title: 'DO — respect the hot slots',
      body: guidance.hot_slots,
    },
    {
      kind: 'dont' as const,
      title: "DON'T — chase the quiet ones",
      body: guidance.quiet_slots,
    },
    {
      kind: 'dont' as const,
      title: "DON'T — ask the clock for direction",
      body: guidance.economics,
    },
  ]

  return (
    <section aria-label="What this means for a scalper">
      <div className="panel border-l-[3px] border-l-gold p-5 sm:p-6">
        <h2 className="panel-title">How to Use the Clock (and How Not To)</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {columns.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{
                delay: reducedMotion ? 0 : i * 0.12,
                duration: reducedMotion ? 0 : 0.45,
                ease: TERMINAL_EASE,
              }}
              className={
                c.kind === 'do'
                  ? 'rounded-md border border-line border-l-2 border-l-up/70 bg-bg2 p-4'
                  : 'rounded-md border border-line border-l-2 border-l-down/80 bg-bg2 p-4'
              }
            >
              {/* one-time red pulse on the DON'T columns — the honesty beat */}
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
        <p className="micro-mono mt-5">{guidance.general}</p>
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
