import { useCallback, useEffect, useRef, useState } from 'react'
import type { LivePredictionState } from '@/hooks/useLivePrediction'

/**
 * Vol Alert System — client-side, honest.
 *
 * Watches the live prediction stream (p_high_vol) and fires on either:
 *  THRESHOLD — p_high_vol crosses ABOVE the user threshold (rising edge only,
 *              never continuously while above)
 *  SURGE     — p_high_vol rises by >= delta within a rolling 10-minute window
 *              of predictions (and the current value is the window maximum)
 *
 * After firing, each condition type is suppressed for a 15-minute cooldown.
 * Alerts operate ONLY when the engine status is 'live' — stale/gap/static/error
 * pauses the watcher (samples are not even consumed, so no phantom edges).
 *
 * Settings + alert log (last 20) persist to localStorage ('goldcast-alerts-v1').
 */

export type VolAlertType = 'threshold' | 'surge' | 'test'

export interface VolAlertEvent {
  /** Epoch ms of the prediction sample (or wall clock for test fires). */
  time: number
  type: VolAlertType
  /** p_high_vol at firing. */
  value: number
  /** Previous sampled p_high_vol (null for test fires / first sample). */
  previous: number | null
}

export interface VolAlertSettings {
  /** Rising-edge threshold, 0.5–0.95 (default 0.75). */
  threshold: number
  /** Surge delta over the rolling window, 0.05–0.30 (default 0.15). */
  delta: number
  soundOn: boolean
  notifyOn: boolean
}

export interface DetectorOptions {
  threshold: number
  delta: number
  windowMs: number
  cooldownMs: number
}

export interface DetectorSample {
  time: number
  value: number
}

export const DEFAULT_SETTINGS: VolAlertSettings = {
  threshold: 0.75,
  delta: 0.15,
  soundOn: true,
  notifyOn: false,
}

export const SURGE_WINDOW_MS = 10 * 60_000
export const COOLDOWN_MS = 15 * 60_000
export const LOG_LIMIT = 20
export const STORAGE_KEY = 'goldcast-alerts-v1'

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported'

/* ------------------------------------------------------------------ */
/* Pure detector (exported for the node sanity-check driver)           */
/* ------------------------------------------------------------------ */

/**
 * Creates a stateful detector. `opts` is read live on every update, so the
 * caller may mutate threshold/delta without losing window/cooldown state.
 *
 * `update(sample, emit)`:
 *  - always records the sample (rolling window + previous value)
 *  - when emit is false (disarmed), only tracking happens — no events fire
 *    and no cooldowns are consumed, so re-arming never produces stale edges.
 */
