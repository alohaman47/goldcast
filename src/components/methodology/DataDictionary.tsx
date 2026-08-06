import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import type { SessionsData } from '@/hooks/useData'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

const LATEST_FIELDS: [string, string][] = [
  ['asof', 'export timestamp, UTC'],
  ['session', 'current session: asia / london / ny / off'],
  ['regime', 'trending / ranging'],
  ['p_high_vol', 'P(next-bar range > 1.2 × ATR14)'],
  ['expected_range_atr', 'expected T+1 range, in ATR units'],
  ['expected_range_price', 'expected T+1 range, in USD'],
  ['cone.T1–T3.half_width', '√-time scaled half-widths, USD'],
  ['direction_policy', '"drift" — never a probability'],
  ['drift_sign', '+1 / −1 long-term drift'],
  ['confidence', '0–5 engine self-rating'],
  ['price', 'last traded XAUUSD price'],
  ['atr14', '14-bar average true range'],
]

const BARS_FIELDS: [string, string][] = [
  ['(file)', '400 most recent H1 bars'],
  ['t, o, h, l, c', 'bar timestamp + OHLC'],
  ['p_high_vol', 'per-bar high-vol probability overlay'],
  ['exp_range_atr', 'per-bar expected range overlay (ATR units)'],
  ['regime', 'per-bar regime label'],
  ['session', 'per-bar session label'],
]

const TRUTH_FIELDS: [string, string][] = [
  ['dataset', 'H1 + D1 bar counts, windows, instrument'],
  ['phase1', 'direction OOS accuracy — the failure record'],
  ['phase2', 'vol classifier / regressor + top features'],
  ['phase3', 'trading backtest + equity_curve_pips + bootstrap_p'],
]

function FieldTable({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
      {rows.map(([field, meaning]) => (
        <div key={field} className="grid grid-cols-[minmax(120px,auto)_1fr] gap-3 border-t border-line py-2">
          <dt className="font-mono text-[12px] text-gold">{field}</dt>
          <dd className="text-[13px] leading-5 text-text1">{meaning}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Data dictionary (methodology.md §8): one accordion item per JSON file.
 * sessions.json.definitions are rendered VERBATIM from the live file.
 * First item auto-opens after 400ms.
 */
export default function DataDictionary({ sessions }: { sessions: SessionsData | null }) {
  const [open, setOpen] = useState<string>('')

  useEffect(() => {
    const id = setTimeout(() => setOpen('latest'), 400)
    return () => clearTimeout(id)
  }, [])

  const definitions = sessions?.definitions
  const bands = sessions?.bands as Record<string, { hours?: number[]; label?: string } | number[] | undefined> | undefined
  const bandLine = (key: string, fallback: string) => {
    const b = bands?.[key]
    if (b && !Array.isArray(b) && b.label) return b.label
    return fallback
  }
  const hour0 = sessions?.hours?.find((h) => h.hour_utc === 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <Accordion type="single" collapsible value={open} onValueChange={setOpen} className="flex flex-col gap-3">
        <AccordionItem value="latest" className="panel px-4">
          <AccordionTrigger className="font-mono text-[14px] font-semibold text-text0 hover:no-underline">
            latest.json <span className="micro-mono ml-2 font-normal">current engine snapshot</span>
          </AccordionTrigger>
          <AccordionContent>
            <FieldTable rows={LATEST_FIELDS} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="bars" className="panel px-4">
          <AccordionTrigger className="font-mono text-[14px] font-semibold text-text0 hover:no-underline">
            bars.json <span className="micro-mono ml-2 font-normal">chart history</span>
          </AccordionTrigger>
          <AccordionContent>
            <FieldTable rows={BARS_FIELDS} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="sessions" className="panel px-4">
          <AccordionTrigger className="font-mono text-[14px] font-semibold text-text0 hover:no-underline">
            sessions.json <span className="micro-mono ml-2 font-normal">24h volatility clock</span>
          </AccordionTrigger>
          <AccordionContent>
            <p className="mb-3 text-[13px] text-text1">
              Per-UTC-hour empiricals. Field definitions below are rendered verbatim from the export:
            </p>
            {definitions ? (
              <dl className="flex flex-col">
                {Object.entries(definitions).map(([field, meaning]) => (
                  <div key={field} className="grid grid-cols-[180px_1fr] gap-3 border-t border-line py-2">
                    <dt className="font-mono text-[12px] text-gold">{field}</dt>
                    <dd className="font-mono text-[12px] leading-5 text-text1">{meaning}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="font-mono text-[12px] text-text2">Loading definitions…</p>
            )}
            <div className="mt-3 border-t border-line pt-3">
              <FieldTable
                rows={[
                  [
                    'bands',
                    `${bandLine('asia', 'Asia (00-07 UTC)')} · ${bandLine('london', 'London (07-11 UTC)')} · ${bandLine('ny', 'Overlap / New York (12-17 UTC)')} · ${bandLine('off', 'Off-hours')}`,
                  ],
                  [
                    'bar_count',
                    `bars per hour (${hour0 ? `${hour0.bar_count} at hour 0` : '0 at hour 0'} — the daily break)`,
                  ],
                ]}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="truth" className="panel px-4">
          <AccordionTrigger className="font-mono text-[14px] font-semibold text-text0 hover:no-underline">
            truth.json <span className="micro-mono ml-2 font-normal">the full research record</span>
          </AccordionTrigger>
          <AccordionContent>
            <FieldTable rows={TRUTH_FIELDS} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </motion.div>
  )
}
