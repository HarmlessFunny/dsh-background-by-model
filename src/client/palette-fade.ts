/**
 * The palette fade: a theme-COLOUR change that interpolates instead of snapping.
 *
 * A custom property is not animatable until it is REGISTERED, so a palette switch —
 * one rewrite of `body{--dsw-alias-…}` — changes every surface in a single frame
 * while the wallpaper cross-fades. This module emits the `@property` registrations
 * that turn the alias tokens into interpolable `<color>`s, plus the `transition`
 * declarations for the elements whose own token declarations changed (and, for
 * surfaces painted from a plugin-owned variable, a transition on the standard
 * property that carries it — see `properties`).
 *
 * Three rules, all about not inventing behaviour:
 *
 *   1. **A token the host does not publish is left alone.** Registration needs an
 *      `initial-value`, and a registered property that nothing else sets resolves to
 *      THAT value instead of the `var(…, fallback)` chain the stylesheet relies on.
 *      `initial` is the host's own resolved value, and only tokens it answers for
 *      are registered.
 *   2. **The duration and the vetoes are the SWITCH's.** The caller passes the same
 *      decision the wallpaper layer made, so "instant", 0 ms and
 *      `prefers-reduced-motion` mean the same on both halves.
 *   3. **Only a token the palette in force WRITES may be transitioned** — a
 *      transition on someone else's token animates THEIR change at our duration.
 *
 * Pure: resolved values in, CSS out, so `scripts/transition-check.ts` pins it.
 */
/**
 * One element whose OWN declarations move with the palette.
 *
 * Per element, deliberately NOT the whole registered set. An element that merely
 * INHERITS a token must not be given a transition for it: the transition targets
 * the value seen at arm time, which is still the OLD one while the ancestor
 * interpolates — so the element drags its subtree behind a lagged copy of the
 * palette instead of riding the real clock. Measured in Chromium (1200 ms, one
 * declared transition, inherited consumers): frame-for-frame without its own
 * transition, 113/255 of the way at t = 1500 ms with one.
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
   * `initial` covers every name SOME palette can write (the registrations a later
   * fade needs must be in place), but the palette being painted writes fewer: the
   * light branch emits ~30 fewer aliases than the dark one, and the host readback
   * only what the host answers for. A name outside this set takes its value from
   * the HOST, and the host flips those on its own schedule (its own re-assert on
   * mount, and the preference reset a dispose→register cycle triggers). Animating
   * one is animating a decision the plugin does not own — the reported white block
   * fading to black was the user bubble, a host-scheme token the light palette
   * never writes, turned into a 3 s ramp by our duration.
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
