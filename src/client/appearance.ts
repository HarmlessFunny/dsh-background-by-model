/**
 * The appearance half: the custom theme skin, the host-palette hand-back, and
 * the delayed boot restore.
 *
 * What `apply()` used to carry inline, now with its questions in one place:
 *
 *   - `applyPalette` — a rule's colour becomes the host theme (debounced: a wheel
 *     drag runs it dozens of times a second) and the host's own scheme is published
 *     for the wallpaper layer;
 *   - `reassert` — the pass that puts a skin the host dropped BACK, without
 *     rebuilding it (a rebuild flashes the system palette);
 *   - `restore` — the delayed boot pass, when the theme service and the host
 *     settings scope settle after `apply`.
 *
 * The recurring checks live in ./appearance-checks, next to the cadences they run
 * at (./cadence), so this module stays about the skin itself.
 */
import type { Ctx } from './types'
import { activeColor } from './state'
import { createSkin } from './theme-skin'
import { applyWp, hostSchemeIsDark, refreshSystemTheme, setHostScheme } from './wallpaper'
import { RESTORE_DELAYS_MS } from './cadence'

/** What the appearance layer needs from the plugin as a whole. */
export interface AppearanceHost {
  /** The context whose theme service is the host palette. */
  ctx: Pick<Ctx, 'theme'>
  /** Repaint everything that follows the active rule. */
  refresh(): void
}

export interface Appearance {
  /**
   * Re-emit the palette for whatever is painted RIGHT NOW (the active image's
   * colour, else the rule's). Called by every repaint that can move the colour — a
   * model switch and a rotation step alike — so it is also the one place the
   * (debounced) skin registration happens.
   */
  applyPalette(): void
  /** Publish the scheme the host's own preference resolves to. */
  syncHostScheme(): void
  /** Re-assert the skin for a colour, reporting whether anything was changed. */
  reassert(): boolean
  /** One delayed-restore pass: scheme, skin, wallpaper. */
  restore(): void
  /** The watchdog's pass: hand back the host palette, or re-assert the skin. */
  watch(): void
  /** Arm the two delayed boot restores; returns their teardown. */
  armRestores(): () => void
  /** Drop the registered skin (teardown). */
  dispose(): void
}

export function createAppearance(host: AppearanceHost): Appearance {
  const skin = createSkin(host.ctx)
  /** The host scheme last published, so a move can be told from a repeat. */
  let lastScheme: boolean | null = null

  /**
   * Publish the scheme the host's own preference resolves to. The theme service is
   * the only place that knows it (a custom active theme included); the wallpaper
   * layer needs it to hand `data-ds-dark-theme` back in the host's own form while a
   * colour-less rule follows that theme, instead of leaving the flag off — which
   * pins the host to its LIGHT palette on a dark system.
   */
  const syncHostScheme = (): void => {
    try {
      setHostScheme(host.ctx.theme.getTheme().active.colorScheme === 'dark')
    } catch {
      // A host build without a resolvable snapshot: let the wallpaper layer fall
      // back to the preference the boot script published.
      setHostScheme(null)
    }
  }

  const reassert = (): boolean => {
    const color = activeColor()
    return color === null ? false : skin.reassert(color)
  }

  /**
   * Re-read the scheme the HOST preference resolves to, repainting when it moved.
   *
   * The host can flip it without telling anyone: the OS while the preference is
   * `system`, a host-side settings adoption, and — the one that hides — a
   * re-projection the host performs on its own, which our flag write can swallow.
   * So the value is compared, not assumed: a moved scheme re-publishes it and
   * repaints; an unchanged one only does the cheap readback while a
   * colour-less rule paints from the host palette.
   *
   * @returns whether the host scheme moved (the caller repaints).
   */
  const syncScheme = (): boolean => {
    let dark: boolean | null
    try {
      dark = host.ctx.theme.getTheme().active.colorScheme === 'dark'
    } catch {
      // No resolvable snapshot: ask the wallpaper layer for its own fallback.
      dark = hostSchemeIsDark()
    }
    const moved = dark !== null && dark !== lastScheme
    if (dark !== null) {
      lastScheme = dark
      setHostScheme(dark)
    }
    if (!moved && activeColor() === null) refreshSystemTheme()
    return moved
  }

  const restore = (): void => {
    syncHostScheme()
    if (reassert()) host.refresh()
    applyWp()
  }

  return {
    syncHostScheme,
    reassert,
    restore,
    applyPalette() {
      skin.commit(activeColor())
      syncHostScheme()
    },
    watch() {
      const moved = syncScheme()
      // A moved scheme comes first, and by itself repaints: the skin's own
      // re-assertion would read the OLD scheme while the skin was already in
      // place, so gating the repaint on it left the host's new palette unpainted
      // until some unrelated apply happened to run (the "host went dark and the
      // interface stayed light" report).
      if (moved) { host.refresh(); return }
      if (reassert()) host.refresh()
    },
    /**
     * Two delayed restores, because the theme service and the host settings scope
     * settle asynchronously after `apply`: a single late pass misses an adoption
     * that happens after it, and an early one misses the one before it.
     */
    armRestores() {
      const timers = RESTORE_DELAYS_MS.map(ms => window.setTimeout(restore, ms))
      return () => { for (const id of timers) window.clearTimeout(id) }
    },
    dispose() { skin.dispose() },
  }
}
