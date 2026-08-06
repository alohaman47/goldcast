import { motion } from 'framer-motion'
import type { TruthData } from '@/hooks/useData'
import { Counter } from '@/components/truth/shared'
import { useInView } from '@/components/truth/motion'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

/**
 * Data & provenance (methodology.md §3): source, windows, the 00:00 UTC daily
 * break, timezone discipline + a 4-stat panel.
 */
export default function DataSection({ data }: { data: TruthData | null }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3)
  const h1 = data?.dataset.h1
  const d1 = data?.dataset.d1

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="flex flex-col gap-4 font-body text-[15px] leading-6 text-text1"
      >
        <p>
          <span className="font-semibold text-text0">Source.</span> OANDA XAUUSD spot. Two timeframes: H1 (
          {h1 ? `${h1.bars.toLocaleString('en-US')} bars, ${h1.start} → ${h1.end}` : '26,836 bars, 2022-01-04 → 2026-07-17'}
          ) for the engine, and D1 (
          {d1 ? `${d1.bars.toLocaleString('en-US')} bars, ${d1.start} → ${d1.end}` : '1,679 bars, 2020-01-02 → 2026-07-03'}
          ) for daily context.
        </p>
        <p>
          <span className="font-semibold text-text0">The 00:00 UTC daily break.</span> Gold markets pause over the
          daily close, so hour-0 bars are largely absent — hour 0 is excluded from session statistics and shown as a
          hollow wedge on the radar rather than silently interpolated.
        </p>
        <p>
          <span className="font-semibold text-text0">Timezone discipline.</span> Everything is UTC, always. Session
          bands, feature encodings and engine exports share one clock, so nothing shifts when your local timezone
          does.
        </p>
      </motion.div>

      <div ref={ref} className="grid grid-cols-2 gap-4 self-start">
        {[
          { label: 'H1 bars', value: h1?.bars ?? 26836, format: (v: number) => Math.round(v).toLocaleString('en-US') },
          { label: 'D1 bars', value: d1?.bars ?? 1679, format: (v: number) => Math.round(v).toLocaleString('en-US') },
        ].map((s) => (
          <div key={s.label} className="panel p-4">
            <span className="label-caps">{s.label}</span>
            <div className="mt-1 font-mono text-[24px] font-semibold leading-8 text-text0">
              <Counter value={s.value} format={s.format} started={inView} />
            </div>
          </div>
        ))}
        {[
          { label: 'Timezone', value: 'UTC only' },
          { label: 'Verification', value: '2× verified' },
        ].map((s) => (
          <div key={s.label} className="panel p-4">
            <span className="label-caps">{s.label}</span>
            <div className="mt-1 font-mono text-[18px] font-semibold leading-8 text-gold">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
