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
const capturedRequests = [];

const stubbedFetch = async (input, init) => {
  const u = typeof input === "string" ? input : input?.url ?? "";
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
await import("./index.js"); // app.listen(PORT) runs on import
await new Promise((r) => setTimeout(r, 500));

const VALID_BODY = { mode: "coach", symbol: "XAUUSD", tf: "M15", route: "/scalper-clock", tz: "UTC", context: { app: "GoldCast" } };
async function postProfessor() {
  const res = await realFetch(`${BASE}/api/professor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(VALID_BODY),
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
