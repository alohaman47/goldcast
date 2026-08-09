// GoldCast AI proxy server — static SPA + tiny /api backend
// - Serves dist/ with SPA fallback (equivalent to `serve -s dist`)
// - POST /api/professor proxies to Kimi (Moonshot AI, OpenAI-compatible)
//   System prompt is built server-side ONLY (never accepted from client).
// - Railway-ready: listens on process.env.PORT || 3000

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCalendarStore, buildNewsBlock, NEWS_RULE_LINE } from "./calendar.js";
import { createUploadRouter } from "./upload.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "dist");

const PORT = Number(process.env.PORT) || 3000;
const MOONSHOT_API_KEY = process.env.MOONSHOT_API_KEY || "";
const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k2.6";
const KIMI_URL = "https://api.moonshot.ai/v1/chat/completions";
const FETCH_TIMEOUT_MS = 60_000;
const MAX_COMPLETION_TOKENS = 1200; // headroom so replies aren't cut off
const MAX_CONTEXT_CHARS = 12_000;
const MAX_HISTORY = 10;
const RATE_LIMIT = 30; // requests per minute per IP
const RATE_WINDOW_MS = 60_000;

// ─── In-memory rate limiter (30 req/min/IP) ─────────────────────────────────
const hits = new Map(); // ip -> number[] (timestamps)
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}
// occasional cleanup so the map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of hits) {
    const kept = arr.filter((t) => now - t < RATE_WINDOW_MS);
    if (kept.length === 0) hits.delete(ip);
    else hits.set(ip, kept);
  }
}, RATE_WINDOW_MS).unref();

// ─── Prompt construction (server-side only) ─────────────────────────────────
const BASE_SYSTEM_PROMPT = [
  "คุณคือ Professor ประจำสถานี GoldCast เทอร์มินัลวิเคราะห์ความผันผวน 7 ตลาด",
  "(XAUUSD, NAS100/US100, US30, GER40, EURUSD, GBPUSD, USDJPY)",
  "กฎเหล็ก: ห้ามทำนายทิศทางราคาเด็ดขาด",
  "(engine พิสูจน์แล้วว่าทิศทำนายไม่ได้ NO-SHIP ทุกตลาด),",
  "อธิบายเฉพาะข้อมูลที่ส่งมาใน context เท่านั้น ห้ามแต่งตัวเลข,",
  "ตอบภาษาไทยง่ายๆ กระชับ, จบด้วยความเห็นเชิงวินัยเสมอ",
].join(" ");

const MODE_INSTRUCTIONS = {
  explain: "โหมดอธิบาย: อธิบายหน้าจอนี้ทีละส่วน ว่าแต่ละส่วนหมายถึงอะไร",
  brief: "โหมดสรุป: สรุปภาพรวมทุกตลาดที่ส่งมาใน context ให้เห็นภาพเดียว",
  chat: "โหมดคุย: ตอบคำถามของผู้ใช้จากข้อมูลที่มีใน context เท่านั้น",
  coach: "โหมดโค้ช: วิเคราะห์ต้นทุนและจังหวะจาก scalper clock ที่ส่งมาใน context",
};

const VALID_MODES = new Set(Object.keys(MODE_INSTRUCTIONS));

function buildMessages(body, newsBlock = "") {
  const { mode, symbol, tf, route, tz, messages, context } = body;

  // While news is in context, extend the iron rule: no predicting the
  // outcome of scheduled events or the price direction from them.
  const system =
    `${BASE_SYSTEM_PROMPT}\n${MODE_INSTRUCTIONS[mode]}` +
    (newsBlock ? `\n${NEWS_RULE_LINE}` : "");

  const meta = { symbol, tf, route, tz };
  let contextJson;
  try {
    contextJson = JSON.stringify(context ?? {});
  } catch {
    contextJson = "{}";
  }
  // News shares the 12k context budget: shrink the context cap by the news
  // block's size so context + news never exceed MAX_CONTEXT_CHARS together.
  const contextCap = Math.max(0, MAX_CONTEXT_CHARS - (newsBlock ? newsBlock.length + 1 : 0));
  if (contextJson.length > contextCap) {
    contextJson = contextJson.slice(0, contextCap);
  }
  const firstUser =
    `ข้อมูลหน้าจอปัจจุบัน (meta): ${JSON.stringify(meta)}\n` +
    `context: ${contextJson}` +
    (newsBlock ? `\n${newsBlock}` : "");

  const history = Array.isArray(messages)
    ? messages
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string"
        )
        .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
        .slice(-MAX_HISTORY)
    : [];

  return [{ role: "system", content: system }, { role: "user", content: firstUser }, ...history];
}

// ─── App ────────────────────────────────────────────────────────────────────
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true); // Railway sits behind a proxy — req.ip must be real client IP
app.use(express.json({ limit: "512kb" }));