export function createVolAlertDetector(opts: DetectorOptions) {
  const history: DetectorSample[] = []
  let prev: number | null = null
  const lastFiredAt = { threshold: -Infinity, surge: -Infinity }

  const cooledDown = (type: 'threshold' | 'surge', t: number) =>
    t - lastFiredAt[type] >= opts.cooldownMs

  return function update(sample: DetectorSample, emit = true): VolAlertEvent[] {
    history.push(sample)
    while (history.length > 1 && sample.time - history[0]!.time > opts.windowMs) {
      history.shift()
    }

    const fired: VolAlertEvent[] = []
    if (emit) {
      /* THRESHOLD — rising edge only */
      if (
        prev != null &&
        prev < opts.threshold &&
        sample.value >= opts.threshold &&
        cooledDown('threshold', sample.time)
      ) {
        lastFiredAt.threshold = sample.time
        fired.push({ time: sample.time, type: 'threshold', value: sample.value, previous: prev })
      }

      /* SURGE — rise of >= delta inside the window, current value at the top */
      if (history.length > 1) {
        let min = Infinity
        let maxEarlier = -Infinity
        for (let i = 0; i < history.length - 1; i++) {
          const v = history[i]!.value
          if (v < min) min = v
          if (v > maxEarlier) maxEarlier = v
        }
        if (
          sample.value >= maxEarlier &&
          sample.value - min >= opts.delta &&
          cooledDown('surge', sample.time)
        ) {
          lastFiredAt.surge = sample.time
          fired.push({ time: sample.time, type: 'surge', value: sample.value, previous: prev })
        }
      }
    }

    prev = sample.value
    return fired
  }
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

interface PersistedAlerts {
  armed: boolean
  settings: VolAlertSettings
  log: VolAlertEvent[]
}

const FALLBACK: PersistedAlerts = { armed: true, settings: DEFAULT_SETTINGS, log: [] }

function numIn(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback
}

function loadPersisted(): PersistedAlerts {
  if (typeof window === 'undefined') return FALLBACK
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return FALLBACK
    const p = JSON.parse(raw) as Partial<PersistedAlerts>
    const s = (p.settings ?? {}) as Partial<VolAlertSettings>
    const log = Array.isArray(p.log)
      ? p.log
          .filter(
            (e): e is VolAlertEvent =>
              typeof e === 'object' &&
              e != null &&
              typeof (e as VolAlertEvent).time === 'number' &&
              typeof (e as VolAlertEvent).value === 'number' &&
              ['threshold', 'surge', 'test'].includes((e as VolAlertEvent).type),
          )
          .slice(0, LOG_LIMIT)
      : []
    return {
      armed: typeof p.armed === 'boolean' ? p.armed : FALLBACK.armed,
      settings: {
        threshold: numIn(s.threshold, 0.5, 0.95, DEFAULT_SETTINGS.threshold),
        delta: numIn(s.delta, 0.05, 0.3, DEFAULT_SETTINGS.delta),
        soundOn: typeof s.soundOn === 'boolean' ? s.soundOn : DEFAULT_SETTINGS.soundOn,
        notifyOn: typeof s.notifyOn === 'boolean' ? s.notifyOn : DEFAULT_SETTINGS.notifyOn,
      },
      log,
    }
  } catch {
    return FALLBACK
  }
}

/* ------------------------------------------------------------------ */
/* Side effects: two-tone WebAudio beep + Notification                 */
/* ------------------------------------------------------------------ */

/** Short two-tone alert beep, synthesized — no external files. */
export function playAlertBeep(): void {
  try {
    const Ctor =
      typeof window !== 'undefined'
        ? (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined
    if (!Ctor) return
    const ctx = new Ctor()
    const t0 = ctx.currentTime
    ;[880, 587.33].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const start = t0 + i * 0.22
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.22)
    })
    window.setTimeout(() => void ctx.close().catch(() => undefined), 1200)
  } catch {
    /* audio unavailable — stay silent, honestly */
  }
}

function currentNotifyPermission(): NotifyPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission as NotifyPermission
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export interface VolAlertsApi {
  armed: boolean
  settings: VolAlertSettings
  /** Newest first, capped at 20. */
  log: VolAlertEvent[]
  /** Alerts fired since the panel was last opened. */
  unseen: number
  /** True only while the engine status is 'live' — the sole firing mode. */
  isLive: boolean
  /** Engine status passthrough for honest "paused" messaging. */
  status: LivePredictionState['status']
  /** Wall-clock ms of the last fired alert (drives the bell flash). */
  lastFiredAtMs: number | null
  notifyPermission: NotifyPermission
  setArmed: (v: boolean) => void
  setSettings: (patch: Partial<VolAlertSettings>) => void
  clearLog: () => void
  markSeen: () => void
  /** Dev/test: pushes a synthetic event through the full fire pipeline. */
  testFire: () => void
  requestNotifyPermission: () => void
}

