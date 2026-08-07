/**
 * Sanity driver for the Vol Alert detector (src/hooks/useVolAlerts.ts).
 * Bundles the hook with esbuild, then feeds synthetic p_high_vol series and
 * asserts: rising edge fires once, sustained-high does not refire, surge
 * fires, cooldown suppresses, disarmed tracking never fires.
 *
 * Run: node scripts/alert_check.mjs
 */
import { buildSync } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { rmSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outfile = path.join(root, 'scripts', '.alert_check.build.mjs')

buildSync({
  entryPoints: [path.join(root, 'src/hooks/useVolAlerts.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
})

const { createVolAlertDetector } = await import(outfile)
rmSync(outfile, { force: true })

const MIN = 60_000
const T0 = 1_700_000_000_000
let failures = 0

function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

/* helper: feed values at 1-minute spacing, collecting events */
function feed(det, values, startMs = T0, stepMs = MIN, emit = true) {
  const events = []
  values.forEach((v, i) => events.push(...det({ time: startMs + i * stepMs, value: v }, emit)))
  return events
}

/* ------------------------------------------------------------------ */
/* 1. THRESHOLD: rising edge fires once; sustained-high never refires  */
/* ------------------------------------------------------------------ */
{
  const det = createVolAlertDetector({ threshold: 0.75, delta: 99, windowMs: 10 * MIN, cooldownMs: 15 * MIN })
  const events = feed(det, [0.5, 0.6, 0.7, 0.8, 0.82, 0.85, 0.9, 0.88, 0.86, 0.91])
  check(
    'threshold: rising edge fires exactly once at the cross',
    events.length === 1 &&
      events[0].type === 'threshold' &&
      events[0].value === 0.8 &&
      events[0].previous === 0.7 &&
      events[0].time === T0 + 3 * MIN,
    JSON.stringify(events),
  )
}

/* ------------------------------------------------------------------ */
/* 2. THRESHOLD: re-cross within cooldown is suppressed; after fires   */
/* ------------------------------------------------------------------ */
{
  const det = createVolAlertDetector({ threshold: 0.75, delta: 99, windowMs: 10 * MIN, cooldownMs: 15 * MIN })
  const first = feed(det, [0.5, 0.8]) // fire at T0+1min
  check('threshold: initial cross fires', first.length === 1)
  const suppressed = feed(det, [0.5, 0.8], T0 + 2 * MIN) // re-cross 2 min later
  check('threshold: re-cross inside 15m cooldown suppressed', suppressed.length === 0, JSON.stringify(suppressed))
  const after = feed(det, [0.5, 0.8], T0 + 20 * MIN) // 20 min later, cooldown over
  check('threshold: re-cross after cooldown fires again', after.length === 1, JSON.stringify(after))
}

/* ------------------------------------------------------------------ */
/* 3. SURGE: >= delta rise inside 10m window fires once, then cools    */
/* ------------------------------------------------------------------ */
{
  const det = createVolAlertDetector({ threshold: 0.99, delta: 0.15, windowMs: 10 * MIN, cooldownMs: 15 * MIN })
  const events = feed(det, [0.3, 0.3, 0.31, 0.35, 0.4, 0.46, 0.47, 0.48])
  const surges = events.filter((e) => e.type === 'surge')
  check(
    'surge: fires once when rise >= 0.15 within window',
    surges.length === 1 && surges[0].value === 0.46 && surges[0].time === T0 + 5 * MIN,
    JSON.stringify(events),
  )
}

/* ------------------------------------------------------------------ */
/* 4. SURGE: slow drift over 20 minutes must NOT fire                  */
/* ------------------------------------------------------------------ */
{
  const det = createVolAlertDetector({ threshold: 0.99, delta: 0.15, windowMs: 10 * MIN, cooldownMs: 15 * MIN })
  const events = feed(det, [0.3, 0.38, 0.46], T0, 9 * MIN) // 0.16 total, but >10m apart
  check('surge: slow drift outside rolling window does not fire', events.length === 0, JSON.stringify(events))
}

/* ------------------------------------------------------------------ */
/* 5. SURGE: new surge after window + cooldown elapsed fires again     */
/* ------------------------------------------------------------------ */
{
  const det = createVolAlertDetector({ threshold: 0.99, delta: 0.15, windowMs: 10 * MIN, cooldownMs: 15 * MIN })
  feed(det, [0.3, 0.46]) // first surge at T0+1min
  feed(det, [0.5, 0.5, 0.5], T0 + 20 * MIN) // flat high: lows out of window, no rise
  const again = feed(det, [0.5, 0.66], T0 + 40 * MIN) // fresh surge, cooldown long over
  check(
    'surge: fires again on a fresh rise after cooldown',
    again.length === 1 && again[0].value === 0.66,
    JSON.stringify(again),
  )
  const flat = feed(det, [0.3, 0.46], T0 + 80 * MIN) // sanity: detector still consistent
  check('surge: independent later surge still detected', flat.length === 1)
}

/* ------------------------------------------------------------------ */
/* 6. DISARMED (emit=false): tracks silently, no stale edge on re-arm  */
/* ------------------------------------------------------------------ */
{
  const det = createVolAlertDetector({ threshold: 0.75, delta: 99, windowMs: 10 * MIN, cooldownMs: 15 * MIN })
  const silent = feed(det, [0.5, 0.8, 0.85], T0, MIN, false) // cross while disarmed
  check('disarmed: crossing while disarmed fires nothing', silent.length === 0, JSON.stringify(silent))
  const rearmed = feed(det, [0.86, 0.87], T0 + 3 * MIN) // re-arm, still high — no phantom edge
  check('disarmed: re-arm while above threshold does not refire', rearmed.length === 0, JSON.stringify(rearmed))
  const real = feed(det, [0.5, 0.8], T0 + 20 * MIN) // genuine new edge while armed
  check('disarmed: genuine new edge after re-arm fires', real.length === 1, JSON.stringify(real))
}

/* ------------------------------------------------------------------ */
/* 7. Both conditions can fire on the same sample                      */
/* ------------------------------------------------------------------ */
{
  const det = createVolAlertDetector({ threshold: 0.75, delta: 0.15, windowMs: 10 * MIN, cooldownMs: 15 * MIN })
  const events = feed(det, [0.5, 0.8])
  const types = events.map((e) => e.type).sort()
  check(
    'combined: threshold + surge both fire on a jump across threshold',
    events.length === 2 && types[0] === 'surge' && types[1] === 'threshold',
    JSON.stringify(events),
  )
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
