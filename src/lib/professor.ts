/**
 * GoldCast Phase 16 Track B — "Professor ประจำสถานี" (AI explainer).
 *
 * Two halves:
 *  1. buildProfessorContext() — assembles the COMPACT real-data snapshot the
 *     Professor can speak about. Everything comes from the existing data
 *     contract (src/engine/symbols.ts configs, the SYMBOL_REGISTRY, and the
 *     static JSON exports under /data/) — nothing is invented, no research
 *     number is re-hardcoded here. Fetches go through a module-level cache
 *     so data the app already loaded is never re-downloaded.
 *  2. askProfessor() — the ONLY network call to the backend. The frontend
 *     talks to /api/professor exclusively; no API keys or provider URLs ever
 *     live here. In dev there is no backend, so failures resolve to honest
 *     Thai fallback states (never a thrown exception into the UI).
 */
import { scalperClockFile } from '@/hooks/useData'
import type { LatestData, ScalperClockData, ScalperTf, SessionsData, TruthData } from '@/hooks/useData'
import { SYMBOL_REGISTRY, sessionsReusedFromGold } from '@/hooks/useSymbol'
import type { AppSymbolId, SymbolState } from '@/hooks/useSymbol'
import type { DisplayTz } from '@/hooks/useTimezone'
import { slotIndexFor } from '@/components/scalper/utils'

export type ProfessorMode = 'explain' | 'brief' | 'chat' | 'coach'

export interface ProfessorChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Request body per the Phase-16 /api/professor contract. */
export interface ProfessorRequest {
  mode: ProfessorMode
  symbol: string
  tf: string
  route: string
  tz: string
  messages?: ProfessorChatMessage[]
  context: Record<string, unknown>
}

/* ------------------------------------------------------------------ */
/* Static JSON loading with a module-level cache (never re-fetch)      */
/* ------------------------------------------------------------------ */

const jsonCache = new Map<string, Promise<unknown>>()

