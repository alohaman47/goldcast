/**
 * GoldCast Phase 6 Stage 1 / Phase 9 Stage 1 — PARITY GATE for BOTH symbols
 * (must print PASS for gold AND nas100 before merge).
 *
 * Recomputes, in TS/JS, everything the Python side exported
 * (goldcast_phase1/src/export_parity.py --symbol gold|nas100) and compares,
 * per symbol:
 *
 *   CHECK 1 — features: buildFeatures(bars json OHLC + daily json) for the
 *             same 400 H1 bars vs scripts/parity/parity[_nas100]_features.csv.
 *             Pass: max abs diff per feature <= 1e-6 (or rel <= 1e-9 for
 *             large values); NaN must match NaN exactly.
 *   CHECK 2 — model scores: JS model score() per bar (NaN->0) via the
 *             symbol's SymbolConfig scorers vs parity[_nas100]_scores.csv.
 *             Pass: max abs diff <= 1e-6.
 *   CHECK 3 — predict(): predict(bars, daily, {config}) for the latest bar vs
 *             parity[_nas100]_predict.json. Pass: all numeric fields within
 *             1e-6, strings equal.
 *
 * Usage: node scripts/parity_check.mjs   (exit code 0 = PASS, 1 = FAIL)
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import * as esbuild from "esbuild";

const ROOT = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const TOL_ABS = 1e-6;
const TOL_REL = 1e-9;

const SYMBOLS = [
  {
    id: "XAUUSD (gold)",
    barsJson: "public/data/bars.json",
    dailyJson: "public/data/daily.json",
    featCsv: "scripts/parity/parity_features.csv",
    scoreCsv: "scripts/parity/parity_scores.csv",
    predJson: "scripts/parity/parity_predict.json",
    configExport: "GOLD_CONFIG",
  },
  {
    id: "NAS100",
    barsJson: "public/data/bars_nas100.json",
    dailyJson: "public/data/daily_nas100.json",
    featCsv: "scripts/parity/parity_nas100_features.csv",
    scoreCsv: "scripts/parity/parity_nas100_scores.csv",
    predJson: "scripts/parity/parity_nas100_predict.json",
    configExport: "NAS100_CONFIG",
  },
];

function parseCsv(text) {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((ln) => {
    const cells = ln.split(",");
    const row = {};
    header.forEach((h, i) => {
      row[h] = cells[i] === "" ? NaN : Number(cells[i]);
    });
    row.__dt = cells[0];
    return row;
  });
}

function diff(a, b) {
  // returns {abs, ok} ; NaN==NaN is a match
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return { abs: NaN, ok: Number.isNaN(a) && Number.isNaN(b) };
  }
  const abs = Math.abs(a - b);
  const rel = abs / Math.max(Math.abs(a), Math.abs(b));
  return { abs, ok: abs <= TOL_ABS || rel <= TOL_REL };
}

/** Run all three checks for one symbol. Returns {pass, maxFeat, maxP, maxR}. */
async function checkSymbol(eng, sym) {
  const bars = JSON.parse(await fs.readFile(path.join(ROOT, sym.barsJson), "utf8"))
    .map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }));
  const daily = JSON.parse(await fs.readFile(path.join(ROOT, sym.dailyJson), "utf8"));
  const featCsv = parseCsv(await fs.readFile(path.join(ROOT, sym.featCsv), "utf8"));
  const scoreCsv = parseCsv(await fs.readFile(path.join(ROOT, sym.scoreCsv), "utf8"));
  const predPy = JSON.parse(await fs.readFile(path.join(ROOT, sym.predJson), "utf8"));
  const config = eng[sym.configExport];

  let allPass = true;

  // ---- CHECK 1: features -------------------------------------------------
  const { names, rows } = eng.buildFeatures(bars, daily);
  console.log("CHECK 1 — feature vectors (400 bars x 20 features)");
  console.log("feature".padEnd(20), "max_abs_diff".padStart(14), "n_nan_match".padStart(13), "verdict");
  let rowCountOk = rows.length === featCsv.length;
  if (!rowCountOk) {
    console.log(`FAIL: row count ${rows.length} vs ${featCsv.length}`);
    allPass = false;
  }
  let maxFeat = 0;
  for (let j = 0; j < names.length; j++) {
    const name = names[j];
    let maxAbs = 0;
    let nanMatch = 0;
    let bad = 0;
    for (let i = 0; i < rows.length; i++) {
      const d = diff(rows[i][j], featCsv[i][name]);
      if (!d.ok) bad++;
      else {
        if (Number.isNaN(d.abs)) nanMatch++;
        else if (d.abs > maxAbs) maxAbs = d.abs;
      }
    }
    if (maxAbs > maxFeat) maxFeat = maxAbs;
    const ok = bad === 0;
    if (!ok) allPass = false;
    console.log(
      name.padEnd(20),
      maxAbs.toExponential(3).padStart(14),
      String(nanMatch).padStart(13),
      ok ? "ok" : `FAIL (${bad} rows)`
    );
  }
  const c1 = rowCountOk && allPass;
  console.log(`CHECK 1: ${c1 ? "PASS" : "FAIL"}\n`);

  // ---- CHECK 2: JS model scores ------------------------------------------
  let maxP = 0;
  let maxR = 0;
  let bad2 = 0;
  let c2 = true;
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i].map((v) => (Number.isNaN(v) ? 0 : v)); // NaN->0 (documented)
    const pJs = config.scoreHvol(x);
    const rJs = config.scoreRange(x);
    const dp = Math.abs(pJs - scoreCsv[i].p_high_vol);
    const dr = Math.abs(rJs - scoreCsv[i].pred_range_atr);
    if (dp > maxP) maxP = dp;
    if (dr > maxR) maxR = dr;
    if (dp > TOL_ABS || dr > TOL_ABS) {
      bad2++;
      c2 = false;
    }
  }
  if (bad2) allPass = false;
  console.log("CHECK 2 — JS model scores vs Python sklearn");
  console.log(`  max |dp_high_vol|     = ${maxP.toExponential(3)}`);
  console.log(`  max |d_pred_range|    = ${maxR.toExponential(3)}`);
  console.log(`CHECK 2: ${c2 ? "PASS" : `FAIL (${bad2} rows)`}\n`);

  // ---- CHECK 3: predict() JSON -------------------------------------------
  const predJs = eng.predict(bars, daily, { config });
  let c3 = true;
  const flat = (obj, prefix = "") => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") Object.assign(out, flat(v, key));
      else out[key] = v;
    }
    return out;
  };
  const fPy = flat(predPy);
  const fJs = flat(predJs);
  console.log("CHECK 3 — predict() JSON vs Python");
  console.log("field".padEnd(28), "python".padStart(16), "ts/js".padStart(16), "verdict");
  for (const key of Object.keys(fPy)) {
    const a = fPy[key];
    const b = fJs[key];
    if (!(key in fJs)) {
      // metadata present only in the Python export (e.g. engine_version) — informational
      console.log(key.padEnd(28), String(a).padStart(16), "(n/a)".padStart(16), "meta");
      continue;
    }
    let ok;
    if (typeof a === "number" && typeof b === "number") ok = Math.abs(a - b) <= TOL_ABS;
    else ok = a === b;
    if (!ok) {
      c3 = false;
      allPass = false;
    }
    console.log(key.padEnd(28), String(a).padStart(16), String(b).padStart(16), ok ? "ok" : "FAIL");
  }
  console.log(`CHECK 3: ${c3 ? "PASS" : "FAIL"}\n`);

  return { pass: allPass && c1 && c2 && c3, maxFeat, maxP, maxR };
}

