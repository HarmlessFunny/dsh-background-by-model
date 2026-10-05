/**
 * Checks for the recommended profile's transfers — `pnpm check:preset`.
 *
 * The profile is one button that fires a SET of downloads (a manifest, a config,
 * one file per wallpaper) over two mirrors. Two things about that are decisions
 * rather than plumbing, and both fail silently:
 *
 *   1. the POLICY (`src/preset.ts`) — which failures get another round, how long
 *      the wait is, and whether a held picture still belongs to the revision being
 *      installed. A retry that also retries "the file is not there" makes the one
 *      message this feature owes its author arrive late; a resume that skips the
 *      revision comparison installs a profile glued together from two different
 *      pushes to `main`.
 *   2. the WIRING (both halves) — the policy is worth nothing if the pool still
 *      fetches the whole slot list, or if a failed attempt drops what it has. Those
 *      are properties of the source, pinned textually, the same way
 *      `rules-view-check.ts` pins the page structure it cannot run.
 *
 * `src/preset.ts` has no imports of its own — deliberately, and it is the reason
 * this check can import it directly: `src/schema.ts` reaches `./holiday` without an
 * extension, which plain `node` cannot resolve (see the note in
 * `image-mode-check.ts`, which restates the lift for the same reason).
 *
 * Runs on plain `node` (≥ 22.6 strips the types itself), no dependency, no
 * transform — the same shape as the checks beside it.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PRESET_ATTEMPTS, PRESET_RETRY_BASE_MS, presetKey, presetMissing, presetResume, presetRetryDelayMs,
  presetRetryable,
} from '../src/preset.ts'
import type { FetchFailure, PresetHeld } from '../src/preset.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (rel: string): string => readFileSync(resolve(HERE, '..', rel), 'utf8')

let failures = 0
function check(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}
function ok(label: string, cond: boolean, detail = ''): void {
  if (!cond) failures++
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${cond || detail === '' ? '' : ` — ${detail}`}`)
}

// ── 1. which failures are worth another round ──────────────────────────────
console.log('--- the retry policy ---')
// Every reason the node half can produce, and the answer for each. Written out
// one by one rather than as a set: "weather" is a judgement about each case, and a
// new reason added to `FetchFailure` has to be judged here too rather than
// inheriting whatever a `switch` default happened to say.
const RETRYABLE: Record<FetchFailure, boolean> = {
  network: true,   // a thrown connection — the mirror never answered
  server: true,    // 5xx, 429, 408 — the mirror answered "not now"
  empty: true,     // 200 with no body — a truncated serve
  missing: false,  // 404/403 — the file is not there, and will not be
  oversized: false, // the bytes are the problem, and they are the same bytes
  timeout: false,  // 60 s of silence, with both mirrors already asked this round
}
for (const [reason, want] of Object.entries(RETRYABLE)) {
  check(`"${reason}"${want ? ' is retried' : ' is terminal'}`, presetRetryable(reason as FetchFailure), want)
}
// The distinction the whole policy rests on: a missing file must fail FAST. Both
// the terminal reasons are the two the node half can recognise cheaply (a 404, a
// length it already knows), so this is also what keeps "the author renamed a file"
// at two requests and no waiting.
ok('the two cheaply-knowable failures are the terminal ones',
  !presetRetryable('missing') && !presetRetryable('oversized'))
ok('a timeout is terminal while a thrown connection is not',
  !presetRetryable('timeout') && presetRetryable('network'))

// ── 2. how long the retry waits ────────────────────────────────────────────
console.log('\n--- the wait between rounds ---')
ok('there IS a retry', PRESET_ATTEMPTS >= 2, `attempts=${PRESET_ATTEMPTS}`)
check('the first retry waits the base delay', presetRetryDelayMs(1), PRESET_RETRY_BASE_MS)
check('the second doubles it', presetRetryDelayMs(2), PRESET_RETRY_BASE_MS * 2)
ok('the wait grows with the round',
  presetRetryDelayMs(2) > presetRetryDelayMs(1) && presetRetryDelayMs(3) > presetRetryDelayMs(2))
// A user is looking at a button that says it is downloading: an escalating wait is
// fine, a wait that reads as a hang is not.
ok('and stays under five seconds', presetRetryDelayMs(PRESET_ATTEMPTS) < 5_000,
  `${presetRetryDelayMs(PRESET_ATTEMPTS)} ms before the last round`)

// ── 3. what makes two attempts "the same profile" ──────────────────────────
console.log('\n--- the revision key ---')
const cfg = { rules: [{ id: 'r1', match: 'flash', images: [{ slot: 'm1' }, { slot: 'm2' }] }], settingsOpacity: 1 }
check('the same revision keys the same', presetKey(6, cfg), presetKey(6, cfg))
// THE property this key exists for: the config is read off the wire and rebuilt by
// the sanitizer, so key order is an accident of assembly. A key that moved with it
// would quietly throw the hold away — the safe direction, and still a bug.
check('a config whose keys were built in another order is the same revision',
  presetKey(6, { settingsOpacity: 1, rules: [{ images: [{ slot: 'm1' }, { slot: 'm2' }], match: 'flash', id: 'r1' }] }),
  presetKey(6, cfg))
check('nested objects are ordered the same way',
  presetKey(6, { a: { b: 1, c: 2 } }), presetKey(6, { a: { c: 2, b: 1 } }))
ok('a different shape version is a different revision', presetKey(7, cfg) !== presetKey(6, cfg))
ok('a changed match string is a different revision',
  presetKey(6, { ...cfg, rules: [{ ...cfg.rules[0]!, match: 'pro' }] }) !== presetKey(6, cfg))
ok('a renamed slot is a different revision',
  presetKey(6, { ...cfg, rules: [{ ...cfg.rules[0]!, images: [{ slot: 'm9' }] }] }) !== presetKey(6, cfg))
// Arrays are NOT sorted: the image list IS the rotation, so two revisions that
// name the same pictures in another order are two revisions.
ok('the order of the image list matters',
  presetKey(6, { images: ['m1', 'm2'] }) !== presetKey(6, { images: ['m2', 'm1'] }))
// JSON's own semantics, so the key agrees with what would actually be persisted.
check('a key JSON cannot carry is ignored rather than fatal',
  presetKey(6, { a: 1, b: undefined }), presetKey(6, { a: 1 }))
ok('and the key is still a string for a config that is not an object',
  typeof presetKey(6, null) === 'string' && presetKey(6, null) !== presetKey(6, {}))

// ── 4. what the next attempt may reuse ─────────────────────────────────────
console.log('\n--- the resume ---')
const held: PresetHeld = { key: 'k', images: { m1: 'data:image/webp;base64,A', m2: 'data:image/webp;base64,B' } }
check('nothing held resumes nothing', presetResume(null, 'k'), {})
check('a hold from another revision resumes nothing', presetResume(held, 'other'), {})
check('a hold from the same revision resumes its bytes', presetResume(held, 'k'), held.images)
// The caller fills the result in as the rest of the profile arrives, so it must
// not be the record the NEXT attempt would resume from.
const resumed = presetResume(held, 'k')
resumed.m3 = 'data:image/webp;base64,C'
check('and hands back a copy, not the held record itself', held.images, {
  m1: 'data:image/webp;base64,A', m2: 'data:image/webp;base64,B',
})
check('the files still to fetch are the ones not held, in the config\'s order',
  presetMissing(['m1', 'm2', 'm3'], held.images), ['m3'])
check('a finished file is never asked for twice',
  presetMissing(['m1', 'm2'], resumed), [])
check('nothing to fetch when everything is held', presetMissing(['m1', 'm2'], held.images), [])
// A held picture the profile no longer names is neither fetched again nor shipped:
// only names the CONFIG asks for can come out of this.
check('a slot the config dropped is not asked for',
  presetMissing(['m1'], { ...held.images, m9: 'data:image/webp;base64,X' }), [])

// ── 5. both halves actually use it ─────────────────────────────────────────
console.log('\n--- the wiring ---')
// The code, not the prose: every function in this file carries a paragraph
// explaining itself, and a policy named in a COMMENT is not a policy in use.
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const node = stripComments(read('src/index.ts'))
const client = stripComments(read('src/client/index.tsx'))
// The node half: the rounds are the retry, and a terminal answer must end them.
ok('the profile fetcher loops over the attempt budget',
  /attempt <= PRESET_ATTEMPTS/.test(node), 'no round loop in src/index.ts')
ok('and asks the policy whether a round is worth repeating',
  /presetRetryable\(got\.reason\)/.test(node) && /sleep\(presetRetryDelayMs\(attempt\)\)/.test(node))
// The holiday path deliberately does NOT get the rounds (it is fetched during boot
// and every later read tries again), so the loop must be the profile's alone.
const holidayFn = node.slice(node.indexOf('async function fetchHolidayAsset'), node.indexOf('async function fetchPresetFile'))
ok('the festival art is not dragged into the retry rounds',
  holidayFn.length > 0 && !/attempt|presetRetryable/.test(holidayFn), holidayFn.slice(0, 80))
// The client half: the pool must be sized and ordered by what is MISSING, or the
// resume would still re-download everything.
ok('the pool walks the missing files, not the whole slot list',
  /Math\.min\(PRESET_CONCURRENCY, missing\.length\)/.test(client), 'the pool still counts `slots`')
ok('the held bytes are keyed to the config that was just fetched',
  /presetKey\(head\.version, head\.config\)/.test(client))
ok('a failed attempt holds what arrived', /presetHeld = \{ key, images \}/.test(client))
ok('a complete download holds nothing', /presetHeld = null/.test(client))
// The cap has to be checked BEFORE a file is taken into the result: checked after,
// the attempt that blows it holds every slot, and the resume then starts with
// nothing left to fetch and hands the oversized profile straight through.
ok('the size cap is applied before the file is kept',
  /bytes \+ got\.dataUrl\.length > PRESET_TOTAL_MAX/.test(client))

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
