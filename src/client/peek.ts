/**
 * "Wallpaper only" — the eye in the conversation header.
 *
 * One click hides the entire interface so that nothing is left on screen but the
 * picture; the next click, or any key press, brings it back. Unloading the plugin
 * gives it back too — a view mode with no way out is worse than no view mode.
 *
 * NOTHING STAYS VISIBLE. An earlier version kept the eye on screen in the hidden
 * state (a descendant may re-assert `visibility:visible` under a hidden ancestor).
 * That worked, but it left a control floating alone on the user's wallpaper — one
 * they did not ask for, and one whose contrast is unknowable against a picture the
 * plugin did not choose. Dismissing the whole screen is now the exit, which is the
 * gesture a full-screen picture mode is expected to accept.
 *
 * HOW the interface is hidden matters more than that it is. The obvious ways —
 * unmounting, or `display:none` — would tear down the conversation's scroll
 * position, the composer's draft and every component's state, none of which this
 * plugin could rebuild on the way back. `visibility:hidden` on the app's mount
 * point keeps the whole tree mounted AND laid out, so leaving the mode is one
 * attribute away and nothing is lost. It also drops the hidden subtree from
 * hit-testing, so the invisible interface cannot be clicked through — which is
 * what lets a click be the exit rather than an interaction.
 *
 * The wallpaper is untouched by construction: its layer is a SIBLING of the mount
 * point (`body > div[data-dab-wp]`, painted at z-index -1 — see ./wallpaper), so
 * hiding the app's subtree hides everything EXCEPT the picture. A host overlay
 * that portals beside the mount point (an approval prompt, a settings dialog)
 * stays visible too, which is the right answer: nothing this plugin does should
 * hide a question the user has to answer.
 *
 * It is deliberately NOT a setting: a way of looking at today's wallpaper is not a
 * preference, so it is not written to the config, not restored on the next boot
 * and not carried across a reload.
 *
 * The rules live in ./components/ui.css — one stylesheet for the plugin, and
 * `check:ui` fails any `.dab-` class used without a rule. Injecting it is the
 * ENTRY's job (a header control must be styled before the settings page is ever
 * opened), which is also what keeps this module free of runtime imports: it is
 * plain document state, and `check:peek` exercises it on bare `node`.
 */
import type { Ctx } from './types'

/**
 * The attribute on `<html>` that switches the interface off.
 *
 * Spelled out in the stylesheet as well, because CSS cannot import it. Renaming
 * the attribute in one place and not the other leaves a button that does nothing
 * and reports nothing, so `check:peek` asserts that both halves name it.
 */
export const PEEK_ATTR = 'data-dab-peek'

/**
 * Slot entry id in `conversation.session.header.utilities`.
 *
 * Namespaced on purpose: that is a LIST slot, so a fresh id is added beside the
 * shipped controls, while reusing one of their ids would put this plugin in THEIR
 * cell and replace it.
 */
export const PEEK_ID = 'background-by-model-peek'

/** Whether the interface is currently hidden. */
export function isPeeking(): boolean {
  return document.documentElement.hasAttribute(PEEK_ATTR)
}

/**
 * Show or hide the interface.
 *
 * The DOM attribute IS the state — there is no second copy to keep in step. That
 * is what lets the mode survive a header rebuild, a session switch, and every
 * other React tree the host may replace under it.
 */
export function setPeeking(on: boolean): void {
  if (on === isPeeking()) return
  if (on) {
    document.documentElement.setAttribute(PEEK_ATTR, '')
    // A focused control keeps receiving keys while it is invisible, so blurring is
    // the difference between "the interface is hidden" and "the interface is
    // hidden but still typing".
    const active = document.activeElement
    if (active instanceof HTMLElement) active.blur()
  } else {
    document.documentElement.removeAttribute(PEEK_ATTR)
  }
}

/** Flip the mode. */
export function togglePeeking(): void {
  setPeeking(!isPeeking())
}

/**
 * The plugin-lifetime half of the mode: the two ways out, and the dispose that
 * gives the interface back.
 *
 * WHY `click` AND NOT `pointerdown`. The UI has to be restored while nothing is
 * hit-testable, and the gesture that restores it must not then also press whatever
 * appears under the cursor. `pointerdown` would restore before the click that
 * follows it is dispatched, so that click would land on the freshly visible
 * interface and activate it. Restoring on `click` means the whole gesture happens
 * over a hidden tree, and the event's propagation path was fixed at dispatch, so
 * it cannot retarget onto what just appeared.
 *
 * The first click must not be the one that ENTERED the mode. That click's capture
 * phase at `document` runs BEFORE the React handler on the mount container (capture
 * travels document → target, and the host's listeners sit on the container), so at
 * that moment the mode is still off and this handler returns immediately.
 */
export function registerPeek(ctx: Ctx): void {
  // The app's mount point, as the Web entry looks it up itself
  // (`dsh-web-frontend`: `document.getElementById('root')`). Checked rather than
  // assumed: if the shell ever renames it, the mode silently hides nothing, and a
  // console line is the only warning anyone would get before a user reports that
  // the eye does nothing.
  if (document.getElementById('root') === null) {
    console.warn('dsh-background-by-model: no #root to hide — "wallpaper only" will have no visible effect')
  }
  /**
   * Leave the mode on the first input of any kind.
   *
   * Capture phase and consumed on purpose: the key or click that dismisses the
   * picture must not ALSO reach the interface that is reappearing (a keystroke
   * typed into the composer, a button pressed by the same click), and it must be
   * seen before any host handler gets the chance to act on it.
   *
   * Any key counts — modifiers included. A mode whose only exits are "the exact
   * key we documented" and "the exact control we drew" is a mode some users get
   * stuck in, and the request was explicit: one press, any key.
   */
  const leave = (e: Event): void => {
    if (!isPeeking()) return
    e.preventDefault()
    e.stopPropagation()
    setPeeking(false)
  }
  document.addEventListener('click', leave, true)
  document.addEventListener('keydown', leave, true)
  ctx.effect(() => () => {
    document.removeEventListener('click', leave, true)
    document.removeEventListener('keydown', leave, true)
    // Whatever this plugin hid, it gives back on the way out: a reload of the
    // plugin, or its removal, must never leave an empty screen behind.
    setPeeking(false)
  }, 'dsh-background-by-model: peek')
}
