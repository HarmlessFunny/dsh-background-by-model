/**
 * Checks for the repaint decision — `pnpm check:repaint`.
 *
 * An edit lands in the config either way, so a missed repaint is not an error
 * anywhere: the panel shows the new value and only the interface behind it stays
 * on the previous rule ("更新的不太及时，只有我动调色盘或者切模型的时候才出现").
 * That is the failure this file exists to pin down, in two halves:
 *
 *   1. the DECISION (`shouldRepaint`, in `src/client/repaint.ts`) is pure, so the
 *      whole truth table is checked here — including the case that kept breaking:
 *      an edit that CREATES the winner (a rule's first picture, its first or
 *      auto-extracted color) must repaint even though the edited rule was not the
 *      active one when the question was asked;
 *   2. every write path in `src/client/index.tsx` actually ASKS that decision.
 *      The check below is textual on purpose: the entry file is where a new
 *      action gets added, and a new action that copies the old
 *      `if (id === activeRuleId) applyActive() else sync()` idiom is exactly how
 *      this bug would come back.
 *
 * Runs on plain `node` (Node ≥ 22.6 strips the types itself), no dependency, no
 * transform — the same shape as `scripts/rotation-check.ts`.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shouldRepaint } from '../src/client/repaint.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENTRY = resolve(HERE, '../src/client/index.tsx')
const source = readFileSync(ENTRY, 'utf8')

let failures = 0
function check(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

console.log('--- shouldRepaint: an edit that creates the winner repaints ---')
// The reported bug, exactly: nothing was painting, the edit makes THIS rule the
// one that paints (a first picture, a first color) — and the old test asked "is
// it already the active rule?" and answered no.
check('the edited rule becomes the winner (nothing was painting)', shouldRepaint('r1', null, 'r1'), true)
check('the edited rule becomes the winner (another rule was painting)', shouldRepaint('r2', 'r1', 'r2'), true)
// The mirror image: the edit takes the winner away (the last picture, or the
// color, removed from the rule on screen).
check('the edited rule stops being the winner', shouldRepaint('r1', 'r1', null), true)
check('the edited rule hands over to the next rule', shouldRepaint('r1', 'r1', 'r2'), true)

console.log('\n--- and does not repaint when nothing on screen can move ---')
check('an edit to a rule that is not painting', shouldRepaint('r3', 'r1', 'r1'), false)
check('an edit while nothing paints at all', shouldRepaint('r3', null, null), false)
// The redundant-but-intended half: the resolution did not move, but the rule that
// IS painting changed its own look (a color, a slider) — the skin has to follow.
check('the painting rule changes its own look', shouldRepaint('r1', 'r1', 'r1'), true)
// A stale tracker: the rule was already the winner, but the page had not recorded
// it as the active one (the state `repaintIfMoved` also repairs).
check('the winner was not the tracked active rule', shouldRepaint('r1', 'r2', 'r1'), true)

console.log('\n--- every write path asks it ---')
// `setRuleRotation` is deliberately absent: the rotate flags do not feed
// `ruleCanPaint` or `matchRule`, so they cannot move the resolution (they only
// re-arm the timer, which `scheduleRotation` does on its own).
const ACTIONS = [
  'setRule',
  'addRuleImages',
  'removeRuleImage',
  'moveRuleImageTo',
  'setImageFraming',
  'setImageColor',
  'setRuleImage',
  'addRuleImageFromUrl',
  'extractColor',
]
const actions = [...source.matchAll(/\n {6}([A-Za-z_$][\w$]*): /g)].map(m => m[1]!)

for (const name of ACTIONS) {
  const at = source.indexOf(`\n      ${name}: `)
  if (at < 0) { check(`action ${name} is still there`, false, true); continue }
  // A body ends at the next action, which the file writes as `      },` + a
  // 6-space-indented key.
  const end = source.indexOf('\n      },\n', at)
  const body = end < 0 ? source.slice(at) : source.slice(at, end)
  check(`${name} samples the winner before editing`, /const winner = winnerId\(\)/.test(body), true)
  check(`${name} closes with repaintIfMoved`, /repaintIfMoved\(id, winner\)/.test(body), true)
}

// `maybeAutoExtract` is not an action: it is the async tail of an upload, and the
// color it computes arrives after that upload's own repaint.
const autoAt = source.indexOf('const maybeAutoExtract = async')
check('maybeAutoExtract is still there', autoAt >= 0, true)
if (autoAt >= 0) {
  const body = source.slice(autoAt, source.indexOf('\n  }\n', autoAt))
  check('maybeAutoExtract samples the winner on arrival', /const winner = winnerId\(\)/.test(body), true)
  check('maybeAutoExtract closes with repaintIfMoved', /repaintIfMoved\(id, winner\)/.test(body), true)
}

console.log('\n--- one upload themes its whole batch ---')
// "一次上传了多张图片，似乎只有最后一张会被自动选主题色": the extraction was
// addressed by LIST POSITION (`rule.images[length - 1]`), which is the right
// answer for a one-file upload and silently the wrong one for a batch — the other
// pictures of the rotation stayed on the system theme. It is now addressed by the
// slots the upload itself just appended, so every file of the batch is themed.
const eachAt = source.indexOf('const maybeAutoExtractEach = async')
check('the batch form of the extraction is still there', eachAt >= 0, true)
if (eachAt >= 0) {
  const body = source.slice(eachAt, source.indexOf('\n  }\n', eachAt))
  check('the batch form walks every slot it was handed', /for \(const slot of slots\) await maybeAutoExtract\(id, slot\)/.test(body), true)
}
const uploadAt = source.indexOf('\n      addRuleImages: ')
check('addRuleImages is still there', uploadAt >= 0, true)
if (uploadAt >= 0) {
  const body = source.slice(uploadAt, source.indexOf('\n      },\n', uploadAt))
  check('an upload records the slots of its own batch', /added\.push\(slot\)/.test(body), true)
  check('an upload themes the whole batch', /maybeAutoExtractEach\(id, added\)/.test(body), true)
  // The exact shape of the bug, so it cannot come back as a "small" edit: a batch
  // that reaches for one image of the rule by position.
  check('an upload no longer themes a single image of the rule', /maybeAutoExtract\(id, rule\.images\[/.test(body), false)
}

console.log('\n--- a rotation step re-emits the palette too ---')
// The 0.7.1 half of the same failure, one step further out: a theme color belongs
// to an IMAGE, so moving the rotation from picture 1 to picture 2 changes the
// interface palette exactly as much as a model switch does. Without this the
// color would arrive only when something else re-ran an apply — dragging the
// color wheel, switching models — which is the reported symptom verbatim.
// `paintImage` is the single funnel every step goes through (`rotateTick`, and
// the manual "next" button), so it is the one place that must ask.
const paintAt = source.indexOf('const paintImage = (')
check('paintImage is still the one place a step paints', paintAt >= 0, true)
if (paintAt >= 0) {
  const body = source.slice(paintAt, source.indexOf('\n  }\n', paintAt))
  check('paintImage re-emits the palette', /applyPalette\(\)/.test(body), true)
}
const paletteAt = source.indexOf('const applyPalette = ')
check('applyPalette exists', paletteAt >= 0, true)
if (paletteAt >= 0) {
  const body = source.slice(paletteAt, source.indexOf('\n  }\n', paletteAt))
  // The color in force is `activeColor()` (the painted image's, else the rule's)
  // and never the rule's alone — reading `rule.color` here is the per-image
  // feature silently not working on the active rule.
  check('applyPalette reads the color in force', /const color = activeColor\(\)/.test(body), true)
}
const activeAt = source.indexOf('const applyActive = ')
check('applyActive still exists', activeAt >= 0, true)
if (activeAt >= 0) {
  const body = source.slice(activeAt, source.indexOf('\n  }\n', activeAt))
  check('applyActive goes through the same palette apply', /applyPalette\(\)/.test(body), true)
}

console.log('\n--- and the old idiom is gone ---')
// The specific text of the regression, so re-introducing it anywhere (including
// in a path this check does not know about) is caught.
const stale = [...source.matchAll(/[^\n]*activeRuleId\s*\)\s*applyActive[^\n]*/g)].map(m => m[0].trim())
check('no write path decides the repaint with `id === activeRuleId`', stale, [])
const sampledElsewhere = [...source.matchAll(/const winner = (?!winnerId\(\))[^\n]*/g)].map(m => m[0].trim())
check('every sampled winner is `winnerId()`', sampledElsewhere, [])
check('repaintIfMoved is defined once', (source.match(/const repaintIfMoved = /g) ?? []).length, 1)

