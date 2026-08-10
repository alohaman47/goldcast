import { motion } from 'framer-motion'
import type { Bar, LatestData } from '@/hooks/useData'
import { cn } from '@/lib/utils'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

function fmt(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** F. Quote List (dashboard.md §F). XAUUSD delta is real (from bars); DXY/US10Y are static context. */
export default function QuoteList({ bars, latest }: { bars: Bar[]; latest: LatestData }) {
  const last = bars[bars.length - 1]
  const prev = bars[bars.length - 2]
  const xauDelta = last && prev ? ((last.c - prev.c) / prev.c) * 100 : 0

  const quotes = [
    { name: 'XAUUSD (Spot)', value: fmt(latest.price), delta: `${xauDelta >= 0 ? '+' : '−'}${Math.abs(xauDelta).toFixed(2)}%`, neg: xauDelta < 0 },
    { name: 'DXY (Index)', value: '104.21', delta: '−0.42%', neg: true },
    { name: 'US10Y (Yield)', value: '3.92%', delta: '−6.1 bps', neg: true },
  ]

  return (
    <section className="panel p-4" aria-label="Quotes">
      <h2 className="panel-title">Quotes</h2>
      <div className="mt-2 flex flex-col">
        {quotes.map((q, i) => (
          <motion.div
            key={q.name}
            initial={{ opacity: 0, y: 10, backgroundColor: q.neg ? 'rgba(242,73,63,0.08)' : 'rgba(46,189,133,0.08)' }}
            animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(0,0,0,0)' }}
            transition={{ duration: 0.5, delay: 0.9 + i * 0.07, ease: EASE }}
            className="flex items-center justify-between border-b border-line/60 px-2 py-3 last:border-0"
          >
            <span className="text-[13px] font-medium text-text1">{q.name}</span>
            <span className="flex items-center gap-3">
              <span className="font-mono text-[14px] font-semibold tnum text-text0">{q.value}</span>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 font-mono text-[11px] font-medium tnum',
                  q.neg ? 'bg-down/10 text-down' : 'bg-up/10 text-up',
                )}
              >
                {q.delta}
              </span>
            </span>
          </motion.div>
        ))}
      </div>
      <p className="micro-mono mt-2 flex items-center gap-1.5">
        XAUUSD: latest MT5 engine snapshot · DXY/US10Y: fixed context values, not real-time
      </p>
    </section>
  )
}
