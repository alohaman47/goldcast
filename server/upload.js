// GoldCast Phase 18 Track U — MT5 CSV data-upload router (self-contained).
//
// Lead wires this into server/index.js with:
//     import { createUploadRouter } from "./upload.js";
//     app.use("/api/data-upload", createUploadRouter());
//
// หมายเหตุซื่อสัตย์ (honest-by-design):
//  - ไฟล์ที่รับไว้ "ไม่ได้" ถูก retrain ในเซิร์ฟเวอร์นี้ — มีไว้ให้ pipeline
//    นอกเว็บ (offline retrain) มาหยิบไปใช้ในรอบถัดไปเท่านั้น ตัวเลขที่แสดง
//    ในแอปจึงไม่เปลี่ยนทันทีหลังอัปโหลด
//  - disk บน host (เช่น Railway container) อาจเป็น ephemeral — ไฟล์อาจหายเมื่อ
//    redeploy ผู้ใช้ควรเก็บต้นฉบับ CSV ไว้เองเสมอ
//
// รูปแบบไฟล์ที่รับ: MT5 "Export" จริง — tab-delimited, header มี <> ครอบ
// (รับทั้งแบบมี/ไม่มี <>), CRLF หรือ LF. มี 2 schema (ยืนยัน byte-level กับ
// ไฟล์จริงใน /mnt/agents/upload/):
//   intraday (M5/M15/H1/H4) — 9 คอลัมน์ มี <TIME>:
//     <DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>
//     2022.01.03\t01:00:00\t1828.40\t1831.74\t1827.95\t1828.44\t1524\t0\t5
//   D1 — 8 คอลัมน์ ไม่มี <TIME> (แท่งรายวันมีแค่วันที่):
//     <DATE>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>
//     2022.01.03\t1828.40\t1831.74\t1798.32\t1801.17\t90188\t0\t5
// คอลัมน์ TICKVOL/VOL/SPREAD เป็นทางเลือก — บันทึก hasTickvol/hasSpread ไว้ใน
// sidecar ให้ pipeline รู้ ไม่บังคับมี

import express from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MARKETS = new Set(["xauusd", "nas100", "us30", "ger40", "eurusd", "gbpusd", "usdjpy"]);
const TFS = new Set(["d1", "h1", "m15", "m5", "h4"]);
const MAX_TEXT = "30mb";

// คอลัมน์บังคับหลัง normalize (ตัด <>, trim, uppercase) — DATE+TIME แยกคอลัมน์
// ตาม MT5 export จริง (ไม่ใช่ TIME คอลัมน์เดียว). ยกเว้น D1 ที่ไม่มี <TIME>
// (แท่งรายวัน) — ดู REQUIRED_COLS_FOR(tf)
const BASE_COLS = ["DATE", "OPEN", "HIGH", "LOW", "CLOSE"];
function requiredColsFor(tf) {
  return tf === "d1" ? BASE_COLS : ["DATE", "TIME", "OPEN", "HIGH", "LOW", "CLOSE"];
}

const DATE_RE = /^\d{4}\.\d{2}\.\d{2}$/; // MT5: 2022.01.03
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/; // MT5: 01:00:00 (บาง export ไม่มีวินาที)
const MIN_PARSE_RATE = 0.95;

/* ── PIN auth (timing-safe) ──────────────────────────────────────────────── */
function requireUploadToken(req, res, next) {
  const expected = process.env.UPLOAD_TOKEN;
  if (!expected) {
    return res.status(501).json({
      error: "Upload not configured — ตั้ง UPLOAD_TOKEN ใน server ก่อน",
    });
  }
  // รับ token จาก header x-upload-token หรือ query ?token= (สำหรับ GET status)
  const got = String(req.get("x-upload-token") || req.query.token || "");
  const a = Buffer.from(got, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: "invalid upload token — PIN ไม่ถูกต้อง" });
  }
  next();
}

