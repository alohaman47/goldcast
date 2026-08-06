import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import type { Phase5Data, Phase5Strategy } from '@/hooks/useData'
import Phase5EquityChart from './Phase5EquityChart'
import { CustomChip, SectionTitle } from './shared'
import { fmtInt, fmtPct, fmtSigned } from './format'
import { useReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const SERIES_STYLE: Record<string, { label: string; color: string }> = {
  'S1-S1': { label: 'S1 Asian breakout', color: '#E8B23A' },
  'S2-S2': { label: 'S2 NY continuation', color: '#8FA3BF' },
  'S3-VOL': { label: 'S3 high-vol timed', color: '#B0564F' },
  'S3-OFF': { label: 'S3 quiet windows', color: '#7E9C8A' },
}
const SERIES_ORDER = ['S1-S1', 'S2-S2', 'S3-VOL', 'S3-OFF']

const CARDS: { key: string; name: string; accent: string; verdictKey: string }[] = [
  { key: 'S1-S1', name: 'S1 · Asian Range Breakout', accent: 'rgba(232,178,58,0.6)', verdictKey: 'S1' },
  { key: 'S2-S2', name: 'S2 · NY Continuation', accent: 'rgba(143,163,191,0.6)', verdictKey: 'S2' },
  { key: 'S3-ALL', name: 'S3 · Vol-window timing isolation', accent: 'rgba(176,86,79,0.6)', verdictKey: 'S3-ALL' },
]

function MetricRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-t border-line py-1.5">
      <span className="text-[12px] text-text1">{label}</span>
      <span className={`font-mono text-[14px] ${strong ? 'font-bold text-text0' : 'font-semibold text-text0'}`}>
        {value}
      </span>
    </div>
  )
}

/**
 * Phase 5 (truth page): the session-edge test — three fixed-parameter session
 * strategies, the S1 top-3-trades knockout, the S3 timing-isolation verdict,
 * real equity curves, and the protocol honesty note. All numbers from
 * /data/phase5.json.
 */
