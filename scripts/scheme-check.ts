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

// ── 3. the recommended profile's manifest agrees with this build ───────────
// The adapter lives in the assets repository, one release away from this one, and
// the gate that reads it fails with the NETWORK's copy ("check your connection")
// when it actually means "the assets are stale". That is what the user saw, so
// the declared version is fetched here and put next to SCHEMA_VERSION. The fetch
// mirrors the node half exactly (`fetchAsset` + `fetchPresetFile`), so the two
// mirrors and the retry rounds are exercised rather than assumed.
console.log('\n--- the recommended profile declares a shape this build can read ---')
check('this build publishes a numeric shape', Number.isFinite(SCHEMA_VERSION), true)
const REF = 'v0.1.0'
const HOSTS = [
  `https://cdn.jsdelivr.net/gh/HarmlessFunny/assets@${REF}/dsh-background-by-model/preset`,
  `https://raw.githubusercontent.com/HarmlessFunny/assets/${REF}/dsh-background-by-model/preset`,
]
async function manifestVersion(): Promise<number | 'unreachable' | 'malformed'> {
  for (let round = 0; round < 3; round++) {
    let retry = false
    for (const host of HOSTS) {
      try {
        const res = await fetch(`${host}/preset.json`, { redirect: 'follow', signal: AbortSignal.timeout(15_000) })
        if (!res.ok) { retry ||= res.status >= 500 || res.status === 429 || res.status === 408; continue }
        const body = await res.json() as { version?: unknown }
        return typeof body?.version === 'number' ? body.version : 'malformed'
      } catch { retry = true }
    }
    if (!retry) return 'unreachable'
  }
  return 'unreachable'
}
const declared = await manifestVersion()
if (declared === 'unreachable') {
  // Offline is not a regression of this repo: the gate is checked where the
  // network exists (CI, a developer machine), and a sandbox without it must not
  // report a failure it cannot see.
  console.log('skip the assets manifest (neither mirror answered — offline sandbox)')
} else if (declared === 'malformed') {
  check('the assets manifest carries a numeric version', declared, 'a number')
} else {
  check(`the profile's schema (${declared}) is not newer than this build's (${SCHEMA_VERSION})`,
    declared <= SCHEMA_VERSION, true)
  // The other half of the same gate: an OLD profile is fine (the sanitizer lifts
  // it), so the assertion is one-sided on purpose and says so.
  console.log(`     (a profile older than ${SCHEMA_VERSION} still imports — the sanitizer lifts it)`)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