/* ── CSV validation ──────────────────────────────────────────────────────── */
// คืน { ok, error?, result? } — result มี rows/firstBar/lastBar/warnings/
// hasSpread/hasTickvol สำหรับ response + sidecar
// tf ใช้ตัดสิน schema: "d1" ไม่มีคอลัมน์ TIME (duplicate ตรวจจาก DATE อย่างเดียว)
export function validateMt5Csv(text, tf = "h1") {
  if (typeof text !== "string" || text.trim() === "") {
    return { ok: false, error: "ไฟล์ว่างเปล่า" };
  }

  const lines = text
    .split("\n")
    .map((l) => l.replace(/\r$/, "")) // MT5 export เป็น CRLF
    .filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { ok: false, error: "ไฟล์มีแค่ header ไม่มีแถวข้อมูล" };
  }

  // delimiter: MT5 ใช้ TAB — เผื่อรับ comma/semicolon ถ้า header ไม่มี tab เลย
  const headerLine = lines[0];
  const delim = headerLine.includes("\t") ? "\t" : headerLine.includes(",") ? "," : headerLine.includes(";") ? ";" : "\t";

  const normalize = (s) => s.trim().replace(/^<|>$/g, "").trim().toUpperCase();
  const header = headerLine.split(delim).map(normalize);
  const colIdx = new Map(header.map((name, i) => [name, i]));

  const required = requiredColsFor(tf);
  const missing = required.filter((c) => !colIdx.has(c));
  if (missing.length > 0) {
    const expect =
      tf === "d1"
        ? "D1 ต้องมี DATE,OPEN,HIGH,LOW,CLOSE (แท่งรายวันไม่มี TIME)"
        : "intraday ต้องมี DATE,TIME,OPEN,HIGH,LOW,CLOSE แยกคอลัมน์";
    return {
      ok: false,
      error:
        `header ไม่ตรงรูปแบบ MT5 — ขาดคอลัมน์ ${missing.join(", ")} ` +
        `(${expect}; พบ: ${header.slice(0, 12).join(", ")})`,
    };
  }
  const hasTickvol = colIdx.has("TICKVOL");
  const hasSpread = colIdx.has("SPREAD");
  const hasTime = colIdx.has("TIME"); // D1 ไม่มี — ใช้ DATE อย่างเดียว

  const iDate = colIdx.get("DATE");
  const iTime = hasTime ? colIdx.get("TIME") : -1;
  const iO = colIdx.get("OPEN");
  const iH = colIdx.get("HIGH");
  const iL = colIdx.get("LOW");
  const iC = colIdx.get("CLOSE");

  const warnings = [];
  const seen = new Set();
  let dupCount = 0;
  let parsed = 0;
  let badRows = 0;
  let firstTs = null; // { key: "YYYY.MM.DD HH:MM[:SS]", sort: number(ms-ish) }
  let lastTs = null;
  let prevSort = -Infinity;
  let unsorted = false;

  const total = lines.length - 1;
  for (let li = 1; li < lines.length; li++) {
    const cells = lines[li].split(delim);
    const need = Math.max(iDate, iTime, iO, iH, iL, iC);
    const date = cells[iDate]?.trim() ?? "";
    const time = hasTime ? (cells[iTime]?.trim() ?? "") : "";
    const o = Number(cells[iO]);
    const h = Number(cells[iH]);
    const l = Number(cells[iL]);
    const c = Number(cells[iC]);
    const rowBad =
      cells.length <= need ||
      !DATE_RE.test(date) ||
      (hasTime && !TIME_RE.test(time)) ||
      cells[iO]?.trim() === "" || cells[iH]?.trim() === "" ||
      cells[iL]?.trim() === "" || cells[iC]?.trim() === "" ||
      !Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c);
    if (rowBad) {
      badRows++;
      continue;
    }
    parsed++;

    // duplicate key: intraday = DATE+TIME รวมกัน, D1 = DATE อย่างเดียว
    const key = hasTime ? `${date} ${time}` : date;
    if (seen.has(key)) dupCount++;
    else seen.add(key);

    // sort key ที่เปรียบเทียบเป็นสตริงได้ตรงๆ เพราะรูปแบบ zero-padded คงที่
    const sortKey = key.padEnd(19, "0"); // เติมวินาทีถ้า export ไม่มี
    if (sortKey < prevSort) unsorted = true;
    prevSort = sortKey;
    if (firstTs === null || sortKey < firstTs.sort) firstTs = { key, sort: sortKey };
    if (lastTs === null || sortKey > lastTs.sort) lastTs = { key, sort: sortKey };
  }

  if (parsed === 0) {
    return {
      ok: false,
      error:
        "parse แถวข้อมูลไม่ได้เลย — รูปแบบวันที่ต้องเป็น YYYY.MM.DD" +
        (hasTime ? " และเวลา HH:MM:SS" : "") +
        " คั่นด้วย TAB",
    };
  }
  const parseRate = parsed / total;
  if (parseRate < MIN_PARSE_RATE) {
    return {
      ok: false,
      error: `parse ได้แค่ ${parsed}/${total} แถว (${(parseRate * 100).toFixed(1)}% < 95%) — ไฟล์เพี้ยนจากรูปแบบ MT5 export มากเกินไป`,
    };
  }
  if (badRows > 0) {
    warnings.push(`ข้ามแถวที่ parse ไม่ได้/ค่า OHLC ว่างหรือไม่ใช่ตัวเลข ${badRows} แถว (${((badRows / total) * 100).toFixed(1)}%)`);
  }
  if (dupCount > 0) {
    warnings.push(`พบแถวเวลาซ้ำ (${hasTime ? "DATE+TIME" : "DATE"}) ${dupCount} แถว`);
  }
  if (unsorted) {
    warnings.push("แถวข้อมูลไม่ได้เรียงเวลาจากเก่าไปใหม่ — pipeline จะ sort ให้ตอน retrain");
  }

  return {
    ok: true,
    result: {
      rows: parsed,
      skippedRows: badRows,
      duplicateRows: dupCount,
      firstBar: firstTs.key,
      lastBar: lastTs.key,
      sorted: !unsorted,
      warnings,
      hasSpread,
      hasTickvol,
    },
  };
}

