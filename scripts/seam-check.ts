/**
 * Checks the copies painted behind the host's two paint bands — `pnpm check:seam`.
 *
 * WHY THIS EARNS A CHECK OF ITS OWN. The seam section couples the plugin to host
 * DOM and CSS that it does not own: `[data-composer-seat]`, `[data-plugin-bar]
 * [data-natural]`, and the `--dsh-any-opaque-bg` variable it has to publish for
 * the fallback to be opaque at all. Every one of those is a name the host can
 * change in a release, and when it does the failure is silent in the worst way:
 * the copies simply stop being made, the bands fall back to a flat fill, and the
 * wallpaper is cut off at a straight line again — the exact bug this section
 * fixed — with nothing in the console and nothing red.
 *
 * The assertions below are the contract, not the implementation: two bands with
 * DIFFERENT washes, a copy that is a CHILD (never a fixed layer, which the seat's
 * `will-change:transform` would re-anchor), the stacking-context gate that keeps a
 * restyled host from becoming a transparent hole over live text, and the
 * opaque-background variable every fallback reads.
 *
 * They are textual because the section is DOM code that cannot run on plain node.
 * The two that CAN be behavioural are: `hooks()` reads the exported style rule
 * itself rather than a copy of its selectors, and the convergence test below
 * asserts the shape of the guard that `watchParts` uses — the one thing about
 * this section that was wrong in 0.12.5 and is easy to write wrong again.
 *
 * Runs on plain `node` (≥ 22.6 strips the types itself), no dependency, no
 * transform, no browser.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (rel: string): string => readFileSync(resolve(HERE, '..', rel), 'utf8')
const WALLPAPER = read('src/client/wallpaper.ts')
const ENTRY = read('src/client/index.tsx')

let failures = 0
function check(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

/** A named slice of the module, so an assertion cannot match in the wrong place. */
function slice(name: string, from: string, to: string): string {
  const start = WALLPAPER.indexOf(from)
  const end = start < 0 ? -1 : WALLPAPER.indexOf(to, start + from.length)
  return start < 0 || end < 0 ? '' : WALLPAPER.slice(start, end)
}

// ── 1. The two bands, and the two washes ────────────────────────────────────
console.log('--- the two paint bands, and the wash each one needs ---')
const SEAM_SPECS = slice('specs', 'const SEAM_SPECS: SeamSpec[] = [', '\n]')

check('the composer seat is targeted by its own data attribute, not a hashed class',
  /\[data-composer-seat\]/.test(SEAM_SPECS), true)
check('and gated on the phases the host only paints its mask in',
  /\[data-phase="active"\]/.test(SEAM_SPECS) && /\[data-content-phase="active"\]/.test(SEAM_SPECS), true)
check('the plugin page bar is targeted by its own attributes, not a hashed class',
  /\[data-plugin-bar\]\[data-natural\]/.test(SEAM_SPECS), true)

// The washes MUST differ: the composer sits in the centre column (main-bg alpha)
// while a function page paints itself at the page opacity. One shared tint would
// leave one of the two bands a shade off the surface it sits in — the seam this
// whole section exists to make invisible.
const TINTS = [...SEAM_SPECS.matchAll(/tint: '([^']+)'/g)].map(m => m[1])
check('there are exactly two bands', TINTS.length, 2)
check('their washes are NOT the same colour expression',
  TINTS.length === 2 && TINTS[0] !== TINTS[1], true)
check('the composer takes the main-background alpha',
  TINTS[0], 'var(--dsh-any-op-bg,var(--dsh-any-opaque-bg))')
check('the page bar takes the page opacity, and is transparent when the page is',
  TINTS[1], 'var(--dsh-any-bg-page,transparent)')
check('the composer band fades over the host\'s own 36px',
  /top: false,\s*ramp: 36,/.test(SEAM_SPECS), true)
check('the page bar paints to the host\'s paint height, not its box',
  /top: true,\s*ramp: 0,/.test(SEAM_SPECS), true)

