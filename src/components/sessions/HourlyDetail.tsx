import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import type { SessionHour, SessionsData } from '@/hooks/useData'
import { GOLD_CONFIG, type SymbolConfig } from '@/engine/symbols'
import { TERMINAL_EASE, fmtAbsRet, fmtAtr, fmtInt, fmtPct, fmtUsd, hourLabel, rangeDigits, rangeUnit, thermalColor, thermalTForPvol } from './utils'
import { cn } from '@/lib/utils'

interface HourlyDetailProps {
  data: SessionsData
  utcHour: number
  flashHour: number | null
  config?: SymbolConfig
}

export default function HourlyDetail({ data, utcHour, flashHour, config = GOLD_CONFIG }: HourlyDetailProps) {
  const reducedMotion = useReducedMotion()
  const [defsOpen, setDefsOpen] = useState(false)
  const unit = rangeUnit(config)
  const digits = rangeDigits(config, 2)

  const maxRange = useMemo(() => {
    let m = 0
    for (const h of data.hours) if (h.avg_range_price != null) m = Math.max(m, h.avg_range_price)
    return m || 1
  }, [data.hours])

  const barDelay = (h: number) => (reducedMotion ? 0 : h * 0.03)
  const rowDelay = (h: number) => (reducedMotion ? 0 : h * 0.015)

  return (
    <section aria-label="Hourly detail">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        {/* Left — horizontal bar chart */}
        <div className="panel p-4 sm:p-5">
          <div className="flex h-10 items-center justify-between">
            <h2 className="panel-title">Avg Range by Hour ({unit})</h2>
            <span className="micro-mono hidden sm:inline">● P(high-vol), 0–1 scale →</span>
          </div>
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            className="mt-1 flex flex-col gap-[3px]"
          >
            {data.hours.map((h) => (
              <BarRow
                key={h.hour_utc}
                hour={h}
                maxRange={maxRange}
                isCurrent={h.hour_utc === utcHour}
                delay={barDelay(h.hour_utc)}
                instant={!!reducedMotion}
              />
            ))}
          </motion.div>
          <div className="mt-3 flex items-center justify-between">
            <span className="micro-mono">bar length = avg range ({unit})</span>
            <span className="micro-mono">
              <span className="text-up">●</span> P(high-vol) position on 0–1 scale
            </span>
          </div>
        </div>

        {/* Right — data table */}
        <div className="panel flex flex-col p-4 sm:p-5">
          <div className="flex h-10 items-center">
            <h2 className="panel-title">Hourly Data — All 24 UTC Hours</h2>
          </div>
          <div className="max-h-[430px] overflow-y-auto rounded-md border border-line">
            <table className="w-full border-collapse text-right">
              <thead className="sticky top-0 z-10 bg-bg2">
                <tr className="label-caps">
                  <th className="px-2 py-2 text-left">UTC hour</th>
                  <th className="px-2 py-2">avg range {unit}</th>
                  <th className="px-2 py-2">×ATR</th>
                  <th className="px-2 py-2">avg |ret|</th>
                  <th className="px-2 py-2">P(high-vol)</th>
                  <th className="px-2 py-2">bars</th>
                </tr>
              </thead>
              <motion.tbody initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }}>
                {data.hours.map((h) => {
                  const isNull = h.bar_count === 0
                  const isCurrent = h.hour_utc === utcHour
                  return (
                    <motion.tr
                      key={h.hour_utc}
                      id={`hour-row-${h.hour_utc}`}
                      variants={{
                        hidden: { opacity: 0 },
                        show: { opacity: 1, transition: { delay: rowDelay(h.hour_utc), duration: reducedMotion ? 0 : 0.3 } },
                      }}
                      className={cn(
                        'border-t border-line font-mono text-[13px] leading-6 transition-colors duration-300 hover:bg-bg2',
                        isCurrent && 'border-l-2 border-l-gold bg-bg2',
                        flashHour === h.hour_utc && 'bg-gold/20',
                      )}
                    >
                      <td className="px-2 py-1.5 text-left text-text1">
                        {hourLabel(h.hour_utc)}
                        {isCurrent && <span className="ml-1.5 text-[9px] text-gold">●NOW</span>}
                      </td>
                      <td className="px-2 py-1.5 text-text0">{fmtUsd(h.avg_range_price, digits)}</td>
                      <td className="px-2 py-1.5 text-text1">{fmtAtr(h.avg_range_atr)}</td>
                      <td className="px-2 py-1.5 text-text1">{fmtAbsRet(h.avg_abs_ret)}</td>
                      <td
                        className="px-2 py-1.5"
                        style={{
                          color: h.p_high_vol_empirical != null ? thermalColor(thermalTForPvol(h.p_high_vol_empirical)) : undefined,
                        }}
                      >
                        {fmtPct(h.p_high_vol_empirical)}
                      </td>
                      <td className="px-2 py-1.5 text-text2">{isNull ? '0 — break' : fmtInt(h.bar_count)}</td>
                    </motion.tr>
                  )
                })}
              </motion.tbody>
            </table>
          </div>

          {/* Definitions accordion */}
          <div className="mt-3 rounded-md border border-line">
            <button
              type="button"
              onClick={() => setDefsOpen((v) => !v)}
              aria-expanded={defsOpen}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-text2 transition-colors duration-150 hover:text-gold"
            >
              What do these columns mean?
              <ChevronDown
                size={14}
                className="shrink-0 transition-transform duration-300"
                style={{ transform: defsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>
            <AnimatePresence initial={false}>
              {defsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: TERMINAL_EASE }}
                  className="overflow-hidden"
                >
                  <dl className="space-y-2 border-t border-line px-3 py-3">
                    {Object.entries(data.definitions ?? {}).map(([term, def]) => (
                      <div key={term}>
                        <dt className="font-mono text-[11px] font-semibold text-gold">{term}</dt>
                        <dd className="font-body text-[13px] leading-5 text-text1">{def}</dd>
                      </div>
                    ))}
                  </dl>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}