/* ── storage ─────────────────────────────────────────────────────────────── */
function uploadDir() {
  return process.env.DATA_UPLOAD_DIR || "/data/uploads";
}

function stampUtc(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

// เขียน CSV + sidecar JSON ใต้ <dir>/<YYYYMMDD-HHmmss>/<market>_<tf>.csv
// ถ้าวินาทีเดียวกันมีอัปโหลดชนกัน ให้เติม -2, -3, … ที่ชื่อโฟลเดอร์
// ใช้ flag "wx" (exclusive create) เพื่อกัน race: 2 request พร้อมกันจะไม่ทับกัน
async function storeUpload(market, tf, csvText, meta) {
  const base = uploadDir();
  const stamp = stampUtc();
  for (let n = 1; ; n++) {
    const dirName = n === 1 ? stamp : `${stamp}-${n}`;
    const dir = path.join(base, dirName);
    const csvPath = path.join(dir, `${market}_${tf}.csv`);
    const jsonPath = path.join(dir, `${market}_${tf}.json`);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.writeFile(csvPath, csvText, { encoding: "utf8", flag: "wx" });
    } catch (e) {
      if (e?.code === "EEXIST") continue; // ชนกัน — ขยับไปโฟลเดอร์ถัดไป
      throw e;
    }
    await fs.writeFile(jsonPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
    return { dirName, csvPath, jsonPath };
  }
}

// อ่าน sidecar ทุกไฟล์ใต้ uploadDir (โครง <stamp>/<market>_<tf>.json)
async function listUploads() {
  const base = uploadDir();
  const out = [];
  let stampDirs;
  try {
    stampDirs = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return out; // ยังไม่เคยมีอัปโหลด / dir หาย (ephemeral disk)
  }
  for (const d of stampDirs) {
    if (!d.isDirectory()) continue;
    let files;
    try {
      files = await fs.readdir(path.join(base, d.name), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(base, d.name, f.name), "utf8");
        const meta = JSON.parse(raw);
        out.push({ dir: d.name, file: f.name.replace(/\.json$/, ".csv"), ...meta });
      } catch {
        out.push({ dir: d.name, file: f.name, error: "sidecar อ่านไม่ได้" });
      }
    }
  }
  out.sort((a, b) => String(a.receivedAt || a.dir).localeCompare(String(b.receivedAt || b.dir)));
  return out;
}

