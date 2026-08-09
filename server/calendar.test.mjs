/**
 * GoldCast Phase 17 — /api/economic-calendar contract test (stubbed upstream).
 *
 * Boots the REAL server (server/index.js) in-process and intercepts fetch so
 * calls to the ForexFactory host are scripted. Asserts the LOCKED contract:
 *   200 → { events: [{title, currency, timeUtc(ISO), impact, forecast, previous}],
 *           source: "forexfactory" | "static-fallback", fetchedAt: ISO }
 *   500 only if live feed AND static fallback both fail.
 *
 * Scenarios:
 *   S1 feed down, no cache → 200 static-fallback (32 curated 2026 CB events)
 *   S2 feed up (sample XML) → 200 forexfactory, MM-DD-YYYY+h:mmam/pm → ISO UTC
 *   S3 second call within TTL → served from cache (no extra upstream fetch)
 *   S4 feed down again → stale cache served (source still "forexfactory")
 *   S5 response has EXACTLY the contract keys {events, source, fetchedAt}
 *   U1-U4 parseFfXml unit edge cases (All Day, bad date, impact normalize, nulls)
 *
 * Usage: node server/calendar.test.mjs   (exit 0 = PASS, 1 = FAIL)
 */
import path from "node:path";
import url from "node:url";
import { parseFfXml } from "./calendar.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FF_HOST = "nfs.faireconomy.media";
const PORT = 3198;
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  → ${extra}`}`);
  if (!cond) failures++;
}

/* ── unit: parseFfXml edge cases ─────────────────────────────────────────── */
const SAMPLE_XML = `<?xml version="1.0" encoding="windows-1252"?>
<weeklyevents>
	<event>
		<title>CPI m/m</title>
		<country>USD</country>
		<date><![CDATA[08-12-2026]]></date>
		<time><![CDATA[12:30pm]]></time>
		<impact><![CDATA[High]]></impact>
		<forecast><![CDATA[0.2%]]></forecast>
		<previous><![CDATA[0.1%]]></previous>
	</event>
	<event>
		<title>BOJ Summary of Opinions</title>
		<country>JPY</country>
		<date><![CDATA[08-09-2026]]></date>
		<time><![CDATA[11:50pm]]></time>
		<impact><![CDATA[Low]]></impact>
		<forecast />
		<previous />
	</event>
	<event>
		<title>Bank Holiday</title>
		<country>JPY</country>
		<date><![CDATA[08-10-2026]]></date>
		<time><![CDATA[All Day]]></time>
		<impact><![CDATA[Holiday]]></impact>
		<forecast />
		<previous />
	</event>
	<event>
		<title>Broken Date Event</title>
		<country>EUR</country>
		<date><![CDATA[2026-08-10]]></date>
		<time><![CDATA[8:30am]]></time>
		<impact><![CDATA[Medium]]></impact>
		<forecast />
		<previous />
	</event>
</weeklyevents>`;

const parsed = parseFfXml(SAMPLE_XML);
check("U1 MM-DD-YYYY + 12:30pm → ISO UTC (12pm = noon)", parsed[0]?.timeUtc === "2026-08-12T12:30:00.000Z", parsed[0]?.timeUtc);
check("U2 11:50pm → 23:50 UTC; empty forecast/previous → null",
  parsed[1]?.timeUtc === "2026-08-09T23:50:00.000Z" && parsed[1]?.forecast === null && parsed[1]?.previous === null,
  JSON.stringify(parsed[1]));
check("U3 All Day → 00:00:00Z; Holiday impact preserved",
  parsed[2]?.timeUtc === "2026-08-10T00:00:00.000Z" && parsed[2]?.impact === "Holiday",
  JSON.stringify(parsed[2]));
check("U4 invalid date format → event skipped (3 kept of 4)", parsed.length === 3, String(parsed.length));

/* ── stub the ForexFactory upstream via fetch interception ───────────────── */
const realFetch = globalThis.fetch;
let scenario = "down";
let ffCalls = 0;

