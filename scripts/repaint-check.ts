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
  'moveRuleImage',
  'setCurrentImage',
  'setImageFraming',
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

console.log('\n--- and the old idiom is gone ---')
// The specific text of the regression, so re-introducing it anywhere (including
// in a path this check does not know about) is caught.
const stale = [...source.matchAll(/[^\n]*activeRuleId\s*\)\s*applyActive[^\n]*/g)].map(m => m[0].trim())
check('no write path decides the repaint with `id === activeRuleId`', stale, [])
const sampledElsewhere = [...source.matchAll(/const winner = (?!winnerId\(\))[^\n]*/g)].map(m => m[0].trim())
check('every sampled winner is `winnerId()`', sampledElsewhere, [])
check('repaintIfMoved is defined once', (source.match(/const repaintIfMoved = /g) ?? []).length, 1)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
