/**
 * Checks for the multi-image rotation's DECISION — `pnpm check:rotation`.
 *
 * The timer lives in the plugin's apply closure and cannot be exercised without a
 * browser, but everything the timer decides with is pure and lives in
 * `src/client/rotation.ts`. Three of those decisions fail silently in a way no
 * screenshot would reveal:
 *
 *   1. walking off the end of the list (a background that stops rotating);
 *   2. "shuffling" onto the image already on screen (indistinguishable from a
 *      missed tick, which is why `order: shuffle` must never repeat);
 *   3. reporting "rotating" for a rule that has nothing to rotate — the one
 *      failure that shows up as a badge claiming something untrue;
 *   4. the SWITCH staying on for a rule that lost a picture. `isRotating` above is
 *      already false below two images, so the badge and the timer were right all
 *      along; what stayed wrong was the stored setting, and the panel disables the
 *      switch there — a control that reads "on" and cannot be turned off until
 *      another picture arrives. Only the removal path can keep the setting and the
 *      count apart, so that half is textual, like `scripts/repaint-check.ts`.
 *
 * Runs on plain `node` (≥ 22.6 strips the types itself), no dependency, no
 * transform — the same shape as `scripts/holiday-check.ts`.
 *
 * Deliberately imports NOTHING from `src/schema.ts`: that module has a real
 * runtime import of `./holiday` (extensionless, which the bundler resolves and
 * plain node does not), and the sanitizer it owns is checked where it actually
 * runs — through the node half's RPC, in `scripts/node-half-check.mjs`.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nextIndex, isRotating, ROTATE_PRESETS } from '../src/client/rotation.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

let failures = 0
function check(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

console.log('--- order: walks the list and wraps ---')
check('next of 0 in a 3-image list', nextIndex(3, 'order', 0), 1)
check('next of 1', nextIndex(3, 'order', 1), 2)
check('the last one wraps to the first', nextIndex(3, 'order', 2), 0)
check('a single image has nowhere to go', nextIndex(1, 'order', 0), null)
check('an empty list has nowhere to go', nextIndex(0, 'order', 0), null)
// The index comes from the UI as often as from the timer, and a stale one (an
// image was just removed) must not be able to index past the end.
check('an out-of-range index starts from the first image', nextIndex(3, 'order', 9), 1)
check('a negative index starts from the first image', nextIndex(3, 'order', -2), 1)
check('a fractional index is floored', nextIndex(3, 'order', 1.7), 2)

console.log('\n--- shuffle: never the image already on screen ---')
for (const len of [2, 3, 7]) {
  for (let cur = 0; cur < len; cur++) {
    // Every roll the generator can produce, so the whole support is covered
    // instead of one lucky sample.
    const seen = new Set<number>()
    for (let i = 0; i <= 20; i++) {
      const got = nextIndex(len, 'shuffle', cur, () => i / 20)
      if (got === null) { check(`len ${len} cur ${cur} roll ${i}`, got, 'an index'); continue }
      if (got === cur) check(`len ${len} cur ${cur} roll ${i} repeats the current image`, got, 'another index')
      if (got < 0 || got >= len) check(`len ${len} cur ${cur} roll ${i} out of range`, got, `0..${len - 1}`)
      seen.add(got)
    }
    check(`len ${len} cur ${cur}: every other image is reachable`, seen.size, len - 1)
  }
}
// A generator that returns exactly 1 (a caller-supplied one may) must not land on
// `len`, which is off the end of the list.
check('roll 1.0 stays inside the list', nextIndex(4, 'shuffle', 0, () => 1), 3)

console.log('\n--- isRotating: the badge and the timer agree ---')
check('off', isRotating(5, false, 60_000), false)
check('on with one image', isRotating(1, true, 60_000), false)
check('on with two images', isRotating(2, true, 60_000), true)
check('on with a zero interval', isRotating(2, true, 0), false)
check('on with a non-finite interval', isRotating(2, true, Number.NaN), false)

console.log('\n--- presets ---')
// The clamp range lives in ./schema and the numbers are repeated here on purpose:
// a preset outside it would be silently rewritten on the next load, and this is
// the one place that can notice without pulling the schema into plain node.
const ROTATE_MIN_MS = 5_000
const ROTATE_MAX_MS = 24 * 60 * 60 * 1000
check('every preset is inside the clamp range',
  ROTATE_PRESETS.every(p => p.ms >= ROTATE_MIN_MS && p.ms <= ROTATE_MAX_MS), true)
check('presets are ordered fastest first',
  ROTATE_PRESETS.every((p, i) => i === 0 || ROTATE_PRESETS[i - 1]!.ms < p.ms), true)
check('preset keys are distinct', new Set(ROTATE_PRESETS.map(p => p.key)).size, ROTATE_PRESETS.length)

console.log('\n--- a rule that loses a picture stops claiming it rotates ---')
// The setting, not the decision: `isRotating` above already says false below two
// images, so this is about the state the panel reads back.
const entry = readFileSync(resolve(HERE, '../src/client/index.tsx'), 'utf8')
check('removing the second-to-last image clears the switch',
  /if \(rule\.images\.length < 2 && rule\.rotate\.enabled\) patchRotation\(rule, \{ enabled: false \}\)/.test(entry), true)
// The same invariant at the layer every path goes through (load, import, persist):
// the removal above is the interactive half, this is the one that also catches a
// rule arriving from a file with `enabled` set and a single picture.
const schemaSrc = readFileSync(resolve(HERE, '../src/schema.ts'), 'utf8')
check('and a rule normalized with one picture never comes back rotating',
  /if \(images\.length < 2\) rotate\.enabled = false/.test(schemaSrc), true)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