globalThis.fetch = async (input, init) => {
  const u = typeof input === "string" ? input : input?.url ?? "";
  if (u.includes(FF_HOST)) {
    ffCalls++;
    if (scenario === "down") throw new Error("stub: network unreachable");
    return new Response(SAMPLE_XML, {
      status: 200,
      headers: { "content-type": "text/xml" },
    });
  }
  return realFetch(input, init);
};

/* ── boot the real server in-process ─────────────────────────────────────── */
process.env.PORT = String(PORT);
await import("./index.js"); // app.listen(PORT) runs on import
await new Promise((r) => setTimeout(r, 500));

async function getCalendar() {
  const res = await realFetch(`${BASE}/api/economic-calendar`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const IMPACTS = new Set(["High", "Medium", "Low", "Holiday"]);
function eventsValid(evts) {
  return (
    Array.isArray(evts) &&
    evts.length > 0 &&
    evts.every(
      (e) =>
        typeof e.title === "string" &&
        typeof e.currency === "string" &&
        ISO_RE.test(e.timeUtc ?? "") &&
        IMPACTS.has(e.impact) &&
        (typeof e.forecast === "string" || e.forecast === null) &&
        (typeof e.previous === "string" || e.previous === null)
    )
  );
}
const contractKeys = (b) =>
  b && Object.keys(b).sort().join(",") === "events,fetchedAt,source";

/* S1: feed down, cold cache → static fallback */
scenario = "down";
const r1 = await getCalendar();
check("S1 feed down → 200", r1.status === 200, `got ${r1.status} ${JSON.stringify(r1.body)}`);
check("S1 → source 'static-fallback'", r1.body?.source === "static-fallback", r1.body?.source);
check("S1 → 32 curated CB events, all valid + ISO", r1.body?.events?.length === 32 && eventsValid(r1.body.events), `n=${r1.body?.events?.length}`);
check("S1 → covers FOMC/ECB/BoE/BoJ",
  ["USD", "EUR", "GBP", "JPY"].every((c) => r1.body?.events?.some((e) => e.currency === c)),
  JSON.stringify([...new Set(r1.body?.events?.map((e) => e.currency))]));
check("S1 → exact contract keys", contractKeys(r1.body), Object.keys(r1.body ?? {}).join(","));

/* S2: feed up → forexfactory parse */
scenario = "up";
ffCalls = 0;
const r2 = await getCalendar();
check("S2 feed up → 200 + source 'forexfactory'", r2.status === 200 && r2.body?.source === "forexfactory", `got ${r2.status} ${r2.body?.source}`);
check("S2 → 3 parsed events (bad date dropped), all valid", r2.body?.events?.length === 3 && eventsValid(r2.body?.events), `n=${r2.body?.events?.length}`);
check("S2 → CPI parsed 2026-08-12T12:30:00.000Z High 0.2%/0.1%",
  r2.body?.events?.[0]?.timeUtc === "2026-08-12T12:30:00.000Z" &&
    r2.body?.events?.[0]?.impact === "High" &&
    r2.body?.events?.[0]?.forecast === "0.2%" &&
    r2.body?.events?.[0]?.previous === "0.1%",
  JSON.stringify(r2.body?.events?.[0]));
check("S2 → exact contract keys + ISO fetchedAt", contractKeys(r2.body) && ISO_RE.test(r2.body?.fetchedAt ?? ""), Object.keys(r2.body ?? {}).join(","));

/* S3: within TTL → cache, no extra upstream call */
const r3 = await getCalendar();
check("S3 second call within TTL → cache hit (1 upstream fetch total)", ffCalls === 1 && r3.body?.source === "forexfactory", `ffCalls=${ffCalls}`);

/* S4: feed down again → stale cache beats fallback */
scenario = "down";
const r4 = await getCalendar();
check("S4 feed down with stale cache → 200 'forexfactory' (stale), same fetchedAt",
  r4.status === 200 && r4.body?.source === "forexfactory" && r4.body?.fetchedAt === r2.body?.fetchedAt,
  `got ${r4.status} ${r4.body?.source}`);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
