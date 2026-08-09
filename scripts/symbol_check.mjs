/**
 * GoldCast Phase 9 Stage 2 — SYMBOL SWITCHER smoke check.
 *
 * Verifies, for BOTH symbols (XAUUSD + NAS100):
 *   CHECK 1 — SymbolConfig resolution: getSymbolConfig(id) returns a complete
 *             config (pointSize/pipSize/priceDecimals/sessionBands/dataFiles/
 *             modelModules/hasLiveFeed) with the expected per-symbol values.
 *   CHECK 2 — model scorers: scoreHvol/scoreRange from the config are callable
 *             on a 20-feature vector and return a finite number.
 *   CHECK 3 — data files: every config.dataFiles entry exists under public/,
 *             parses as JSON, and has the expected shape (latest: asof+price,
 *             bars: non-empty OHLC, sessions: 24 hourly rows + 4 bands,
 *             daily: non-empty).
 *   CHECK 4 — band parity: sessions JSON bands match config.sessionBands hours.
 *   CHECK 5 — honest-mode contract: XAUUSD hasLiveFeed === true (unsuffixed
 *             data files), NAS100 hasLiveFeed === false (_nas100 suffix).
 *   CHECK 6 — component sources are symbol-aware (ForecastStrip / EvidencePanel
 *             / CandlestickChart / Navbar / Footer read config, not hardcoded
 *             gold values).
 *   CHECK 7 — NAS100 H4 variant (Phase 11 / Track B2): VARIANT_CONFIGS
 *             ["nas100-h4"] resolves with timeframe "H4", H4 data files
 *             exist/parse/shape-ok, scorers callable, validation metrics match
 *             the verified H4 numbers, XAUUSD/NAS100 configs unchanged.
 *   CHECK 8 — XAUUSD H4 variant (Phase 12): VARIANT_CONFIGS["xauusd-h4"]
 *             resolves with timeframe "H4" and hasLiveFeed FALSE (STATIC —
 *             the live feed drives gold H1 only), H4 data files
 *             exist/parse/shape-ok (400 bars with predictions), scorers
 *             callable, validation metrics match the verified gold H4 numbers.
 *   CHECK 9 — XAUUSD M5 scalper slot map (Phase 13): xauusd_m5_slots.json
 *             exists/parses with 288 slots, meta exact (timeframe M5,
 *             bar_count 325160, last_bar 2026-08-04 16:00:00, point 0.01),
 *             slots 0–11 null with bar_count 0 (00:xx session break),
 *             highlights.hottest_slot = 15:30 UTC at ~2.18x ATR (within
 *             0.01), econ.breakeven_gap_pp 1.5 (NOT survivable), and a
 *             zero-key-diff schema match vs xauusd_m15_slots.json.
 *
 * Phase 12 note: the Footer dataLine assertion now pins ALL SIX provenance
 * strings (per-symbol scalper-clock M15 lines + per-symbol H1/H4 engine
 * lines), replacing the previous four-string assertion.
 *
 * Phase 13 note: the Footer dataLine assertion now pins ALL SEVEN provenance
 * strings — the Phase-12 six plus the gold scalper-clock M5 line (selected
 * by the page-local ?stf=m5 param; NAS100 stays M15-only).
 *
 * v7-fix note: two CHECK-6 assertions were ADDED (nothing existing weakened
 * or removed):
 *   - per-symbol data-source labels: SymbolStatusBar + Home chart headers
 *     must use dataSourceLabel(config) (OANDA for XAUUSD / MT5 for NAS100,
 *     matching the Footer provenance matrix) with no hardcoded "OANDA" left;
 *   - honest update indicator: Footer must show a neutral "Static export"
 *     label for static contexts (scalper-clock dataLines / hasLiveFeed ===
 *     false) while keeping the pulsing "Auto-updated" for live gold H1.
 *
 * Usage: node scripts/symbol_check.mjs   (exit code 0 = PASS, 1 = FAIL)
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import * as esbuild from "esbuild";

const ROOT = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const EXPECTED = {
  XAUUSD: {
    pointSize: 0.01,
    pipSize: 0.1,
    priceDecimals: 2,
    hasLiveFeed: true,
    suffix: "",
    londonHours: [7, 8, 9, 10],
    validation: {
      // Phase 17 Track D3 refresh: classic-GBM OOS on the refreshed
      // 27,136-bar dataset (was 80.08 / 0.778 / 26,836 pre-refresh).
      hvolAccuracyPct: 79.99,
      hvolAuc: 0.775,
      hvolAucDecimals: 3,
      bars: 27136,
      directionModelPct: 50.1,
      directionAlwaysUpPct: 52.1,
      driftPeriod: "2022–2026",
    },
  },
  NAS100: {
    pointSize: 0.1,
    pipSize: 1.0,
    priceDecimals: 1,
    hasLiveFeed: false,
    suffix: "_nas100",
    londonHours: [7, 8, 9, 10, 11],
    validation: {
      // Phase 18 refresh: classic-GBM OOS on the 2026-08-04 data
      // (results/phase18_gbm_classic_nas100_oos.csv).
      hvolAccuracyPct: 83.28,
      hvolAuc: 0.8716,
      hvolAucDecimals: 4,
      bars: 27098,
      directionModelPct: 51.63,
      directionAlwaysUpPct: 52.91,
      driftPeriod: "2022–2026",
    },
  },
};

async function loadJson(rel) {
  const p = path.join(ROOT, "public", rel);
  const raw = await fs.readFile(p, "utf8").catch(() => null);
  if (raw == null) return { exists: false, json: null, path: p };
  try {
    return { exists: true, json: JSON.parse(raw), path: p };
  } catch (e) {
    return { exists: true, json: null, path: p, error: String(e) };
  }
}

const main = async () => {
  // ---- bundle the TS engine config module on the fly ----------------------
  const outfile = path.join(os.tmpdir(), `goldcast_symbol_check_${process.pid}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(ROOT, "src", "engine", "symbols.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile,
    logLevel: "silent",
  });
  const eng = await import(url.pathToFileURL(outfile).href);
  const { getSymbolConfig, SYMBOL_CONFIGS } = eng;

  check("symbols module exports getSymbolConfig + SYMBOL_CONFIGS", typeof getSymbolConfig === "function" && !!SYMBOL_CONFIGS);

  for (const id of ["XAUUSD", "NAS100"]) {
    const exp = EXPECTED[id];
    console.log(`\n[${id}]`);
    const cfg = getSymbolConfig(id);

    // CHECK 1 — config resolution
    check("config resolves with matching symbol id", cfg && cfg.symbol === id);
    check(
      `pointSize=${exp.pointSize} pipSize=${exp.pipSize} priceDecimals=${exp.priceDecimals}`,
      cfg.pointSize === exp.pointSize && cfg.pipSize === exp.pipSize && cfg.priceDecimals === exp.priceDecimals,
      `got pointSize=${cfg.pointSize} pipSize=${cfg.pipSize} priceDecimals=${cfg.priceDecimals}`,
    );
    check(
      `hasLiveFeed === ${exp.hasLiveFeed}`,
      cfg.hasLiveFeed === exp.hasLiveFeed,
    );
    check(
      "sessionBands has asia/london/ny/off with hours+label",
      ["asia", "london", "ny", "off"].every(
        (k) => cfg.sessionBands[k] && Array.isArray(cfg.sessionBands[k].hours) && typeof cfg.sessionBands[k].label === "string",
      ),
    );
    check(
      `london band hours = [${exp.londonHours}]`,
      JSON.stringify(cfg.sessionBands.london.hours) === JSON.stringify(exp.londonHours),
      `got [${cfg.sessionBands.london.hours}]`,
    );

    // CHECK 1b — validation metrics (ForecastStrip / EvidencePanel source)
    const ev = exp.validation;
    const cv = cfg.validation ?? {};
    check(
      `validation: ${ev.hvolAccuracyPct}% OOS · AUC ${ev.hvolAuc} (${ev.hvolAucDecimals}dp) · ${ev.bars} bars`,
      cv.hvolAccuracyPct === ev.hvolAccuracyPct &&
        cv.hvolAuc === ev.hvolAuc &&
        cv.hvolAucDecimals === ev.hvolAucDecimals &&
        cv.bars === ev.bars,
      `got ${JSON.stringify(cv)}`,
    );
    check(
      `validation direction: ${ev.directionModelPct}% vs ${ev.directionAlwaysUpPct}% always-up, drift ${ev.driftPeriod}`,
      cv.directionModelPct === ev.directionModelPct &&
        cv.directionAlwaysUpPct === ev.directionAlwaysUpPct &&
        cv.driftPeriod === ev.driftPeriod,
      `got ${JSON.stringify(cv)}`,
    );

    // CHECK 2 — scorers callable (20-feature gbm_price vector)
    const vec = new Array(20).fill(0);
    const hv = cfg.scoreHvol(vec);
    const rg = cfg.scoreRange(vec);
    check("scoreHvol/scoreRange callable, finite output", Number.isFinite(hv) && Number.isFinite(rg), `hvol=${hv} range=${rg}`);
    check("modelModules paths point at engine modules", cfg.modelModules.hvol.endsWith(".js") && cfg.modelModules.range.endsWith(".js"));

    // CHECK 3 — data files present + shaped
    for (const kind of ["bars", "daily", "sessions", "latest"]) {
      const rel = cfg.dataFiles[kind];
      check(
        `dataFiles.${kind} ${exp.suffix ? `uses '${exp.suffix}'` : "unsuffixed (gold default)"} naming`,
        exp.suffix ? rel.includes(exp.suffix) : !rel.includes("_nas100"),
        rel,
      );
      const { exists, json, error } = await loadJson(rel);
      check(`public/${rel} exists and parses`, exists && json != null, error ?? (exists ? "parse error" : "missing"));
      if (json == null) continue;
      if (kind === "latest") {
        check("latest: asof + positive price + cone T1..T3",
          typeof json.asof === "string" && json.price > 0 && json.cone?.T1?.half_width > 0 && json.cone?.T3?.half_width > 0);
      } else if (kind === "bars") {
        const last = json[json.length - 1];
        check("bars: non-empty, OHLC rows", json.length > 0 && typeof last.o === "number" && typeof last.c === "number", `len=${json.length}`);
      } else if (kind === "sessions") {
        check("sessions: 24 hourly rows + 4 bands",
          Array.isArray(json.hours) && json.hours.length === 24 && ["asia", "london", "ny", "off"].every((k) => json.bands?.[k]));
        // CHECK 4 — JSON bands match config.sessionBands
        check(
          "sessions JSON bands match config.sessionBands hours",
          ["asia", "london", "ny", "off"].every(
            (k) => JSON.stringify(json.bands[k].hours) === JSON.stringify(cfg.sessionBands[k].hours),
          ),
        );
      } else if (kind === "daily") {
        check("daily: non-empty OHLC rows", json.length > 0 && typeof json[json.length - 1].c === "number", `len=${json.length}`);
      }
    }
  }

  // ---- CHECK 6 — component sources are symbol-aware (verifier bugs 1-5) ---
  console.log(`\n[component sources]`);
  const readSrc = async (rel) => fs.readFile(path.join(ROOT, "src", rel), "utf8");

  const forecast = await readSrc("components/dashboard/ForecastStrip.tsx");
  check(
    "ForecastStrip: validation metrics sourced from config.validation (no hardcoded gold numbers)",
    forecast.includes("config.validation") &&
      !forecast.includes("80.08% OOS accuracy") &&
      !forecast.includes("26,836 bars") &&
      !forecast.includes("AUC 0.778"),
  );
  check(
    "ForecastStrip: range unit via priceUnit(config) (no hardcoded USD label)",
    forecast.includes("priceUnit(config)") && !forecast.includes(">USD<"),
  );

  const evidence = await readSrc("components/dashboard/EvidencePanel.tsx");
  check(
    "EvidencePanel: direction block sourced from config.validation (no hardcoded gold numbers)",
    evidence.includes("config.validation") &&
      !evidence.includes("50.1%") &&
      !evidence.includes("52.1%") &&
      !evidence.includes("26,836 bars") &&
      !evidence.includes("(2022–2026)"),
  );

  const chart = await readSrc("components/dashboard/CandlestickChart.tsx");
  check(
    "CandlestickChart: aria-label + a11y summary use config.symbol / tf / priceUnit (no hardcoded XAUUSD/USD)",
    chart.includes("aria-label={`${config.symbol} ${tf} candlestick chart") &&
      chart.includes("config.timeframe ?? 'H1'") &&
      !chart.includes('"XAUUSD H1 candlestick chart') &&
      !chart.includes("} XAUUSD H1 bars") &&
      !chart.includes(" USD. Range forecast"),
  );
  check(
    "CandlestickChart: bar-close countdown chip gated on live",
    /if \(live\) \{[\s\S]{0,600}`closes \$\{mm\}:\$\{ss\}`/.test(chart),
  );
  check(
    "CandlestickChart: fmtPrice respects config.priceDecimals",
    chart.includes("function fmtPrice(v: number, decimals = 2)") && chart.includes("config.priceDecimals"),
  );

  const navbar = await readSrc("components/Navbar.tsx");
  check(
    "Navbar: Market Open pulse only for live-feed symbols, static wording otherwise",
    navbar.includes("config.hasLiveFeed") && navbar.includes("Static export") && navbar.includes("Market Open"),
  );

  const footer = await readSrc("components/Footer.tsx");
  const useSymbolSrc = await readSrc("hooks/useSymbol.tsx");
  /* Phase 15: the provenance matrix moved into the SYMBOL_REGISTRY
     (entry.footer) — Footer.tsx is data-driven now. The seven LEGACY lines
     stay byte-pinned against the registry source here; CHECK 10 verifies the
     resolved registry values (and the ten new Phase-15 lines) against the
     static JSON exports. */
  check(
    "Footer: data-driven provenance matrix (entry.footer from SYMBOL_REGISTRY) — no hardcoded dataLine strings left",
    footer.includes("entry.footer") &&
      footer.includes("isStaticContext") &&
      !footer.includes("Precomputed engine export · As of"),
  );
  check(
    "Footer registry: all seven legacy exact lines (per-symbol scalper M15 + gold scalper M5 + per-symbol H1/H4 engine) pinned in SYMBOL_REGISTRY",
    useSymbolSrc.includes("Data: MT5 XAUUSD M15 · 108,473 bars · Static research export · As of 2026-08-04 16:00 UTC") &&
      useSymbolSrc.includes("Data: MT5 XAUUSD M5 · 325,160 bars · Static research export · As of 2026-08-04 16:00 UTC") &&
      useSymbolSrc.includes("Data: MT5 NAS100 M15 · 100,317 bars · Static research export · As of 2026-05-21 11:00 UTC") &&
      useSymbolSrc.includes("Data: OANDA XAUUSD H1/D1 · Precomputed engine export · As of 2026-08-04 16:00 UTC") &&
      useSymbolSrc.includes("Data: OANDA XAUUSD H4/D1 · Precomputed engine export · As of 2026-07-03 16:00 UTC") &&
      useSymbolSrc.includes("Data: MT5 NAS100 H1/D1 · Precomputed engine export · As of 2026-08-04 16:00 UTC") &&
      useSymbolSrc.includes("Data: MT5 NAS100 H4/D1 · Precomputed engine export · As of 2026-07-03 16:00 UTC"),
  );

  // v7-fix: per-symbol data-source label (OANDA gold / MT5 NAS100, matching
  // the Footer provenance matrix) — no hardcoded "OANDA" left in the three
  // call sites; gold rendered strings stay byte-identical via the helper.
  const statusBar = await readSrc("components/symbol/SymbolStatusBar.tsx");
  const home = await readSrc("pages/Home.tsx");
  check(
    "data-source label: dataSourceLabel(config) in SymbolStatusBar + Home chart headers (no hardcoded OANDA)",
    statusBar.includes("dataSourceLabel(config)") &&
      !statusBar.includes("Data: OANDA") &&
      home.includes("dataSourceLabel(config)") &&
      !home.includes("· OANDA"),
  );

  // v7-fix: honest update indicator — pulsing "Auto-updated" only for the
  // live gold H1 context; static research exports / no-feed configs get a
  // neutral "Static export" label with no pulse.
  check(
    "Footer: 'Static export' for static contexts, pulsing 'Auto-updated' kept for live gold H1",
    footer.includes("isStaticContext") &&
      footer.includes("config.hasLiveFeed") &&
      footer.includes("Static export") &&
      footer.includes("Auto-updated") &&
      footer.includes("animate-pulse-dot"),
  );

  // ---- CHECK 7 — NAS100 H4 engine variant (Phase 11 / Track B2) -----------
  // (the "CHECK 6" slot is the component-source block above; this section is
  //  appended only — nothing above is re-asserted or weakened)
  console.log(`\n[NAS100-H4 variant]`);
  const { VARIANT_CONFIGS } = eng;
  const h4 = VARIANT_CONFIGS?.["nas100-h4"];
  check("VARIANT_CONFIGS['nas100-h4'] resolves with timeframe 'H4'", !!h4 && h4.timeframe === "H4");
  if (h4) {
    check("H4 variant is NAS100, STATIC mode (no live feed)", h4.symbol === "NAS100" && h4.hasLiveFeed === false);
    check(
      "H4 dataFiles: H4 bars/latest + reused NAS100 daily/sessions",
      h4.dataFiles.bars === "data/bars_nas100_h4.json" &&
        h4.dataFiles.latest === "data/latest_nas100_h4.json" &&
        h4.dataFiles.daily === "data/daily_nas100.json" &&
        h4.dataFiles.sessions === "data/sessions_nas100.json",
      JSON.stringify(h4.dataFiles),
    );
    // validation metrics — the verified H4 numbers the UI must render
    const hv = h4.validation ?? {};
    check(
      "H4 validation: 83.18% OOS accuracy · AUC 0.8715 (4dp) · 8,509 bars",
      hv.hvolAccuracyPct === 83.18 && hv.hvolAuc === 0.8715 && hv.hvolAucDecimals === 4 && hv.bars === 8509,
      `got ${JSON.stringify(hv)}`,
    );
    check(
      "H4 validation direction: 52.35% vs 54.33% always-up, drift 2021–2026",
      hv.directionModelPct === 52.35 && hv.directionAlwaysUpPct === 54.33 && hv.driftPeriod === "2021–2026",
      `got ${JSON.stringify(hv)}`,
    );
    // scorers callable on a 20-feature gbm_price vector
    const vec = new Array(20).fill(0);
    const hv4 = h4.scoreHvol(vec);
    const rg4 = h4.scoreRange(vec);
    check(
      "H4 scoreHvol/scoreRange callable, finite output",
      Number.isFinite(hv4) && Number.isFinite(rg4),
      `hvol=${hv4} range=${rg4}`,
    );
    check(
      "H4 modelModules point at the H4 engine modules",
      h4.modelModules.hvol.includes("H4") && h4.modelModules.range.includes("H4"),
      JSON.stringify(h4.modelModules),
    );
    // data files exist / parse / shape-ok under public/
    for (const kind of ["bars", "daily", "sessions", "latest"]) {
      const rel = h4.dataFiles[kind];
      const { exists, json, error } = await loadJson(rel);
      check(`public/${rel} exists and parses`, exists && json != null, error ?? (exists ? "parse error" : "missing"));
      if (json == null) continue;
      if (kind === "latest") {
        check(
          "H4 latest: asof + positive price + cone T1..T3",
          typeof json.asof === "string" && json.price > 0 && json.cone?.T1?.half_width > 0 && json.cone?.T3?.half_width > 0,
        );
      } else if (kind === "bars") {
        const last = json[json.length - 1];
        check("H4 bars: non-empty, OHLC rows", json.length > 0 && typeof last.o === "number" && typeof last.c === "number", `len=${json.length}`);
      } else if (kind === "sessions") {
        check(
          "H4 sessions (reused H1 profile): 24 hourly rows + 4 bands",
          Array.isArray(json.hours) && json.hours.length === 24 && ["asia", "london", "ny", "off"].every((k) => json.bands?.[k]),
        );
        check(
          "H4 sessions JSON bands match H4 config.sessionBands hours",
          ["asia", "london", "ny", "off"].every(
            (k) => JSON.stringify(json.bands[k].hours) === JSON.stringify(h4.sessionBands[k].hours),
          ),
        );
      } else if (kind === "daily") {
        check("H4 daily: non-empty OHLC rows", json.length > 0 && typeof json[json.length - 1].c === "number", `len=${json.length}`);
      }
    }
    // XAUUSD / NAS100 base configs stay untouched (no timeframe field — H1 default)
    check(
      "XAUUSD/NAS100 configs unchanged (timeframe stays undefined — H1 default)",
      SYMBOL_CONFIGS.XAUUSD.timeframe === undefined && SYMBOL_CONFIGS.NAS100.timeframe === undefined,
    );
  }

  // ---- CHECK 8 — XAUUSD (GOLD) H4 engine variant (Phase 12) ----------------
  // (appended only — nothing above is re-asserted or weakened)
  console.log(`\n[XAUUSD-H4 variant]`);
  const gh4 = VARIANT_CONFIGS?.["xauusd-h4"];
  check("VARIANT_CONFIGS['xauusd-h4'] resolves with timeframe 'H4'", !!gh4 && gh4.timeframe === "H4");
  if (gh4) {
    // LOUD honesty contract: gold H1 has a live feed, gold H4 does NOT.
    check("H4 variant is XAUUSD, STATIC mode (no live feed — live feed drives gold H1 only)", gh4.symbol === "XAUUSD" && gh4.hasLiveFeed === false);
    check(
      "H4 dataFiles: H4 bars/latest + reused gold daily/sessions",
      gh4.dataFiles.bars === "data/bars_xauusd_h4.json" &&
        gh4.dataFiles.latest === "data/latest_xauusd_h4.json" &&
        gh4.dataFiles.daily === "data/daily.json" &&
        gh4.dataFiles.sessions === "data/sessions.json",
      JSON.stringify(gh4.dataFiles),
    );
    // validation metrics — the verified gold H4 numbers the UI must render
    const ghv = gh4.validation ?? {};
    check(
      "H4 validation: 76.14% OOS accuracy · AUC 0.735 (3dp) · 6,971 bars",
      ghv.hvolAccuracyPct === 76.14 && ghv.hvolAuc === 0.735 && ghv.hvolAucDecimals === 3 && ghv.bars === 6971,
      `got ${JSON.stringify(ghv)}`,
    );
    check(
      "H4 validation direction: 52.21% vs 53.98% always-up, drift 2022–2026",
      ghv.directionModelPct === 52.21 && ghv.directionAlwaysUpPct === 53.98 && ghv.driftPeriod === "2022–2026",
      `got ${JSON.stringify(ghv)}`,
    );
    // scorers callable on a 20-feature gbm_price vector
    const vec = new Array(20).fill(0);
    const ghv4 = gh4.scoreHvol(vec);
    const grg4 = gh4.scoreRange(vec);
    check(
      "H4 scoreHvol/scoreRange callable, finite output",
      Number.isFinite(ghv4) && Number.isFinite(grg4),
      `hvol=${ghv4} range=${grg4}`,
    );
    check(
      "H4 modelModules point at the H4 engine modules",
      gh4.modelModules.hvol.includes("H4") && gh4.modelModules.range.includes("H4"),
      JSON.stringify(gh4.modelModules),
    );
    // data files exist / parse / shape-ok under public/
    for (const kind of ["bars", "daily", "sessions", "latest"]) {
      const rel = gh4.dataFiles[kind];
      const { exists, json, error } = await loadJson(rel);
      check(`public/${rel} exists and parses`, exists && json != null, error ?? (exists ? "parse error" : "missing"));
      if (json == null) continue;
      if (kind === "latest") {
        check(
          "H4 latest: asof + positive price + cone T1..T3",
          typeof json.asof === "string" && json.price > 0 && json.cone?.T1?.half_width > 0 && json.cone?.T3?.half_width > 0,
        );
      } else if (kind === "bars") {
        const last = json[json.length - 1];
        check(
          "H4 bars: exactly 400 OHLC rows with predictions (p_high_vol + exp_range_atr)",
          json.length === 400 &&
            typeof last.o === "number" &&
            typeof last.c === "number" &&
            typeof last.p_high_vol === "number" &&
            typeof last.exp_range_atr === "number",
          `len=${json.length}`,
        );
      } else if (kind === "sessions") {
        check(
          "H4 sessions (reused gold H1 profile): 24 hourly rows + 4 bands",
          Array.isArray(json.hours) && json.hours.length === 24 && ["asia", "london", "ny", "off"].every((k) => json.bands?.[k]),
        );
        check(
          "H4 sessions JSON bands match H4 config.sessionBands hours",
          ["asia", "london", "ny", "off"].every(
            (k) => JSON.stringify(json.bands[k].hours) === JSON.stringify(gh4.sessionBands[k].hours),
          ),
        );
      } else if (kind === "daily") {
        check("H4 daily (reused gold D1): non-empty OHLC rows", json.length > 0 && typeof json[json.length - 1].c === "number", `len=${json.length}`);
      }
    }
  }

  // ---- CHECK 9 — XAUUSD M5 scalper slot map (Phase 13) --------------------
  // (appended only — nothing above is re-asserted or weakened)
  console.log(`\n[XAUUSD-M5 scalper slot map]`);
  const m15 = await loadJson("data/xauusd_m15_slots.json");
  const m5 = await loadJson("data/xauusd_m5_slots.json");
  check("public/data/xauusd_m5_slots.json exists and parses", m5.exists && m5.json != null, m5.error ?? (m5.exists ? "parse error" : "missing"));
  if (m5.json != null) {
    const d = m5.json;
    check("M5 export has exactly 288 slots", Array.isArray(d.slots) && d.slots.length === 288, `len=${d.slots?.length}`);
    check(
      "M5 meta exact: timeframe M5 · bar_count 325160 · last_bar 2026-08-04 16:00:00 · point 0.01",
      d.meta?.timeframe === "M5" &&
        d.meta?.bar_count === 325160 &&
        d.meta?.last_bar === "2026-08-04 16:00:00" &&
        d.meta?.point === 0.01,
      JSON.stringify({ timeframe: d.meta?.timeframe, bar_count: d.meta?.bar_count, last_bar: d.meta?.last_bar, point: d.meta?.point }),
    );
    check(
      "M5 slots 0–11 (00:xx session break) are null with bar_count 0",
      Array.isArray(d.slots) &&
        d.slots.slice(0, 12).every((s) => s.avg_range_atr == null && s.avg_range_usd == null && s.bar_count === 0),
      JSON.stringify(d.slots?.slice(0, 12).map((s) => [s.slot, s.avg_range_atr, s.bar_count])),
    );
    const hot = d.highlights?.hottest_slot ?? {};
    check(
      "M5 hottest slot from highlights = 15:30 UTC at ~2.18x ATR (label exact, value within 0.01)",
      hot.label === "15:30" && typeof hot.avg_range_atr === "number" && Math.abs(hot.avg_range_atr - 2.18) <= 0.01,
      JSON.stringify(hot),
    );
    check(
      "M5 econ breakeven_gap_pp = 1.5 (NOT survivable — prefer M15 timing)",
      d.econ?.breakeven_gap_pp === 1.5,
      `got ${d.econ?.breakeven_gap_pp}`,
    );
    // zero-key-diff vs the M15 export — identical schema, per-export values
    if (m15.json != null) {
      const keyDiff = (a, b) => {
        const ka = Object.keys(a ?? {}).sort();
        const kb = Object.keys(b ?? {}).sort();
        return JSON.stringify(ka) === JSON.stringify(kb);
      };
      check(
        "M5 export zero-key-diff vs xauusd_m15_slots.json (top-level + meta/econ/guidance/highlights/hourly + slot entries)",
        keyDiff(d, m15.json) &&
          keyDiff(d.meta, m15.json.meta) &&
          keyDiff(d.econ, m15.json.econ) &&
          keyDiff(d.guidance, m15.json.guidance) &&
          keyDiff(d.highlights, m15.json.highlights) &&
          keyDiff(d.hourly, m15.json.hourly) &&
          keyDiff(d.slots?.[0], m15.json.slots?.[0]),
      );
    }
  }

  // ---- CHECK 10 — Phase 15 Track C: multi-market registry + 5 new markets --
  // (appended only — nothing above is re-asserted or weakened)
  console.log(`\n[Phase-15 UI registry + 5 new SHIP'ed markets]`);
  const uiOutfile = path.join(os.tmpdir(), `goldcast_symbol_check_ui_${process.pid}.mjs`);
  const dataOutfile = path.join(os.tmpdir(), `goldcast_symbol_check_data_${process.pid}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(ROOT, "src", "hooks", "useSymbol.tsx")],
    bundle: true,
    format: "esm",
    platform: "node",
    alias: { "@": path.join(ROOT, "src") },
    outfile: uiOutfile,
    logLevel: "silent",
  });
  await esbuild.build({
    entryPoints: [path.join(ROOT, "src", "hooks", "useData.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    alias: { "@": path.join(ROOT, "src") },
    outfile: dataOutfile,
    logLevel: "silent",
  });
  const ui = await import(url.pathToFileURL(uiOutfile).href);
  const dataHooks = await import(url.pathToFileURL(dataOutfile).href);
  const { SYMBOL_REGISTRY, SYMBOL_GROUPS, parseAppSymbolParam, fmtSymPrice, priceUnit, dataSourceLabel, symbolDisplayName } = ui;
  const { scalperClockFile, parseScalperTf } = dataHooks;

  // 10a — registry integrity -------------------------------------------------
  const REG_IDS = ["XAUUSD", "NAS100", "US30", "GER40", "EURUSD", "GBPUSD", "USDJPY"];
  check(
    "registry: exactly the 7 SHIP'ed markets, in order",
    !!SYMBOL_REGISTRY && JSON.stringify(Object.keys(SYMBOL_REGISTRY)) === JSON.stringify(REG_IDS),
    SYMBOL_REGISTRY ? JSON.stringify(Object.keys(SYMBOL_REGISTRY)) : "missing",
  );
  check(
    "registry: groups Metals/Indices/Forex in order, covering all 7 markets",
    Array.isArray(SYMBOL_GROUPS) &&
      SYMBOL_GROUPS.length === 3 &&
      SYMBOL_GROUPS[0].group === "Metals" &&
      SYMBOL_GROUPS[1].group === "Indices" &&
      SYMBOL_GROUPS[2].group === "Forex" &&
      JSON.stringify(SYMBOL_GROUPS[0].symbols) === JSON.stringify(["XAUUSD"]) &&
      JSON.stringify(SYMBOL_GROUPS[1].symbols) === JSON.stringify(["NAS100", "US30", "GER40"]) &&
      JSON.stringify(SYMBOL_GROUPS[2].symbols) === JSON.stringify(["EURUSD", "GBPUSD", "USDJPY"]),
    JSON.stringify(SYMBOL_GROUPS),
  );
  check(
    "registry: every entry's param is unique and lowercase",
    new Set(REG_IDS.map((id) => SYMBOL_REGISTRY[id].param)).size === 7 &&
      REG_IDS.every((id) => SYMBOL_REGISTRY[id].param === id.toLowerCase()),
  );

  // 10b — backward compatibility of ?symbol= ---------------------------------
  check(
    "?symbol= backward compatible: xauusd/nas100 resolve exactly as before; unknown/missing → XAUUSD",
    parseAppSymbolParam("xauusd") === "XAUUSD" &&
      parseAppSymbolParam("nas100") === "NAS100" &&
      parseAppSymbolParam("NAS100") === "NAS100" &&
      parseAppSymbolParam(null) === "XAUUSD" &&
      parseAppSymbolParam("bogus") === "XAUUSD",
  );
  check(
    "?symbol= accepts all five new markets (case-insensitive)",
    ["us30", "ger40", "eurusd", "gbpusd", "usdjpy"].every(
      (p) => parseAppSymbolParam(p) === p.toUpperCase() && parseAppSymbolParam(p.toUpperCase()) === p.toUpperCase(),
    ),
  );

  // 10c — legacy entries unchanged -------------------------------------------
  check(
    "legacy entries unchanged: XAUUSD OANDA/live/H4+M5, NAS100 MT5/static/H4, range units USD/pts",
    SYMBOL_REGISTRY.XAUUSD.dataSource === "OANDA" &&
      SYMBOL_REGISTRY.XAUUSD.h1.hasLiveFeed === true &&
      SYMBOL_REGISTRY.XAUUSD.h4 === "xauusd-h4" &&
      SYMBOL_REGISTRY.XAUUSD.scalperM5 === "/data/xauusd_m5_slots.json" &&
      SYMBOL_REGISTRY.XAUUSD.rangeUnit === "USD" &&
      SYMBOL_REGISTRY.NAS100.dataSource === "MT5" &&
      SYMBOL_REGISTRY.NAS100.h1.hasLiveFeed === false &&
      SYMBOL_REGISTRY.NAS100.h4 === "nas100-h4" &&
      SYMBOL_REGISTRY.NAS100.scalperM5 === null &&
      SYMBOL_REGISTRY.NAS100.rangeUnit === "pts",
  );
  check(
    "legacy display helpers byte-identical: displayName + headline",
    symbolDisplayName(SYMBOL_REGISTRY.XAUUSD.h1) === "Gold / U.S. Dollar" &&
      symbolDisplayName(SYMBOL_REGISTRY.NAS100.h1) === "Nasdaq 100 Index" &&
      SYMBOL_REGISTRY.XAUUSD.headline === "Gold has a schedule. Volatility keeps it." &&
      SYMBOL_REGISTRY.NAS100.headline === "Nasdaq has a schedule. Volatility keeps it.",
  );
  check(
    "legacy units/dataSource via helpers: priceUnit USD/pts · dataSourceLabel OANDA/MT5",
    priceUnit(SYMBOL_REGISTRY.XAUUSD.h1) === "USD" &&
      priceUnit(SYMBOL_REGISTRY.NAS100.h1) === "pts" &&
      dataSourceLabel(SYMBOL_REGISTRY.XAUUSD.h1) === "OANDA" &&
      dataSourceLabel(SYMBOL_REGISTRY.NAS100.h1) === "MT5",
  );

  // 10d — per-market checks for the five Phase-15 markets ---------------------
  const P15 = {
    US30: { group: "Indices", variant: "us30-h1", decimals: 1, rangeUnit: "pts", econ: "spread" },
    GER40: { group: "Indices", variant: "ger40-h1", decimals: 1, rangeUnit: "pts", econ: "spread" },
    EURUSD: { group: "Forex", variant: "eurusd-h1", decimals: 5, rangeUnit: "USD", econ: "commission" },
    GBPUSD: { group: "Forex", variant: "gbpusd-h1", decimals: 5, rangeUnit: "USD", econ: "commission" },
    USDJPY: { group: "Forex", variant: "usdjpy-h1", decimals: 3, rangeUnit: "JPY", econ: "commission-analogy" },
  };
  const { VARIANT_CONFIGS: VC } = eng;
  const grouped = (n) => n.toLocaleString("en-US");
  for (const [id, exp] of Object.entries(P15)) {
    console.log(`\n[${id}]`);
    const e = SYMBOL_REGISTRY[id];
    const vc = VC?.[exp.variant];
    check(
      `registry entry: group=${exp.group} · h1=${exp.variant} · H1-only · M15-only clock · MT5 static`,
      !!e &&
        e.group === exp.group &&
        /* structural equality with the engine variant config (the UI and
           engine bundles are separate esbuild products — no shared identity) */
        !!vc &&
        e.h1.symbol === vc.symbol &&
        e.h1.pointSize === vc.pointSize &&
        e.h1.pipSize === vc.pipSize &&
        JSON.stringify(e.h1.dataFiles) === JSON.stringify(vc.dataFiles) &&
        JSON.stringify(e.h1.validation) === JSON.stringify(vc.validation) &&
        e.h4 === null &&
        e.scalperM5 === null &&
        e.scalperM15 === `/data/${exp.variant.replace("-h1", "")}_m15_slots.json` &&
        e.dataSource === "MT5" &&
        e.h1.hasLiveFeed === false,
    );
    check(
      `decimals=${exp.decimals} (registry reads engine config, not a UI copy)`,
      e.h1.priceDecimals === exp.decimals && vc.priceDecimals === exp.decimals,
      `got ${e.h1.priceDecimals}`,
    );
    check(
      `rangeUnit=${exp.rangeUnit} via priceUnit(config)`,
      e.rangeUnit === exp.rangeUnit && priceUnit(e.h1) === exp.rangeUnit,
    );
    check(`econKind=${exp.econ}`, e.econKind === exp.econ);

    // footer strings derived from the static JSONs (no invented numbers)
    const slot = await loadJson(`data/${id.toLowerCase()}_m15_slots.json`);
    check(`public/data/${id.toLowerCase()}_m15_slots.json exists and parses`, slot.exists && slot.json != null);
    if (slot.json != null) {
      const m = slot.json.meta;
      const asOf = String(m.last_bar).slice(0, 16);
      const expectedScalperLine = `Data: MT5 ${id} M15 · ${grouped(m.bar_count)} bars · Static research export · As of ${asOf} UTC`;
      check(
        "slot map: meta.symbol/timeframe match, 96 M15 slots, 24 hourly rows + 4 bands",
        m.symbol === id &&
          m.timeframe === "M15" &&
          Array.isArray(slot.json.slots) &&
          slot.json.slots.length === 96 &&
          Array.isArray(slot.json.hourly?.hours) &&
          slot.json.hourly.hours.length === 24 &&
          ["asia", "london", "ny", "off"].every((k) => slot.json.hourly.bands?.[k]),
      );
      check(
        "slot map: econ/guidance/highlights blocks present with verdict text",
        typeof slot.json.econ?.verdict === "string" &&
          slot.json.econ.verdict.length > 0 &&
          typeof slot.json.econ?.breakeven_win_pct_median === "number" &&
          ["hot_slots", "quiet_slots", "economics", "general"].every((k) => typeof slot.json.guidance?.[k] === "string") &&
          typeof slot.json.highlights?.hottest_slot?.label === "string",
      );
      check(
        `footer scalper M15 line derived from JSON meta exactly ("${expectedScalperLine}")`,
        e.footer.scalperM15 === expectedScalperLine,
        `got "${e.footer.scalperM15}"`,
      );
    }
    const latest = await loadJson(vc.dataFiles.latest);
    check(`public/${vc.dataFiles.latest} exists and parses`, latest.exists && latest.json != null);
    if (latest.json != null) {
      const asOf = String(latest.json.asof).slice(0, 16);
      const expectedEngineLine = `Data: MT5 ${id} H1/D1 · Precomputed engine export · As of ${asOf} UTC`;
      check(
        `footer engine H1 line derived from latest JSON asof exactly ("${expectedEngineLine}")`,
        e.footer.engineH1 === expectedEngineLine,
        `got "${e.footer.engineH1}"`,
      );
      check(
        "latest: positive price + cone T1..T3",
        latest.json.price > 0 && latest.json.cone?.T1?.half_width > 0 && latest.json.cone?.T3?.half_width > 0,
      );
    }
    for (const kind of ["bars", "daily"]) {
      const rel = vc.dataFiles[kind];
      const { exists, json } = await loadJson(rel);
      check(
        `public/${rel} exists, parses, non-empty OHLC`,
        exists && Array.isArray(json) && json.length > 0 && typeof json[json.length - 1].c === "number",
      );
    }

    // scalperClockFile + stf guard from the bundled data hooks
    check(
      `scalperClockFile(${id}) → M15 export; stf=m5 ignored (M15 only)`,
      scalperClockFile(id, "M15") === e.scalperM15 &&
        scalperClockFile(id, "M5") === e.scalperM15 &&
        parseScalperTf("m5", id) === "M15",
      `${scalperClockFile(id, "M15")} / ${scalperClockFile(id, "M5")}`,
    );

    // price formatting at market decimals (from the bundled registry helpers)
    const probe = exp.decimals === 1 ? 53764.04 : exp.decimals === 5 ? 1.14404 : 157.4316;
    const expectedPrice = probe.toLocaleString("en-US", {
      minimumFractionDigits: exp.decimals,
      maximumFractionDigits: exp.decimals,
    });
    check(
      `fmtSymPrice honors ${exp.decimals}dp ("${expectedPrice}")`,
      fmtSymPrice(probe, e.h1) === expectedPrice,
      `got "${fmtSymPrice(probe, e.h1)}"`,
    );
  }

  // 10e — honesty notes --------------------------------------------------------
  console.log(`\n[Phase-15 honesty notes]`);
  check(
    "FX commission honesty: EURUSD/GBPUSD econNote is exactly 'commission $7/lot (user account)'",
    SYMBOL_REGISTRY.EURUSD.econNote === "commission $7/lot (user account)" &&
      SYMBOL_REGISTRY.GBPUSD.econNote === "commission $7/lot (user account)",
  );
  check(
    "USDJPY econNote: commission $7/lot (user account) — applied by analogy",
    typeof SYMBOL_REGISTRY.USDJPY.econNote === "string" &&
      SYMBOL_REGISTRY.USDJPY.econNote.includes("commission $7/lot (user account)") &&
      SYMBOL_REGISTRY.USDJPY.econNote.includes("analogy"),
  );
  check(
    "non-FX markets carry no commission note",
    ["XAUUSD", "NAS100", "US30", "GER40"].every((id) => SYMBOL_REGISTRY[id].econNote === null),
  );
  check(
    "USDJPY range-model honesty: negative classic R² disclosed (engineRangeNote), other markets null",
    typeof SYMBOL_REGISTRY.USDJPY.engineRangeNote === "string" &&
      SYMBOL_REGISTRY.USDJPY.engineRangeNote.includes("−0.185") &&
      REG_IDS.filter((id) => id !== "USDJPY").every((id) => SYMBOL_REGISTRY[id].engineRangeNote === null),
  );

  // 10f — component sources ----------------------------------------------------
  console.log(`\n[Phase-15 component sources]`);
  const picker = await readSrc("components/symbol/SymbolPicker.tsx");
  check(
    "SymbolPicker: grouped dropdown from SYMBOL_GROUPS (shadcn DropdownMenu), registry-driven",
    picker.includes("SYMBOL_GROUPS") &&
      picker.includes("DropdownMenu") &&
      picker.includes("setSymbol") &&
      !picker.includes("xauusd_m15_slots"),
  );
  const navbarSrc = await readSrc("components/Navbar.tsx");
  check(
    "Navbar: uses SymbolPicker (old 2-button SymbolToggle gone)",
    navbarSrc.includes("SymbolPicker") && !navbarSrc.includes("SymbolToggle"),
  );
  const toggleGone = await fs
    .readFile(path.join(ROOT, "src", "components", "symbol", "SymbolToggle.tsx"), "utf8")
    .then(() => false)
    .catch(() => true);
  check("SymbolToggle.tsx removed (replaced by SymbolPicker)", toggleGone);
  const tfToggle = await readSrc("components/symbol/TfToggle.tsx");
  check(
    "TfToggle: H1-only markets get an honest note instead of a fake control",
    tfToggle.includes("H1 only") && tfToggle.includes("SEGMENTS[symbol]"),
  );
  const econPanel = await readSrc("components/scalper/EconPanel.tsx");
  check(
    "EconPanel: commission family (FX) schema + econNote + zero-cost reference, spread family kept",
    econPanel.includes("median_cost_atr") &&
      econPanel.includes("entry.econNote") &&
      econPanel.includes("zero-cost") &&
      econPanel.includes("commission $7/lot (user account)") &&
      econPanel.includes("median_spread_atr"),
  );
  const scalperUtils = await readSrc("components/scalper/utils.ts");
  check(
    "scalper utils: verdict chips for all 5 new markets + fmtSlotRange (per-market units)",
    ["US30", "GER40", "EURUSD", "GBPUSD", "USDJPY"].every((s) => scalperUtils.includes(`${s}:`)) &&
      scalperUtils.includes("fmtSlotRange"),
  );
  const slotGrid = await readSrc("components/scalper/SlotGrid.tsx");
  const hotCards = await readSrc("components/scalper/HotCards.tsx");
  const hourlyStrip = await readSrc("components/scalper/HourlyStrip.tsx");
  const scalperPage = await readSrc("pages/ScalperClock.tsx");
  check(
    "scalper page: per-market range formatting (fmtSlotRange) in SlotGrid/HotCards/HourlyStrip/hero",
    slotGrid.includes("fmtSlotRange") &&
      hotCards.includes("fmtSlotRange") &&
      hourlyStrip.includes("fmtSlotRange") &&
      scalperPage.includes("fmtSlotRange"),
  );
  check(
    "24h markets honest: HourlyStrip trading-hours count + SlotGrid break legend are data-driven",
    hourlyStrip.includes("tradingHours") && slotGrid.includes("hasBreak"),
  );
  const forecastStrip = await readSrc("components/dashboard/ForecastStrip.tsx");
  check(
    "ForecastStrip: per-market range decimals + engineRangeNote disclosure (USDJPY negative R²)",
    forecastStrip.includes("rangeDigits(config, 1)") && forecastStrip.includes("engineRangeNote"),
  );
  const sessionsPage = await readSrc("pages/Sessions.tsx");
  check(
    "Sessions: headline + verified bar count from registry/config (no per-symbol hardcode map)",
    sessionsPage.includes("entryForSymbol(config.symbol).headline") &&
      sessionsPage.includes("config.validation.bars") &&
      !sessionsPage.includes("TOTAL_BARS"),
  );
  const sessionsUtils = await readSrc("components/sessions/utils.ts");
  const symbolStrip = await readSrc("components/symbol/SymbolSessionStrip.tsx");
  const homePage = await readSrc("pages/Home.tsx");
  check(
    "shared gold session profile honesty: reuse-aware formatting + visible notes (Sessions utils/hero, SymbolSessionStrip, Home context)",
    sessionsUtils.includes("sessionsReusedFromGold") &&
      sessionsPage.includes("sessionsReusedFromGold") &&
      symbolStrip.includes("sessionsReusedFromGold") &&
      symbolStrip.includes("shared XAUUSD H1 session profile") &&
      homePage.includes("sessionsReusedFromGold"),
  );

  // ---- CHECK 11 — Phase 17 Track B: economic calendar frontend -------------
  // newsCurrencies registry field + useEconCalendar hook + NewsWarningBar
  // wired into the Scalper's Clock and both dashboards, tz-aware, source-badged.
  console.log("\n[CHECK 11 — Phase 17 Track B: economic calendar frontend]");
  const EXPECTED_NEWS_CCYS = {
    XAUUSD: ["USD"],
    NAS100: ["USD"],
    US30: ["USD"],
    GER40: ["EUR", "USD"],
    EURUSD: ["EUR", "USD"],
    GBPUSD: ["GBP", "USD"],
    USDJPY: ["USD", "JPY"],
  };
  check(
    "newsCurrencies: every registry entry carries the expected feed currency codes (feed covers USD/EUR/GBP/JPY)",
    Object.entries(EXPECTED_NEWS_CCYS).every(
      ([id, ccys]) => JSON.stringify(SYMBOL_REGISTRY[id]?.newsCurrencies) === JSON.stringify(ccys),
    ),
  );
  const econHook = await readSrc("hooks/useEconCalendar.ts");
  check(
    "useEconCalendar: locked contract (GET /api/economic-calendar, events/timeUtc/impact, source forexfactory|static-fallback)",
    econHook.includes("'/api/economic-calendar'") &&
      econHook.includes("timeUtc") &&
      econHook.includes("forexfactory") &&
      econHook.includes("static-fallback"),
  );
  const newsBar = await readSrc("components/news/NewsWarningBar.tsx");
  check(
    "NewsWarningBar: registry-driven currencies, tz-aware times, source badge, honest empty/error states",
    newsBar.includes("entry.newsCurrencies") &&
      newsBar.includes("useTimezone") &&
      newsBar.includes("useEconCalendar") &&
      newsBar.includes("static fallback") &&
      newsBar.includes("calendar unavailable"),
  );
  check(
    "NewsWarningBar wired into ScalperClock page",
    scalperPage.includes("NewsWarningBar"),
  );
  check(
    "NewsWarningBar wired into Home (live + static dashboards)",
    homePage.includes("NewsWarningBar") &&
      (homePage.match(/<NewsWarningBar/g) ?? []).length >= 2,
  );

  await fs.unlink(uiOutfile).catch(() => {});
  await fs.unlink(dataOutfile).catch(() => {});
  await fs.unlink(outfile).catch(() => {});
  console.log(failures === 0 ? "\nSYMBOL CHECK: PASS" : `\nSYMBOL CHECK: FAIL (${failures} failing checks)`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error("SYMBOL CHECK: ERROR", e);
  process.exit(1);
});