function BarRow({
  hour,
  maxRange,
  isCurrent,
  delay,
  instant,
}: {
  hour: SessionHour
  maxRange: number
  isCurrent: boolean
  delay: number
  instant: boolean
}) {
  const isNull = hour.bar_count === 0 || hour.avg_range_price == null
  const widthPct = isNull ? 0 : (hour.avg_range_price! / maxRange) * 100
  const pvolPct = hour.p_high_vol_empirical != null ? hour.p_high_vol_empirical * 100 : null

  return (
    <div className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-right font-mono text-[10px] leading-4 text-text2">
        {String(hour.hour_utc).padStart(2, '0')}
      </span>
      <div
        className={cn(
          'relative h-[15px] flex-1 rounded-sm',
          isCurrent && 'outline outline-1 outline-gold',
        )}
        style={{ background: 'rgba(21,28,36,0.6)' }}
      >
        {isNull ? (
          <div
            className="flex h-full w-[42%] items-center rounded-sm border border-dashed border-text3 px-2"
            title="00:00 UTC — daily break, no bars"
          >
            <span className="micro-mono whitespace-nowrap">daily break — no bars</span>
          </div>
        ) : (
          <>
            <motion.div
              className="h-full rounded-sm"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ delay, duration: instant ? 0 : 0.6, ease: TERMINAL_EASE }}
              style={{
                width: `${widthPct}%`,
                transformOrigin: 'left center',
                background: 'linear-gradient(90deg, #8A6A2A 0%, #E8B23A 70%, #F5CD6B 100%)',
              }}
            />
            {pvolPct != null && (
              <span
                className="absolute top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-up"
                style={{ left: `calc(${pvolPct}% - 3px)`, boxShadow: '0 0 6px rgba(46,189,133,0.6)' }}
                title={`P(high-vol) ${fmtPct(hour.p_high_vol_empirical)}`}
              />
            )}
          </>
        )}
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-[11px] leading-4 text-text1">
        {isNull ? '—' : fmtUsd(hour.avg_range_price)}
      </span>
    </div>
  )
}
