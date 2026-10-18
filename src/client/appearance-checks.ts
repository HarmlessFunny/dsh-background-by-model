/**
 * The two recurring checks the appearance half needs, and why they are a SCHEDULE
 * rather than a `setInterval` each (see ./watchdogs).
 *
 * Neither is a poll of something that changes often. The theme watchdog exists
 * because the host drops the plugin's theme preference on ANY settings adoption
 * without telling anyone; the holiday rollover exists because the calendar moves
 * once a day, at Beijing midnight, and a holiday whose art was never fetched (it
 * was not that day at boot) has to download it before it can paint.
 *
 * Both are cheap when nothing changed, which is what makes a one-second and a
 * thirty-second cadence affordable at all.
 */
import type { Watchdog } from './watchdogs'
import { HOLIDAY_WATCH_MS, THEME_WATCH_MS } from './cadence'

/** What the checks ask of the plugin. */
export interface CheckHost {
  /** Re-publish the host scheme and re-assert the skin; true = something moved. */
  restore(): void
  /** The active rule's colour, or null when it follows the system theme. */
  activeColor(): [number, number, number] | null
  /** Re-read the host palette while no palette of ours is in force. */
  refreshHostPalette(): void
  /** Repaint everything that follows the active rule. */
  refresh(): void
  /** Recompute the active rule and repaint. */
  applyActive(): void
  /** Today's holiday id, or null. */
  activeHolidayId(): string | null
  /** Today's holiday slot, or null when no holiday can paint today. */
  todayHolidaySlot(): string | null
  /** Load one slot's bytes and repaint once they are in. */
  loadAndRepaint(slot: string): Promise<void>
}

/**
 * The theme watchdog. The theme service keeps only built-in preferences in
 * memory, so any host-scope adoption can silently drop the custom theme —
 * reverting the label colours and the inner surfaces to the system palette.
 *
 * A colour-less rule needs the same slow check for the opposite reason: it paints
 * from the HOST palette, which the host can re-project (or which the scheme flag
 * can fall behind) with no event of ours to hang a repaint on.
 */
export function themeWatchdog(host: CheckHost): Watchdog {
  return {
    name: 'theme',
    everyMs: THEME_WATCH_MS,
    run(): void {
      if (host.activeColor() === null) { host.refreshHostPalette(); return }
      host.restore()
    },
  }
}

/**
 * The holiday rollover: a slow tick that does nothing at all until the day key
 * actually moves. 30 s is plenty for a boundary that is a whole day wide.
 */
export function holidayRollover(host: CheckHost): Watchdog {
  let day = host.activeHolidayId() ?? ''
  return {
    name: 'holiday',
    everyMs: HOLIDAY_WATCH_MS,
    run(): void {
      const next = host.activeHolidayId() ?? ''
      if (next === day) return
      day = next
      // Midnight can land ON a holiday whose art was deliberately not fetched at
      // boot; download it, then repaint.
      const slot = host.todayHolidaySlot()
      if (slot === null) host.applyActive()
      else void host.loadAndRepaint(slot)
    },
  }
}
