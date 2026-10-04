/**
 * Checks for the per-image layout mode — `pnpm check:image-mode`.
 *
 * 适应/填充/拉伸/平铺/居中 used to be a RULE setting: one value for every picture
 * of a rotation. It belongs to the picture, like the framing beside it, and moving
 * it down is the same argument that moved the framing — a landscape photo and a
 * tall screenshot in one rotation do not want the same answer, and one rule-level
 * value forced at least one of them into the other's compromise.
 *
 * Two halves, because the move is only complete when both are true:
 *
 *   1. the LIFT. A config written before the move carries the mode on the rule, so
 *      it has to be handed to each image on read instead of being reset to the
 *      default (a 填充 wallpaper that quietly becomes 适应 on the next load is the
 *      bug this file exists to prevent). The lift is re-implemented below, from the
 *      real one's own shape, and the four lines of `src/schema.ts` it mirrors are
 *      anchored so a change there cannot leave this copy passing on its own;
 *   2. the WIRING. The renderer must read the mode of the image it is painting
 *      (not of the rule) and the panel must write to the selected image's slot.
 *      That half is textual: both sides are one-liners inside functions that need
 *      a DOM, and getting them wrong fails SILENTLY — every image paints the same
 *      way, which is exactly the state the move was made to escape.
 *
 * Note the deliberate absence of an `import` from `src/`: `src/schema.ts` reaches
 * `./holiday` without an extension, which plain `node` cannot resolve, and every
 * other check script that imports source imports it directly. The lift is small
 * enough to restate honestly; the anchoring below is what keeps the copy tied to
 * the module it is copying.
 *
 * Runs on plain `node` (Node ≥ 22.6 strips the types itself), no dependency, no
 * transform — the same shape as `scripts/rotation-check.ts`.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (rel: string): string => readFileSync(resolve(HERE, '..', rel), 'utf8')
const SCHEMA = read('src/schema.ts')
const STATE = read('src/client/state.ts')
const PANEL = read('src/client/components/pages/ModelBgPage.tsx')
const ENTRY = read('src/client/index.tsx')
const WALL = read('src/client/wallpaper.ts')

let failures = 0
function check(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

// ── The shape under test, read out of the module that declares it ───────────
// Both lists are parsed rather than restated: the numbers below are meaningless
// if the module under test has moved past them by itself.
const modes = ((): string[] => {
  const m = /export const BG_MODES: readonly BgMode\[\] = \[([^\]]*)\]/.exec(SCHEMA)
  return m === null ? [] : [...m[1]!.matchAll(/'([a-z]+)'/g)].map(x => x[1]!)
})()
const announced = Number(/export const SCHEMA_VERSION = (\d+)/.exec(SCHEMA)?.[1] ?? 0)

console.log('\n--- the mode list this file is written against ---')
check('it is the five modes the panel offers', modes, ['fit', 'fill', 'stretch', 'tile', 'center'])

// ── The lift, as `normalizeImage` / `normalizeRule` perform it ──────────────
interface Image { slot: string; bgMode: string; bgState: { zoom: number }; color: null }
/** `normalizeImage`: a usable key wins, otherwise the caller's inherited mode. */
function normImage(raw: { slot?: string; bgMode?: string; bgState?: { zoom?: number } }, inheritMode = 'fit'): Image | null {
  if (typeof raw.slot !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(raw.slot)) return null
  return {
    slot: raw.slot,
    bgMode: modes.includes(raw.bgMode as string) ? raw.bgMode! : inheritMode,
    bgState: { zoom: typeof raw.bgState?.zoom === 'number' ? raw.bgState.zoom : 1 },
    color: null,
  }
}
/** `normalizeRule`: resolve the rule-level mode ONCE, hand it to every entry. */
function normRule(raw: { bgMode?: unknown; images?: unknown[] }): Image[] {
  const mode = modes.includes(raw.bgMode as string) ? (raw.bgMode as string) : 'fit'
  if (!Array.isArray(raw.images)) return []
  return raw.images.map(entry => normImage(entry as { slot?: string }, mode)).filter((x): x is Image => x !== null)
}

console.log('\n--- the mode a fresh image gets ---')
check('an image with no mode of its own lands on the shipped default',
  normImage({ slot: 'm1' })?.bgMode, 'fit')
// Every accepted mode has to survive: the chip row offers five, so a shape that
// only kept the first would make four of them lies.
check('every accepted mode is kept as written',
  modes.map(m => normImage({ slot: 'm1', bgMode: m })?.bgMode), modes)
check('a mode nothing recognizes falls back instead of reaching the renderer',
  normImage({ slot: 'm1', bgMode: 'zigzag' })?.bgMode, 'fit')

console.log('\n--- the lift: a rule-level mode becomes every image\'s own ---')
// The shape a pre-move config has: one mode on the rule, several pictures under
// it, none of which has a mode key. Every one of them has to come back with what
// the user chose.
const legacy = normRule({
  bgMode: 'fill',
  images: [{ slot: 'm2', bgState: {} }, { slot: 'm3', bgState: {}, color: null }],
})
check('each image of a pre-move rule inherits the rule-level mode',
  legacy.map(i => i.bgMode), ['fill', 'fill'])
check('a rule that never named a mode hands its images the default',
  normRule({ images: [{ slot: 'm5' }] }).map(i => i.bgMode), ['fit'])
check('a rule-level mode nothing recognizes lifts nothing', normRule({ bgMode: 'zigzag', images: [{ slot: 'm6' }] }).map(i => i.bgMode), ['fit'])