function fetchJsonCached<T>(path: string): Promise<T> {
  let p = jsonCache.get(path)
  if (p == null) {
    p = fetch(path).then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`)
      return res.json() as Promise<unknown>
    })
    jsonCache.set(path, p)
  }
  return p as Promise<T>
}

/* ------------------------------------------------------------------ */
/* Context assembly (compact — the backend trims to 12k chars again)   */
/* ------------------------------------------------------------------ */

/** Round to 4 significant decimals so long floats don't bloat the payload. */
function r4(v: number): number {
  return Number(v.toPrecision(4))
}

function compactLatest(latest: LatestData): Record<string, unknown> {
  return {
    asof: latest.asof,
    session: latest.session,
    regime: latest.regime,
    p_high_vol: r4(latest.p_high_vol),
    expected_range_atr: r4(latest.expected_range_atr),
    expected_range_price: r4(latest.expected_range_price),
    cone_half_widths: {
      T1: r4(latest.cone.T1.half_width),
      T2: r4(latest.cone.T2.half_width),
      T3: r4(latest.cone.T3.half_width),
    },
    direction_policy: latest.direction_policy,
    drift_sign: latest.drift_sign,
    confidence_0_to_5: latest.confidence,
    price: latest.price,
    atr14: r4(latest.atr14),
  }
}

function marketBlock(symbolState: SymbolState): Record<string, unknown> {
  const { entry, config, tf, isLive } = symbolState
  const v = config.validation
  return {
    symbol: config.symbol,
    label: entry.label,
    display_name: entry.displayName,
    group: entry.group,
    engine_timeframe: config.timeframe ?? tf,
    data_source: entry.dataSource,
    has_live_feed: isLive,
    validation_oos: {
      hvol_accuracy_pct: v.hvolAccuracyPct,
      hvol_auc: v.hvolAuc,
      bars_verified: v.bars,
      direction_model_pct: v.directionModelPct,
      direction_always_up_baseline_pct: v.directionAlwaysUpPct,
      drift_period: v.driftPeriod,
    },
    provenance: tf === 'H4' && entry.footer.engineH4 != null ? entry.footer.engineH4 : entry.footer.engineH1,
    honesty_notes: {
      econ: entry.econNote,
      engine_range: entry.engineRangeNote,
      direction: 'NO-SHIP — direction model does not beat the always-up baseline; engine proves direction is not predictable',
    },
  }
}

async function dashboardBlock(symbolState: SymbolState): Promise<Record<string, unknown>> {
  const latest = await fetchJsonCached<LatestData>(`/${symbolState.config.dataFiles.latest}`)
  return {
    page: 'dashboard',
    latest_prediction: compactLatest(latest),
    honesty_badges: {
      direction: 'NOT PREDICTABLE (engine-verified)',
      hvol: 'VERIFIED OOS',
    },
    live: symbolState.isLive,
  }
}

async function scalperBlock(symbolState: SymbolState, stf: ScalperTf, now: Date): Promise<Record<string, unknown>> {
  const { symbol, entry } = symbolState
  if (entry.scalperM15 == null) {
    /* Defensive: every current market has an M15 map, but if a future market
       doesn't, say so honestly instead of pretending. */
    return { page: 'scalper-clock', available: false, note: 'no Scalper\u2019s Clock research export for this market' }
  }
  const data = await fetchJsonCached<ScalperClockData>(scalperClockFile(symbol, stf))
  const currentIdx = slotIndexFor(now, data.slots.length)
  const current = data.slots[currentIdx]
  const econ = data.econ
  return {
    page: 'scalper-clock',
    available: true,
    symbol: data.meta.symbol,
    timeframe: data.meta.timeframe,
    date_range: data.meta.date_range,
    top5_hottest_slots: data.highlights.top5_hottest_slots.map((s) => ({
      label: `${s.label} UTC`,
      avg_range_atr: r4(s.avg_range_atr),
      p_high_vol_empirical: r4(s.p_high_vol_empirical),
    })),
    current_slot: {
      label: `${current.label} UTC`,
      avg_range_atr: current.avg_range_atr != null ? r4(current.avg_range_atr) : null,
      p_high_vol_empirical: current.p_high_vol_empirical != null ? r4(current.p_high_vol_empirical) : null,
    },
    economics: {
      trade_model: econ.trade_model,
      verdict: econ.verdict,
      breakeven_win_pct_median: econ.breakeven_win_pct_median,
      breakeven_gap_pp: econ.breakeven_gap_pp ?? null,
      breakeven_gap_over_zero_cost_pp: econ.breakeven_gap_over_zero_cost_pp ?? null,
      cost_provenance: econ.cost_provenance ?? null,
    },
    guidance: data.guidance,
  }
}

async function sessionsBlock(symbolState: SymbolState): Promise<Record<string, unknown>> {
  const sessions = await fetchJsonCached<SessionsData>(`/${symbolState.config.dataFiles.sessions}`)
  return {
    page: 'sessions',
    reused_from_gold_h1: sessionsReusedFromGold(symbolState.config),
    bands: Object.fromEntries(
      Object.entries(sessions.bands).map(([k, band]) => {
        /* sessions.json exports {hours, label} objects; tolerate plain hour
           arrays too (the loose SessionBands type allows both). */
        const hours: number[] = Array.isArray(band) ? band : ((band as { hours?: number[] }).hours ?? [])
        return [k, hours.length > 0 ? `${Math.min(...hours)}–${(Math.max(...hours) + 1) % 24} UTC` : '—']
      }),
    ),
    hourly: sessions.hours.map((h) => ({
      hour_utc: h.hour_utc,
      avg_range_atr: h.avg_range_atr != null ? r4(h.avg_range_atr) : null,
      p_high_vol_empirical: h.p_high_vol_empirical != null ? r4(h.p_high_vol_empirical) : null,
    })),
  }
}

async function truthBlock(): Promise<Record<string, unknown>> {
  const truth = await fetchJsonCached<TruthData>('/data/truth.json')
  return {
    page: 'truth',
    dataset: {
      h1_bars: truth.dataset.h1.bars,
      h1_range: `${truth.dataset.h1.start} → ${truth.dataset.h1.end}`,
      instrument: truth.dataset.h1.instrument,
    },
    phase1_direction: {
      h1_t1: truth.phase1.h1_t1,
      d1_t1: truth.phase1.d1_t1,
    },
    phase2: {
      description: truth.phase2.description,
      top_features: truth.phase2.top_features,
    },
    phase3: { bootstrap_p: truth.phase3.bootstrap_p },
    note: 'The Truth page is the gold H1 research record — metrics above are XAUUSD H1 regardless of the selected market',
  }
}

/** brief mode: the H1 latest prediction of every market in the registry. */
async function briefMarketsBlock(): Promise<Record<string, unknown>> {
  const ids = Object.keys(SYMBOL_REGISTRY) as AppSymbolId[]
  const entries = await Promise.all(
    ids.map(async (id) => {
      const entry = SYMBOL_REGISTRY[id]
      try {
        const latest = await fetchJsonCached<LatestData>(`/${entry.h1.dataFiles.latest}`)
        return [id, {
          label: entry.label,
          display_name: entry.displayName,
          timeframe: 'H1',
          has_live_feed: entry.h1.hasLiveFeed,
          hvol_accuracy_pct: entry.h1.validation.hvolAccuracyPct,
          hvol_auc: entry.h1.validation.hvolAuc,
          latest: compactLatest(latest),
        }] as const
      } catch (err) {
        return [id, { label: entry.label, error: err instanceof Error ? err.message : String(err) }] as const
      }
    }),
  )
  return { markets: Object.fromEntries(entries) }
}

export interface BuildContextArgs {
  mode: ProfessorMode
  route: string
  symbolState: SymbolState
  stf: ScalperTf
  tz: DisplayTz
  now?: Date
}

/**
 * Assemble the context snapshot for one Professor request. Always includes
 * the active market config; the route block follows the current page; brief
 * adds every market's H1 latest; coach forces the scalper-clock block (for
 * the ACTIVE market + page-local scalper TF) whatever the current page is.
 * A failed sub-fetch degrades to an honest error note instead of throwing.
 */
export async function buildProfessorContext(args: BuildContextArgs): Promise<Record<string, unknown>> {
  const { mode, route, symbolState, stf, tz } = args
  const now = args.now ?? new Date()

  const context: Record<string, unknown> = {
    app: 'GoldCast',
    generated_at_utc: now.toISOString().replace('T', ' ').slice(0, 19),
    route,
    display_tz: tz,
    market: marketBlock(symbolState),
  }

  const safe = async (fn: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> => {
    try {
      return await fn()
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }

  if (mode === 'coach') {
    context.coach = await safe(() => scalperBlock(symbolState, stf, now))
  } else if (mode === 'brief') {
    context.brief = await safe(() => briefMarketsBlock())
  }

  switch (route) {
    case '/':
      context.dashboard = await safe(() => dashboardBlock(symbolState))
      break
    case '/scalper-clock':
      context.scalper_clock = await safe(() => scalperBlock(symbolState, stf, now))
      break
    case '/sessions':
      context.sessions = await safe(() => sessionsBlock(symbolState))
      break
    case '/truth':
      context.truth = await safe(() => truthBlock())
      break
    default:
      /* /methodology etc.: the market block above is the context */
      break
  }

  return context
}

/* ------------------------------------------------------------------ */
/* /api/professor client — graceful, honest failure states             */
/* ------------------------------------------------------------------ */

export type ProfessorResult =
  | { ok: true; text: string }
  | { ok: false; kind: 'unconfigured' | 'offline' | 'error'; message: string }

/**
 * POST /api/professor per the Phase-16 contract. Never throws:
 *  - 501 → "unconfigured" (server up, API key not set)
 *  - network failure / 404 (dev & preview have no backend) → "offline"
 *  - anything else → "error" with the server's message when available
 */
export async function askProfessor(req: ProfessorRequest): Promise<ProfessorResult> {
  let res: Response
  try {
    res = await fetch('/api/professor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch {
    return {
      ok: false,
      kind: 'offline',
      message: 'Professor จะทำงานเมื่อ deploy พร้อม API key — ตอนนี้ยังเชื่อม backend ไม่ได้',
    }
  }

  /* Dev servers answer unknown routes with the SPA index.html (200, not
     JSON) — that is "no backend", not a broken Professor answer. */
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
    return {
      ok: false,
      kind: 'offline',
      message: 'Professor จะทำงานเมื่อ deploy พร้อม API key — ตอนนี้ยังไม่มี backend ให้คุยด้วย',
    }
  }

  const body: unknown = await res.json().catch(() => null)
  const errMsg =
    body != null && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
      ? (body as { error: string }).error
      : null

  if (res.status === 501) {
    return {
      ok: false,
      kind: 'unconfigured',
      message: 'Professor ยังไม่พร้อม — รอตั้งค่า API key บน server (AI not configured)',
    }
  }
  if (res.status === 404) {
    /* No backend behind this origin (vite dev / static preview). */
    return {
      ok: false,
      kind: 'offline',
      message: 'Professor จะทำงานเมื่อ deploy พร้อม API key — ตอนนี้ยังไม่มี backend ให้คุยด้วย',
    }
  }
  if (!res.ok) {
    return {
      ok: false,
      kind: 'error',
      message: errMsg != null ? `Professor ตอบไม่ได้: ${errMsg} (HTTP ${res.status})` : `Professor ตอบไม่ได้ (HTTP ${res.status})`,
    }
  }
  const text =
    body != null && typeof body === 'object' && 'text' in body && typeof (body as { text: unknown }).text === 'string'
      ? (body as { text: string }).text
      : null
  if (text == null || text.trim() === '') {
    return { ok: false, kind: 'error', message: 'Professor ตอบกลับมาในรูปแบบที่อ่านไม่ได้' }
  }
  return { ok: true, text }
}
