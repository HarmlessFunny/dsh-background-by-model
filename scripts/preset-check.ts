/**
 * Checks for the recommended profile — `pnpm check:preset`.
 *
 * The profile is one button that fires a SET of picture downloads. Its RULES are
 * compiled in (`src/profile.ts`), so what can go wrong is narrower than it used to
 * be, and this file pins the parts that still can:
 *
 *   1. the POLICY (`src/preset.ts`) — which failures get another round, how long
 *      the wait is, and whether a held picture still belongs to the generation being
 *      installed. A retry that also retries "the file is not there" makes the one
 *      message this feature owes its author arrive late; a resume that skips the
 *      revision comparison installs a profile glued together from two releases.
 *   2. the CONTENT (`src/profile.ts`) — the rule list, the slot ↔ URL table and the
 *      revision constant. It is a constant now, which is exactly why it needs
 *      pinning: nothing else in the repo would notice a slot that no rule uses, two
 *      rules that would both match one model, or a URL that lost its transform
 *      suffix and started serving an 8 MB upload.
 *   3. the WIRING (both halves) — the policy is worth nothing if the pool still
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
  PRESET_ATTEMPTS, PRESET_RETRY_BASE_MS, presetMissing, presetResume, presetRetryDelayMs,
  presetRetryable,
} from '../src/preset.ts'
import type { FetchFailure, PresetHeld } from '../src/preset.ts'
import {
  PROFILE_HOSTS, PROFILE_SLOTS, RECOMMENDED_REVISION, profileImagePath, recommendedConfig,
} from '../src/profile.ts'
import { HOLIDAYS, holidayArtGeneration } from '../src/holiday.ts'
import { SCHEMA_VERSION } from '../src/schema.ts'

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

// ── 3. the profile itself ──────────────────────────────────────────────────
console.log('\n--- the built-in profile ---')
const profile = recommendedConfig()
// Seven models, one rule each, in the order the fallback depends on: matching runs
// top→bottom and the first usable rule is what an unmatched model gets.
check('one rule per model', profile.rules.length, 7)
check('the rules match the models the plugin knows',
  profile.rules.map(r => r.match), ['deepseek', 'gpt', 'claude', 'qwen', 'glm', 'kimi', 'grok'])
ok('every rule is switched on and carries exactly one picture',
  profile.rules.every(r => r.enabled && r.images.length === 1))
ok('every picture is full-bleed (a letterboxed wallpaper is not a profile)',
  profile.rules.every(r => r.images[0]!.bgMode === 'fill'),
  JSON.stringify(profile.rules.map(r => r.images[0]!.bgMode)))
ok('every picture carries its own theme colour',
  profile.rules.every(r => Array.isArray(r.images[0]!.color) && r.images[0]!.color!.length === 3))
// A rule that named no colour AND no picture would be skipped by `ruleCanPaint`, so
// the seventh model would silently fall through to the first rule.
ok('and none of them paints nothing (every rule is usable)',
  profile.rules.every(r => r.images.length > 0 || r.color !== null))
// The request set is derived from the rules and must agree with the URL table in
// BOTH directions — a rule whose slot has no URL would fail the whole download with
// a sentence about a slot the author never meant to ship.
const ruleSlots = profile.rules.map(r => r.images[0]!.slot)
check('the URL table names exactly the slots the rules use', [...PROFILE_SLOTS].sort(), [...ruleSlots].sort())
ok('no slot is named twice in the table', new Set(PROFILE_SLOTS).size === PROFILE_SLOTS.length)
check('the profile is written for the shape this build sanitizes', profile.version, undefined)
// The interface numbers are the ones a fresh install already starts on — that is
// what makes installing the profile "add the rules and the pictures" on a clean
// store. Pinned by value, so a constant changed here alone fails.
check('the interface opacities are the shipped defaults',
  JSON.stringify(profile.opacities), JSON.stringify({ bg: 0, sidebar: 0.1, card: 1, code: 0.81, input: 0.88 }))
check('the tint alphas are the shipped defaults',
  [profile.settingsOpacity, profile.chatTextOpacity, profile.trajectoryOpacity, profile.rightbarOpacity],
  [1, 0.35, 0.73, 0.45])
check('the switch effect is the shipped one',
  JSON.stringify(profile.transition), JSON.stringify({ effect: 'fade', easing: 'ease', durationMs: 320 }))
// The one setting the profile deliberately differs on: a fresh install ships the
// festival overrides OFF, and this is a configuration somebody chose.
check('the holiday overrides ship ON in the profile (and off in a fresh config)', profile.holidays.enabled, true)
check('with one entry per built-in holiday', profile.holidays.items.map(i => i.id),
  ['mid-autumn', 'national-day'])

console.log('\n--- the pictures come from Bilibili, by content address ---')
ok('three edges are tried, in order', PROFILE_HOSTS.length === 3
  && PROFILE_HOSTS.every(h => h.endsWith('.hdslb.com')), JSON.stringify(PROFILE_HOSTS))
for (const slot of PROFILE_SLOTS) {
  const path = profileImagePath(slot)
  // THE transform: without it the CDN answers the uploaded PNG, which for the
  // largest of these is 12 MB — past `PRESET_IMAGE_MAX`, and 76 MB of wallpapers on
  // disk if it ever landed.
  ok(`${slot} carries the webp transform`, path !== null && /@\d+w\.webp$/.test(path), path ?? 'null')
  ok(`${slot} is content-addressed`, path !== null && /\/bfs\/new_dyn\/[0-9a-f]{24,}/.test(path), path ?? 'null')
}
check('a slot the profile does not carry has no URL', profileImagePath('m9'), null)
check('nor does a holiday slot (it has no file to download into)', profileImagePath('h-midautumn'), null)
ok('the revision is a constant, so a hold can only be invalidated on purpose',
  typeof RECOMMENDED_REVISION === 'string' && RECOMMENDED_REVISION !== '')

console.log('\n--- the festival art follows the same rules ---')
for (const def of HOLIDAYS) {
  ok(`${def.id} has a BFS source with a transform`,
    /^\/bfs\/new_dyn\/[0-9a-f]+\w*\.png@\d+w\.webp$/.test(def.source), def.source)
  // The cache directory is derived from the content hash, so new art cannot be
  // answered from the old generation's directory — the property the pinned assets
  // release tag used to provide, now impossible to forget.
  check(`${def.id} caches by content hash, not by a version constant`,
    holidayArtGeneration(def), /new_dyn\/([0-9a-f]{8})/.exec(def.source)![1])
}
ok('two different holidays cannot share a generation',
  new Set(HOLIDAYS.map(holidayArtGeneration)).size === HOLIDAYS.length)

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
const holidayFn = node.slice(node.indexOf('async function fetchHolidayAsset'), node.indexOf('async function fetchProfileFile'))
ok('the festival art is not dragged into the retry rounds',
  holidayFn.length > 0 && !/attempt|presetRetryable/.test(holidayFn), holidayFn.slice(0, 80))
// One URL per slot comes from the CONSTANT table, never from a slot name the caller
// chose — that indirection is the whole whitelist on a public RPC.
ok('the wallpaper fetch resolves its URL from the built-in table',
  /profileImagePath\(slot\)/.test(node))
ok('and a slot the table does not carry is refused before any request',
  /if \(path === null\) return \{ ok: false, error: 'bad slot' \}/.test(node), 'no table-miss refusal')
// Nothing may be downloaded to CHECK a profile any more: the rules are local, so a
// manifest or config request would be a leftover of the old shape.
ok('no manifest or config is fetched', !/fetchProfileFile\([^)]*PRESET_(MANIFEST|CONFIG)/.test(node)
  && !/preset\.json/.test(node))
// The client half: the pool must be sized and ordered by what is MISSING, or the
// resume would still re-download everything.
ok('the pool walks the missing files, not the whole slot list',
  /Math\.min\(PRESET_CONCURRENCY, missing\.length\)/.test(client), 'the pool still counts `slots`')
ok('the slot list comes from the built-in table, not from a download',
  /const slots = PROFILE_SLOTS/.test(client) && !/head\.slots/.test(client))
ok('the held bytes are keyed to the profile generation',
  /const key = RECOMMENDED_REVISION/.test(client))
ok('a failed attempt holds what arrived', /presetHeld = \{ key, images \}/.test(client))
ok('a complete download holds nothing', /presetHeld = null/.test(client))
// The cap has to be checked BEFORE a file is taken into the result: checked after,
// the attempt that blows it holds every slot, and the resume then starts with
// nothing left to fetch and hands the oversized profile straight through.
ok('the size cap is applied before the file is kept',
  /bytes \+ got\.dataUrl\.length > PRESET_TOTAL_MAX/.test(client))

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
