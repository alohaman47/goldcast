# GoldCast — Integration Handoff Guide

**For the Kimi team merging GoldCast into another app.** This document is the complete, self-contained brief. Follow it exactly and run the verification gates at the end — they prove the engine survived the move bit-for-bit.

---

## 1. What you are receiving

GoldCast is a **market-volatility intelligence terminal** (XAUUSD + NAS100, H1/H4 engines + M15/M5 scalping maps). Key architectural facts that make it portable:

- **Zero backend.** No database, no API keys, no server code. Everything runs client-side.
- **Pure-TypeScript prediction engine** in `src/engine/` — indicators → filters → features → GBM models (exported from Python via m2cgen-style tree assembly) → `predict()`.
- **All data is static JSON** in `public/data/` (17 files, ~1.2 MB total) — precomputed research exports.
- **One external call only**: the live gold price feed (`https://api.gold-api.com/price/XAU`, CORS-open, polled every 60 s by `src/hooks/useLivePrice.ts`). Everything else is offline-capable.
- **Standard Kimi webapp stack**: Node 20 · React 19 · TypeScript · Vite 7.2.4 · Tailwind 3.4.19 · shadcn/ui · react-router 7 · GSAP · Lenis · Framer Motion.

**The honesty contract (non-negotiable):** every number in the UI is backed by an out-of-sample research export. Direction prediction is deliberately shown as NOT predictable (we proved it loses to the always-up baseline). NAS100 and all H4 views are STATIC (no live feed) and must stay labeled as such. Do not "improve" any metric, label, or honesty badge during the merge — `scripts/symbol_check.mjs` pins the exact strings and will FAIL if they drift.

---

## 2. Choose your integration mode

| Mode | What you take | When |
|---|---|---|
| **A — Full module (recommended)** | Everything below, mounted under `/goldcast/*` | The host app wants the full terminal UI |
| **B — Engine only** | `src/engine/` + `public/data/` + (optional) `src/hooks/` | The host app builds its own UI on our predictions |
| **C — Link/embed** | Nothing; publish GoldCast separately and link/iframe | Zero code merge desired |

Mode A is covered in §3–§7, Mode B in §8.

---

## 3. Mode A — File inventory to copy

Copy these paths **verbatim** (preserve directory structure):

```
src/engine/          # ENTIRE directory — 8 model JS files + .d.ts + bars/features/filters/indicators/liveBars/predict/symbols
src/pages/           # Home.tsx, Sessions.tsx, Truth.tsx, Methodology.tsx, ScalperClock.tsx
src/components/dashboard/  src/components/sessions/  src/components/truth/
src/components/methodology/  src/components/scalper/  src/components/symbol/
src/components/live/
src/components/ConfidencePips.tsx  src/components/HonestyBadge.tsx
src/hooks/           # useData.ts, useSymbol.tsx, useLivePrice.ts, useLivePrediction.ts, useVolAlerts.ts
src/lib/utils.ts     # cn() helper (skip if host already has the identical shadcn utils)
public/data/         # ALL 17 JSON files (see §6)
public/logo.svg
scripts/             # parity_check.mjs, parity_entry.ts, symbol_check.mjs, alert_check.mjs, scripts/parity/*
```

