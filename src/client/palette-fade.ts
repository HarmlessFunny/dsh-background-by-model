/**
 * The palette fade: a theme-COLOUR change that interpolates instead of snapping.
 *
 * A custom property is not animatable until it is REGISTERED, so a palette switch
 * — which is one rewrite of `body{--dsw-alias-…}` — changes every surface in a
 * single frame. The wallpaper cross-fades and the interface jumps, which is what
 * this module exists to fix: it emits the `@property` registrations that turn the
 * alias tokens into interpolable `<color>`s, plus the `transition` declarations
 * for the elements whose own token declarations are what changed — and, for the
 * surfaces the plugin paints from a variable of its own instead of from a token,
 * a transition on the STANDARD property that carries it (see `properties`).
 *
 * Two rules shape it, and both are about not inventing behaviour:
 *
 *   1. **A token the host does not publish is left alone.** Registration requires
 *      an `initial-value`, and a registered property that nothing else sets
 *      resolves to THAT value rather than to the `var(…, fallback)` chain the
 *      plugin's own stylesheet relies on — so a name the host answers with a
 *      colour is registered, and one it does not is skipped instead of being
 *      given an invented colour. `initial` is that answer (the host's resolved
 *      value) and doubles as the declaration.
 *   2. **The duration and the vetoes are the SWITCH's, not a second opinion.** The
 *      caller passes the same decision the wallpaper layer uses, so "instant", a
 *      0 ms duration and `prefers-reduced-motion` mean the same thing on both
 *      halves of a switch, and there is only one place to change them.
 *   3. **Only a token the palette in force WRITES may be transitioned.** A
 *      transition on a token someone else owns animates that someone else's
 *      change, at this plugin's duration: see `written`.
 *
 * Pure: it takes resolved values and returns CSS, so `scripts/transition-check.ts`
 * can pin the shape down without a browser.
 */
/**
 * One element whose OWN declarations move with the palette, and the tokens those
 * declarations are for.
 *
 * The list is per element and deliberately NOT the whole registered set, which is
 * the entire reason this shape is not a flat `selectors` array. An element that
 * merely INHERITS a token must not be handed a transition for it: that element's
 * transition then targets the value it sees at arm time — and while the ancestor
 * is itself interpolating, that value is still the OLD one — so the element drags
 * its whole subtree behind a lagged copy of the palette for the length of the
 * animation instead of riding the real clock.
 *
 * Measured in Chromium, one 1200 ms transition on the declaring ancestor and
 * three consumers of it (`@property` registered `<color>`, `inherits: true`):
 *
 *   inherits, no transition of its own -> follows the ancestor frame for frame
 *   inherits, HAS a transition of its own -> 113/255 of the way at t = 1500 ms
 *
 * The plugin walked straight into it: the settings dialog and the trajectory root
 * were both given the FULL token list while they only re-declare the three layer
 * tokens, so every control inside the dialog (the holiday switch fill, the active
 * effect chips) sat on the previous theme colour for an entire wallpaper switch
 * and snapped to the new one only after it ended.
 */
export interface PaletteFadeScope {
  selector: string
  /** The tokens THIS element declares. An inherited name belongs to its owner. */
  tokens: readonly string[]
  /**
   * Standard properties whose OWN value on this element moves with the palette.
   *
   * The second way the plugin paints a surface, and the one a token list cannot
   * reach: three of them are painted from a colour the plugin OWNS as a plain
   * variable (`--dsh-any-…`, written on `<html>` with its alpha folded in) rather
   * than from a registered alias token — the settings dialog's plate, the
   * file-preview panel, the Cordis panel. An unregistered variable is not
   * interpolable, so there is nothing to register and no token to transition;
   * `background-color` is what changes on the element itself, and it interpolates
   * like any other standard property once it is named here.
   *
   * No filter is applied to these: unlike a token name, a property name is not
   * something the host has to publish.
   */
  properties?: readonly string[]
}

