/**
 * The palette fade: a theme-COLOUR change that interpolates instead of snapping.
 *
 * A custom property is not animatable until it is REGISTERED, so a palette switch
 * — which is one rewrite of `body{--dsw-alias-…}` — changes every surface in a
 * single frame. The wallpaper cross-fades and the interface jumps, which is what
 * this module exists to fix: it emits the `@property` registrations that turn the
 * alias tokens into interpolable `<color>`s, plus the `transition` declarations
 * for the elements whose own token declarations are what changed.
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
 *
 * Pure: it takes resolved values and returns CSS, so `scripts/transition-check.ts`
 * can pin the shape down without a browser.
 */
export interface PaletteFadeInput {
  /** Elements whose OWN token declarations change when the palette does. */
  selectors: readonly string[]
  /** Registered colour token -> the value it must never be without. */
  initial: Readonly<Record<string, string>>
  /** Transition length in ms; `0` emits the registrations alone (no animation). */
  durationMs: number
  easing: string
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
  if (!(input.durationMs > 0) || input.selectors.length === 0) return css
  const list = names.map(n => `${n} ${input.durationMs}ms ${input.easing}`).join(',')
  return `${css}${input.selectors.join(',')}{transition:${list}}`
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
