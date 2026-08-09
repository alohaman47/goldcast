// GoldCast — Economic calendar (GET /api/economic-calendar)
//
// Live source: ForexFactory weekly XML feed (nfs.faireconomy.media) — free,
// no key, times already UTC (verified 2026-08-10 against known releases:
// Sentix 08:30 feed = 10:30 CEST ✓, BRC 23:01 feed = 00:01 BST ✓).
//
// Fallback: server/econ_fallback.json — curated 2026 central-bank decision
// dates (FOMC/ECB/BoE/BoJ, verified against official schedules). Served ONLY
// when the live feed fails AND there is no stale cache.
//
// Contract (locked with the frontend):
//   200 → { events: [{title, currency, timeUtc(ISO), impact, forecast, previous}],
//           source: "forexfactory" | "static-fallback", fetchedAt: ISO }
//   500 → { error }  (only if live feed AND static fallback both fail)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_PATH = path.join(__dirname, "econ_fallback.json");

const FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml";
const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // feed is weekly; refresh hourly
const VALID_IMPACTS = new Set(["High", "Medium", "Low", "Holiday"]);

/* ─── XML parsing (no deps — the FF feed schema is small and stable) ─────── */
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function field(block, tag) {
  // matches <tag>…</tag>, <tag><![CDATA[…]]></tag>, and self-closing <tag />
  const m = block.match(
    new RegExp(`<${tag}\\s*/>|<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, "i")
  );
  if (!m) return "";
  return decodeEntities((m[1] ?? "").trim());
}

// FF date = MM-DD-YYYY, time = "h:mmam|pm" | "All Day" | "Tentative" | ""
// Feed times are UTC. All-day/tentative events pin to 00:00:00Z.
function toIsoUtc(dateStr, timeStr) {
  const dm = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!dm) return null;
  const [, mm, dd, yyyy] = dm;
  let hh = 0;
  let min = 0;
  const tm = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (tm) {
    hh = Number(tm[1]) % 12;
    if (tm[3].toLowerCase() === "pm") hh += 12;
    min = Number(tm[2]);
  }
  const mo = Number(mm);
  const dy = Number(dd);
  if (mo < 1 || mo > 12 || dy < 1 || dy > 31) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${yyyy}-${pad(mo)}-${pad(dy)}T${pad(hh)}:${pad(min)}:00.000Z`;
}

export function parseFfXml(xml) {
  if (typeof xml !== "string" || !xml.includes("<weeklyevents>")) return [];
  const events = [];
  for (const chunk of xml.split(/<event>/i).slice(1)) {
    const block = chunk.split(/<\/event>/i)[0];
    const title = field(block, "title");
    const currency = field(block, "country");
    const timeUtc = toIsoUtc(field(block, "date"), field(block, "time"));
    if (!title || !currency || !timeUtc) continue;
    const rawImpact = field(block, "impact");
    const impact = [...VALID_IMPACTS].find(
      (v) => v.toLowerCase() === rawImpact.toLowerCase()
    ) ?? "Low";
    const forecast = field(block, "forecast");
    const previous = field(block, "previous");
    events.push({
      title,
      currency,
      timeUtc,
      impact,
      forecast: forecast === "" ? null : forecast,
      previous: previous === "" ? null : previous,
    });
  }
  return events;
}

/* ─── Store factory: shared cache + getEvents() for HTTP AND Professor ───── */
// createCalendarStore() returns { getEvents, handler }:
//   - getEvents(): async → { events, source, fetchedAt } — the same contract
//     payload the HTTP route serves. Throws ONLY if the live feed fails AND
//     there is no stale cache AND the static fallback is unreadable. Server-
//     side consumers (Professor news injection) call this directly so both
//     paths share ONE cache (one upstream fetch per hour process-wide).
//   - handler: the GET /api/economic-calendar Express handler (thin wrapper
//     around getEvents — behavior identical to the pre-refactor handler).
export function createCalendarStore({
  fetchImpl = globalThis.fetch,
  fallbackPath = FALLBACK_PATH,
  cacheTtlMs = CACHE_TTL_MS,
} = {}) {
  let cache = null; // { events, fetchedAt, fetchedAtMs }

  const loadFallback = async () => {
    const raw = await readFile(fallbackPath, "utf8");
    const parsed = JSON.parse(raw);
    const events = Array.isArray(parsed?.events) ? parsed.events : [];
    if (events.length === 0) throw new Error("fallback file has no events");
    return events;
  };

  async function getEvents() {
    // 1) fresh cache
    if (cache && Date.now() - cache.fetchedAtMs < cacheTtlMs) {
      return { events: cache.events, source: "forexfactory", fetchedAt: cache.fetchedAt };
    }

    // 2) live fetch
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const upstream = await fetchImpl(FF_URL, {
        headers: { "User-Agent": "GoldCast/1.0 (+economic-calendar)" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!upstream.ok) throw new Error(`FF feed HTTP ${upstream.status}`);
      // feed is windows-1252 — decode explicitly, not as utf-8
      const buf = await upstream.arrayBuffer();
      const xml = new TextDecoder("windows-1252").decode(buf);
      const events = parseFfXml(xml);
      if (events.length === 0) throw new Error("FF feed parsed to 0 events");
      cache = { events, fetchedAt: new Date().toISOString(), fetchedAtMs: Date.now() };
      return { events, source: "forexfactory", fetchedAt: cache.fetchedAt };
    } catch (e) {
      clearTimeout(timer);
      // 3) stale cache beats the static fallback (real weekly events > CB dates only)
      if (cache) {
        return { events: cache.events, source: "forexfactory", fetchedAt: cache.fetchedAt };
      }
      // 4) curated static fallback — throws if unreadable (caller decides)
      const events = await loadFallback();
      return { events, source: "static-fallback", fetchedAt: new Date().toISOString() };
    }
  }

  async function economicCalendarHandler(_req, res) {
    res.setHeader("Cache-Control", "public, max-age=300");
    try {
      return res.json(await getEvents());
    } catch (e) {
      // 500 only if live feed AND static fallback both fail
      return res.status(500).json({
        error: "economic calendar unavailable",
        detail: `live feed failed and static fallback unreadable: ${String(e?.message || e)}`,
      });
    }
  }

  return { getEvents, handler: economicCalendarHandler };
}

// Back-compat wrapper: same factory shape as before the getEvents() split.
export function createCalendarHandler(options) {
  return createCalendarStore(options).handler;
}

/* ─── Professor news injection (server-side, pure helpers) ───────────────── */
// Which currencies move each symbol. Unknown symbol → no news injected.
export const NEWS_SYMBOL_CURRENCIES = {
  xauusd: ["USD"],
  nas100: ["USD"],
  us100: ["USD"],
  us30: ["USD"],
  ger40: ["EUR"],
  eurusd: ["EUR", "USD"],
  gbpusd: ["GBP", "USD"],
  usdjpy: ["JPY", "USD"],
};

// Extra system-prompt line while news is in context — extends the iron rule
// (no direction calls) to scheduled events.
export const NEWS_RULE_LINE =
  "เวลาข่าวคือกำหนดการล่วงหน้า ห้ามคาดการณ์ผลของข่าวหรือทิศทางราคาจากข่าว";

const NEWS_WINDOW_PAST_MS = 30 * 60 * 1000; // just-released events still count
const NEWS_WINDOW_FUTURE_MS = 48 * 60 * 60 * 1000; // "today + tomorrow"
const NEWS_MAX_EVENTS = 8;
export const NEWS_BUDGET_CHARS = 800;

// Filter (High/Medium impact, matching currencies, now−30m … now+48h), sort
// by time, cap at 8, render compactly within ~800 chars. Returns "" when the
// symbol is unknown or nothing matches → caller injects nothing.
export function buildNewsBlock(events, symbol, nowMs = Date.now()) {
  const currencies = NEWS_SYMBOL_CURRENCIES[String(symbol ?? "").toLowerCase()];
  if (!currencies || !Array.isArray(events)) return "";
  const wanted = new Set(currencies);

  const picked = events
    .filter(
      (e) =>
        e &&
        wanted.has(String(e.currency ?? "").toUpperCase()) &&
        (e.impact === "High" || e.impact === "Medium")
    )
    .map((e) => ({ e, t: Date.parse(e.timeUtc) }))
    .filter(
      (x) =>
        Number.isFinite(x.t) &&
        x.t >= nowMs - NEWS_WINDOW_PAST_MS &&
        x.t <= nowMs + NEWS_WINDOW_FUTURE_MS
    )
    .sort((a, b) => a.t - b.t)
    .slice(0, NEWS_MAX_EVENTS)
    .map((x) => x.e);

  const pad = (n) => String(n).padStart(2, "0");
  const render = (list) =>
    "ข่าววันนี้-พรุ่งนี้ (เวลา UTC):\n" +
    list
      .map((e) => {
        const d = new Date(Date.parse(e.timeUtc));
        let line =
          `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
          `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} ` +
          `[${e.impact}] ${String(e.currency).toUpperCase()} ${e.title}`;
        const extra = [];
        if (e.forecast) extra.push(`คาด ${e.forecast}`);
        if (e.previous) extra.push(`ก่อน ${e.previous}`);
        if (extra.length > 0) line += ` (${extra.join(" / ")})`;
        return line;
      })
      .join("\n");

  // Drop the furthest-out events until the block fits the char budget.
  while (picked.length > 0) {
    const block = render(picked);
    if (block.length <= NEWS_BUDGET_CHARS) return block;
    picked.pop();
  }
  return "";
}
