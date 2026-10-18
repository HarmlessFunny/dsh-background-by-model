/**
 * The theme skin: the host theme the plugin registers from the ACTIVE rule's
 * colour, and everything needed to keep it in force.
 *
 * Three things about this are load-bearing, and all three used to live inline in
 * `apply()` where nothing could be seen in isolation:
 *
 *   1. **Same scheme, no re-registration.** A dispose→register→activate cycle
 *      walks the interface through the SYSTEM palette: the host resets the
 *      preference to `system` the moment the theme backing it is disposed, and
 *      under a light palette the plugin does not re-emit every token — so those
 *      surfaces take the host's dark values and the armed fade turns the frame
 *      into a white block fading to black.
 *   2. **A colour-less rule hands the palette back BEFORE the repaint.** The host's
 *      snapshot is what the wallpaper layer reads the host scheme from, and while
 *      our skin is still active that snapshot reports OUR scheme.
 *   3. **The skin is re-asserted rather than rebuilt.** `reassert` is the slow path
 *      a watchdog and a delayed boot restore take: a host-scope adoption can
 *      silently drop the registered theme, and rebuilding it every second would
 *      flash the interface.
 */
import type { Ctx } from './types'
import { genTokens } from './utils/color'

/** Id of the plugin's own registered theme. */
export const CUSTOM_ID = 'custom-color'
/** How long a colour drag waits before the (host-visible) skin switch is made. */
const SKIN_DEBOUNCE_MS = 60

export interface Skin {
  /**
   * Bring the host palette in line with `color` (null = follow the system theme).
   *
   * Called on every repaint, including dozens of times per second during a drag,
   * which is why the registration half is debounced and the hand-back half is not.
   */
  commit(color: [number, number, number] | null): void
  /**
   * Re-assert the skin for `color` in ONE pass, without the debounce: registers it
   * if the host dropped the registration, activates it if the host dropped the
   * preference, and does neither when both are already right.
   *
   * @returns whether anything was changed (the caller repaints only then).
   */
  reassert(color: [number, number, number]): boolean
  /** Drop the skin and hand the palette back to the host. */
  drop(): void
  /** Drop the registration and cancel a pending switch (plugin teardown). */
  dispose(): void
}

export function createSkin(ctx: Pick<Ctx, 'theme'>): Skin {
  let customDispose: (() => void) | null = null
  let skinTimer: number | null = null
  /** Colour scheme of the skin this plugin registered, or null when none is. */
  let skinScheme: string | null = null

  /** Scheme the host currently holds for our theme id; null when it is not there. */
  const registeredScheme = (): string | null => {
    const theme = ctx.theme.getTheme().themes.find(t => t.id === CUSTOM_ID)
    return theme === undefined ? null : theme.colorScheme
  }
  const hasSkin = (): boolean => ctx.theme.getTheme().themes.some(t => t.id === CUSTOM_ID)

  const register = (h: number, s: number, l: number): void => {
    const { colorScheme, tokens } = genTokens(h, s, l)
    // A skin whose SCHEME is already in force is not rebuilt — see the header. What
    // it contributes is its colorScheme (the tokens themselves are re-emitted by
    // the plugin's own `!important` rule), so a same-scheme re-registration would
    // buy a system-palette flash and nothing else.
    if (skinScheme === colorScheme && registeredScheme() !== null) {
      // Still asserted: the host drops the PREFERENCE on a settings adoption even
      // while the registration survives.
      if (ctx.theme.getTheme().preference !== CUSTOM_ID) ctx.theme.setTheme(CUSTOM_ID)
      return
    }
    customDispose?.()
    try {
      customDispose = ctx.theme.register({ id: CUSTOM_ID, colorScheme, tokens })
    } catch {
      // A live registration from an earlier HMR apply pass cannot be torn down
      // here; keep it and activate it below. Without this the duplicate-id throw
      // would abort the whole apply.
      customDispose = null
    }
    // Whichever registration is in force now, its scheme is the one to compare
    // against next time — a leftover id is the same id this call asked for.
    skinScheme = registeredScheme() ?? colorScheme
    if (hasSkin()) ctx.theme.setTheme(CUSTOM_ID)
  }

  const drop = (): void => {
    customDispose?.()
    customDispose = null
    skinScheme = null
    try {
      if (ctx.theme.getTheme().preference === CUSTOM_ID) ctx.theme.setTheme('system')
    } catch {
      // A host build without a `system` preference keeps its own choice.
    }
  }

  return {
    commit(color) {
      if (skinTimer !== null) window.clearTimeout(skinTimer)
      if (color === null) {
        // Hand the palette back BEFORE the caller's apply that follows, so the
        // host-scheme readback sees the host's own answer. Dropping is idempotent,
        // so it needs none of the debouncing a colour drag does.
        skinTimer = null
        drop()
        return
      }
      // The skin is a host-visible switch (dispose + register + activate) and is
      // batched; the wallpaper and tokens land immediately either way.
      skinTimer = window.setTimeout(() => {
        skinTimer = null
        register(color[0], color[1], color[2])
      }, SKIN_DEBOUNCE_MS)
    },
    reassert(color) {
      // Theme missing (a host adoption dropped it): re-register + activate.
      if (!hasSkin()) { register(color[0], color[1], color[2]); return true }
      // Present but inactive: re-assert the preference only. `register` would
      // dispose and re-create the skin, which flashes the system theme.
      if (ctx.theme.getTheme().preference !== CUSTOM_ID) { ctx.theme.setTheme(CUSTOM_ID); return true }
      return false
    },
    drop,
    dispose() {
      if (skinTimer !== null) { window.clearTimeout(skinTimer); skinTimer = null }
      customDispose?.()
      customDispose = null
    },
  }
}
