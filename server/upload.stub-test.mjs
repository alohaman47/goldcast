/**
 * GoldCast Phase 18 Track U — data-upload router stub test (in-process, จริง).
 *
 * ยิง Express Router จริง (server/upload.js) ใน process เดียวกัน — ไม่ผ่าน
 * server/index.js (lead จะต่อ router เข้าเอง):
 *   T1  501 เมื่อไม่ได้ตั้ง UPLOAD_TOKEN
 *   T2  403 เมื่อ token ผิด (และ status ก็ 403)
 *   T3  400 เมื่อ header เพี้ยน (ไม่มี DATE/TIME แยกคอลัมน์)
 *   T4  200 + sidecar ถูกสร้าง (fixture รูปแบบ MT5 จริง: TAB + <> + CRLF)
 *   T5  200 พร้อม warnings (เวลาซ้ำ + ไม่เรียงเวลา + แถว parse ไม่ได้เล็กน้อย)
 *   T6  400 เมื่อ parse ได้ <95%
 *   T7  GET /status list ถูกต้อง (ผ่าน ?token=)
 *   T8  อัปโหลด 2 ตลาดในวินาทีเดียวกัน → path ไม่ชนกัน
 *   T9  market ไม่รองรับ → 400
 *   T10 D1 (8 คอลัมน์ ไม่มี <TIME>) → 200, duplicate ตรวจจาก DATE อย่างเดียว
 *   T11 intraday ขาดคอลัมน์ TIME → 400
 *   ── Phase 20 Track S: GET /file/:market/:tf (pull endpoint) ──
 *   T12 GET file โดย UPLOAD_TOKEN unset → 501
 *   T13 GET file ไม่ใส่ token / token ผิด → 403
 *   T14 GET file market มั่ว → 400, tf มั่ว → 400
 *   T15 GET file คู่ที่ยังไม่เคยอัปโหลด (token ถูก) → 404
 *   T16 POST แล้ว GET file → 200, body byte-identical + headers X-GoldCast-* ถูก
 *   T17 POST 2 รอบ (คนละเนื้อ) แล้ว GET → ได้เนื้อรอบล่าสุดเท่านั้น
 *
 * Usage: DATA_UPLOAD_DIR=/tmp/uploadtest node server/upload.stub-test.mjs
 *   (exit 0 = PASS, 1 = FAIL)
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import express from "express";

process.env.DATA_UPLOAD_DIR = process.env.DATA_UPLOAD_DIR || "/tmp/uploadtest";
const DIR = process.env.DATA_UPLOAD_DIR;

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  → ${extra}`}`);
  if (!cond) failures++;
}

/* ── fixtures: รูปแบบ MT5 export จริง (TAB, header มี <>, CRLF) ─────────── */
function mt5csv(rows, { header = true, crlf = true, extraCols = true } = {}) {
  const eol = crlf ? "\r\n" : "\n";
  const head = extraCols
    ? "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>"
    : "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>";
  const lines = rows.map(([d, t, o, h, l, c, tv = 100, sp = 5]) =>
    extraCols ? `${d}\t${t}\t${o}\t${h}\t${l}\t${c}\t${tv}\t0\t${sp}` : `${d}\t${t}\t${o}\t${h}\t${l}\t${c}`
  );
  return (header ? [head, ...lines] : lines).join(eol) + eol;
}

const GOLD_ROWS = [
  ["2022.01.03", "01:00:00", "1828.40", "1831.74", "1827.95", "1828.44"],
  ["2022.01.03", "02:00:00", "1828.42", "1831.01", "1827.02", "1830.27"],
  ["2022.01.03", "03:00:00", "1830.20", "1831.59", "1827.60", "1828.81"],
  ["2022.01.03", "04:00:00", "1828.80", "1828.89", "1825.66", "1826.15"],
];
const FX_ROWS = [
  ["2022.05.16", "06:00:00", "1.04025", "1.04027", "1.03927", "1.03965"],
  ["2022.05.16", "06:15:00", "1.03965", "1.03965", "1.03891", "1.03957"],
  ["2022.05.16", "06:30:00", "1.03957", "1.04011", "1.03920", "1.04002"],
];

