/**
 * ONE scheduler for every recurring check the plugin runs.
 *
 * Four concerns used to own a timer each — the model watch (1.5 s), the theme
 * watchdog (1 s), the holiday rollover (30 s) and the two delayed boot restores
 * (300 ms, 1500 ms) — which meant four wake-up sources with no shared beat, four
 * disposers to forget, and a page with four independent chances to keep running
 * work after the plugin was torn down. They are independent QUESTIONS, not
 * independent clocks, so they now share one interval: each entry says how often
 * it wants to be asked, the scheduler fires it when that many milliseconds have
 * elapsed, and everything is cancelled by one call.
 *
 * The intervals are deliberately NOT rounded up into one tick length: a 30 s
 * holiday check asked every 100 ms would cost thirty `Intl` formats a second to
 * save a wake-up nobody measures. What is shared is the clock and the lifecycle;
 * what stays per-entry is the cadence and the last-run stamp.
 *
 * `document.hidden` pauses the whole schedule. Every entry here answers a
 * question about what the user CAN SEE (which model is on screen, whether the
 * host dropped our palette, whether today became a holiday) — and a background
 * tab pays for the checks in battery while nobody is looking at the answer. The
 * first tick after the tab comes back runs everything that is due, so nothing is
 * skipped, only deferred.
 */

/** One recurring check. */
export interface Watchdog {
  /** Stable name, for the console when a check throws. */
  readonly name: string
  /** How often it wants to be asked, in ms. */
  readonly everyMs: number
  /** Run it. A throw is caught and logged; it must not stop the others. */
  run(): void
}

/** The shortest cadence allowed — also the scheduler's own tick. */
const MIN_TICK_MS = 1_000

export interface Schedule {
  /** Register a check; returns a disposer for it alone. */
  add(watchdog: Watchdog): () => void
  /** Run every registered check once, right now (the first paint / resume path). */
  runAll(): void
  /** Drop every registration and stop the interval. */
  dispose(): void
}

/**
 * Start one scheduler. It does NOT run anything on registration: the caller
 * decides when the first pass happens (the plugin's boot sequence needs the
 * order — wallpaper, model, palette), and registers with the intent that the
 * first tick is the first run.
 *
 * The clock is `performance.now()` rather than `Date.now()`: a wall-clock jump
 * (NTP, a laptop waking from sleep) would otherwise fire every entry at once or
 * park them all for hours, and "how long ago did we last ask" is a duration, not
 * a date.
 */
export function createSchedule(): Schedule {
  const entries = new Map<Watchdog, { last: number }>()
  let timer: number | null = null
  let disposed = false
  const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  const fire = (w: Watchdog, stamp: { last: number }): void => {
    stamp.last = now()
    try {
      w.run()
    } catch (e) {
      // One broken check must not silence the rest — a theme watchdog that threw
      // every second would otherwise take the holiday rollover down with it.
      console.warn(`dsh-background-by-model: the "${w.name}" check threw`, e)
    }
  }

  const tick = (): void => {
    if (disposed || document.hidden) return
    const at = now()
    for (const [w, stamp] of entries) {
      // `last` is stamped BEFORE the run (inside `fire`), so a slow check is not
      // re-entered on the next tick while it is still working.
      if (at - stamp.last >= w.everyMs) fire(w, stamp)
    }
  }

  /**
   * One beat for the whole page, and it is the SHORTEST cadence any entry asks
   * for, so each one fires within one beat of its own due time. With nothing
   * registered there is no timer at all.
   */
  const resync = (): void => {
    if (timer !== null) { window.clearInterval(timer); timer = null }
    if (disposed || entries.size === 0) return
    let beat = Infinity
    for (const w of entries.keys()) beat = Math.min(beat, w.everyMs)
    timer = window.setInterval(tick, Math.max(MIN_TICK_MS, beat))
  }

  const onVisibility = (): void => {
    // Coming back: everything that fell due while hidden runs on the next beat,
    // which is now.
    if (!document.hidden) tick()
  }
  document.addEventListener('visibilitychange', onVisibility)

  resync()

  return {
    add(watchdog: Watchdog): () => void {
      if (disposed) return () => undefined
      // Stamped at registration, so a new entry is asked a FULL interval from
      // now — registering a check must not fire it (the caller has already run
      // whatever first pass it wanted, in an order it chose).
      entries.set(watchdog, { last: now() })
      resync()
      return () => {
        entries.delete(watchdog)
        resync()
      }
    },
    runAll(): void {
      if (disposed) return
      for (const [w, stamp] of entries) {
        // `runAll` is the explicit "do it now" path (boot, tab resume), so the
        // stamp is advanced even for entries that were not due.
        fire(w, stamp)
      }
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      entries.clear()
      if (timer !== null) { window.clearInterval(timer); timer = null }
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
