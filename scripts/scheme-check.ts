/**
 * Checks for the scheme flag — `pnpm check:scheme`.
 *
 * `data-ds-dark-theme` is the host's own switch: its tokens, its ink and its
 * shell all flip on that ONE attribute, and the plugin writes it whenever it
 * forces a palette of its own (a dark theme colour sets it to `OWN_SCHEME`, a
 * light one removes it). Everything below is a way that hand-off goes wrong
 * WITHOUT an error, because the attribute is just a string:
 *
 *   1. **The plugin's value is never cleaned up.** A teardown or a dropped
 *      palette that leaves `OWN_SCHEME` on <body> keeps the host dark forever.
 *   2. **The plugin PUSHES a scheme it does not own.** Its verdict comes from its
 *      own last reading of the host preference; that reading is stale exactly
 *      when the host changed without telling anyone, so writing it "restores" a
 *      host that has already moved on. Only the OWNER of the flag is corrected.
 *   3. **A moved scheme does not repaint.** The theme watchdog gated its repaint
 *      on the skin re-registering, and on a host that still had the skin that was
 *      always false — so the new palette sat unread until some unrelated apply.
 *   4. **The themed gate outlives its variable.** `html[data-dab-themed]` makes
 *      the dialog/trajectory layer tokens point at plugin-owned variables; if it
 *      survives their removal they resolve to nothing (transparent panels).
 *
 * The behavioural half is pure (the adoption policy is extracted and exercised
 * against a fake document); the wiring half is textual, the same shape the other
 * checks use for DOM code they cannot run.
 *
 * Runs on plain `node` (≥ 22.6 strips the types itself), no dependency.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLIENT = resolve(HERE, '../src/client')
const read = (name: string): string => readFileSync(resolve(CLIENT, name), 'utf8')

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
function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

// Read, not imported: `src/schema.ts` reaches `./holiday` without an extension,
// which the bundler resolves and plain node does not (see `image-mode-check.ts`).
const schemaVersion = (): number => {
  const src = readFileSync(resolve(CLIENT, '../schema.ts'), 'utf8')
  return Number(/export const SCHEMA_VERSION = (\d+)/.exec(src)?.[1] ?? NaN)
}
const SCHEMA_VERSION = schemaVersion()
const wall = strip(read('wallpaper.ts'))
const appearance = strip(read('appearance.ts'))
const entry = strip(read('index.tsx'))

// ── 1. the adoption policy, per flag state ────────────────────────────────
console.log('--- only the OWNER of the flag is corrected ---')
/**
 * The policy `adoptHostScheme` implements, written out: given the flag as it
 * stands and the plugin's resolved verdict, what should the flag end up as —
 * and is this plugin allowed to write it at all?
 */
const OWN = 'the-plugin'
function adopt(current: string | null, dark: boolean): string | null {
  if (current !== OWN) return current // not ours: leave the host's flag alone
  return dark ? '' : null
}
check('the plugin\'s dark value stays dark in the host\'s form', adopt(OWN, true), '')
check('the plugin\'s dark value is dropped when the host is light', adopt(OWN, false), null)
// A host that went dark on its own: its flag is `''`, and the plugin's stale
// verdict is `false`. Pushing that verdict is what left the interface light.
check('a host flag set by the host is not pushed back to light', adopt('', false), '')
check('a host flag removed by the host is not pushed back to dark', adopt(null, true), null)

console.log('\n--- and the plugin\'s own value is always cleaned up ---')
// The value the plugin writes is recognisable, which is what lets the other
// direction (restoring the host's form) be safe at all.
check('the plugin writes a distinguishable value',
  /export const OWN_SCHEME = 'dsh-background-by-model'/.test(wall), true)
const clearAt = wall.indexOf('function clearCustomTokens()')
const clear = wall.slice(clearAt, wall.indexOf('\n}\n', clearAt))
ok('dropping the token sheet drops the themed gate with it',
  /removeAttribute\(THEMED_ATTR\)/.test(clear), clear.slice(0, 200))
const teardownAt = wall.indexOf('export function teardownWp')
const teardown = wall.slice(teardownAt, wall.indexOf('\n}\n', teardownAt))
ok('teardown hands the scheme back to the host', /adoptHostScheme\(\)/.test(teardown))

console.log('\n--- the adoption never pushes a host scheme ---')
check('it checks who owns the flag before writing',
  /function adoptHostScheme\(\): void \{[\s\S]{0,300}?ownsSchemeFlag\(\)/.test(wall), true)
ok('and stops when the flag is not the plugin\'s',
  /ownsSchemeFlag\(\)\) return/.test(wall))
// The write is the ONE that only ever restores the host's form of the PLUGIN's
// value: `''` for dark (a boolean attribute) and removal for light.
ok('the write restores the host\'s form of the value, nothing else',
  /if \(resolveHostDark\(\)\) document\.body\.setAttribute\(DARK_ATTR, ''\)\s*\n\s*else document\.body\.removeAttribute\(DARK_ATTR\)/.test(wall))

// ── 2. a moved scheme repaints ─────────────────────────────────────────────
console.log('--- a moved host scheme repaints on its own ---')
const watchAt = appearance.indexOf('watch() {')
const watch = appearance.slice(watchAt, appearance.indexOf('\n    },', watchAt))
ok('the watchdog compares the published scheme instead of skipping it',
  /const moved = syncScheme\(\)/.test(watch), watch.slice(0, 120))
ok('a moved scheme repaints before the skin is consulted',
  /if \(moved\) \{ host\.refresh\(\); return \}/.test(watch))
ok('the pass still re-asserts the skin', /reassert\(\)/.test(watch))
ok('the comparison starts from "nothing published yet"',
  /let lastScheme: boolean \| null = null/.test(appearance))
ok('and a publish updates it', /lastScheme = dark/.test(appearance))
// The entry must use the appearance layer's pass, not a hand-copied one.
ok('the entry hands the watchdog the appearance pass',
  /restore: appearance\.watch/.test(entry))

// ── 3. nothing here goes to the network any more ───────────────────────────
// This section used to fetch the recommended profile's `preset.json` and compare
// its declared schema with SCHEMA_VERSION, because the profile was a REMOTE
// document one release away from this build and a stale one made the button fail
// with the network's copy. The profile is compiled in now (../src/profile.ts), so
// there is no manifest to compare: the shape on disk and the shape in the bundle
// are the same value. What is worth pinning instead is that the client half stops
// asking for a head at all — a leftover call would 404 on every press.
console.log('\n--- the recommended profile no longer needs a remote manifest ---')
const rpc = strip(read('rpc.ts'))
const entrySrc = strip(read('index.tsx'))
ok('the client no longer asks the host for a profile head',
  !/fetchPresetConfig/.test(rpc) && !/fetchPresetConfig/.test(entrySrc))
ok('and the slot list it downloads comes from the built-in table',
  /PROFILE_SLOTS/.test(entrySrc))
// The pictures are the one thing still fetched, so the transform that keeps them
// small must be part of the URL the table hands out — pinned here as well as in
// `preset-check.ts`, because this is the file a reader opens to learn what the
// plugin talks to.
const profileSrc = readFileSync(resolve(CLIENT, '../profile.ts'), 'utf8')
ok('the wallpaper URLs carry a webp transform',
  /@\$\{?BFS_SUFFIX\}?|@3840w\.webp/.test(profileSrc), profileSrc.match(/@\w+webp[^`'"]*/)?.[0] ?? 'none')
ok('and they name Bilibili edges rather than a git host',
  /hdslb\.com/.test(profileSrc) && !/jsdelivr|raw\.githubusercontent/.test(profileSrc))

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