export function useVolAlerts(live: LivePredictionState): VolAlertsApi {
  const [initial] = useState(loadPersisted)
  const [armed, setArmed] = useState(initial.armed)
  const [settings, setSettingsState] = useState<VolAlertSettings>(initial.settings)
  const [log, setLog] = useState<VolAlertEvent[]>(initial.log)
  const [unseen, setUnseen] = useState(0)
  const [lastFiredAtMs, setLastFiredAtMs] = useState<number | null>(null)
  const [notifyPermission, setNotifyPermission] = useState<NotifyPermission>(currentNotifyPermission)

  /* Detector survives renders; options object is mutated on settings change
     so the rolling window + cooldown clocks are preserved. */
  const optsRef = useRef<DetectorOptions>({
    threshold: initial.settings.threshold,
    delta: initial.settings.delta,
    windowMs: SURGE_WINDOW_MS,
    cooldownMs: COOLDOWN_MS,
  })
  const detectorRef = useRef<ReturnType<typeof createVolAlertDetector> | null>(null)
  if (detectorRef.current == null) {
    detectorRef.current = createVolAlertDetector(optsRef.current)
  }

  /* Refs for values read inside fire/effects (avoid stale closures). */
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const liveRef = useRef(live)
  liveRef.current = live
  const armedRef = useRef(armed)
  armedRef.current = armed
  const lastSampleAtRef = useRef<number | null>(null)

  const fire = useCallback((events: VolAlertEvent[]) => {
    if (events.length === 0) return
    setLog((prev) => [...events.slice().reverse(), ...prev].slice(0, LOG_LIMIT))
    setUnseen((n) => n + events.length)
    setLastFiredAtMs(Date.now())

    if (settingsRef.current.soundOn) playAlertBeep()

    if (settingsRef.current.notifyOn && currentNotifyPermission() === 'granted') {
      const session = liveRef.current.data?.session ?? null
      for (const e of events) {
        const label = e.type === 'threshold' ? 'THRESHOLD' : e.type === 'surge' ? 'SURGE' : 'TEST'
        try {
          new Notification('GoldCast Vol Alert', {
            body: `${label} · p_high_vol ${e.value.toFixed(2)}${session ? ` · ${session} session` : ''}`,
            tag: `goldcast-vol-alert-${e.type}`,
          })
        } catch {
          /* notification construction can throw on some platforms — ignore */
        }
      }
    }
  }, [])

  /* Watch the live prediction stream. Only 'live' status feeds the detector;
     while disarmed the detector tracks samples silently (no firing). */
  useEffect(() => {
    if (live.status !== 'live') return
    const p = live.data?.p_high_vol
    const t = live.computedAtMs
    if (p == null || t == null) return
    if (lastSampleAtRef.current === t) return
    lastSampleAtRef.current = t
    const events = detectorRef.current!({ time: t, value: p }, armedRef.current)
    if (armedRef.current && events.length > 0) fire(events)
  }, [live.status, live.data, live.computedAtMs, fire])

  /* Persist armed/settings/log. */
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ armed, settings, log }))
    } catch {
      /* storage full/blocked — non-fatal */
    }
  }, [armed, settings, log])

  const setSettings = useCallback((patch: Partial<VolAlertSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch }
      optsRef.current.threshold = numIn(next.threshold, 0.5, 0.95, DEFAULT_SETTINGS.threshold)
      optsRef.current.delta = numIn(next.delta, 0.05, 0.3, DEFAULT_SETTINGS.delta)
      return {
        threshold: optsRef.current.threshold,
        delta: optsRef.current.delta,
        soundOn: next.soundOn,
        notifyOn: next.notifyOn,
      }
    })
    if (patch.notifyOn) {
      /* enabling notifications always (re)checks permission */
      const perm = currentNotifyPermission()
      if (perm === 'default') {
        void Notification.requestPermission()
          .then((p) => setNotifyPermission(p as NotifyPermission))
          .catch(() => undefined)
      } else {
        setNotifyPermission(perm)
      }
    }
  }, [])

  const requestNotifyPermission = useCallback(() => {
    const perm = currentNotifyPermission()
    if (perm === 'unsupported' || perm === 'granted' || perm === 'denied') {
      setNotifyPermission(perm)
      return
    }
    void Notification.requestPermission()
      .then((p) => setNotifyPermission(p as NotifyPermission))
      .catch(() => undefined)
  }, [])

  const clearLog = useCallback(() => setLog([]), [])
  const markSeen = useCallback(() => setUnseen(0), [])

  const testFire = useCallback(() => {
    const now = Date.now()
    const value = liveRef.current.data?.p_high_vol ?? settingsRef.current.threshold
    fire([{ time: now, type: 'test', value, previous: null }])
  }, [fire])

  return {
    armed,
    settings,
    log,
    unseen,
    isLive: live.status === 'live',
    status: live.status,
    lastFiredAtMs,
    notifyPermission,
    setArmed,
    setSettings,
    clearLog,
    markSeen,
    testFire,
    requestNotifyPermission,
  }
}