/* ── router ──────────────────────────────────────────────────────────────── */
export function createUploadRouter() {
  const router = express.Router();

  // body parsing ของตัวเอง — raw CSV เป็น text body ไม่ว่า content-type อะไร
  router.use(express.text({ limit: MAX_TEXT, type: () => true }));

  // GET /api/data-upload/status?token=… — รายการไฟล์ที่รับไว้ + ผล validate
  router.get("/status", requireUploadToken, async (_req, res) => {
    const files = await listUploads();
    res.json({
      ok: true,
      dir: uploadDir(),
      count: files.length,
      files,
      note: "ไฟล์บน disk อาจหายเมื่อ redeploy (ephemeral) — มีไว้ให้ pipeline นอกเว็บมาหยิบไป retrain เท่านั้น",
    });
  });

  // POST /api/data-upload/:market/:tf — รับ raw CSV (text body)
  router.post("/:market/:tf", requireUploadToken, async (req, res) => {
    const market = String(req.params.market).toLowerCase();
    const tf = String(req.params.tf).toLowerCase();
    if (!MARKETS.has(market)) {
      return res.status(400).json({ error: `market ไม่รองรับ: ${req.params.market} (รองรับ: ${[...MARKETS].join(", ")})` });
    }
    if (!TFS.has(tf)) {
      return res.status(400).json({ error: `timeframe ไม่รองรับ: ${req.params.tf} (รองรับ: ${[...TFS].join(", ")})` });
    }

    const text = typeof req.body === "string" ? req.body : "";
    const v = validateMt5Csv(text, tf);
    if (!v.ok) {
      return res.status(400).json({ error: v.error, market, tf });
    }
    const r = v.result;

    const receivedAt = new Date().toISOString();
    const meta = {
      market,
      tf,
      receivedAt,
      bytes: Buffer.byteLength(text, "utf8"),
      rows: r.rows,
      skippedRows: r.skippedRows,
      duplicateRows: r.duplicateRows,
      firstBar: r.firstBar,
      lastBar: r.lastBar,
      sorted: r.sorted,
      warnings: r.warnings,
      hasSpread: r.hasSpread,
      hasTickvol: r.hasTickvol,
    };

    try {
      const stored = await storeUpload(market, tf, text, meta);
      return res.json({
        ok: true,
        market,
        tf,
        rows: r.rows,
        firstBar: r.firstBar,
        lastBar: r.lastBar,
        warnings: r.warnings,
        hasSpread: r.hasSpread,
        hasTickvol: r.hasTickvol,
        storedAs: `${stored.dirName}/${market}_${tf}.csv`,
      });
    } catch (e) {
      return res.status(500).json({
        error: `เขียนไฟล์ไม่สำเร็จ: ${String(e?.message || e)}`,
        market,
        tf,
      });
    }
  });

  // body เกิน limit / parse error — ตอบ JSON ไม่ปล่อย HTML default
  // eslint-disable-next-line no-unused-vars
  router.use((err, _req, res, _next) => {
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ error: "ไฟล์ใหญ่เกิน 30MB" });
    }
    return res.status(400).json({ error: `อ่าน body ไม่ได้: ${String(err?.message || err)}` });
  });

  return router;
}

export default createUploadRouter;
