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
      hvolAccuracyPct: 80.08,
      hvolAuc: 0.778,
      hvolAucDecimals: 3,
      bars: 26836,
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
      hvolAccuracyPct: 82.98,
      hvolAuc: 0.8726,
      hvolAucDecimals: 4,
      bars: 26798,
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
    "CandlestickChart: aria-label + a11y summary use config.symbol / priceUnit (no hardcoded XAUUSD/USD)",
    chart.includes("aria-label={`${config.symbol} H1 candlestick chart") &&
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
  check(
    "Footer: data-source line symbol-aware (OANDA XAUUSD vs MT5 NAS100)",
    footer.includes("Data: OANDA XAUUSD H1/D1") && footer.includes("Data: MT5 NAS100 H1/D1"),
  );

  await fs.unlink(outfile).catch(() => {});
  console.log(failures === 0 ? "\nSYMBOL CHECK: PASS" : `\nSYMBOL CHECK: FAIL (${failures} failing checks)`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error("SYMBOL CHECK: ERROR", e);
  process.exit(1);
});
