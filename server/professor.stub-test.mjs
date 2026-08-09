/**
 * GoldCast v11-fix2 — Professor empty-reply regression test (stubbed upstream).
 *
 * Proves the production bug and the fix end-to-end without a real Kimi key:
 *   - Intercepts global fetch so calls to the Kimi endpoint return scripted
 *     upstream responses (normal / empty content + reasoning_content / 401).
 *   - Boots the REAL server (server/index.js) in-process on a test port.
 *   - POSTs /api/professor per scenario and asserts the server contract:
 *       1. normal content         → 200 {text}
 *       2. "" content + reasoning → 502 {error:"AI empty reply", detail, model}
 *       3. upstream 401           → 502 {error:"AI key rejected", detail}
 *   - Feeds each REAL server response through the REAL frontend predicate
 *     (src/lib/professor.ts → askProfessor, bundled with esbuild) and asserts
 *     the user-facing ProfessorResult is correct & honest in every case.
 *   - Also asserts the outgoing Kimi request disables thinking and raises
 *     max_completion_tokens (kimi-k2.6 defaults thinking to ENABLED — that
 *     was the production root cause of empty content).
 *
 * Usage: node server/professor.stub-test.mjs   (exit 0 = PASS, 1 = FAIL)
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import * as esbuild from "esbuild";

const ROOT = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const KIMI_HOST = "api.moonshot.ai";
const FF_HOST = "nfs.faireconomy.media";
const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  → ${extra}`}`);
  if (!cond) failures++;
}

/* ── 1. Stub the Kimi upstream via fetch interception ────────────────────── */
const realFetch = globalThis.fetch;
let scenario = "normal";
let ffScenario = "down"; // ForexFactory stub: "down" (throws) | "up" (news XML)
const capturedRequests = [];

/* ── ForexFactory stub: dynamic weekly XML around Date.now() ─────────────── */
// The server's news window is now−30m … now+48h, so fixture times must be
// generated relative to NOW (the calendar feed itself is weekly-relative).
const pad2 = (n) => String(n).padStart(2, "0");
function ffStamp(msFromNow) {
  const d = new Date(Date.now() + msFromNow);
  const date = `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}-${d.getUTCFullYear()}`;
  let h = d.getUTCHours();
  const ampm = h < 12 ? "am" : "pm";
  h = h % 12 || 12;
  return { date, time: `${h}:${pad2(d.getUTCMinutes())}${ampm}` };
}
const H = 3_600_000;
function ffEvent(title, currency, impact, msFromNow) {
  const { date, time } = ffStamp(msFromNow);
  return (
    `<event><title>${title}</title><country>${currency}</country>` +
    `<date>${date}</date><time>${time}</time><impact>${impact}</impact>` +
    `<forecast>0.2%</forecast><previous>0.1%</previous></event>`
  );
}
function buildNewsXml() {
  const fillers = Array.from({ length: 10 }, (_, i) =>
    ffEvent(`Filler Event ${i}`, "USD", "High", (5 + i * 0.5) * H)
  );
  return (
    `<?xml version="1.0" encoding="windows-1252"?>\n<weeklyevents>\n` +
    [
      ffEvent("Medium Impact Event", "USD", "Medium", 1.5 * H), // in window
      ffEvent("FOMC Test Event", "USD", "High", 2 * H),         // in window
      ffEvent("ECB Test Event", "EUR", "High", 3 * H),          // EUR only
      ffEvent("BoJ Test Event", "JPY", "High", 4 * H),          // JPY only
      ffEvent("Low Impact Event", "USD", "Low", 1 * H),         // impact filtered
      ffEvent("Old Event", "USD", "High", -2 * H),              // past window
      ffEvent("Far Future Event", "USD", "High", 72 * H),       // future window
      ...fillers, // 10 more USD High in-window → 12 qualifying (cap = 8)
    ].join("\n") +
    `\n</weeklyevents>`
  );
}

