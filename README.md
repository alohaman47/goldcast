# GoldCast 📈

**A market-volatility intelligence terminal** for XAUUSD (gold) and NAS100 — with a brutal-honesty research contract: *we show what we can prove, we label what we can't.*

GoldCast does **not** predict price direction (we proved out-of-sample that direction models lose to a trivial always-up baseline on every market and timeframe — and the app says so openly). What it does predict, with verified out-of-sample skill, is **volatility**: when the market will be violent and when it will be dead. For discretionary traders and scalpers, that is the edge that actually exists.

## Features

- **4 parity-verified volatility engines** (client-side, zero backend):
  | Engine | Mode | OOS accuracy | AUC |
  |---|---|---|---|
  | XAUUSD H1 | 🟢 LIVE (gold-api.com feed, 60 s) | 80.08% | 0.778 |
  | XAUUSD H4 | STATIC | 76.14% | 0.735 |
  | NAS100 H1 | STATIC | 82.98% | 0.8726 |
  | NAS100 H4 | STATIC | 83.18% | 0.8715 |
- **Dashboard** — real candlestick chart, ghost candles T+1–T+3 with √-time uncertainty cone, P(high-vol), expected range, confidence pips, engine evidence panel.
- **Session Radar** — 24-hour volatility heatmap per symbol (the clock is ~90–97% of the learnable signal).
- **Scalper's Clock** — 96-slot M15 maps (gold + NAS100) and a 288-slot gold M5 map: which UTC slots are hot, plus honest spread economics per timeframe (computed from 100k–325k real bars each).
- **The Truth** — the full honest research record: what works, what doesn't, equity curves.
- **Methodology** — auditable engine docs: pipeline, walk-forward protocol, cone math, data dictionary.
- **Vol alerts** — configurable P(high-vol) spike notifications.
- URL-param state everywhere (`?symbol=`, `?tf=`, `?stf=`) — every view is shareable.

## The honesty contract

- Direction: **NOT predictable** — shown as such everywhere (`⚠ NOT PREDICTABLE`).
- STATIC modes are labeled STATIC; data as-of dates are displayed; GAP banners appear when data is stale.
- Every displayed metric is pinned by `scripts/symbol_check.mjs` (95 assertions) against fabrication.
- JS engine is parity-verified against the Python research models to ≤1e-6 (actual ~1e-13) by `scripts/parity_check.mjs` across all 4 engines.

## Tech stack

Node 20 · React 19 · TypeScript · Vite 7 · Tailwind 3.4 · shadcn/ui · react-router 7 · GSAP · Lenis · Framer Motion. GBM models are exported from Python (scikit-learn) via m2cgen-style tree assembly to dependency-free JS.

## Quickstart

```bash
npm install
npm run dev        # dev server
npm run build      # production build → dist/
npm run preview    # preview the build

# Verification gates (should all PASS)
node scripts/parity_check.mjs
node scripts/symbol_check.mjs
node scripts/alert_check.mjs
```

## AI Professor (optional backend)

The app ships with a tiny Node/Express server (`server/index.js`) that does two jobs:

1. Serves `dist/` with SPA fallback (same behavior as `serve -s dist`).
2. Proxies `POST /api/professor` to the Kimi API (Moonshot AI, OpenAI-compatible at `https://api.moonshot.ai/v1/chat/completions`) — the system prompt is built **server-side only**, and the API key never reaches the browser.

Cost guards built in: 30 req/min/IP rate limit, `max_completion_tokens` 800, context JSON truncated at 12,000 chars, chat history trimmed to the last 10 messages.

```bash
cp .env.example .env   # set MOONSHOT_API_KEY (optional: KIMI_MODEL, default kimi-k2.6)
npm run build
npm start              # node server/index.js on $PORT (default 3000)
```

Without `MOONSHOT_API_KEY` the endpoint returns `501 {"error":"AI not configured"}` and the frontend shows "ยังไม่ได้ตั้งค่า key" — everything else works normally. On Railway, set the variables under **project → Variables** (see `DEPLOY.md`).

## Deploy (Railway / any Docker host)

```bash
docker build -t goldcast .
docker run -p 3000:3000 -e MOONSHOT_API_KEY=sk-... goldcast
```

The included `Dockerfile` builds the app and runs `node server/index.js` on `$PORT` (Railway-ready, zero config): static `dist/` with SPA fallback + the AI proxy. See `DEPLOY.md` for a click-by-click GitHub + Railway guide.

## Project layout

```
src/engine/     # prediction engine: bars → indicators → filters → features → predict (+ 8 GBM model modules)
src/pages/      # Home, Sessions, Truth, Methodology, ScalperClock
src/hooks/      # useData / useSymbol / useLivePrice / useLivePrediction / useVolAlerts
public/data/    # 17 static research exports (JSON)
scripts/        # parity / symbol / alert verification gates
server/         # Node/Express server: static dist/ + SPA fallback + /api/professor AI proxy
INTEGRATION.md  # guide for embedding GoldCast into another app
DEPLOY.md       # GitHub + Railway deploy guide
```

## License

Private / all rights reserved (contact the owner before reuse).