export interface PaletteFadeInput {
  /** Elements whose OWN token declarations change when the palette does. */
  scopes: readonly PaletteFadeScope[]
  /** Registered colour token -> the value it must never be without. */
  initial: Readonly<Record<string, string>>
  /**
   * The token names the palette IN FORCE actually writes.
   *
   * The third filter, and the one this shape was missing. `initial` covers every
   * name SOME palette can write — it has to, or the registrations a later fade
   * needs would not be in place — but the palette being painted writes fewer of
   * them: the plugin's light branch emits roughly thirty fewer aliases than its
   * dark one, and the host-palette readback emits only the surfaces the host can
   * answer for. Every name outside this set still takes its value from the HOST,
   * and the host changes those on its own schedule: the plugin forces
   * `data-ds-dark-theme` for its own palette, the host re-asserts its own scheme
   * on mount and on settings adoption, and the plugin itself disposes and
   * re-registers its theme on a colour change — which the host answers by
   * resetting the preference to `system` for the length of that call. A token
   * that belongs to one of those flips goes from the host's light value to its
   * dark one (and back) inside a single switch.
   *
   * A transition on such a token is the plugin animating a decision it does not
   * own and cannot correct — reported as "白色色块会渐变为黑色色块…白色渐变完黑色后
   * 立马切到白色". The block is the user message bubble: `#edf3fe` in the host's
   * light scheme (that is `--dsw-static-deepseek-50`, the value measured off the
   * screen) and `#2c2c2e` in its dark one, a name the fade sheet had registered
   * while the palette in force — a light one — never writes it. Nothing about that
   * surface is ours: the host's own flip is the whole story, and our duration is
   * what turned it into a 3 s ramp (the reported session runs its switch at
   * 3000 ms) instead of a frame.
   */
  written: readonly string[]
  /** Transition length in ms; `0` emits the registrations alone (no animation). */
  durationMs: number
  easing: string
}

/**
 * Whether a palette change may interpolate at all.
 *
 * Only while the SCHEME stays put. A light↔dark flip is not a tint of the same
 * palette, it is a different palette: interpolating between them walks the whole
 * interface through mid-tones whose ink is wrong in both directions (dark text
 * half-way into a dark palette), which looks worse than the switch it replaces.
 * The wallpaper has no such problem — one image fades into another either way —
 * so its own animation is deliberately untouched by this.
 *
 * `previous === null` means nothing has been painted yet (the first apply after a
 * load): there is no colour to come from, so there is nothing to fade.
 */
export function paletteFadeAllowed(previous: 'light' | 'dark' | null, next: 'light' | 'dark'): boolean {
  return previous === next
}

/** One `@property` block per registered token. */
function registrations(names: readonly string[], initial: Readonly<Record<string, string>>): string {
  return names.map(n => `@property ${n}{syntax:'<color>';inherits:true;initial-value:${initial[n]}}`).join('')
}

/**
 * The stylesheet for one state: the registrations always, the transition only
 * while a palette change is actually being painted.
 *
 * `durationMs = 0` deliberately emits NO transition rule. That is not only
 * "instant": it is what keeps a slider drag instant, because the same call sites
 * rewrite the `body{…}` rule on every frame of a drag and a live transition on
 * those tokens would make the alphas lag behind the pointer.
 */
export function paletteFadeCss(input: PaletteFadeInput): string {
  const names = Object.keys(input.initial).filter(n => n.startsWith('--'))
  if (names.length === 0) return ''
  const css = registrations(names, input.initial)
  if (!(input.durationMs > 0)) return css
  // The palette's own token set, as a lookup: a scope may only animate what this
  // apply actually rewrites (see `written`).
  const written = new Set(input.written)
  const timing = (n: string): string => `${n} ${input.durationMs}ms ${input.easing}`
  const rules = input.scopes
    // Only what THIS element declares, only what the host can answer for, and
    // only what the palette in force writes: a token with no registration cannot
    // interpolate, so a transition on it would only lengthen the list, and a
    // token this palette does not write keeps the HOST's value — which the host
    // is free to change on a schedule of its own. A scope left with nothing
    // emits no rule at all.
    .map(s => ({
      selector: s.selector,
      transitions: [
        ...s.tokens.filter(n => names.includes(n) && written.has(n)),
        ...(s.properties ?? []),
      ],
    }))
    .filter(s => s.transitions.length > 0)
    .map(s => `${s.selector}{transition:${s.transitions.map(timing).join(',')}}`)
    .join('')
  return `${css}${rules}`
}

/**
 * The same fade for an element the plugin paints INLINE (its columns and cards).
 *
 * No custom property is involved there — the element's own `background-color` is
 * what changes — so the standard property is what has to be told. `0` means
 * `none` rather than an empty value: an empty value would leave whatever the host
 * had declared on that element, and the point of the 0 case is that a drag must
 * not fade at all.
 */
export function paletteFadeInline(durationMs: number, easing: string): string {
  return durationMs > 0 ? `background-color ${durationMs}ms ${easing}` : 'none'
}