// ── 2. The copy is a child, never a fixed layer ─────────────────────────────
console.log('--- the copy is a child of the band, at a negative z-index ---')
const CREATE = slice('createSeam', 'function createSeam(', '\n}\n')
check('the wrapper is absolutely positioned inside the band',
  /position:absolute/.test(CREATE), true)
check('it carries a negative z-index, so it paints under the band\'s own text',
  /z-index:-1/.test(CREATE), true)
check('and it is NOT fixed — the seat\'s will-change:transform would re-anchor it',
  /position:fixed/.test(CREATE), false)
check('it cannot swallow pointer events',
  /pointer-events:none/.test(CREATE), true)
// The band itself is the containing block for a negative-z child only while it
// forms a stacking context, which is why the gate below has to exist.
check('the host is checked for a stacking context before the copy takes over',
  /function hostStacks\(/.test(WALLPAPER) && /hostStacks\(host\)/.test(WALLPAPER), true)
check('and a band with no copy is handed back to the opaque fallback',
  /function hideSeam\(/.test(WALLPAPER) && /hideSeam\(e\)/.test(WALLPAPER), true)

// Three layers: opaque base (text can never show through), the picture, the wash.
const CHILDREN = [...CREATE.matchAll(/dataset\.dabSeam\w* = ''/g)].length
check('the copy stacks three layers', CHILDREN, 4) // wrapper + colour + image + tint
check('the bottom layer is the opaque base colour',
  /background:var\(--dsh-any-opaque-bg,var\(--dsw-alias-bg-base\)\)/.test(CREATE), true)

// ── 3. The fallback rule, in both directions ────────────────────────────────
console.log('--- the fallback rule, before and after a copy is installed ---')
const RULE = slice('SEAM_STYLE_RULE', 'export const SEAM_STYLE_RULE =', '\n\ninterface SeamEntry')
for (const [label, pattern] of [
  ['composer without a copy paints the opaque gradient',
    /\[data-composer-seat\]:not\(\[\$\{SEAM_HOST_ATTR\}\]\)\{background:linear-gradient/],
  ['composer with a copy paints nothing',
    /\[data-composer-seat\]\[\$\{SEAM_HOST_ATTR\}\]\{background:transparent/],
  ['page bar without a copy paints the opaque fill',
    /:not\(\[\$\{SEAM_HOST_ATTR\}\]\)::before\{background:var\(--dsh-any-opaque-bg/],
  ['page bar with a copy paints nothing',
    /\[data-plugin-bar\]\[data-natural\]\[\$\{SEAM_HOST_ATTR\}\]::before\{background:transparent/],
] as const) {
  check(label, pattern.test(RULE), true)
}
// Every branch reads the OPAQUE variable, never the translucent token it is
// derived from: a fallback that fell back to `--dsw-alias-bg-base` would be the
// transparent hole this rule exists to rule out.
check('the rule never falls back to a translucent token as the band fill',
  /\[data-composer-seat\][^{]*\{background:(?!linear-gradient|transparent)/.test(RULE), false)

// ── 4. The variable that makes the fallback opaque ─────────────────────────
console.log('--- --dsh-any-opaque-bg: the colour before any opacity is applied ---')
check('it is published beside the palette tokens',
  /--dsh-any-opaque-bg:\$\{opaqueBg\}/.test(WALLPAPER), true)
check('and it is taken from the base token BEFORE the alpha is applied',
  /const opaqueBg = tokens\['--dsw-alias-bg-base'\]/.test(WALLPAPER), true)
// Written once per palette rebuild, in the same `decls` block that emits the
// tokens: anywhere else and it could describe a palette that is no longer live.
const TOKEN_WRITE = slice('applyCustomTokensNow', 'function applyCustomTokensNow(', '\n}\n')
check('it is emitted inside the token rebuild, not on a separate beat',
  /opaqueBg/.test(TOKEN_WRITE), true)

// ── 5. Wiring: one boot pass, one teardown, and the same beat as the layer ──
console.log('--- wiring: mounted once, torn down with the wallpaper ---')
check('the entry imports and mounts the watcher',
  /watchSeams/.test(ENTRY) && /refreshSeams\(\)/.test(ENTRY), true)
check('the rule is appended to the plugin\'s own sheet',
  /PLACEHOLDER_RULE \+ SEAM_STYLE_RULE/.test(ENTRY), true)
const TEARDOWN = slice('teardownWp', 'export function teardownWp', '\n}\n')
check('teardown removes every copy AND stops watching',
  /removeSeams\(\)/.test(TEARDOWN) && /stopWatchingSeams\(\)/.test(TEARDOWN), true)
check('and it does so from inside teardownWp, not merely defines the functions',
  TEARDOWN.length > 0, true)
check('a full apply repaints the copies on the same beat as the layer',
  /applyInterfaceParts\(paletteMoved\)[\s\S]{0,400}?scheduleSeams\(\)/.test(WALLPAPER), true)
check('a wallpaper-opacity drag moves them',
  /export function setWpOpacity[\s\S]*?scheduleSeams\(\)/.test(WALLPAPER), true)
check('a brightness / blur drag moves them',
  /export function setWpFilter[\s\S]*?scheduleSeams\(\)/.test(WALLPAPER), true)

// A copy must never be left behind by an unmount, and must be re-attached when a
// host re-render drops it (React removes children it did not create).
check('a dropped copy is re-attached before anything else',
  /if \(!host\.contains\(wrap\)\)/.test(WALLPAPER), true)
check('a band that unmounted takes its copy with it',
  /seamEntries\.delete\(host\)/.test(WALLPAPER), true)

// ── 6. The convergence guard — the 0.12.5 bug ──────────────────────────────
console.log('--- the convergence guard: only a band change asks for another pass ---')
const WATCH = slice('watchParts', 'export function watchParts()', '\n}\n')

// The bug: `seamEntries.size < SEAM_SPECS.length` compares the number of bands
// FOUND against the number of specs, but the two bands are ALTERNATIVES. A
// conversation holds one entry against two specs, so the test was true on every
// body mutation — scheduling a layout-reading pass per frame of a streamed reply,
// in exactly the state it was written to settle down in.
check('the guard does not compare the entry count against the spec count',
  /seamEntries\.size\s*<\s*SEAM_SPECS\.length/.test(WALLPAPER), false)
check('it is driven by the mutation records instead',
  /mutationTouchesSeams\(records\)/.test(WATCH), true)
check('and the observer callback actually receives them',
  /new MutationObserver\(records =>/.test(WATCH), true)

const TOUCHES = slice('mutationTouchesSeams', 'function mutationTouchesSeams(', '\n}\n')
check('both additions and removals are inspected',
  /record\.addedNodes/.test(TOUCHES) && /record\.removedNodes/.test(TOUCHES), true)
check('a copy dropped by the host counts as a band change',
  /data-dab-seam/.test(TOUCHES), true)
check('text nodes are skipped without touching the DOM',
  /instanceof Element/.test(TOUCHES), true)
check('no layout read is reached from the guard itself',
  /getBoundingClientRect|getComputedStyle/.test(TOUCHES), false)

// ── 7. The framing, copied from the layer rather than re-derived ────────────
console.log('--- the copy is placed from the SAME reads the main layer uses ---')
const PAINT = slice('paintSeam', 'function paintSeam(', '\n}\n')
for (const [label, pattern] of [
  ['the layout mode', /rBgMode\(\)/],
  ['the framing (zoom / pan)', /rBgState\(\)/],
  ['the brightness', /rBrightness\(\)/],
  ['the blur', /rBl\(\)/],
] as const) {
  check(`it reads ${label} from the store, never from a copy of its own`,
    pattern.test(PAINT), true)
}
check('all five layout modes are handled, as in paintLayer',
  ['fit', 'fill', 'stretch', 'tile', 'center'].every(m => PAINT.includes(`'${m}'`)), true)
check('the blur pad keeps the same +pad relationship writeLayerBox keeps',
  /wpBlurPad\(blur\)/.test(PAINT) && /posX \+ pad/.test(PAINT), true)
// The layer's own opacity is the container's; the copy has no container, so it
// has to apply that alpha itself or the picture would come out at full strength.
check('the container\'s own alpha is applied by the copy',
  /opacity = String\(wpAlpha\)/.test(PAINT), true)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
