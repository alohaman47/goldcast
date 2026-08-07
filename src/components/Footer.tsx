import { Link } from 'react-router'
import { useSymbol } from '@/hooks/useSymbol'

export default function Footer() {
  const { config } = useSymbol()
  /* data-source line follows the active symbol (gold text byte-identical) */
  const dataLine =
    config.symbol === 'NAS100'
      ? 'Data: MT5 NAS100 H1/D1 · Precomputed engine export · As of 2026-07-17 15:00 UTC'
      : 'Data: OANDA XAUUSD H1/D1 · Precomputed engine export · As of 2026-07-17 15:00 UTC'
  return (
    <footer className="border-t border-line bg-bg0">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-6 py-12 md:grid-cols-3">
        {/* Brand + tagline */}
        <div>
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="GoldCast logo" className="h-8 w-8" />
            <span className="font-display text-[16px] font-bold">
              <span className="text-gold">Gold</span>
              <span className="text-text0">Cast</span>
            </span>
          </div>
          <p className="mt-4 font-body text-[13px] leading-5 text-text1">
            We show what we can prove. We label what we can&apos;t.
          </p>
        </div>

        {/* Page links */}
        <nav className="flex flex-col gap-2" aria-label="Footer">
          <span className="label-caps mb-1">Pages</span>
          <Link className="text-[13px] text-text1 transition-colors hover:text-gold" to="/">
            Dashboard
          </Link>
          <Link className="text-[13px] text-text1 transition-colors hover:text-gold" to="/sessions">
            Session Radar
          </Link>
          <Link className="text-[13px] text-text1 transition-colors hover:text-gold" to="/truth">
            The Truth
          </Link>
          <Link className="text-[13px] text-text1 transition-colors hover:text-gold" to="/methodology">
            Methodology
          </Link>
        </nav>

        {/* Honesty block */}
        <div className="rounded-lg border border-warn/30 bg-bg1 p-4">
          <span className="label-caps text-warn">Honesty</span>
          <p className="mt-2 font-body text-[12px] leading-5 text-text1">
            GoldCast is a risk display, not a signal service. Nothing here is investment advice. All statistics
            from walk-forward out-of-sample backtests, independently verified twice.
          </p>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-2 px-6 py-3">
          <span className="micro-mono">{dataLine}</span>
          <span className="micro-mono flex items-center gap-1.5 text-text2">
            Auto-updated <span className="h-1.5 w-1.5 rounded-full bg-up animate-pulse-dot" />
          </span>
        </div>
      </div>
    </footer>
  )
}
