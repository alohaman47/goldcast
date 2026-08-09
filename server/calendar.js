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

/* ─── Handler factory (fetchImpl injectable for tests) ───────────────────── */
export function createCalendarHandler({
  fetchImpl = globalThis.fetch,
  fallbackPath = FALLBACK_PATH,
  cacheTtlMs = CACHE_TTL_MS,
} = {}) {
  let cache = null; // { events, fetchedAt, fetchedAtMs }

  const serveFallback = async (res) => {
    try {
      const raw = await readFile(fallbackPath, "utf8");
      const parsed = JSON.parse(raw);
      const events = Array.isArray(parsed?.events) ? parsed.events : [];
      if (events.length === 0) throw new Error("fallback file has no events");
      return res.json({
        events,
        source: "static-fallback",
        fetchedAt: new Date().toISOString(),
      });
    } catch (e) {
      return res.status(500).json({
        error: "economic calendar unavailable",
        detail: `live feed failed and static fallback unreadable: ${String(e?.message || e)}`,
      });
    }
  };

  return async function economicCalendarHandler(_req, res) {
    res.setHeader("Cache-Control", "public, max-age=300");

    // 1) fresh cache
    if (cache && Date.now() - cache.fetchedAtMs < cacheTtlMs) {
      return res.json({ events: cache.events, source: "forexfactory", fetchedAt: cache.fetchedAt });
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
      return res.json({ events, source: "forexfactory", fetchedAt: cache.fetchedAt });
    } catch (e) {
      clearTimeout(timer);
      // 3) stale cache beats the static fallback (real weekly events > CB dates only)
      if (cache) {
        return res.json({ events: cache.events, source: "forexfactory", fetchedAt: cache.fetchedAt });
      }
      // 4) curated static fallback; 5) 500 only if that fails too
      return serveFallback(res);
    }
  };
}
