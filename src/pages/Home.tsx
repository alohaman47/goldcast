import { motion } from 'framer-motion'
import { useLatest, useBars, useSessions } from '@/hooks/useData'
import CandlestickChart from '@/components/dashboard/CandlestickChart'
import EvidencePanel from '@/components/dashboard/EvidencePanel'
import ForecastStrip from '@/components/dashboard/ForecastStrip'
import SessionStrip from '@/components/dashboard/SessionStrip'
import OntologyMap from '@/components/dashboard/OntologyMap'
import QuoteList from '@/components/dashboard/QuoteList'
import StatusBar from '@/components/dashboard/StatusBar'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

function fmt(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function DashboardSkeleton() {
  return (
    <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[1fr_380px]">
      <div className="panel order-1 flex h-[560px] items-center justify-center xl:row-start-1">
        <span className="font-mono text-[13px] text-text2 animate-pulse">Loading engine export…</span>
      </div>
      <div className="panel order-3 h-[560px] xl:col-start-2 xl:row-start-1" />
      <div className="panel order-2 h-[120px] xl:row-start-2" />
      <div className="panel order-4 h-[110px] xl:row-start-3" />
    </div>
  )
}

export default function Home() {
  const latest = useLatest()
  const bars = useBars()
  const sessions = useSessions()

  const loading = latest.loading || bars.loading || sessions.loading
  const error = latest.error || bars.error || sessions.error
  const ready = latest.data && bars.data && sessions.data && bars.data.length > 0

  if (loading) {
    return (
      <>
        <DashboardSkeleton />
        <StatusBar latest={null} />
      </>
    )
  }

  if (error || !ready) {
    return (
      <>
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="panel max-w-md p-6 text-center">
            <p className="font-display text-[18px] font-semibold text-down">Engine export unavailable</p>
            <p className="mt-2 font-mono text-[12px] text-text2">{error ?? 'No data in /data/.'}</p>
          </div>
        </div>
        <StatusBar latest={null} />
      </>
    )
  }

  const last = bars.data![bars.data!.length - 1]
  const prev = bars.data![bars.data!.length - 2]
  const delta = last.c - prev.c
  const deltaPct = (delta / prev.c) * 100
  const up = delta >= 0

  return (
    <>
      {/* terminal grid: chart + evidence rail / forecast / sessions */}
      <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[1fr_380px]">
        {/* A. Chart panel */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="panel panel-gold relative order-1 overflow-hidden xl:col-start-1 xl:row-start-1"
          aria-label="XAUUSD chart"
        >
          {/* gold texture backdrop at 8% */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{ backgroundImage: 'url(/gold-texture-dark.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
          {/* scanline sweep (once) */}
          <motion.div
            initial={{ top: '0%', opacity: 1 }}
            animate={{ top: '100%', opacity: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
            className="pointer-events-none absolute left-0 h-px w-full bg-gold/60"
          />
          <div className="relative flex h-full flex-col">
            <div className="flex h-10 flex-wrap items-center justify-between gap-2 border-b border-line px-4">
              <h1 className="panel-title flex items-center gap-2">
                XAUUSD · 1H · OANDA
                <span className="h-2 w-2 rounded-full bg-up animate-pulse-dot" aria-label="live" />
              </h1>
              <p className="font-mono text-[13px] tnum text-text1">
                O {fmt(last.o)}&nbsp;&nbsp;H {fmt(last.h)}&nbsp;&nbsp;L {fmt(last.l)}&nbsp;&nbsp;C {fmt(last.c)}{' '}
                <span className={up ? 'text-up' : 'text-down'}>
                  {up ? '+' : '−'}
                  {fmt(Math.abs(delta))} ({up ? '+' : '−'}
                  {Math.abs(deltaPct).toFixed(2)}%)
                </span>
              </p>
            </div>
            <div className="relative min-h-[420px] flex-1 lg:min-h-[520px]">
              <CandlestickChart bars={bars.data!} latest={latest.data!} />
            </div>
          </div>
        </motion.section>

        {/* B. Evidence panel (right rail) */}
        <div className="order-3 flex xl:order-none xl:col-start-2 xl:row-span-3 xl:row-start-1">
          <EvidencePanel latest={latest.data!} />
        </div>

        {/* C. Forecast strip */}
        <div className="order-2 xl:col-start-1 xl:row-start-2">
          <ForecastStrip latest={latest.data!} />
        </div>

        {/* D. Session strip */}
        <div className="order-4 xl:col-start-1 xl:row-start-3">
          <SessionStrip sessions={sessions.data!} latest={latest.data!} />
        </div>
      </div>

      {/* E. Ontology + F. Quotes */}
      <div className="grid gap-4 px-4 pb-4 lg:grid-cols-2">
        <OntologyMap />
        <QuoteList bars={bars.data!} latest={latest.data!} />
      </div>

      {/* G. Status bar */}
      <StatusBar latest={latest.data} />
    </>
  )
}