async function main() {
  // ---- bundle the TS engine on the fly ----------------------------------
  const outfile = path.join(os.tmpdir(), `goldcast_parity_${process.pid}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(ROOT, "scripts", "parity_entry.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile,
    logLevel: "silent",
  });
  const eng = await import(url.pathToFileURL(outfile).href);

  const results = [];
  for (const sym of SYMBOLS) {
    console.log("##################################################");
    console.log(`SYMBOL: ${sym.id}`);
    console.log("##################################################");
    const r = await checkSymbol(eng, sym);
    results.push({ sym, ...r });
    console.log(`SYMBOL ${sym.id}: ${r.pass ? "PASS" : "FAIL"} ` +
      `(max feat diff ${r.maxFeat.toExponential(3)}, ` +
      `max |dp| ${r.maxP.toExponential(3)}, max |dr| ${r.maxR.toExponential(3)})\n`);
  }

  await fs.unlink(outfile).catch(() => {});
  const allPass = results.every((r) => r.pass);
  console.log("==================================================");
  for (const r of results) {
    console.log(`  ${r.sym.id.padEnd(16)} ${r.pass ? "PASS" : "FAIL"}`);
  }
  console.log(`PARITY GATE: ${allPass ? "PASS" : "FAIL"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("parity_check crashed:", e);
  process.exit(1);
});