console.log('\n--- a palette change cannot wait for a frame that may never run ---')
// The field bug this section exists for: switching a rule to a DARK theme colour
// left the panel's ink on the PREVIOUS (light) palette while every surface
// followed the new one — dark text on a dark panel, unreadable, cleared only by
// reloading, and absent from the log. The reason it could happen at all is that
// the ink has exactly ONE writer (the token stylesheet) and that write used to be
// reachable only from a `requestAnimationFrame` callback wrapped in `catch {}`:
// a window that is not rendering swallows the frame and the id stays armed, so
// every later update parks behind it, and a failure inside the write disappears.
// A palette change is therefore written SYNCHRONOUSLY (the rAF is left to what it
// was for: coalescing a slider drag, where the palette is already correct), a
// frame older than a second is dropped instead of blocking, and the failure is
// logged. Every one of those is a line a later edit can quietly undo.
const WALLPAPER = resolve(HERE, '../src/client/wallpaper.ts')
const wall = readFileSync(WALLPAPER, 'utf8')

const applyAt = wall.indexOf('export function applyCustomTokens(')
check('applyCustomTokens is still there', applyAt >= 0, true)
if (applyAt >= 0) {
  const body = wall.slice(applyAt, wall.indexOf('\n}\n', applyAt))
  check('a palette that moved is written synchronously',
    /paletteKey\(src, rColor\(\)\) !== baseTokenKey\)\s*\{\s*flushTokens\(\)/.test(body), true)
  check('the frame path is still there for the alphas', /requestAnimationFrame/.test(body), true)
  check('a frame that never ran does not park every later update',
    /cancelAnimationFrame/.test(body), true)
  check('and the frame path runs the same funnel', /flushTokens\(\)/.test(body), true)
}
// One funnel, so no caller can reach the writer while skipping the decision.
check('flushTokens is defined once', (wall.match(/function flushTokens\(/g) ?? []).length, 1)
const nowAt = wall.indexOf('function applyCustomTokensNow(')
check('applyCustomTokensNow is still the one writer', nowAt >= 0, true)
if (nowAt >= 0) {
  const body = wall.slice(nowAt, nowAt + 8000)
  // `catch {}` is the exact text that hid this state: the ink went stale and the
  // console said nothing at all.
  check('the palette writer reports its own failure',
    /catch \(e\)[\s\S]{0,3000}?console\.warn\(/.test(body), true)
  // Comments are stripped before this one: the section above explains the removed
  // `catch {}` in prose, and a check that trips on its own explanation is not a
  // check. Only code is asked whether a failure can disappear without a word.
  const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  check('and never swallows one in silence',
    /catch(\s*\([^)]*\))?\s*\{\s*\}/.test(code), false)
}
// The palette fade is armed by ONE question — may this change fade? — and the
// answer has two halves: the palette moved, and the scheme stayed put. Both are
// asserted here because the call site is where a later edit would drop one.
check('the palette fade is gated on the palette having moved AND the scheme holding',
  /const fadeable = paletteChanged && paletteFadeAllowed\(paletteScheme, scheme\)/.test(wall), true)
check('and that answer is what the writer receives', /applyPaletteFade\(fadeable\)/.test(wall), true)
check('the scheme of the new palette is remembered', /paletteScheme = scheme/.test(wall), true)
check('and it is the same answer the inline-painted surfaces get',
  /applyPartOpacities\(ops, fadeable\)/.test(wall), true)

console.log('\n--- every surface painted from a plugin-OWNED variable is also faded ---')
// The third place this bug class landed. A surface painted from one of the
// plugin's own variables (`--dsh-any-…`, written on <html> with its alpha folded
// in) is NOT painted from a registered alias token, so registering tokens cannot
// reach it: the element snaps in one frame while every surface around it fades.
// The faded half is a `transition` on the element's own standard property, and it
// has to name the SAME selector the paint rule does — which is why both sides now
// read one shared constant. Pairing them here means a new paint site without a
// fade is a failing check rather than a screenshot nobody took.
const PLUGIN_PAINTED = [
  {
    surface: 'the settings dialog plate',
    paint: ['SETTINGS_PANEL_SEL}{', 'background:var(--dsh-any-bg-settings-surface'],
    fade: /selector: SETTINGS_PANEL_SEL,[^}]*properties: \['background-color'\]/,
  },
  {
    surface: 'the file-preview panel',
    paint: ['RIGHTBAR_SEL}{', 'background:var(--dsh-any-bg-rightbar'],
    fade: /selector: RIGHTBAR_SEL,[^}]*properties: \['background-color'\]/,
  },
  {
    surface: 'the Cordis panel',
    paint: ['CORDIS_PANEL_SEL}{', '--dsw-specific-menu:var(--dsh-any-op-menu-cordis)'],
    fade: /selector: CORDIS_PANEL_SEL,[^}]*tokens: \['--dsw-specific-menu'\]/,
  },
]
for (const p of PLUGIN_PAINTED) {
  check(`${p.surface} is painted from its own variable`, p.paint.every(t => wall.includes(t)), true)
  check(`and that same selector carries a fade for it`, p.fade.test(wall), true)
}
// Both sides read one constant, so the selector cannot drift apart; the check
// above would pass a rename on one side only.
check('the shared selectors are declared once each',
  [/const CORDIS_PANEL_SEL =/g, /const RIGHTBAR_SEL =/g].map(re => (wall.match(re) ?? []).length), [1, 1])

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
