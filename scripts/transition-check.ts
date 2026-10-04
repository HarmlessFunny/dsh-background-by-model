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
import { paletteFadeAllowed, paletteFadeCss, paletteFadeInline } from '../src/client/palette-fade.ts'
import type { TransitionConfig, TransitionEffect, TransitionEasing } from '../src/schema.ts'

let failures = 0
function check(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

const t = (patch: Partial<TransitionConfig> = {}): TransitionConfig => ({
  effect: 'fade', easing: 'ease', durationMs: 320, ...patch,
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
// There is exactly ONE duration for every switch: a rule has no notion of a
// transition, and the per-rule field this replaced had no control anywhere.
check('the global duration is the one used', resolveFadeMs(t({ durationMs: 700 })), 700)
check('a deliberate hard cut is kept', resolveFadeMs(t({ durationMs: 0 })), 0)
// Asking for no animation and asking for 0 ms are the same request, and the
// effect is the more explicit of the two.
check('effect none beats a long duration', resolveFadeMs(t({ effect: 'none', durationMs: 3000 })), 0)
check('a negative duration is a hard cut, not a default', resolveFadeMs(t({ durationMs: -5 })), 0)
check('a non-finite duration is a hard cut, not a default', resolveFadeMs(t({ durationMs: NaN })), 0)

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
for (const cfg of [t(), t({ durationMs: 900 }), t({ effect: 'none' }), t({ effect: 'zoom', durationMs: 0 })]) {
  const ms = resolveFadeMs(cfg)
  check(`plan and resolve agree for ${JSON.stringify(cfg)}`, plan({ effect: cfg.effect, durationMs: ms }).durationMs, ms)
}

console.log('\n--- the palette fade rides the same switch, on registered tokens ---')
// A colour change is one rewrite of `body{…}`, so it snaps unless the tokens are
// REGISTERED as colours; the fade is the same duration and the same vetoes as the
// wallpaper by construction (both come from `transitionPlan`), which is also what
// the wiring in ./wallpaper is checked for in `check:repaint`.
const INIT = {
  '--dsw-alias-bg-base': 'rgb(255, 255, 255)',
  '--dsw-alias-label-primary': 'rgb(0, 0, 0)',
}
const fade = paletteFadeCss({
  // Two elements that DECLARE tokens: the body declares both, the dialog only the
  // first — the shape the plugin's own two re-scoping rules have.
  scopes: [
    { selector: 'body', tokens: ['--dsw-alias-bg-base', '--dsw-alias-label-primary'] },
    { selector: '.dlg', tokens: ['--dsw-alias-bg-base'] },
  ],
  initial: INIT, written: Object.keys(INIT), durationMs: 320, easing: 'ease',
})
check('each token is registered as an interpolable colour',
  (fade.match(/@property --dsw-alias-[a-z-]+\{syntax:'<color>';inherits:true;initial-value:rgb\(/g) ?? []).length, 2)
check('the registration carries the host value as its initial',
  fade.includes('initial-value:rgb(255, 255, 255)'), true)
check('the transition runs on the switch duration and easing',
  fade.includes('--dsw-alias-bg-base 320ms ease'), true)
check('every token an element declares is in that element\'s transition list',
  fade.includes('body{transition:--dsw-alias-bg-base 320ms ease,--dsw-alias-label-primary 320ms ease}'), true)
check('and it is declared on every element that re-declares the tokens',
  fade.includes('.dlg{transition:--dsw-alias-bg-base 320ms ease}'), true)
// THE invariant this shape exists for. An element that only INHERITS a token must
// not be given a transition for it: the transition then targets the value that
// element sees at arm time, which — while its ancestor is itself interpolating —
// is still the OLD one, so it drags its whole subtree behind a lagged copy of the
// palette and releases it only when the animation ends. That is exactly how the
// settings dialog froze every control inside it for a whole wallpaper switch.
check('a scope is never given a token it only inherits',
  fade.includes('.dlg{transition:--dsw-alias-label-primary'), false)
check('a scope with nothing of its own emits no rule',
  paletteFadeCss({
    scopes: [{ selector: '.empty', tokens: ['--dsw-alias-not-published'] }, { selector: 'body', tokens: ['--dsw-alias-bg-base'] }],
    initial: INIT, written: Object.keys(INIT), durationMs: 320, easing: 'ease',
  }).includes('.empty'), false)

console.log('\n--- and only a token the palette IN FORCE writes may animate ---')
// The other half of "does this element declare it": does the palette being painted
// actually WRITE it? The registrations cover every name some palette can write —
// they have to, or a later light→dark change would find the dark names
// unregistered — and that is a strictly larger set than the palette in force
// writes: the light branch emits roughly thirty fewer aliases than the dark one
// (the bubble, the selector, the tip, tooltip/toast, toolbar and markdown state
// tokens). A name outside the written set still takes its value from the HOST, and
// the host changes those on a schedule of its own: it re-asserts its own scheme on
// mount and on settings adoption, and the plugin's own theme dispose/re-register
// makes the host reset the preference to `system` for the length of that call. A
// transition on such a name is this plugin animating a decision it does not own,
// at its own duration — reported as "白色色块会渐变为黑色色块…白色渐变完黑色后立马切到
// 白色": the user message bubble is `#edf3fe` in the host's light scheme and
// `#2c2c2e` in its dark one, and the fade sheet had registered that very name.
const SPLIT_INIT = { ...INIT, '--dsw-specific-bubble': 'rgb(237, 243, 254)' }
const narrowed = paletteFadeCss({
  scopes: [
    { selector: 'body', tokens: ['--dsw-alias-bg-base', '--dsw-specific-bubble'] },
    { selector: '.plate', tokens: ['--dsw-specific-bubble'], properties: ['background-color'] },
  ],
  initial: SPLIT_INIT,
  written: ['--dsw-alias-bg-base'],
  durationMs: 320, easing: 'ease',
})
check('a registered token the palette does not write is still registered',
  narrowed.includes('@property --dsw-specific-bubble'), true)
check('but it is not animated by the plugin', narrowed.includes('--dsw-specific-bubble 320ms'), false)
check('while the token the palette does write still fades',
  narrowed.includes('body{transition:--dsw-alias-bg-base 320ms ease}'), true)
check('a scope left with only unwritten tokens keeps its standard property',
  narrowed.includes('.plate{transition:background-color 320ms ease}'), true)
check('and none of those tokens reaches its transition list',
  narrowed.includes('.plate{transition:--dsw'), false)
// The written set is intersected with the registrations, never unioned into them:
// a name the palette writes but the host cannot answer for cannot interpolate
// either, and a transition on it would only lengthen the list.
check('a written name the host does not publish still gets no transition',
  paletteFadeCss({
    scopes: [{ selector: 'body', tokens: ['--dsw-specific-bubble', '--dsw-alias-bg-base'] }],
    initial: INIT, written: ['--dsw-specific-bubble', '--dsw-alias-bg-base'],
    durationMs: 320, easing: 'ease',
  }).includes('--dsw-specific-bubble 320ms'), false)
// 0 ms is "do not animate", not "animate for no time": the registrations stay
// (they cost nothing and are what makes a LATER fade possible) and no transition
// rule is emitted at all — which is also what keeps a slider drag instant, since
// a drag rewrites the same token block on every frame.
const fadeOff = paletteFadeCss({ scopes: [{ selector: 'body', tokens: Object.keys(INIT) }], initial: INIT, written: Object.keys(INIT), durationMs: 0, easing: 'ease' })
check('a zero duration emits no transition rule', fadeOff.includes('transition:'), false)
check('but still registers the tokens', fadeOff.includes('@property'), true)
check('no tokens means no CSS (nothing is invented)',
  paletteFadeCss({ scopes: [{ selector: 'body', tokens: ['--dsw-alias-bg-base'] }], initial: {}, written: [], durationMs: 320, easing: 'ease' }), '')
check('a name that is not a custom property is ignored',
  paletteFadeCss({ scopes: [{ selector: 'body', tokens: ['color'] }], initial: { color: 'rgb(0,0,0)' }, written: ['color'], durationMs: 320, easing: 'ease' }), '')
// The elements the plugin paints INLINE do not read the registered tokens, so
// they carry the standard property instead — and 0 must be `none`, never an empty
// value that would leave the host's own transition in place.
check('inline: the same duration on background-color', paletteFadeInline(320, 'ease'), 'background-color 320ms ease')
check('inline: zero disarms instead of inheriting', paletteFadeInline(0, 'ease'), 'none')

console.log('\n--- a surface painted from a plugin-OWNED variable names the property ---')
// The second way a surface is painted, and the one no registration can reach: the
// settings dialog's plate, the file-preview panel and the Cordis panel read a
// colour the plugin owns as a PLAIN variable on <html> (`--dsh-any-…`), not a
// registered alias token. An unregistered variable cannot interpolate, so there is
// no token to register and none to transition — the element's own
// `background-color` is what moves, and naming it here is the whole fix. It must
// NOT be filtered against the registered names the way a token is: a property name
// is not something the host publishes.
const own = paletteFadeCss({
  scopes: [
    { selector: '.plate', tokens: [], properties: ['background-color'] },
    { selector: '.chip', tokens: ['--dsw-alias-bg-base'], properties: ['background-color'] },
    { selector: '.empty', tokens: [], properties: [] },
  ],
  initial: INIT, written: Object.keys(INIT), durationMs: 320, easing: 'ease',
})
check('a scope with only a standard property still emits its rule',
  own.includes('.plate{transition:background-color 320ms ease}'), true)
check('and it rides the same duration and easing as the tokens',
  own.includes('.chip{transition:--dsw-alias-bg-base 320ms ease,background-color 320ms ease}'), true)
check('a scope with neither a token nor a property emits nothing', own.includes('.empty'), false)
check('a standard property is never registered as a colour', own.includes('@property background-color'), false)
check('and a scope whose only token is unregistered keeps its property',
  paletteFadeCss({
    scopes: [{ selector: '.plate', tokens: ['--dsw-alias-not-published'], properties: ['background-color'] }],
    initial: INIT, written: [], durationMs: 320, easing: 'ease',
  }).includes('.plate{transition:background-color 320ms ease}'), true)
// 0 ms disarms this half too: a slider drag rewrites the same variables, and a
// live transition on them would make the plate lag behind the slider.
check('a zero duration disarms the standard property as well',
  paletteFadeCss({
    scopes: [{ selector: '.plate', tokens: [], properties: ['background-color'] }],
    initial: INIT, written: Object.keys(INIT), durationMs: 0, easing: 'ease',
  }).includes('transition:'), false)

console.log('\n--- but a light/dark FLIP is not a tint, so it does not fade ---')
// Interpolating between the two palettes walks the interface through mid-tones
// whose ink is wrong in both directions, which is worse than the switch it would
// replace. The wallpaper keeps its own animation either way: it has no scheme.
check('light -> light fades', paletteFadeAllowed('light', 'light'), true)
check('dark -> dark fades', paletteFadeAllowed('dark', 'dark'), true)
check('light -> dark does NOT fade', paletteFadeAllowed('light', 'dark'), false)
check('dark -> light does NOT fade', paletteFadeAllowed('dark', 'light'), false)
// The first apply after a load has no previous colour to come from.
check('nothing painted yet does not fade', paletteFadeAllowed(null, 'dark'), false)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