console.log('\n--- an image that has a mode of its own is left alone ---')
// The lift must not walk over a per-image value — including one the rule no
// longer agrees with, which is the entire point of the move.
const mixed = normRule({
  bgMode: 'fill',
  images: [{ slot: 'm6', bgMode: 'center', bgState: {} }, { slot: 'm7', bgState: {} }],
})
check('a per-image mode survives beside the inherited one',
  mixed.map(i => i.bgMode), ['center', 'fill'])
check('and each image keeps its own framing next to it',
  mixed.map(i => i.bgState.zoom), [1, 1])

console.log('\n--- the copy above is anchored to the real lift ---')
// These are the four lines that make the lift work, in the module both halves
// sanitize through. If any of them is edited away, the copy above is no longer
// describing `src/schema.ts` and this file has to be rewritten with it.
check('the rule-level mode is resolved once, before the images are walked',
  /const mode: BgMode = BG_MODES\.includes\(r\.bgMode as BgMode\) \? \(r\.bgMode as BgMode\) : 'fit'\n\s+const images: BgImage\[\] = \[\]/.test(SCHEMA), true)
check('and passed to every entry as its inherited mode',
  /normalizeImage\(entry, color, mode\)/.test(SCHEMA), true)
check('a keyless mode on an entry resolves to that inherited value',
  /bgMode: BG_MODES\.includes\(i\.bgMode as BgMode\) \? \(i\.bgMode as BgMode\) : inheritMode/.test(SCHEMA), true)
check('the synthesized pre-0.7 image is lifted too',
  /slot: legacySlot,\n\s+bgMode: mode,/.test(SCHEMA), true)
// And the field is gone from the object the function RETURNS: a `bgMode` left
// there would be written back to disk for every rule, forever, and the lift above
// would then be reading its own output back as if it came from the user.
const ruleReturn = ((): string => {
  const body = /export function normalizeRule[\s\S]*?\n\}/.exec(SCHEMA)?.[0] ?? ''
  const at = body.indexOf('  return {')
  return at < 0 ? '' : body.slice(at)
})()
check('the rule object the sanitizer returns has no mode of its own',
  /\bbgMode:/.test(ruleReturn), false)
check('the image shape declares one', /bgMode: BgMode\n/.test(SCHEMA), true)

console.log('\n--- the holiday keeps the definition\'s fill ---')
// A holiday has exactly one picture and a definition of its own, so the old
// rule-level value is not what it should follow: `fill` is. A stale `fit` must
// not letterbox a festival wallpaper.
check('a holiday image is full-bleed: fill comes from the definition',
  /images: \[\{ slot: def\.slot, bgMode: 'fill', bgState: \{ \.\.\.DEFAULT_BG_STATE \}, color \}\]/.test(SCHEMA), true)
check('and the read-back takes the mode from the definition, not from disk',
  /bgMode: image\.bgMode,\n\s+bgState: normalizeBgState/.test(SCHEMA), true)

console.log('\n--- the renderer reads it from the image it is painting ---')
check('rBgMode asks the CURRENT image, not the rule',
  /export function rBgMode\(\): BgMode \{ return activeImage\(\)\?\.bgMode \?\? 'fit' \}/.test(STATE), true)
check('and that is what the layer painter reads',
  /const mode = rBgMode\(\)/.test(WALL), true)
// The center-mode decode callback re-asks, and it has to ask the same question:
// a rule-level read there would let a stale answer override the native size.
check('the center-mode decode re-asks the same per-image question',
  /rBgMode\(\) !== 'center'/.test(WALL), true)

console.log('\n--- the panel writes to the selected image\'s slot ---')
check('the chips read the selected image',
  /const bgMode: BgMode = image\?\.bgMode \?\? 'fit'/.test(PANEL), true)
check('and write through the slot-addressed store call',
  /p\.setImageMode\(rule\.id, image\.slot, m\.mode\)/.test(PANEL), true)
// Disabled, not hidden: a rule starts with no picture at all, and a mode row that
// vanished there would leave the card's own "add an image" hint to explain a
// control the user has never seen.
check('and are disabled (not hidden) while there is no image to lay out',
  /disabled=\{image === undefined\}/.test(PANEL), true)
check('every chip comes from the one mode list',
  (PANEL.match(/\{BG_MODES\.map\(m => \(/g) ?? []).length, 1)
// The store half: slot-addressed, sanitized, and only the mode is touched — a
// write that went through `setRule` would land on a field the rule no longer has.
check('the store patches by slot and re-sanitizes',
  /image\.bgMode = mode\n\s+normalizeRuleInPlace\(rule\)/.test(ENTRY), true)
check('and a live mode edit repaints through the shared decision',
  /setImageMode: \(id: string, slot: string, mode: BgMode\)[\s\S]{0,700}?repaintIfMoved\(id, winner\)/.test(ENTRY), true)
// A newly added picture must carry its mode EXPLICITLY: the lift only reaches an
// entry with no key, so an entry written without one would come back with whatever
// a rule-level field happened to say — the opposite of a default.
check('a new picture from the file picker writes its own mode',
  /const image = \{ slot, bgMode: 'fit' as const, bgState: \{ \.\.\.DEFAULT_BG_STATE \}, color: null \}/.test(ENTRY), true)
check('and so does one fetched from a URL',
  /rule\.images\.push\(\{ slot, bgMode: 'fit', bgState:/.test(ENTRY), true)

console.log('\n--- the shape bump, which is what protects the lifted value ---')
// The mode moved AROUND inside the image entry, and a schema-5 host rebuilds every
// entry from the keys it knows — so it would drop the mode without a word. The
// announced number is what puts a new bundle in front of such a process into the
// hold-writes path, so it is checked here as "strictly past 5" rather than "=== 6":
// a later bump does not have to come back and edit this file.
check('the announced shape moved past the config that had the mode on the rule',
  announced > 5, true)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
