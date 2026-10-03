/**
 * Checks for the wallpaper-switch transition's DECISION — `pnpm check:transition`.
 *
 * The layers and the rAF that run a switch live in the plugin's apply closure and
 * cannot be exercised without a browser, but everything the switch decides with
 * is pure and lives in `src/client/transition.ts`. Each of the failures it can
 * produce is silent — nothing throws, the wallpaper simply stops moving, or moves
 * in a way nobody asked for:
 *
 *   1. a start state equal to the end state (an effect that visibly does nothing,
 *      which is indistinguishable from "the setting was not saved");
 *   2. `none`, a `0` duration and a `0` unified duration each failing to mean
 *      "hard cut";
 *   3. `reduced-motion` not vetoing, or vetoing the wrong way round;
 *   4. a duration that is not a number animating anyway;
 *   5. an effect that leaves the incoming layer scaled or transparent (the stale
 *      `transform` that would leave every later wallpaper cropped by 6%);
 *   6. `fade` ceasing to be byte-for-byte the cross-fade earlier releases ran.
 *
 * Runs on plain `node` (≥ 22.6 strips the types itself), no dependency, no
 * transform — the same shape as `scripts/rotation-check.ts`, and for the same
 * reason it imports nothing from `src/schema.ts`.
 */
import { resolveFadeMs, transitionPlan } from '../src/client/transition.ts'
import type { TransitionConfig, TransitionEffect, TransitionEasing } from '../src/schema.ts'

let failures = 0
function check(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

const t = (patch: Partial<TransitionConfig> = {}): TransitionConfig => ({
  effect: 'fade', easing: 'ease', durationMode: 'per-rule', durationMs: 320, ...patch,
})

const plan = (patch: Partial<Parameters<typeof transitionPlan>[0]> = {}) =>
  transitionPlan({ effect: 'fade', easing: 'ease', durationMs: 320, canAnimate: true, reducedMotion: false, ...patch })

console.log('--- the shipped default is the cross-fade we already had ---')
check('a default switch animates', plan().animate, true)
check('and runs for its full duration', plan().durationMs, 320)
check('starting invisible', plan().from, { opacity: '0', transform: 'none' })
check('and landing visible', plan().to, { opacity: '1', transform: 'none' })
// The exact string the previous implementation wrote. A global setting that
// changed the DEFAULT switch would be a regression dressed as a feature.
check('on exactly the old transition string', plan().transition, 'opacity 320ms ease')
check('with exactly the old compositor hint', plan().willChange, 'opacity')

console.log('\n--- which duration one switch uses ---')
check('per-rule mode uses the rule\'s own', resolveFadeMs(t(), 700), 700)
check('per-rule mode keeps a deliberate hard cut', resolveFadeMs(t(), 0), 0)
check('unified mode uses the global one', resolveFadeMs(t({ durationMode: 'unified', durationMs: 120 }), 700), 120)
check('unified mode keeps a deliberate hard cut', resolveFadeMs(t({ durationMode: 'unified', durationMs: 0 }), 700), 0)
// Asking for no animation and asking for 0 ms are the same request, and the
// effect is the more explicit of the two.
check('effect none beats a long rule duration', resolveFadeMs(t({ effect: 'none' }), 3000), 0)
check('effect none beats a long unified duration', resolveFadeMs(t({ effect: 'none', durationMode: 'unified', durationMs: 3000 }), 3000), 0)
check('a negative duration is a hard cut, not a default', resolveFadeMs(t(), -5), 0)
check('a non-finite duration is a hard cut, not a default', resolveFadeMs(t({ durationMode: 'unified', durationMs: NaN }), 700), 0)

console.log('\n--- "nothing to animate from" and reduced motion both veto ---')
// The first paint after a boot, and a wallpaper the user set to 0% opacity.
check('no previous layer means no animation', plan({ canAnimate: false }).animate, false)
check('and the layer is simply visible', plan({ canAnimate: false }).to, { opacity: '1', transform: 'none' })
check('reduced motion vetoes a zoom', plan({ effect: 'zoom', durationMs: 1000, reducedMotion: true }).animate, false)
// A fast animation is still an animation: the preference is honoured as a veto,
// never as "a shorter one".
check('reduced motion is a veto, not a shorter duration', plan({ reducedMotion: true }).durationMs, 0)
check('a vetoed switch carries no transition', plan({ reducedMotion: true }).transition, 'none')
check('a vetoed switch asks for no compositor layer', plan({ reducedMotion: true }).willChange, '')

console.log('\n--- effect none and a zero duration are both hard cuts ---')
check('effect none does not animate', plan({ effect: 'none' }).animate, false)
check('a zero duration does not animate', plan({ durationMs: 0 }).animate, false)
check('a zero duration still lands visible', plan({ durationMs: 0 }).to, { opacity: '1', transform: 'none' })
check('a non-numeric duration does not animate', plan({ durationMs: NaN }).animate, false)

console.log('\n--- each effect moves the way it says ---')
const EFFECTS: TransitionEffect[] = ['fade', 'zoom', 'slide']
for (const effect of EFFECTS) {
  const p = plan({ effect })
  // The one assertion that catches "I picked the new effect and nothing
  // happened": every effect must start somewhere other than where it ends.
  check(`${effect} starts away from its end state`, p.from.opacity !== p.to.opacity || p.from.transform !== p.to.transform, true)
  // …and the other half: whatever it did, the layer ends fully visible and
  // unscaled. A zoom that never resets would crop every later wallpaper.
  check(`${effect} lands visible and unscaled`, p.to, { opacity: '1', transform: 'none' })
  check(`${effect} animates`, p.animate, true)
}
check('zoom pushes in from above 1', plan({ effect: 'zoom' }).from.transform, 'scale(1.06)')
check('slide pushes in from the side', plan({ effect: 'slide' }).from.transform, 'translateX(6%)')
// `fade` must not put an unchanged property on its transition list: that is the
// difference between the shipped default and the cross-fade it replaces.
check('fade animates opacity only', plan({ effect: 'fade' }).transition, 'opacity 320ms ease')
check('zoom animates opacity AND transform', plan({ effect: 'zoom' }).transition, 'opacity 320ms ease, transform 320ms ease')
check('slide animates opacity AND transform', plan({ effect: 'slide' }).transition, 'opacity 320ms ease, transform 320ms ease')
check('a transform effect hints the compositor about it', plan({ effect: 'zoom' }).willChange, 'opacity, transform')

console.log('\n--- the easing and the duration reach the stylesheet ---')
const EASINGS: TransitionEasing[] = ['ease', 'linear', 'ease-out', 'ease-in-out']
for (const easing of EASINGS) {
  check(`${easing} reaches the transition`, plan({ easing }).transition, `opacity 320ms ${easing}`)
}
check('the resolved duration is what is written', plan({ durationMs: 1500 }).transition, 'opacity 1500ms ease')
check('the plan reports the duration it will use', plan({ durationMs: 1500 }).durationMs, 1500)
// The two halves must agree: whatever `resolveFadeMs` hands over is what the plan
// animates with — a mismatch is a switch that writes one duration and runs another.
for (const cfg of [t(), t({ durationMode: 'unified', durationMs: 900 }), t({ effect: 'none' })]) {
  const ms = resolveFadeMs(cfg, 700)
  check(`plan and resolve agree for ${JSON.stringify(cfg)}`, plan({ effect: cfg.effect, durationMs: ms }).durationMs, ms)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