export default function Phase5Section({ data }: { data: Phase5Data | null }) {
  const root = useRef<HTMLElement | null>(null)
  const reduced = useReducedMotion()

  useGSAP(
    () => {
      if (reduced || !data) return
      // strategy cards
      gsap.from('[data-p5-card]', {
        opacity: 0,
        y: 20,
        duration: 0.45,
        stagger: 0.1,
        ease: 'power4.out',
        scrollTrigger: { trigger: '[data-p5-cards]', start: 'top 80%', once: true },
      })
      // knockout reveal — the section's emotional peak
      const tl = gsap.timeline({
        scrollTrigger: { trigger: '[data-p5-knockout]', start: 'top 70%', once: true },
      })
      tl.from('[data-p5-total]', { opacity: 0, y: 18, duration: 0.5, ease: 'power4.out' })
        .from('[data-p5-winner]', { opacity: 0, y: 12, duration: 0.35, stagger: 0.14, ease: 'power4.out' }, '+=0.15')
        .to('[data-p5-strike]', { scaleX: 1, duration: 0.45, stagger: 0.12, ease: 'power3.inOut' }, '+=0.35')
        .to('[data-p5-total-num]', { color: '#6B7684', duration: 0.4 }, '<')
        .to('[data-p5-winner]', { opacity: 0.45, duration: 0.4 }, '<')
        .from('[data-p5-after]', { opacity: 0, y: 16, duration: 0.5, ease: 'power4.out' }, '+=0.1')
        .fromTo(
          '[data-p5-after]',
          { boxShadow: '0 0 0 rgba(242,73,63,0)' },
          { boxShadow: '0 0 28px rgba(242,73,63,0.18)', duration: 0.6, yoyo: true, repeat: 1 },
        )
      // S3 timing verdict banner
      gsap.from('[data-p5-s3]', {
        scale: 0.96,
        opacity: 0,
        duration: 0.5,
        ease: 'power4.out',
        scrollTrigger: { trigger: '[data-p5-s3]', start: 'top 85%', once: true },
      })
      // verdict stamp
      gsap.from('[data-p5-stamp]', {
        scale: 0.94,
        opacity: 0,
        duration: 0.5,
        ease: 'power4.out',
        scrollTrigger: { trigger: '[data-p5-stamp]', start: 'top 88%', once: true },
        onComplete: () => {
          gsap.fromTo(
            '[data-p5-stamp]',
            { boxShadow: '0 0 0 rgba(232,178,58,0)' },
            { boxShadow: '0 0 28px rgba(232,178,58,0.22)', duration: 0.6, yoyo: true, repeat: 1 },
          )
        },
      })
    },
    { scope: root, dependencies: [reduced, data] },
  )

  const strikeStyle = { transform: reduced ? 'scaleX(1)' : 'scaleX(0)' }

  if (!data) {
    return (
      <section ref={root} className="border-t border-line bg-bg0">
        <div className="mx-auto w-full max-w-[1180px] px-6 py-20">
          <SectionTitle>PHASE 5 — &ldquo;Does session timing make money?&rdquo;</SectionTitle>
          <div className="panel mt-10 flex h-[200px] items-center justify-center font-mono text-[12px] text-text2">
            Loading Phase 5 session-edge results…
          </div>
        </div>
      </section>
    )
  }

  const byKey = new Map<string, Phase5Strategy>(data.strategies.map((s) => [s.key, s]))
  const ko = data.knockout_fact
  const s3 = data.s3_vol_off
  const s3vol = byKey.get('S3-VOL')
  const s3off = byKey.get('S3-OFF')
  const chartSeries = SERIES_ORDER.filter((k) => (data.equity[k] ?? []).length >= 2).map((k) => ({
    key: k,
    label: SERIES_STYLE[k].label,
    color: SERIES_STYLE[k].color,
    points: data.equity[k],
  }))

  return (
    <section ref={root} className="border-t border-line bg-bg0">
      <div className="mx-auto w-full max-w-[1180px] px-6 py-20">
        <SectionTitle>PHASE 5 — &ldquo;Does session timing make money?&rdquo;</SectionTitle>
        <p className="mt-3 max-w-[680px] font-body text-[15px] leading-6 text-text1">
          One question was left. Phase 2 showed the clock predicts volatility — the session features carried ~97% of
          the predictable signal — so we tested the clock itself. Three session strategies, fixed parameters, real
          spread costs, pooled out-of-sample on {data.protocol.instrument ?? 'XAUUSD H1'}.
        </p>

        {/* Strategy cards */}
        <div data-p5-cards className="mt-10 grid gap-4 md:grid-cols-3">
          {CARDS.map((c) => {
            const s = byKey.get(c.key)
            if (!s) return null
            return (
              <div
                key={c.key}
                data-p5-card
                className="panel p-5"
                style={{ boxShadow: `inset 0 2px 0 ${c.accent}` }}
              >
                <span className="panel-title">{c.name}</span>
                <div className="mt-3">
                  <MetricRow label="Trades" value={fmtInt(s.n_trades)} />
                  <MetricRow label="Win rate" value={fmtPct(s.win_rate, 1)} />
                  <MetricRow label="Net pips / trade" value={fmtSigned(s.avg_pips, 2)} strong />
                  <MetricRow label="Total pips" value={fmtSigned(s.total_pips, 1)} />
                  <MetricRow label="Profit factor" value={s.profit_factor.toFixed(2)} />
                  <MetricRow label="Max drawdown" value={`${fmtInt(s.max_dd)} pips`} />
                  <MetricRow label="Bootstrap p" value={s.bootstrap_p === null ? '—' : s.bootstrap_p.toFixed(4)} />
                </div>
                <p className="mt-3 font-body text-[12px] leading-5 text-text1">{data.verdicts[c.verdictKey]}</p>
              </div>
            )
          })}
        </div>

        {/* THE KNOCKOUT */}
        <div data-p5-knockout className="panel panel-gold mt-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="panel-title">The knockout — S1 under the microscope</span>
            <span className="micro-mono">PF 1.42 looked like an edge</span>
          </div>

          <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-6">
            {/* total, struck through */}
            <div data-p5-total>
              <span className="label-caps">S1 total pips · n = {fmtInt(ko.n_trades_total)}</span>
              <div className="relative mt-1 inline-block">
                <span data-p5-total-num className="font-mono text-[44px] font-bold leading-[44px] text-up">
                  {fmtSigned(ko.mean_pips_all_trades * ko.n_trades_total, 1)}
                </span>
                <span
                  data-p5-strike
                  className="absolute left-[-4px] right-[-4px] top-1/2 h-[3px] origin-left bg-down"
                  style={strikeStyle}
                />
              </div>
            </div>

            {/* the three winners */}
            <div className="flex flex-wrap gap-2">
              {ko.top3_winners.map((w) => (
                <div
                  key={w.exit_dt}
                  data-p5-winner
                  className="relative rounded border border-gold/50 bg-gold/10 px-3 py-2"
                >
                  <div className="font-mono text-[10px] tracking-[0.04em] text-text1">{w.exit_dt.slice(0, 10)}</div>
                  <div className="relative mt-0.5 inline-block font-mono text-[18px] font-bold text-gold">
                    {fmtSigned(w.pnl_pips, 1)}
                    <span
                      data-p5-strike
                      className="absolute left-[-3px] right-[-3px] top-1/2 h-[2px] origin-left bg-down"
                      style={strikeStyle}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* what remains */}
          <div data-p5-after className="panel mt-6 border-down/40 p-5">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <div>
                <span className="label-caps">
                  Remove {ko.winners_removed} trades · {fmtInt(ko.n_trades_after_removal)} remain
                </span>
                <div className="mt-1 font-mono text-[28px] font-bold leading-8 text-text0">
                  <span className="text-down">{fmtSigned(ko.mean_pips_after_removal, 2)}</span> pips / trade
                </div>
              </div>
              <p className="max-w-[480px] font-body text-[15px] leading-6 text-text1">
                Three winners carry {fmtPct(ko.share_of_total_pips_from_top3, 1)} of S1&apos;s total pips — more than
                all of it. {ko.interpretation}
              </p>
              <CustomChip label="⚠ LUCK OF A FEW TRADES, NOT EDGE" tone="warn" className="ml-auto !px-3 !py-1.5 !text-[12px]" />
            </div>
          </div>
        </div>

        {/* S3 timing-isolation verdict */}
        <div data-p5-s3 className="panel mt-6 border-down/40 p-6">
          <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
            <div>
              <span className="label-caps">Trade only high-vol windows</span>
              <div className="mt-1 font-mono text-[24px] font-bold leading-7 text-text0">
                {fmtSigned(s3.vol_avg_pips, 2)} <span className="text-[13px] font-normal text-text1">pips/tr</span>
                {s3vol && <span className="ml-2 text-[12px] font-normal text-text2">n = {fmtInt(s3vol.n_trades)}</span>}
              </div>
            </div>
            <div className="font-mono text-[22px] font-bold text-down">&lt;</div>
            <div>
              <span className="label-caps">Trade only quiet windows</span>
              <div className="mt-1 font-mono text-[24px] font-bold leading-7 text-up">
                {fmtSigned(s3.off_avg_pips, 2)} <span className="text-[13px] font-normal text-text1">pips/tr</span>
                {s3off && <span className="ml-2 text-[12px] font-normal text-text2">n = {fmtInt(s3off.n_trades)}</span>}
              </div>
            </div>
            <p className="max-w-[420px] font-body text-[15px] leading-6 text-text1">
              The same entry, timed by our own volatility engine, does <em>worse</em> in predicted high-vol windows
              (VOL−OFF = {fmtSigned(s3.diff_vol_minus_off, 2)}, p = {s3.bootstrap_p.toFixed(3)}, 90% CI [
              {fmtSigned(s3.ci_5_95[0], 2)}, {fmtSigned(s3.ci_5_95[1], 2)}]). Timing doesn&apos;t monetize.
            </p>
          </div>
        </div>

        {/* Verdict stamp */}
        <div data-p5-stamp className="panel mt-6 border-warn/40 p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <CustomChip
              label="⚠ NO SESSION EDGE — the clock predicts volatility, not profit"
              tone="warn"
              className="!px-3 !py-1.5 !text-[12px]"
            />
            <p className="max-w-[720px] font-body text-[13px] leading-5 text-text1">{data.verdicts.overall}</p>
          </div>
        </div>

        {/* Equity curves */}
        <div className="panel panel-gold mt-6 p-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="panel-title">Cumulative pips — pooled walk-forward OOS, real spread costs</span>
            <span className="micro-mono">2023-10 → 2026-07</span>
          </div>
          {chartSeries.length > 0 ? (
            <Phase5EquityChart series={chartSeries} />
          ) : (
            <div className="flex h-[420px] items-center justify-center font-mono text-[12px] text-text2">
              Loading equity curves…
            </div>
          )}
        </div>

        {/* Protocol honesty note */}
        <div className="panel mt-6 p-5">
          <span className="panel-title">Protocol — a hypothesis test, not a product</span>
          <ul className="mt-3 grid gap-x-8 gap-y-2 md:grid-cols-2">
            <li className="micro-mono !text-text1">Fixed parameters, no sweeps, no tuning — {data.protocol.tuning}</li>
            <li className="micro-mono !text-text1">{data.protocol.evaluation}</li>
            <li className="micro-mono !text-text1">{data.protocol.costs}</li>
            <li className="micro-mono !text-text1">Determinism — {data.protocol.determinism}</li>
          </ul>
        </div>
      </div>
    </section>
  )
}