**Shared shell — DO NOT blind-copy** (these collide with the host app's shell; merge manually, see §5):

```
src/components/Navbar.tsx  src/components/Footer.tsx  src/components/Layout.tsx
src/components/ui/         # shadcn primitives — the host app already has these; only copy if missing
src/App.tsx  src/index.css  tailwind.config.js  package.json
```

---

## 4. Dependencies to add to the host `package.json`

GoldCast-specific runtime deps (the rest of its `package.json` is the standard Kimi/shadcn template the host already has):

```json
"@gsap/react": "^2.1.2",
"gsap": "^3.15.0",
"lenis": "^1.3.26",
"framer-motion": "^13.0.0",
"lucide-react": "^0.562.0",
"recharts": "^2.15.4",
"react-router": "^7.6.1",
"sonner": "^2.0.7",
"next-themes": "^0.4.6"
```

If the host app lacks any shadcn primitives GoldCast uses (`tabs`, `switch`, `slider`, `progress`, `tooltip`, `hover-card`, `scroll-area`, `separator`, `select`, `radio-group`, `label`, `accordion`, `badge`), add them via the usual shadcn generator — GoldCast consumes the stock, unmodified primitives.

---

## 5. The 5 merge points (the only real work)

1. **Router (`src/App.tsx`)** — mount GoldCast under a path prefix to avoid colliding with the host's `/` home:
   ```tsx
   <Route path="goldcast" element={<GoldcastLayout />}>   {/* Layout.tsx = nav+footer shell */}
     <Route index element={<Home />} />
     <Route path="sessions" element={<Sessions />} />
     <Route path="truth" element={<Truth />} />
     <Route path="methodology" element={<Methodology />} />
     <Route path="scalper-clock" element={<ScalperClock />} />
   </Route>
   ```
   **Critical:** GoldCast uses react-router **nested routes with `<Outlet/>`** inside `Layout.tsx` — keep that pattern; mixing `{children}` layout with nested routes renders a blank page that still builds clean. `BrowserRouter` is required (SPA fallback on the host server).
   Navbar links inside GoldCast are **relative paths** — if you mount under `/goldcast`, update `NAV_LINKS` in `src/components/Navbar.tsx` accordingly (or keep GoldCast's own Navbar/Footer inside `Layout.tsx` and let the host link to `/goldcast`).

2. **Theme (`src/index.css` + `tailwind.config.js`)** — GoldCast's design tokens are CSS variables in `:root` (`--background: 216 27% 4%` dark charcoal family, gold `#E8B23A`, up `#2EBD85`, down `#F2493F`, honest-gray `#8A93A3`) mapped in `tailwind.config.js` (`colors`, `fontFamily`: Space Grotesk display / JetBrains Mono / Inter body). Merge these into the host's config under the same token names **only if unused by the host**; otherwise wrap GoldCast pages in a scoped class (e.g. `.goldcast-theme`) and scope the variables. Google Fonts: add Space Grotesk, JetBrains Mono, Inter to the host's font loading.

3. **Navbar/Footer/Layout** — either (a) keep GoldCast's own shell inside its route subtree (simplest, zero conflict — recommended), or (b) merge GoldCast links into the host's Navbar. GoldCast's Navbar contains the SymbolToggle (`?symbol=xauusd|nas100`) and TfToggle (`?tf=h4`) — these are URL-param driven, self-contained, and safe to keep.

4. **URL params** — GoldCast state lives in query params: `?symbol=` (xauusd default, omitted), `?tf=h4`, `?stf=m5` (scalper page only). No global store, no context providers — nothing to wire.

5. **`vite.config.ts` alias** — GoldCast imports via `@/…` → `"@": path.resolve(__dirname, "./src")`. If the host uses the same alias (Kimi default), nothing to do.

---

## 6. Data files (public/data/)

All 17 must ship — components fetch them relative to origin (`/data/*.json`). If the host serves the app under a sub-path, keep `/data/` at the web root or adjust the fetch prefixes in `src/hooks/useData.ts` (single location).

| File | Content |
|---|---|
| `bars.json`, `bars_nas100.json`, `bars_nas100_h4.json`, `bars_xauusd_h4.json` | 400 recent bars + engine predictions per symbol/TF |
| `latest.json`, `latest_nas100.json`, `latest_nas100_h4.json`, `latest_xauusd_h4.json` | Latest prediction snapshot (cone, p_high_vol, expected range) |
| `daily.json`, `daily_nas100.json` | Daily bars for MTF filter |
| `sessions.json`, `sessions_nas100.json` | 24h session profiles + bands + data dictionary |
| `nas100_m15_slots.json`, `xauusd_m15_slots.json`, `xauusd_m5_slots.json` | Scalper's Clock slot maps (96/96/288 slots) |
| `truth.json` | Phase 1–3 research findings + equity curves |
| `phase5.json` | Trading-backtest export |

---

## 7. Post-merge verification gates (MANDATORY)

From the merged repo root:

```bash
npx tsc -b                      # must be clean
npm run build                   # must succeed
node scripts/parity_check.mjs   # MUST print: PARITY GATE: PASS — all 4 configs (XAUUSD, NAS100, NAS100-H4, XAUUSD-H4)
node scripts/symbol_check.mjs   # MUST print: SYMBOL CHECK: PASS (95 assertions; pins honesty strings, footer matrix, data shapes)
node scripts/alert_check.mjs    # MUST print: ALL CHECKS PASSED
```

The parity gate compares the JS engine against the Python research models to ≤1e-6 (actual ~1e-13). **If any gate fails after your merge, the engine was damaged — do not ship.** The checks are self-contained Node scripts (esbuild-bundled at runtime); keep them runnable.

---

## 8. Mode B — Engine-only integration

- `src/engine/predict.ts` is the entry point: given bars + config it returns `{ p_high_vol, expected_range_atr, expected_range_price, cone (T+1..T+3), session, regime, drift_sign, confidence }`.
- Configs in `src/engine/symbols.ts`: `GOLD_CONFIG` (live), `NAS100_CONFIG`, `VARIANT_CONFIGS["nas100-h4" | "xauusd-h4"]` — each bundles contract sizes, data file paths, model scorers, and verified OOS validation metrics.
- Models are plain JS modules exporting `score(featureVector: number[]): number` — no TF.js, no WASM, tree-walking pure arithmetic.
- Feature pipeline: `bars.ts` → `indicators.ts` (Wilder ATR14 etc.) → `filters.ts` → `features.ts` (exact 20-feature gbm_price set). NaN→0 imputation matches research (warmup rows only).
- `src/hooks/useLivePrediction.ts` shows the full composition (static export + optional live forming bar).

---

## 9. Lineage & support facts

- Repo lineage: `master` = delivery branch; every feature landed via reviewed subagent branches + independent verifier (SHIP gate) before merge.
- Research codebase (Python, walk-forward backtests, model training, export scripts): `goldcast_phase1/` in the original workspace — not needed at runtime; request it if the host team wants to retrain.
- Verified engine metrics (OOS): XAUUSD H1 80.08%/AUC 0.778 · XAUUSD H4 76.14%/AUC 0.735 · NAS100 H1 82.98%/AUC 0.8726 · NAS100 H4 83.18%/AUC 0.8715. Direction: NOT predictable anywhere (shown honestly in UI — do not remove).
- Live feed: gold H1 only; `useLivePrice` handles LIVE/STALE/GAP/ERROR/STATIC states honestly. No NAS100 feed exists (static by design).
- App data snapshots end 2026-07-17 (gold H1), 2026-07-03 (H4/M15 files), 2026-08-04 (gold M5) — the UI shows these as-of dates; that's expected, not a bug.

*Questions the gates can't answer → ask the GoldCast team before improvising. The honesty contract is the product.*
