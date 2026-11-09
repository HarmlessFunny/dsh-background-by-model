/**
 * Checks the plugin's own MARK and how it reaches the settings navigation —
 * `pnpm check:mark`.
 *
 * WHAT GOES WRONG HERE, and why it is worth a check of its own: for several
 * releases the settings nav showed the HARNESS'S default gear instead of this
 * plugin's glyph, and nothing anywhere reported a problem. The old code patched
 * the mounted DOM cell in place. It looked for the nav button whose first
 * `<span>` read as the section label, but the host's markup is
 * `<button><span class="navIcon"><svg/></span><span class="navLabel">…</span>`,
 * so the first span was the ICON one, its text was empty, the label never
 * matched, and the patch returned having found nothing. Silent by construction.
 *
 * The harness does expose the supported route — a `settings.section.icon` slot
 * whose registration id must EQUAL the section's id (`only: row.id` filters
 * every other id out) — so three things have to stay true, and each fails
 * quietly on its own:
 *
 *   1. **The icon is registered at all**, under `settings.section.icon`.
 *   2. **Its id equals the section's**, through one shared constant rather than
 *      two literals that can drift.
 *   3. **The DOM patch does not come back.** A patch that finds nothing is
 *      indistinguishable from one that works, so its absence is asserted.
 *
 * Plus the mark's shape: a 16-unit viewBox (the nav asks for 16), `currentColor`
 * so the sidebar tints it like every other row's glyph, and no fill that would
 * paint over the tile behind it.
 *
 * Runs on plain `node` (≥ 22.6 strips the types itself), reading source text —
 * the same shape as `scripts/rev-check.ts`, because every fact here is a
 * REGISTRATION, not a computation. Needs no dependency, no transform, no DOM.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (rel: string): string => readFileSync(resolve(HERE, '..', rel), 'utf8')
const NAV = read('src/client/nav-icon.ts')
const ENTRY = read('src/client/index.tsx')
const ICONS = read('src/client/components/icons.tsx')
const SECTION = read('src/client/components/ThemeSection.tsx')

let failures = 0
function check(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}
/** `detail` explains a FAILURE, so it is printed only when the assertion fails. */
function assert(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`)
}

/** Comments stripped, so a sentence describing the old bug cannot satisfy a check. */
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

console.log('--- the nav icon is a SLOT registration, not a DOM patch ---')
const nav = code(NAV)
check('the icon slot is the one the harness renders',
  /inject\('settings\.section\.icon'/.test(nav) && /name: 'settings\.section\.icon'/.test(nav), true)
// The DOM patch's fingerprints: a selector scan and node surgery. Either one
// coming back means the gear is back too, whether or not anything reports it.
assert('no MutationObserver-based cell patching', !/MutationObserver/.test(nav), 'a DOM observer is in nav-icon.ts again')
assert('no querySelector walk over the nav', !/querySelector/.test(nav), 'nav-icon.ts scans the DOM again')
assert('no svg surgery on a host element', !/replaceWith|prepend\(/.test(nav), 'nav-icon.ts still swaps a host <svg>')
assert('the entry imports the registration, not the watcher',
  /import \{[^}]*registerNavIcon[^}]*\} from '\.\/nav-icon'/.test(ENTRY), 'index.tsx still imports watchNavIcon')
assert('and the entry no longer watches for the dialog',
  !/watchNavIcon/.test(code(ENTRY)), 'index.tsx still calls watchNavIcon')

console.log('\n--- one id, shared by the section and its icon ---')
// The failure mode: two literals, one edited, and the icon silently never
// renders because `only: row.id` no longer matches it.
assert('the id is exported once as a constant', /export const SECTION_ID = '[^']+'/.test(nav),
  'SECTION_ID is not exported from nav-icon.ts')
const idMatch = /export const SECTION_ID = '([^']+)'/.exec(nav)
const sectionId = idMatch?.[1] ?? ''
assert('the icon registers under that constant, not a literal',
  /id: SECTION_ID/.test(nav), 'the icon registration builds its id some other way')
assert('the section registers under the same constant',
  /name: 'settings\.section', id: SECTION_ID/.test(code(ENTRY)),
  'index.tsx names the section with a literal, so the two can drift')
// The package name is the natural id; if it ever changes, both move together and
// this stays as the reminder of where it came from.
assert('and it is a non-empty id', sectionId.length > 0, sectionId)

console.log('\n--- the mark itself ---')
const mark = /export const MARK_PATHS = ([\s\S]*?)\n\nexport function MarkIcon/.exec(ICONS)?.[1] ?? ''
assert('MARK_PATHS is declared', mark.length > 0)
assert('it is drawn on the 16-unit grid the nav asks for', /viewBox="0 0 16 16"/.test(ICONS))
// `currentColor` is what lets one glyph work on the sidebar's text tint and on
// the brand tile's inverted foreground; a hard-coded fill would only suit one.
assert('its ink is currentColor', /fill="currentColor"/.test(mark) && /stroke="currentColor"/.test(mark))
assert('and nothing in it hard-codes an ink colour',
  !/(fill|stroke)="(?!currentColor|none)[^"]*"/.test(mark), 'MARK_PATHS pins a literal colour')
// The old sun stays: its other caller is the "follow the system theme" button,
// where a plain sun is the right glyph and the mark would be wrong.
assert('the plain sun is kept for the theme button', /export const SUN_PATHS/.test(ICONS))
assert('and the brand tile draws the MARK, not the sun',
  /dab-brand-tile"><MarkIcon/.test(code(SECTION)), 'ThemeSection still puts SunIcon in the brand tile')

console.log('\n--- the artwork keeps its headroom ---')
// The published icon is the same mark at 36 units, drawn through a uniform scale
// so the container is filled the way other plugins fill theirs. The scale is only
// safe while the transformed ink stays inside the viewBox; if the drawing grows,
// this stops being true and the corners get clipped with no error.
const svg = read('icon.svg')
assert('the published icon declares a 36 viewBox', /viewBox="0 0 36 36"/.test(svg))
const scale = Number(/scale\(([\d.]+)\)/.exec(svg)?.[1] ?? 1)
assert('its scale stays under the vertical limit (36 / ink height)', scale > 0 && scale < 1.3, String(scale))

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