app.post("/api/professor", async (req, res) => {
  // AI not configured — frontend shows "ยังไม่ได้ตั้งค่า key"
  if (!MOONSHOT_API_KEY) {
    return res.status(501).json({ error: "AI not configured" });
  }

  const ip = req.ip || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "rate limited", detail: "สูงสุด 30 ครั้งต่อนาทีต่อ IP" });
  }

  const body = req.body ?? {};
  if (!VALID_MODES.has(body.mode)) {
    return res.status(400).json({ error: "invalid mode", detail: "mode ต้องเป็น explain|brief|chat|coach" });
  }
  if (
    body.context == null ||
    typeof body.context !== "object" ||
    Array.isArray(body.context)
  ) {
    return res.status(400).json({ error: "invalid body", detail: "ต้องส่ง context เป็น object (ห้ามเป็น array/null)" });
  }

  // News injection (best-effort): attach today's/tomorrow's High/Medium
  // impact events for the symbol's currencies. A calendar failure must NEVER
  // break Professor — skip the news block and answer normally.
  let newsBlock = "";
  try {
    const { events } = await calendarStore.getEvents();
    newsBlock = buildNewsBlock(events, body.symbol);
  } catch {
    newsBlock = "";
  }

  let kimiMessages;
  try {
    kimiMessages = buildMessages(body, newsBlock);
  } catch (e) {
    return res.status(400).json({ error: "invalid body", detail: String(e?.message || e) });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let upstream;
  try {
    upstream = await fetch(KIMI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MOONSHOT_API_KEY}`,
      },
      body: JSON.stringify({
        model: KIMI_MODEL,
        messages: kimiMessages,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        // Professor is an explainer, not a deep-reasoning task. kimi-k2.6
        // defaults to thinking ENABLED (docs: thinking defaults to
        // {"type":"enabled"}); reasoning tokens then consume the completion
        // budget and message.content can come back EMPTY → users saw
        // "Professor ตอบกลับมาในรูปแบบที่อ่านไม่ได้". Disable it per the
        // official k2.6 guide ("thinking": {"type": "disabled"}).
        thinking: { type: "disabled" },
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e?.name === "AbortError") {
      return res.status(504).json({ error: "AI timeout", detail: "Kimi ไม่ตอบภายใน 60 วินาที" });
    }
    return res.status(502).json({ error: "AI unreachable", detail: String(e?.message || e) });
  }
  clearTimeout(timer);

  const text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!upstream.ok) {
    // Map Kimi errors honestly: 401/403 = key, 429 = quota/rate, 5xx = upstream
    const detail =
      (data && (data.error?.message || data.message)) || text.slice(0, 500) || `HTTP ${upstream.status}`;
    let error;
    if (upstream.status === 401 || upstream.status === 403) error = "AI key rejected";
    else if (upstream.status === 429) error = "AI rate/quota limited";
    else if (upstream.status >= 500) error = "AI upstream error";
    else error = "AI request failed";
    return res.status(502).json({ error, detail, status: upstream.status });
  }

  const message = data?.choices?.[0]?.message;
  const content = message?.content;
  const reasoning = message?.reasoning_content;
  const finishReason = data?.choices?.[0]?.finish_reason;

  if (typeof content !== "string") {
    return res.status(502).json({ error: "AI bad response", detail: text.slice(0, 500) });
  }

  if (content.trim() === "") {
    // Never forward an empty text silently — the frontend can only show
    // "อ่านไม่ได้" for that. Answer honestly with a diagnosable 502 instead.
    // (reasoning_content is internal chain-of-thought, often truncated
    // mid-thought — leaking it as the user-facing answer would be dishonest,
    // so we report the condition rather than substitute it.)
    const why =
      typeof reasoning === "string" && reasoning.trim() !== ""
        ? "โมเดลตอบว่าง — token หมดไปกับ reasoning (thinking mode) จนไม่เหลือเนื้อคำตอบ"
        : finishReason === "length"
          ? "โมเดลตอบว่าง — คำตอบถูกตัดเพราะเกิน max_completion_tokens"
          : "โมเดลตอบกลับมาว่างเปล่าโดยไม่ทราบสาเหตุ";
    return res.status(502).json({
      error: "AI empty reply",
      detail: `${why} (model: ${data?.model || KIMI_MODEL}, finish_reason: ${finishReason ?? "unknown"})`,
      model: data?.model || KIMI_MODEL,
    });
  }

  return res.json({
    text: content,
    model: data.model || KIMI_MODEL,
    usage: data.usage || undefined,
  });
});

// ─── Economic calendar (ForexFactory weekly XML → static CB fallback) ───────
// ONE shared store: GET /api/economic-calendar and the Professor news
// injection both go through the same 1h cache. ECON_FALLBACK_PATH is a
// test-only override for the static fallback location (default unchanged).
const calendarStore = createCalendarStore(
  process.env.ECON_FALLBACK_PATH ? { fallbackPath: process.env.ECON_FALLBACK_PATH } : {}
);
app.get("/api/economic-calendar", calendarStore.handler);

// MT5 CSV data upload (PIN-gated via UPLOAD_TOKEN env; 501 when unset).
// Router is self-contained: parses its own text body, no new dependencies.
app.use("/api/data-upload", createUploadRouter());

// ─── Static SPA (equivalent to `serve -s dist`) ─────────────────────────────
app.use(
  express.static(DIST, {
    index: "index.html",
    maxAge: "1h",
    setHeaders(res, filePath) {
      // hashed assets can be cached hard; index.html must always revalidate
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache");
      } else if (/\.(js|css|woff2?|png|jpg|svg|json)$/.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);

// SPA fallback: every non-/api route → dist/index.html
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(DIST, "index.html"));
});

app.use("/api", (_req, res) => res.status(404).json({ error: "unknown api route" }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "invalid JSON body" });
  }
  console.error(err);
  res.status(500).json({ error: "internal error" });
});

app.listen(PORT, () => {
  console.log(`GoldCast server listening on :${PORT}`);
  console.log(`  static: ${DIST} (SPA fallback)`);
  console.log(`  AI: ${MOONSHOT_API_KEY ? `configured (model ${KIMI_MODEL})` : "NOT configured (POST /api/professor → 501)"}`);
  console.log(`  calendar: GET /api/economic-calendar (ForexFactory weekly feed + static fallback)`);
  console.log(`  upload: /api/data-upload ${process.env.UPLOAD_TOKEN ? "configured (PIN required)" : "NOT configured (→ 501)"}`);
});
