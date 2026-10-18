/**
 * The image rotation timer: ONE interval, always aimed at the ACTIVE rule.
 *
 * A timer per rule would burn wakeups on rules that are not painting anything,
 * and since only one rule's images can be on screen at a time, one timer is all
 * that is needed. It is kept out of `apply()` because a rotation is the one piece
 * of this plugin that must keep working while nothing else changes — and the
 * questions it has to answer (did the schedule's inputs move? is the tab
 * hidden? which image is next?) read better gathered in one place.
 *
 * The schedule is armed by SIGNATURE rather than by "already armed": a slider drag
 * on the active rule re-runs the whole apply dozens of times per second, and
 * restarting the interval on each of those would mean the dwell timer never
 * elapses while the user is dragging (a 10 s rotation would never advance). The
 * signature carries exactly the inputs the schedule depends on, so a real change —
 * another rule, another interval, the tab becoming visible again — re-arms while a
 * repaint does not.
 */
import { activeRule, imageIndexOf, setRotIndex } from './state'
import { nextIndex, isRotating } from './rotation'
import type { BgRule } from './types'

export interface RotationHost {
  /** Show the image at `idx` of `rule` (loads it first when it is cold). */
  paintImage(rule: BgRule, idx: number): void
  /** Warm one image so a later switch fades toward bytes already here. */
  warmImage(rule: BgRule, idx: number): void
  /** Refresh the section's readout (the "rotating" badge). */
  sync(): void
}

export interface Rotation {
  /** Arm (or re-arm) the rotation for the active rule. Idempotent by signature. */
  schedule(force?: boolean): void
  /** Step the rotation once, right now — the panel's "next" button. */
  step(): boolean
  /** The tab hid or showed itself: pause the dwell, or resume it fresh. */
  onVisibility(): void
  /** Stop the timer (plugin teardown). */
  dispose(): void
}

export function createRotation(host: RotationHost): Rotation {
  let timer: number | null = null
  /** Identity of the schedule currently armed; a change means "re-arm". */
  let signature = ''

  const tick = (): void => {
    const rule = activeRule()
    if (rule === null) return
    const next = nextIndex(rule.images.length, rule.rotate.order, imageIndexOf(rule))
    // Nothing to step to (the list shrank to a single image under us): stop rather
    // than leave a timer firing forever at a rule with one picture.
    if (next === null) { schedule(true); return }
    setRotIndex(next)
    host.paintImage(rule, next)
    // Warm the image AFTER the one just shown, so the next tick has decoded bytes
    // to fade toward instead of paying a read at the moment of the switch.
    const after = nextIndex(rule.images.length, rule.rotate.order, next)
    if (after !== null) host.warmImage(rule, after)
  }

  const schedule = (force = false): void => {
    // `activeRule()` also answers with a holiday entry, whose images are the single
    // hosted festival picture; `isRotating` turns that into "no schedule".
    const rule = activeRule()
    const sig = rule === null
      ? ''
      : [rule.id, rule.rotate.enabled, rule.rotate.intervalMs, rule.rotate.order, rule.images.length, document.hidden].join('|')
    if (!force && sig === signature) return
    signature = sig
    if (timer !== null) { window.clearInterval(timer); timer = null }
    if (rule === null || document.hidden) return
    if (!isRotating(rule.images.length, rule.rotate.enabled, rule.rotate.intervalMs)) return
    // Warm the first image this schedule will ask for, so the very first tick is
    // not the one that has to pay for the read.
    const next = nextIndex(rule.images.length, rule.rotate.order, imageIndexOf(rule))
    if (next !== null) host.warmImage(rule, next)
    timer = window.setInterval(tick, rule.rotate.intervalMs)
  }

  return {
    schedule,
    step(): boolean {
      const rule = activeRule()
      if (rule === null) return false
      const next = nextIndex(rule.images.length, rule.rotate.order, imageIndexOf(rule))
      if (next === null) return false
      setRotIndex(next)
      host.paintImage(rule, next)
      // A manual step restarts the dwell, so the tick already on its way does not
      // follow the user's click a second later.
      schedule(true)
      return true
    },
    onVisibility(): void {
      // A hidden tab has nothing to paint, so the rotation stops with the pixels
      // and resumes on a fresh interval: coming back to a background that changed
      // three times while nobody was looking is not what "every 30 seconds" means
      // to anyone watching it. `sync()` moves the readout with it — the section
      // cannot be seen while the tab is hidden, but the badge must be right the
      // moment it is shown again.
      schedule()
      host.sync()
    },
    dispose(): void {
      if (timer !== null) { window.clearInterval(timer); timer = null }
    },
  }
}
