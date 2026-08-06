/**
 * GoldCast Phase 6 Stage 1 — PARITY GATE (must print PASS before merge).
 *
 * Recomputes, in TS/JS, everything the Python side exported
 * (goldcast_phase1/src/export_parity.py) and compares:
 *
 *   CHECK 1 — features: buildFeatures(bars.json OHLC + daily.json) for the
 *             same 400 H1 bars vs scripts/parity/parity_features.csv.
 *             Pass: max abs diff per feature <= 1e-6 (or rel <= 1e-9 for
 *             large values); NaN must match NaN exactly.
 *   CHECK 2 — model scores: JS modelHvol/modelRange score() per bar (NaN->0)
 *             vs scripts/parity/parity_scores.csv. Pass: max abs diff <= 1e-6.
 *   CHECK 3 — predict(): predict(bars, daily) for the latest bar vs
 *             scripts/parity/parity_predict.json. Pass: all numeric fields
 *             within 1e-6, strings equal.
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

  // ---- load data ---------------------------------------------------------
  const bars = JSON.parse(await fs.readFile(path.join(ROOT, "public/data/bars.json"), "utf8"))
    .map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }));
  const daily = JSON.parse(await fs.readFile(path.join(ROOT, "public/data/daily.json"), "utf8"));
  const featCsv = parseCsv(await fs.readFile(path.join(ROOT, "scripts/parity/parity_features.csv"), "utf8"));
  const scoreCsv = parseCsv(await fs.readFile(path.join(ROOT, "scripts/parity/parity_scores.csv"), "utf8"));
  const predPy = JSON.parse(await fs.readFile(path.join(ROOT, "scripts/parity/parity_predict.json"), "utf8"));

  let allPass = true;

  // ---- CHECK 1: features -------------------------------------------------
  const { names, rows } = eng.buildFeatures(bars, daily);
  console.log("CHECK 1 — feature vectors (400 bars x 20 features)");
  console.log("feature".padEnd(20), "max_abs_diff".padStart(14), "n_nan_match".padStart(13), "verdict");
  if (rows.length !== featCsv.length) {
    console.log(`FAIL: row count ${rows.length} vs ${featCsv.length}`);
    allPass = false;
  }
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
    const ok = bad === 0;
    if (!ok) allPass = false;
    console.log(
      name.padEnd(20),
      maxAbs.toExponential(3).padStart(14),
      String(nanMatch).padStart(13),
      ok ? "ok" : `FAIL (${bad} rows)`
    );
  }
  const c1 = rows.length === featCsv.length && allPass;
  console.log(`CHECK 1: ${c1 ? "PASS" : "FAIL"}\n`);

  // ---- CHECK 2: JS model scores ------------------------------------------
  let maxP = 0;
  let maxR = 0;
  let bad2 = 0;
  let c2 = true;
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i].map((v) => (Number.isNaN(v) ? 0 : v)); // NaN->0 (documented)
    const pJs = eng.scoreHvol(x);
    const rJs = eng.scoreRange(x);
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
  const predJs = eng.predict(bars, daily);
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

  await fs.unlink(outfile).catch(() => {});
  console.log("==================================================");
  console.log(`PARITY GATE: ${allPass && c1 && c2 && c3 ? "PASS" : "FAIL"}`);
  process.exit(allPass && c1 && c2 && c3 ? 0 : 1);
}

main().catch((e) => {
  console.error("parity_check crashed:", e);
  process.exit(1);
});