const stubbedFetch = async (input, init) => {
  const u = typeof input === "string" ? input : input?.url ?? "";
  if (u.includes(FF_HOST)) {
    if (ffScenario === "down") throw new Error("stub: FF network unreachable");
    return new Response(buildNewsXml(), {
      status: 200,
      headers: { "content-type": "text/xml" },
    });
  }
  if (u.includes(KIMI_HOST)) {
    const body = JSON.parse(init.body);
    capturedRequests.push(body);
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (scenario === "normal") {
      return json({
        model: "kimi-k2.6",
        choices: [{ message: { role: "assistant", content: "สรุป: ตลาดผันผวนปานกลาง วินัยคือต้นทุน" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      });
    }
    if (scenario === "empty-with-reasoning") {
      // The exact production shape: HTTP 200, budget consumed by reasoning.
      return json({
        model: "kimi-k2.6",
        choices: [{
          message: { role: "assistant", content: "", reasoning_content: "ให้ฉันวิเคราะห์ context ทีละส่วน ก่อนอื่นดู p_high_vol..." },
          finish_reason: "length",
        }],
        usage: { prompt_tokens: 100, completion_tokens: 800, total_tokens: 900 },
      });
    }
    if (scenario === "upstream-401") {
      return json({ error: { message: "Invalid Authentication" } }, 401);
    }
    throw new Error(`unknown scenario ${scenario}`);
  }
  return realFetch(input, init);
};
globalThis.fetch = stubbedFetch;

/* ── 2. Boot the real server in-process ──────────────────────────────────── */
process.env.MOONSHOT_API_KEY = "stub-test-key";
process.env.PORT = String(PORT);
// Test-only: point the calendar static fallback at a missing file so the
// "calendar totally down" scenario (feed throws + fallback unreadable) makes
// getEvents() THROW — proving Professor survives without the news block.
process.env.ECON_FALLBACK_PATH = path.join(os.tmpdir(), `no-such-fallback-${process.pid}.json`);
await import("./index.js"); // app.listen(PORT) runs on import
await new Promise((r) => setTimeout(r, 500));

const VALID_BODY = { mode: "coach", symbol: "XAUUSD", tf: "M15", route: "/scalper-clock", tz: "UTC", context: { app: "GoldCast" } };
async function postProfessor(body = VALID_BODY) {
  const res = await realFetch(`${BASE}/api/professor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/* ── 3. Server contract per scenario ─────────────────────────────────────── */
scenario = "normal";
const r1 = await postProfessor();
check("S1 normal content → 200", r1.status === 200, `got ${r1.status} ${JSON.stringify(r1.body)}`);
check("S1 normal content → non-empty text", typeof r1.body?.text === "string" && r1.body.text.trim() !== "", JSON.stringify(r1.body));

scenario = "empty-with-reasoning";
const r2 = await postProfessor();
check("S2 empty content + reasoning → 502 (NOT silent 200 text:'')", r2.status === 502, `got ${r2.status} ${JSON.stringify(r2.body)}`);
check("S2 → error 'AI empty reply'", r2.body?.error === "AI empty reply", JSON.stringify(r2.body));
check("S2 → honest detail mentions reasoning + model", /reasoning/.test(r2.body?.detail ?? "") && /kimi-k2\.6/.test(r2.body?.detail ?? ""), r2.body?.detail);

scenario = "upstream-401";
const r3 = await postProfessor();
check("S3 upstream 401 → 502", r3.status === 502, `got ${r3.status}`);
check("S3 → error 'AI key rejected' + upstream detail", r3.body?.error === "AI key rejected" && /Invalid Authentication/.test(r3.body?.detail ?? ""), JSON.stringify(r3.body));

/* ── 4. Outgoing request: thinking disabled + token headroom ─────────────── */
const last = capturedRequests.at(-1) ?? {};
check("R1 request sets thinking:{type:'disabled'} (k2.6 defaults to enabled)", last.thinking?.type === "disabled", JSON.stringify(last.thinking));
check("R2 request max_completion_tokens = 1200", last.max_completion_tokens === 1200, String(last.max_completion_tokens));

/* ── 4b. Professor news injection (economic calendar → Kimi context) ─────── */
const NEWS_HEADER = "ข่าววันนี้-พรุ่งนี้ (เวลา UTC):";
const NEWS_RULE = "เวลาข่าวคือกำหนดการล่วงหน้า ห้ามคาดการณ์ผลของข่าวหรือทิศทางราคาจากข่าว";
const msgOf = (req, role) => req?.messages?.find((m) => m.role === role)?.content ?? "";
const newsBlockOf = (req) => {
  const c = msgOf(req, "user");
  const i = c.indexOf(NEWS_HEADER);
  return i === -1 ? "" : c.slice(i);
};

// N1 (c): calendar TOTALLY down (FF throws + fallback path missing) →
// getEvents() throws → no injection, Professor still answers 200 normally.
scenario = "normal";
ffScenario = "down";
const n1 = await postProfessor();
const n1req = capturedRequests.at(-1);
check("N1 calendar down → Professor still 200 + text", n1.status === 200 && typeof n1.body?.text === "string", `got ${n1.status} ${JSON.stringify(n1.body)}`);
check("N1 calendar down → NO news block + NO news rule line injected",
  newsBlockOf(n1req) === "" && !msgOf(n1req, "system").includes(NEWS_RULE),
  msgOf(n1req, "user").slice(-300));

// N2 (a): XAUUSD → USD only. USD High/Medium events inside now−30m…now+48h
// are injected; EUR/JPY events (b), Low impact, and out-of-window events are not.
ffScenario = "up";
const n2 = await postProfessor(); // VALID_BODY symbol XAUUSD
const n2req = capturedRequests.at(-1);
const n2user = msgOf(n2req, "user");
const n2block = newsBlockOf(n2req);
check("N2 inject → 200 + news block appended to user context", n2.status === 200 && n2block !== "", `got ${n2.status}`);
check("N2 → in-window USD High+Medium events present (FOMC 2h, Medium 1.5h)",
  n2user.includes("FOMC Test Event") && n2user.includes("Medium Impact Event"),
  n2block);
check("N2 → EUR/JPY events NOT injected for XAUUSD (currency mismatch)",
  !n2user.includes("ECB Test Event") && !n2user.includes("BoJ Test Event"),
  n2block);
check("N2 → Low impact / older-than-30m / beyond-48h events NOT injected",
  !n2user.includes("Low Impact Event") && !n2user.includes("Old Event") && !n2user.includes("Far Future Event"),
  n2block);
check("N2 → system prompt gains the news iron-rule line",
  msgOf(n2req, "system").includes(NEWS_RULE), msgOf(n2req, "system"));

// N3 (b, reverse): EURUSD → EUR+USD, so the ECB event must now be injected.
const n3 = await postProfessor({ ...VALID_BODY, symbol: "EURUSD" });
check("N3 EURUSD → ECB event injected (symbol currency match)",
  n3.status === 200 && msgOf(capturedRequests.at(-1), "user").includes("ECB Test Event"),
  JSON.stringify(n3.body));

// N4: unknown symbol → no mapping → no news injected at all.
const n4 = await postProfessor({ ...VALID_BODY, symbol: "BTCUSD" });
check("N4 unknown symbol → no news block, still 200",
  n4.status === 200 && newsBlockOf(capturedRequests.at(-1)) === "",
  `got ${n4.status}`);

// N5 (d): feed has 12 qualifying USD events → block capped at 8 lines and
// within the ~800-char budget (events sorted by time, furthest dropped first).
const n5lines = n2block.split("\n").filter((l) => /^\d{2}-\d{2} \d{2}:\d{2} \[(High|Medium)\] /.test(l));
check("N5 → at most 8 news lines despite 12 qualifying events", n5lines.length > 0 && n5lines.length <= 8, `lines=${n5lines.length}`);
check("N5 → news block within ~800-char budget", n2block.length <= 800, `chars=${n2block.length}`);
check("N5 → events sorted by time ascending",
  (() => {
    const mins = n5lines.map((l) => {
      const m = l.match(/^(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
      return m ? Number(m[1]) * 1e6 + Number(m[2]) * 1e4 + Number(m[3]) * 60 + Number(m[4]) : NaN;
    });
    return mins.every((v, i) => i === 0 || v >= mins[i - 1]);
  })(),
  n5lines.join(" | "));

/* ── 5. Frontend predicate (real src/lib/professor.ts) on real responses ─── */
const outfile = path.join(os.tmpdir(), `professor-bundle-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [path.join(ROOT, "src", "lib", "professor.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  alias: { "@": path.join(ROOT, "src") },
  outfile,
  logLevel: "silent",
});
const { askProfessor } = await import(url.pathToFileURL(outfile).href);

// askProfessor posts to '/api/professor' — route that to the real server
// responses captured above (same status + body the server actually produced).
const serverResponses = [r1, r2, r3];
let respIdx = 0;
globalThis.fetch = async () => {
  const r = serverResponses[respIdx++];
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
};

const f1 = await askProfessor(VALID_BODY);
check("F1 normal → ok:true with the answer text", f1.ok === true && f1.text.includes("สรุป"), JSON.stringify(f1));

const f2 = await askProfessor(VALID_BODY);
check("F2 empty-reply 502 → ok:false, shows real cause (AI empty reply + detail)",
  f2.ok === false && /AI empty reply/.test(f2.message) && /reasoning/.test(f2.message) && /502/.test(f2.message),
  JSON.stringify(f2));

const f3 = await askProfessor(VALID_BODY);
check("F3 upstream 401 → ok:false, shows key cause + upstream detail",
  f3.ok === false && /AI key rejected/.test(f3.message) && /Invalid Authentication/.test(f3.message),
  JSON.stringify(f3));

// F4: defensive — a 200 with text:"" (old server shape) must NOT show
// "อ่านไม่ได้" blindly; it must be honest + actionable.
globalThis.fetch = async () =>
  new Response(JSON.stringify({ text: "" }), { status: 200, headers: { "content-type": "application/json" } });
const f4 = await askProfessor(VALID_BODY);
check("F4 200 text:'' → ok:false, honest + retry hint",
  f4.ok === false && /ว่างเปล่า/.test(f4.message) && /ลองใหม่/.test(f4.message),
  JSON.stringify(f4));

await fs.rm(outfile, { force: true });

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
