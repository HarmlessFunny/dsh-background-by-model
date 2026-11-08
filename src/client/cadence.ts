/**
 * The scheduler entry points the plugin registers, and the cadences they run at.
 *
 * Every interval the plugin owns is declared HERE rather than at its call site, so
 * "what does this plugin poll, and how often" has one answer. The scheduler itself
 * lives in ./watchdogs; the questions live in their own modules (boot restore and
 * the theme watchdog in ./appearance, the holiday rollover in ./holiday-status).
 */

/** The theme skin / host palette re-assert, once a second while a colour is live. */
export const THEME_WATCH_MS = 1_000
/**
 * The delayed boot restores. Two of them because the theme service and the host
 * settings scope settle asynchronously after `apply` — a single late pass misses a
 * host adoption that happens after it, and an early one misses the one before it.
 */
export const RESTORE_DELAYS_MS: readonly number[] = [300, 1_500]
/** The holiday rollover: the answer only moves at Beijing midnight, a whole day wide. */
export const HOLIDAY_WATCH_MS = 30_000
/**
 * How often the panel checks whether the config on disk moved under it.
 *
 * Only matters once agent access is on (the tools are the other writer), so the
 * check is a conditional no-op the rest of the time: it asks the host for one
 * number and stops. 3 s is the compromise between noticing an agent's edit while
 * the user is still looking at the screen and not paying a request per second for
 * a file that usually has not changed.
 */
export const REV_POLL_MS = 3_000

/** Where each scheduled check is described. */
export type WatchdogKind = 'theme' | 'holiday' | 'rev' | `restore:${number}`
