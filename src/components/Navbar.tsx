import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router'
import { Menu, X } from 'lucide-react'
import { useLatest } from '@/hooks/useData'
import { useSymbol, symbolDisplayName } from '@/hooks/useSymbol'
import SymbolToggle from '@/components/symbol/SymbolToggle'
import TfToggle from '@/components/symbol/TfToggle'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/sessions', label: 'Session Radar' },
  { to: '/scalper-clock', label: 'Scalper Clock' },
  { to: '/truth', label: 'The Truth' },
  { to: '/methodology', label: 'Methodology' },
]

function useUtcClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function formatUtc(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`
}

export default function Navbar() {
  const { data: latest } = useLatest()
  const { symbol, config, tf } = useSymbol()
  const now = useUtcClock()
  const [drawerOpen, setDrawerOpen] = useState(false)

  /* gold regime chip only — NAS100 has no live feed, so no live regime claim */
  const regime = symbol === 'XAUUSD' ? (latest?.regime ?? null) : null
  const regimeIsTrending = regime === 'trending'
  /* keep the active symbol (and NAS100 timeframe) on every internal navigation */
  const symbolQuery = symbol === 'XAUUSD' ? '' : tf === 'H4' ? '?symbol=nas100&tf=h4' : '?symbol=nas100'

  return (
    <header className="sticky top-0 z-50 h-16 border-b border-line bg-bg0/95 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-[1920px] items-center gap-6 px-4 lg:px-6">
        {/* Left: logo + wordmark */}
        <Link to={`/${symbolQuery}`} className="flex shrink-0 items-center gap-3">
          <img src="/logo.svg" alt="GoldCast logo" className="h-9 w-9" />
          <div className="flex flex-col leading-none">
            <span className="font-display text-[18px] font-bold">
              <span className="text-gold">Gold</span>
              <span className="text-text0">Cast</span>
            </span>
            <span className="label-caps mt-1 hidden text-[10px] sm:block">— XAUUSD Volatility &amp; Risk</span>
          </div>
        </Link>

        {/* Center: instrument block + regime chip (follows the symbol toggle) */}
        <div className="hidden items-center gap-4 xl:flex">
          <div className="flex flex-col leading-tight">
            <span className="font-display text-[13px] font-semibold text-text0">{config.symbol}</span>
            <span className="micro-mono">{symbolDisplayName(config)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="rounded border border-gold bg-gold/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-gold">
              {config.timeframe ?? 'H1'}
            </span>
            <span className="rounded border border-line px-2 py-0.5 font-mono text-[11px] font-medium text-text2">
              D1
            </span>
          </div>
          {regime && (
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[12px] font-medium animate-breathing-glow',
                regimeIsTrending
                  ? 'border-up/40 bg-up/10 text-up'
                  : 'border-warn/40 bg-warn/10 text-warn',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', regimeIsTrending ? 'bg-up' : 'bg-warn')} />
              REGIME: {regime.toUpperCase()}
            </span>
          )}
        </div>

        {/* Right: clock + status + symbol toggle + links */}
        <div className="ml-auto flex items-center gap-5">
          <div className="hidden items-center gap-3 lg:flex">
            <span className="font-mono text-[13px] tnum text-text1">{formatUtc(now)}</span>
            {config.hasLiveFeed ? (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-up animate-pulse-dot" />
                <span className="micro-mono text-text2">Market Open</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-text2" />
                <span className="micro-mono text-text2">Static export</span>
              </span>
            )}
          </div>
          <SymbolToggle className="hidden sm:flex" />
          <TfToggle className="hidden sm:flex" />
          <nav className="hidden items-center gap-5 md:flex" aria-label="Primary">
            {NAV_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={`${l.to}${symbolQuery}`}
                end={l.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'relative pb-1 font-display text-[13px] font-medium transition-colors duration-150',
                    isActive
                      ? 'text-gold after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:bg-gold'
                      : 'text-text1 hover:text-text0',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <button
            className="rounded-md border border-line p-2 text-text1 md:hidden"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-50 border-t border-line bg-bg0 md:hidden">
          <nav className="flex flex-col gap-1 p-4" aria-label="Mobile">
            <SymbolToggle className="mb-2 self-start" />
            <TfToggle className="mb-2 self-start" />
            {NAV_LINKS.map((l, i) => (
              <NavLink
                key={l.to}
                to={`${l.to}${symbolQuery}`}
                end={l.to === '/'}
                onClick={() => setDrawerOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-4 py-3 font-display text-[15px] font-medium',
                    'animate-in fade-in slide-in-from-left-2',
                    isActive ? 'bg-bg2 text-gold' : 'text-text1 hover:bg-bg1 hover:text-text0',
                  )
                }
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {l.label}
              </NavLink>
            ))}
            {regime && (
              <div className="mt-4 px-4">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[12px]',
                    regimeIsTrending ? 'border-up/40 bg-up/10 text-up' : 'border-warn/40 bg-warn/10 text-warn',
                  )}
                >
                  REGIME: {regime.toUpperCase()}
                </span>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
