/**
 * The wallpaper-switch transition: what a change LOOKS like, and how long it
 * takes.
 *
 * Pure and import-free at runtime on purpose — the layers, the timers and the
 * rAF that actually paint live in the apply closure (./wallpaper), but the
 * DECISION lives here so `scripts/transition-check.ts` can pin it down. Every
 * failure this feature can produce is silent:
 *
 *   1. a start state equal to the end state (an effect that visibly does
 *      nothing, indistinguishable from "the setting was not saved");
 *   2. a duration of `0` read as "absent" and defaulted instead of honoured;
 *   3. an effect selected while `reduced-motion` is on, animating anyway;
 *   4. a garbage duration animating for an unknown length.
 *
 * This module deliberately imports NOTHING from `src/schema.ts`, exactly like
 * `./rotation` and for the same reason: that module has a real (extensionless)
 * runtime import of `./holiday`, which the bundler resolves and plain `node`
 * does not. The persisted shape's own clamps are checked where they run —
 * through the node half's RPC, in `scripts/node-half-check.mjs`.
 */
import type { TransitionConfig, TransitionEffect, TransitionEasing } from './types'

/** One wallpaper layer's inline style, in the two properties a switch touches. */
export interface LayerStyle {
  opacity: string
  transform: string
}

/** Everything the render layer needs to run (or skip) one switch. */
export interface TransitionPlan {
  /** Whether any animation runs at all. */
  animate: boolean
  /** Duration to use, in ms — `0` whenever nothing animates. */
  durationMs: number
  /** Start state of the INCOMING layer. */
  from: LayerStyle
  /** End state of the incoming layer. */
  to: LayerStyle
  /** The `transition` shorthand, written before `to` is applied. */
  transition: string
  /** `will-change` while the animation runs (`''` = none). */
  willChange: string
}

/**
 * Resolve the duration one switch uses.
 *
 * The order is the whole "global effect, per-rule duration" bargain:
 *
 *   1. `effect: 'none'` is a hard cut whatever any duration says — asking for no
 *      animation and asking for 0 ms are the same request, and the effect is the
 *      more explicit of the two;
 *   2. `durationMode: 'unified'` uses the global duration for every rule;
 *   3. otherwise the rule's own `rotate.fadeMs` decides, which is what makes
 *      this setting change nothing on upgrade.
 *
 * A non-finite or negative value answers `0` (a hard cut) rather than a default:
 * animating for an unknown length is the one answer that cannot be right. Both
 * inputs are already clamped by the shared sanitizer (`./schema`), so this is a
 * guard against a hand-edited config, not a second clamp.
 */
export function resolveFadeMs(transition: TransitionConfig, ruleFadeMs: number): number {
  if (transition.effect === 'none') return 0
  const chosen = transition.durationMode === 'unified' ? transition.durationMs : ruleFadeMs
  return Number.isFinite(chosen) && chosen > 0 ? chosen : 0
}

/**
 * The transform the incoming layer starts from, per effect.
 *
 * `zoom` starts ABOVE 1 and settles back to exactly `none`, never below or past
 * it: the wallpaper would otherwise be left larger than the viewport, cropping a
 * `fit` framing the user committed by hand. `slide` is a small push because a
 * full-width travel of a full-bleed wallpaper reads as two wallpapers, not one
 * transition.
 */
const START_TRANSFORM: Record<TransitionEffect, string> = {
  fade: 'none',
  // Never animates (see `resolveFadeMs`), so its start state is its end state.
  none: 'none',
  zoom: 'scale(1.06)',
  slide: 'translateX(6%)',
}

/** The properties one effect actually animates — an unchanged property must not
 *  be put on the transition list, or `fade` would stop being byte-for-byte the
 *  cross-fade every release so far performed. */
function animatedProps(effect: TransitionEffect): string[] {
  return effect === 'fade' ? ['opacity'] : ['opacity', 'transform']
}

/**
 * Decide one switch: whether to animate, from what, to what, and on what curve.
 *
 * `canAnimate` is the caller's answer to "is there anything to animate from" —
 * a first paint has no previous layer, and a wallpaper at 0% opacity is not on
 * screen — plus the window-visibility question the caller already owns. It is
 * passed in rather than computed here so this stays a pure function of its
 * inputs.
 *
 * `reducedMotion` is honoured as a hard veto rather than a shortened duration:
 * the point of the preference is that the interface stops moving, and a fast
 * animation is still an animation.
 */
export function transitionPlan(input: {
  effect: TransitionEffect
  easing: TransitionEasing
  /** Already-resolved duration (see `resolveFadeMs`). */
  durationMs: number
  canAnimate: boolean
  reducedMotion: boolean
}): TransitionPlan {
  const still: LayerStyle = { opacity: '1', transform: 'none' }
  const moves = input.durationMs > 0
  if (!input.canAnimate || input.reducedMotion || input.effect === 'none' || !moves) {
    // Nothing animates: the layer is put straight on its end state, and the
    // `transition: none` is part of the answer because the previous switch may
    // have left a transition on this very element.
    return { animate: false, durationMs: 0, from: still, to: still, transition: 'none', willChange: '' }
  }
  const props = animatedProps(input.effect)
  const timing = `${input.durationMs}ms ${input.easing}`
  return {
    animate: true,
    durationMs: input.durationMs,
    from: { opacity: '0', transform: START_TRANSFORM[input.effect] },
    to: still,
    transition: props.map(p => `${p} ${timing}`).join(', '),
    willChange: props.join(', '),
  }
}