/* ── boot router จริง in-process ─────────────────────────────────────────── */
const app = express();
const { createUploadRouter } = await import("./upload.js");
app.use("/api/data-upload", createUploadRouter());
const server = await new Promise((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const BASE = `http://127.0.0.1:${server.address().port}`;

async function post(market, tf, body, token) {
  const headers = { "content-type": "text/plain" };
  if (token !== undefined) headers["x-upload-token"] = token;
  const res = await fetch(`${BASE}/api/data-upload/${market}/${tf}`, { method: "POST", headers, body });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function getStatus(token) {
  const res = await fetch(`${BASE}/api/data-upload/status?token=${encodeURIComponent(token)}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function getFile(market, tf, token) {
  const qs = token !== undefined ? `?token=${encodeURIComponent(token)}` : "";
  const res = await fetch(`${BASE}/api/data-upload/file/${market}/${tf}${qs}`);
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("json") ? await res.json().catch(() => null) : await res.text();
  return {
    status: res.status,
    body,
    ct,
    receivedAt: res.headers.get("x-goldcast-received-at"),
    rows: res.headers.get("x-goldcast-rows"),
  };
}

await fs.rm(DIR, { recursive: true, force: true });

/* ── T1: ไม่ได้ตั้ง UPLOAD_TOKEN → 501 ───────────────────────────────────── */
delete process.env.UPLOAD_TOKEN;
const t1 = await post("xauusd", "h1", mt5csv(GOLD_ROWS), "whatever");
check("T1 ไม่มี UPLOAD_TOKEN → 501", t1.status === 501, `got ${t1.status} ${JSON.stringify(t1.body)}`);
check("T1 error บอกให้ตั้ง UPLOAD_TOKEN", /UPLOAD_TOKEN/.test(t1.body?.error ?? ""), JSON.stringify(t1.body));

/* ── T2: token ผิด → 403 ─────────────────────────────────────────────────── */
process.env.UPLOAD_TOKEN = "test-pin-1234";
const t2 = await post("xauusd", "h1", mt5csv(GOLD_ROWS), "wrong-pin-0000");
check("T2 token ผิด → 403", t2.status === 403, `got ${t2.status}`);
const t2b = await getStatus("wrong-pin-0000");
check("T2b status ก็ 403 เมื่อ token ผิด", t2b.status === 403, `got ${t2b.status}`);

/* ── T3: header เพี้ยน → 400 ─────────────────────────────────────────────── */
// TIME คอลัมน์เดียวรวมวันที่ (รูปแบบผิด — ต้อง DATE+TIME แยกตาม MT5)
const badHeader = "TIME\tOPEN\tHIGH\tLOW\tCLOSE\r\n2022.01.03 01:00:00\t1\t2\t0\t1.5\r\n";
const t3 = await post("xauusd", "h1", badHeader, "test-pin-1234");
check("T3 header เพี้ยน (ไม่มี DATE แยก) → 400", t3.status === 400, `got ${t3.status} ${JSON.stringify(t3.body)}`);
check("T3 error ระบุคอลัมน์ที่ขาด", /DATE/.test(t3.body?.error ?? ""), JSON.stringify(t3.body));

/* ── T4: ไฟล์ MT5 จริง → 200 + sidecar ───────────────────────────────────── */
const t4 = await post("xauusd", "h1", mt5csv(GOLD_ROWS), "test-pin-1234");
check("T4 MT5 csv ถูกต้อง → 200 ok", t4.status === 200 && t4.body?.ok === true, `got ${t4.status} ${JSON.stringify(t4.body)}`);
check("T4 rows = 4", t4.body?.rows === 4, JSON.stringify(t4.body));
check("T4 firstBar/lastBar ถูก", t4.body?.firstBar === "2022.01.03 01:00:00" && t4.body?.lastBar === "2022.01.03 04:00:00", JSON.stringify(t4.body));
check("T4 hasSpread/hasTickvol = true", t4.body?.hasSpread === true && t4.body?.hasTickvol === true, JSON.stringify(t4.body));
check("T4 ไม่มี warnings", Array.isArray(t4.body?.warnings) && t4.body.warnings.length === 0, JSON.stringify(t4.body));

// sidecar ถูกสร้าง + เนื้อหาตรง
const storedAs = t4.body?.storedAs ?? "";
const sidecarPath = path.join(DIR, storedAs.replace(/\.csv$/, ".json"));
const sidecar = JSON.parse(await fs.readFile(sidecarPath, "utf8").catch(() => "null"));
check("T4 sidecar JSON ถูกสร้าง", sidecar !== null, sidecarPath);
check(
  "T4 sidecar meta ครบ (market/tf/rows/เวลารับ/ขนาด)",
  sidecar?.market === "xauusd" && sidecar?.tf === "h1" && sidecar?.rows === 4 &&
    typeof sidecar?.receivedAt === "string" && typeof sidecar?.bytes === "number",
  JSON.stringify(sidecar)
);
const csvOnDisk = await fs.readFile(path.join(DIR, storedAs), "utf8").catch(() => "");
check("T4 CSV ต้นฉบับถูกเก็บ", csvOnDisk.includes("1828.40") && csvOnDisk.includes("<DATE>"), `${csvOnDisk.length} bytes`);
console.log("   ตัวอย่าง response validate จริง:", JSON.stringify(t4.body));

/* ── T5: warnings — ซ้ำ + ไม่เรียง + แถวพังเล็กน้อย (ยัง ≥95%) ───────────── */
const warnRows = [
  ...FX_ROWS,
  ["2022.05.16", "06:15:00", "1.03965", "1.03965", "1.03891", "1.03957"], // duplicate DATE+TIME
  ["2022.05.16", "05:45:00", "1.04030", "1.04040", "1.03990", "1.04025"], // ย้อนเวลา → unsorted
];
let warnCsv = mt5csv(warnRows, { extraCols: false }); // ไม่มี TICKVOL/SPREAD
warnCsv += "garbage\tline\twithout\tenough\tfields\r\n"; // 1 แถวพังจาก 6 → parse 83.3%? ไม่ 5/6 = 83% — ต้องเพิ่มแถวดี
// ทำให้ parse rate ≥95%: แถวดี 19 + พัง 1
const manyRows = [];
for (let i = 0; i < 19; i++) {
  const hh = String(6 + Math.floor(i / 4)).padStart(2, "0");
  const mm = String((i % 4) * 15).padStart(2, "0");
  manyRows.push(["2022.05.16", `${hh}:${mm}:00`, "1.04025", "1.04027", "1.03927", "1.03965"]);
}
manyRows[10] = [...manyRows[9]]; // duplicate
manyRows[18] = ["2022.05.16", "05:00:00", "1.04030", "1.04040", "1.03990", "1.04025"]; // unsorted
warnCsv = mt5csv(manyRows, { extraCols: false }) + "garbage\tline\r\n"; // 19 ดี / 20 รวม = 95%
const t5 = await post("eurusd", "m15", warnCsv, "test-pin-1234");
check("T5 ผ่านแต่มี warnings → 200", t5.status === 200 && t5.body?.ok === true, `got ${t5.status} ${JSON.stringify(t5.body)}`);
check("T5 warnings มีทั้งซ้ำ/ไม่เรียง/ข้ามแถว",
  (t5.body?.warnings ?? []).some((w) => /ซ้ำ/.test(w)) &&
    (t5.body?.warnings ?? []).some((w) => /เรียง/.test(w)) &&
    (t5.body?.warnings ?? []).some((w) => /ข้าม/.test(w)),
  JSON.stringify(t5.body?.warnings));
check("T5 ไม่มี TICKVOL/SPREAD → hasTickvol/hasSpread = false", t5.body?.hasTickvol === false && t5.body?.hasSpread === false, JSON.stringify(t5.body));
console.log("   ตัวอย่าง response มี warnings:", JSON.stringify(t5.body));

/* ── T6: parse <95% → 400 ────────────────────────────────────────────────── */
const mostlyBad = mt5csv(GOLD_ROWS) + Array.from({ length: 80 }, (_, i) => `broken\trow\t${i}`).join("\r\n") + "\r\n";
const t6 = await post("us30", "d1", mostlyBad, "test-pin-1234");
check("T6 parse <95% → 400", t6.status === 400, `got ${t6.status} ${JSON.stringify(t6.body)}`);
check("T6 error บอก parse rate", /95%/.test(t6.body?.error ?? ""), JSON.stringify(t6.body));

/* ── T7: status list ─────────────────────────────────────────────────────── */
const t7 = await getStatus("test-pin-1234");
check("T7 status → 200 + list", t7.status === 200 && Array.isArray(t7.body?.files), `got ${t7.status}`);
check("T7 list มี 2 ไฟล์ที่เพิ่งอัปโหลด (xauusd h1 + eurusd m15)", (t7.body?.files ?? []).length === 2, `got ${t7.body?.count}`);
const f0 = (t7.body?.files ?? []).find((f) => f.market === "xauusd");
check("T7 sidecar ใน list มีผล validate (rows/firstBar/lastBar)",
  f0?.rows === 4 && f0?.firstBar === "2022.01.03 01:00:00" && f0?.lastBar === "2022.01.03 04:00:00",
  JSON.stringify(f0));

/* ── T8: 2 ตลาดอัปโหลดพร้อมกัน (วินาทีเดียว) → path ไม่ชน ─────────────────── */
const [t8a, t8b] = await Promise.all([
  post("nas100", "h1", mt5csv(GOLD_ROWS), "test-pin-1234"),
  post("usdjpy", "h4", mt5csv(FX_ROWS), "test-pin-1234"),
]);
check("T8 อัปโหลด 2 ตลาดพร้อมกัน → 200 ทั้งคู่", t8a.status === 200 && t8b.status === 200, `${t8a.status}/${t8b.status}`);
check("T8 storedAs ไม่ชนกัน", t8a.body?.storedAs !== t8b.body?.storedAs, `${t8a.body?.storedAs} vs ${t8b.body?.storedAs}`);
// ซ้ำตลาดเดิม timeframe เดิมในวินาทีเดียวกัน → ต้องไม่ทับกัน
const [t8c, t8d] = await Promise.all([
  post("ger40", "m5", mt5csv(GOLD_ROWS), "test-pin-1234"),
  post("ger40", "m5", mt5csv(FX_ROWS), "test-pin-1234"),
]);
check("T8b ตลาด+tf เดียวกันพร้อมกัน → path ไม่ทับกัน",
  t8c.status === 200 && t8d.status === 200 && t8c.body?.storedAs !== t8d.body?.storedAs,
  `${t8c.status}/${t8d.status} → ${t8c.body?.storedAs} vs ${t8d.body?.storedAs}`);

/* ── T9: market/tf ไม่รองรับ → 400 ────────────────────────────────────────── */
const t9 = await post("btcusd", "h1", mt5csv(GOLD_ROWS), "test-pin-1234");
check("T9 market ไม่รองรับ → 400", t9.status === 400, `got ${t9.status}`);

/* ── T10: D1 schema จริง — 8 คอลัมน์ ไม่มี <TIME> ─────────────────────────── */
// ยืนยัน byte-level กับไฟล์จริง: <DATE>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>
function mt5D1csv(rows) {
  const head = "<DATE>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>";
  const lines = rows.map(([d, o, h, l, c, tv = 90188, sp = 5]) => `${d}\t${o}\t${h}\t${l}\t${c}\t${tv}\t0\t${sp}`);
  return [head, ...lines].join("\r\n") + "\r\n";
}
const D1_ROWS = [
  ["2022.01.03", "1828.40", "1831.74", "1798.32", "1801.17"],
  ["2022.01.04", "1801.20", "1815.10", "1799.50", "1814.40"],
  ["2022.01.05", "1814.40", "1825.00", "1810.10", "1824.90"],
];
const t10 = await post("xauusd", "d1", mt5D1csv(D1_ROWS), "test-pin-1234");
check("T10 D1 (ไม่มี TIME) → 200 ok", t10.status === 200 && t10.body?.ok === true, `got ${t10.status} ${JSON.stringify(t10.body)}`);
check("T10 D1 rows/firstBar/lastBar ถูก (firstBar เป็นวันที่ล้วน)",
  t10.body?.rows === 3 && t10.body?.firstBar === "2022.01.03" && t10.body?.lastBar === "2022.01.05",
  JSON.stringify(t10.body));
// D1 duplicate ตรวจจาก DATE อย่างเดียว
const t10dup = await post("gbpusd", "d1", mt5D1csv([...D1_ROWS, D1_ROWS[1]]), "test-pin-1234");
check("T10b D1 วันที่ซ้ำ → 200 + warning ซ้ำจาก DATE",
  t10dup.status === 200 && (t10dup.body?.warnings ?? []).some((w) => /ซ้ำ \(DATE\)/.test(w)),
  `got ${t10dup.status} ${JSON.stringify(t10dup.body?.warnings)}`);
console.log("   ตัวอย่าง response D1 จริง:", JSON.stringify(t10.body));

/* ── T11: intraday ขาดคอลัมน์ TIME → 400 ─────────────────────────────────── */
const t11 = await post("xauusd", "h1", mt5D1csv(D1_ROWS), "test-pin-1234");
check("T11 ไฟล์ D1 (8 คอลัมน์) ส่งเป็น h1 → 400 บอกขาด TIME",
  t11.status === 400 && /TIME/.test(t11.body?.error ?? ""),
  `got ${t11.status} ${JSON.stringify(t11.body)}`);

/* ══ Phase 20 Track S — GET /file/:market/:tf (pull endpoint) ══════════════ */

/* ── T12: GET file โดย UPLOAD_TOKEN unset → 501 ───────────────────────────── */
delete process.env.UPLOAD_TOKEN;
const t12 = await getFile("xauusd", "h1", "whatever");
check("T12 GET file โดยไม่มี UPLOAD_TOKEN → 501", t12.status === 501, `got ${t12.status} ${JSON.stringify(t12.body)}`);
process.env.UPLOAD_TOKEN = "test-pin-1234";

/* ── T13: GET file ไม่ใส่ token / token ผิด → 403 ─────────────────────────── */
const t13a = await getFile("xauusd", "h1", undefined);
check("T13 GET file ไม่ใส่ token → 403", t13a.status === 403, `got ${t13a.status}`);
const t13b = await getFile("xauusd", "h1", "wrong-pin-0000");
check("T13b GET file token ผิด → 403", t13b.status === 403, `got ${t13b.status}`);

/* ── T14: GET file market/tf มั่ว → 400 ───────────────────────────────────── */
const t14a = await getFile("btcusd", "h1", "test-pin-1234");
check("T14 GET file market ไม่รองรับ → 400", t14a.status === 400 && /market ไม่รองรับ/.test(t14a.body?.error ?? ""), `got ${t14a.status} ${JSON.stringify(t14a.body)}`);
const t14b = await getFile("xauusd", "w1", "test-pin-1234");
check("T14b GET file tf ไม่รองรับ → 400", t14b.status === 400 && /timeframe ไม่รองรับ/.test(t14b.body?.error ?? ""), `got ${t14b.status} ${JSON.stringify(t14b.body)}`);

/* ── T15: GET file คู่ที่ยังไม่เคยอัปโหลด (token ถูก) → 404 ───────────────── */
// us30/h1 ไม่เคยถูก POST สำเร็จในเทสต์ชุดนี้ (T6 ส่ง us30/d1 แต่โดน 400)
const t15 = await getFile("us30", "h1", "test-pin-1234");
check("T15 GET file คู่ที่ยังไม่เคยอัปโหลด → 404", t15.status === 404, `got ${t15.status} ${JSON.stringify(t15.body)}`);
check("T15 404 body มี error/market/tf",
  /ยังไม่มีไฟล์ของ us30\/h1/.test(t15.body?.error ?? "") && t15.body?.market === "us30" && t15.body?.tf === "h1",
  JSON.stringify(t15.body));

/* ── T16: POST แล้ว GET file → 200 + byte-identical + headers ─────────────── */
const pullCsv1 = mt5csv(GOLD_ROWS);
const t16post = await post("nas100", "m15", pullCsv1, "test-pin-1234");
check("T16 POST nas100/m15 → 200", t16post.status === 200 && t16post.body?.ok === true, `got ${t16post.status} ${JSON.stringify(t16post.body)}`);
const t16 = await getFile("nas100", "m15", "test-pin-1234");
check("T16 GET file → 200", t16.status === 200, `got ${t16.status} ${JSON.stringify(t16.body)}`);
check("T16 Content-Type เป็น text/plain; charset=utf-8",
  /text\/plain/.test(t16.ct) && /utf-8/i.test(t16.ct), t16.ct);
check("T16 body byte-identical กับที่ POST", t16.body === pullCsv1,
  `len ${String(t16.body).length} vs ${pullCsv1.length}`);
check("T16 X-GoldCast-Received-At เป็น ISO string",
  typeof t16.receivedAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(t16.receivedAt), String(t16.receivedAt));
check("T16 X-GoldCast-Rows = 4 ตรงกับ sidecar", t16.rows === "4", String(t16.rows));

/* ── T17: POST 2 รอบ (คนละเนื้อ) แล้ว GET → ได้รอบล่าสุดเท่านั้น ──────────── */
const pullCsv2 = mt5csv(FX_ROWS); // 3 แถว เนื้อต่างจาก pullCsv1 (4 แถว)
const t17post = await post("nas100", "m15", pullCsv2, "test-pin-1234");
check("T17 POST รอบสอง nas100/m15 → 200", t17post.status === 200 && t17post.body?.ok === true, `got ${t17post.status} ${JSON.stringify(t17post.body)}`);
const t17 = await getFile("nas100", "m15", "test-pin-1234");
check("T17 GET file → 200 + ได้เนื้อรอบล่าสุดเป๊ะ (byte-identical กับ pullCsv2)",
  t17.status === 200 && t17.body === pullCsv2,
  `status ${t17.status}, len ${String(t17.body).length} vs ${pullCsv2.length}`);
check("T17 เนื้อรอบแรกไม่หลงเหลือ (ไม่มีแถว 1828.40 ของ GOLD_ROWS)",
  !String(t17.body).includes("1828.40"), String(t17.body).slice(0, 80));
check("T17 X-GoldCast-Rows = 3 ของรอบล่าสุด", t17.rows === "3", String(t17.rows));

server.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
