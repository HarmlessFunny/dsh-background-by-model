/**
 * Checks the header eye — "wallpaper only" — and the four things that have to
 * hold for it to be a way OUT as well as a way in: `pnpm check:peek`.
 *
 * WHY THIS EARNS A CHECK OF ITS OWN. Every failure mode here is silent, and each
 * one produces a different wrong screen:
 *
 *   1. **The slot registration drifts** (a renamed slot, a reused shipped id, a
 *      missing `locale: NS`). The button simply never appears, and nothing says
 *      so — the same class of silence as the settings-nav icon that used to show
 *      a gear.
 *   2. **The two halves of the attribute name disagree** (the stylesheet selects
 *      `html[data-dab-peek]` while the module sets `data-dab-peek-mode`). CSS
 *      cannot import a constant, so this is a real risk every time either side is
 *      edited: the click toggles a property no rule matches and the interface
 *      never hides.
 *   3. **The escape hatch goes away** — no `Escape` handler, or no
 *      `visibility:visible` for the button itself. The user is then on a bare
 *      wallpaper with no visible control, which is unrecoverable without
 *      reloading the page. This is the one that must never regress.
 *   4. **The plugin hides the interface and then unloads without giving it back**
 *      (an HMR update, or the plugin being disabled): an empty screen that the
 *      user cannot explain, because the code that would explain it is gone.
 *
 * Two facts are checked BEHAVIOURALLY rather than by reading source, because they
 * are decisions rather than registrations and a source regex would pin the
 * spelling instead of the behaviour:
 *
 *   - `setPeeking(true)` sets the attribute and `setPeeking(false)` removes it, and
 *     subscribers are notified both ways;
 *   - leaving the mode with `Escape` calls the same setter, in the capture phase.
 *
 * The module under test is plain TypeScript with one runtime import (the CSS
 * injector), and `node --experimental-strip-types` runs it directly — so the tests
 * below import `PEEK_ATTR` itself rather than a copy of the string, which is what
 * makes the "both halves agree" assertion meaningful.
 *
 * Runs on plain `node` (≥ 22.6 strips the types itself), no dependency, no
 * transform, no browser.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (rel: string): string => readFileSync(resolve(HERE, '..', rel), 'utf8')
const PEEK = read('src/client/peek.ts')
const BUTTON = read('src/client/components/PeekButton.tsx')
const ICONS = read('src/client/components/icons.tsx')
const CSS = read('src/client/components/ui.css.ts')
const ENTRY = read('src/client/index.tsx')
const I18N = read('src/client/i18n.ts')

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

/** Comments stripped, so a sentence describing the rule can never satisfy it. */
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

// ── 1. the button is registered where the user asked for it ─────────────────
console.log('--- the eye is a slot entry in the conversation header ---')
const entry = code(ENTRY)
check('registered into the header utilities slot',
  /slots\.inject\('conversation\.session\.header\.utilities'/.test(entry)
  && /name: 'conversation\.session\.header\.utilities'/.test(entry), true)
check('under its own id, not one of the shipped ones',
  /id: PEEK_ID/.test(entry), true)
// A LIST slot adds a fresh id beside the shipped entries; reusing one of theirs
// would replace that control instead of sitting next to it.
const peekId = /export const PEEK_ID = '([^']+)'/.exec(code(PEEK))?.[1] ?? ''
assert('and that id collides with nothing the harness ships',
  peekId !== '' && peekId !== 'schedule-catalog' && peekId !== 'forge-panel', peekId)
check('with the locale namespace bound, so the label follows the language',
  /locale: NS,/.test(entry), true)
check('and it renders the eye component', /PeekButton as any/.test(entry), true)
// The mode is document-level, so it must be armed by the plugin entry and not by
// the settings section: the header exists whether or not that page is open.
assert('the mode is armed by the plugin entry, not by the section',
  /registerPeek\(ctx\)/.test(entry), 'index.tsx no longer calls registerPeek')
assert('and not by the settings section',
  !/registerPeek/.test(code(read('src/client/components/ThemeSection.tsx'))),
  'ThemeSection arms the mode — it would only work once the page is opened')

// ── 2. one attribute name, shared by the module and the stylesheet ──────────
console.log('\n--- the stylesheet and the module name the same attribute ---')
// The duplication is unavoidable (CSS cannot import), so it is asserted instead:
// a mismatch is a button whose click changes an attribute no rule matches.
const attr = /export const PEEK_ATTR = '([^']+)'/.exec(code(PEEK))?.[1] ?? ''
assert('PEEK_ATTR is exported', attr.length > 0)
assert('the stylesheet selects that very attribute',
  attr.length > 0 && CSS.includes(`html[${attr}]`), `ui.css.ts has no html[${attr}] rule`)
assert('the module sets it on <html>',
  /document\.documentElement\.setAttribute\(PEEK_ATTR/.test(code(PEEK)),
  'the attribute is set on something other than <html>')
assert('and reads it back from the same place',
  /document\.documentElement\.hasAttribute\(PEEK_ATTR\)/.test(code(PEEK)),
  'the state read and the state write disagree about the element')

// ── 3. hiding hides the interface and NOTHING ELSE ──────────────────────────
console.log('\n--- what is hidden, and what is deliberately not ---')
// `#root` is the app's mount point, and the wallpaper layer is its SIBLING, so
// this one selector is the whole reason the picture survives.
assert('the app mount point is the thing hidden',
  CSS.includes(`html[${attr}] #root`) && /#root[^{]*\{visibility:hidden/.test(CSS),
  'ui.css.ts does not hide #root')
// THE REPORT THIS FIXED: "侧边栏没隐藏完全" — the workspace header's section label
// and its two action buttons stayed over the picture. `visibility` is inherited,
// so a descendant re-asserting `visible` (the harness does, in eight of its own
// stylesheets) punches a hole in a rule that only covers #root. `!important` on
// #root does NOT help: importance belongs to the element that declares it, and
// descendants still INHERIT — an inherited value loses to any declaration the
// descendant makes on itself.
// NOTE: built with the RegExp constructor, not a literal — a regex LITERAL does
// not interpolate, so `/\[${attr}\]/` would look for the four characters "${attr}"
// and pass or fail for reasons that have nothing to do with the stylesheet.
assert('every descendant is hidden, not merely the mount point',
  CSS.includes(`[${attr}] #root,`)
  && new RegExp(`\\[${attr}\\] #root \\*\\{visibility:hidden!important\\}`).test(CSS),
  'the hidden rule stops at #root — any host rule that re-asserts visibility:visible leaks')
// Without !important the host's own `.sectionLabel{visibility:visible}` wins by
// document order in some builds and by nothing at all in others — it is the same
// specificity class, so the outcome would depend on stylesheet order.
assert('and the hidden rule cannot be out-ranked',
  /#root \*\{visibility:hidden!important\}/.test(CSS),
  'the subtree rule is not !important — a host re-assertion ties with it')
// The shell the plugin is loaded into really does render into #root: if the
// harness ever renames it, the mode becomes a no-op. The id comes from the Web
// entry in this repo's own dependency, which is where it has to be read.
const webEntry = (() => {
  try {
    return readFileSync(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-web-frontend')), 'utf8')
  } catch {
    return ''
  }
})()
if (webEntry === '') {
  console.log('skip #root contract: dsh-web-frontend is not installed here')
} else {
  assert("the shell really mounts into #root", webEntry.includes('#root'),
    'dsh-web-frontend no longer names #root — peek has nothing to hide')
}
// The wallpaper must not be swept up with it: it is a body-level sibling painted
// at z-index -1 (see ./wallpaper's ensureWpContainer), which is what leaves the
// picture on screen.
assert('the wallpaper layer is never selected by the mode',
  !new RegExp(`html\\[${attr}[^\\]]*\\][^{]*data-dab-wp`).test(CSS),
  'a peek rule targets the wallpaper layer — the mode would hide the picture too')
// `#root *` reaches every descendant, so the wallpaper must not be inside it. A
// belt-and-braces check that it really is a body-level sibling: the layer is
// prepended to <body> by ensureWpContainer, never appended to #root.
const WALLPAPER = readFileSync(resolve(HERE, '../src/client/wallpaper.ts'), 'utf8')
assert('the wallpaper is mounted beside the mount point, not inside it',
  /document\.body\.prepend\(wpEl\)/.test(code(WALLPAPER)),
  'the wallpaper moved inside #root — every descendant rule would now hide it')
// Display:none would drop the tree's layout AND lose the scroll position, which is
// the whole reason visibility was chosen. Scanned line by line, so a rule added
// anywhere in the stylesheet is caught rather than only the one this check knows.
const peekRules = CSS.split('\n').filter(line => line.includes(`[${attr}]`))
assert('some rule really targets the mode', peekRules.length > 0)
assert('the mode uses visibility, not display',
  !peekRules.some(line => /display\s*:\s*none/.test(line)),
  'a peek rule sets display:none — the conversation would lose its scroll position')

// ── 4. the way back ─────────────────────────────────────────────────────────
console.log('\n--- the way back: a click, any key, and unload ---')
// NOTHING IS HANDED BACK. The subtree rule must be the last word, with no
// exception: an earlier version re-lit the eye so it could be the exit, which left
// a control floating alone on the user's wallpaper. The mode is left by a DOM
// listener now, so a `visibility:visible` anywhere in a peek rule means the old
// design crept back.
assert('no node is exempted from the hidden state',
  !/visibility:visible/.test(peekRules.join('\n')),
  'a peek rule re-lights something — the screen would not be just the wallpaper')
// The exit is a gesture, not a control: both a click and a key, both in the
// CAPTURE phase at document, so the dismissing input is seen before any host
// handler and can be consumed (otherwise the same click would press whatever it
// revealed, and the same key would be typed into the composer).
assert('a click leaves the mode', /addEventListener\('click', leave, true\)/.test(code(PEEK)))
assert('any key leaves the mode', /addEventListener\('keydown', leave, true\)/.test(code(PEEK)))
// A click that is restored during mousedown would be dispatched against a tree
// that is visible again. Restoring on `click` keeps the whole gesture over the
// hidden tree, and the event cannot retarget onto what just appeared.
assert('and the click is not split across the restore',
  !/addEventListener\('pointerdown'/.test(code(PEEK)) && !/addEventListener\('mousedown'/.test(code(PEEK)),
  'the mode is left on pointerdown/mousedown — the follow-up click lands on the restored UI')
// One handler for both, so the "is the mode on?" test exists once.
assert('one handler leaves the mode for either input',
  /const leave = \(e: Event\)/.test(code(PEEK)) && /if \(!isPeeking\(\)\) return/.test(code(PEEK)))
assert('and the dismissing input is consumed',
  /e\.stopPropagation\(\)/.test(code(PEEK)) && /e\.preventDefault\(\)/.test(code(PEEK)))
// Entering must not immediately leave: the entering click's capture phase at
// document runs BEFORE the host's handler on the mount container turns the mode on,
// so it is still off there and the handler returns.
assert('the click that enters the mode is not the click that leaves it',
  /addEventListener\('click', leave, true\)/.test(code(PEEK)),
  'the exit listener moved off the capture phase — the entering click would undo itself')
// ANY key, modifiers included — not just Escape. A mode whose only exits are "the
// key we documented" and "the control we drew" is one some users get stuck in, and
// the request was explicit: one press, any key.
assert('the key handler does not filter for one key',
  !/key !== 'Escape'/.test(code(PEEK)) && !/\.key ===/.test(code(PEEK)),
  'the key handler now accepts only one key — the mode could be left stuck')
// Disposal must hand the interface back: an HMR reload or a disabled plugin that
// left the screen empty is a bug the user cannot even report.
assert('unloading the plugin gives the interface back',
  /setPeeking\(false\)/.test(code(PEEK)), 'the dispose effect does not restore the interface')
assert('focus is dropped on the way in',
  /activeElement[\s\S]{0,80}blur\(\)/.test(code(PEEK)),
  'a focused control keeps receiving keys while invisible')

// ── 4b. the stylesheet still parses ────────────────────────────────────────
// UI_CSS is a TEMPLATE LITERAL, so a backtick anywhere inside it — including in a
// comment — closes the string early and the bundle stops building. That has
// happened twice while editing this block, both times from a `code` span in a
// sentence, and both times the failure surfaced as an unrelated-looking parse
// error in the middle of a CSS comment. The two boundary backticks are the only
// legal ones.
// Scoped to the template BODY, not the file: the module's own doc comments use
// backticks legitimately, so a whole-file count would be noise. The body runs from
// the opening backtick to the last line that is nothing but a closing backtick.
const lines = CSS.split('\n')
const open = lines.findIndex(line => line.includes('export const UI_CSS = `'))
const close = lines.reduce((last, line, i) => (line === '`' ? i : last), -1)
assert('the template body can be located', open >= 0 && close > open, `open ${open}, close ${close}`)
const body = lines.slice(open + 1, close).join('\n')
assert('no backtick inside the stylesheet body',
  !body.includes('`'),
  'a backtick inside UI_CSS closes the string early — every edit of this block has to escape it')

// ── 5. the button and its glyphs ────────────────────────────────────────────
console.log('\n--- the control ---')
// ONE STATE ONLY, and that is the point: the button is hidden along with the rest
// of the interface while the mode is on, so it must not carry a pressed look, a
// second glyph, or a document subscription to keep either in step. A `useState`
// flag or a `useSyncExternalStore` here would mean the button believes it can be
// visible in the hidden state — the design that was just removed.
assert('the button does not track the mode',
  !/useSyncExternalStore|useState|subscribePeek/.test(code(BUTTON)),
  'PeekButton subscribes to the mode — it is meant to be hidden with everything else')
assert('so it claims no pressed state', !/aria-pressed/.test(BUTTON),
  'a toggle that can never be visible as pressed is worse than a plain button')
assert('it calls the one-way entry', /togglePeeking\(\)/.test(code(BUTTON)))
// A literal t('…') call, which is what lets check:ui see the key.
assert('its label is the one dictionary key', /t\('peekHide'\)/.test(code(BUTTON)))
assert('it is a real button, reachable by keyboard',
  /<button[\s\S]*?type="button"/.test(BUTTON))
// One glyph: the crossed-out twin went with the state that needed it.
assert('the open eye exists and is currentColor',
  /export const EyeIcon/.test(ICONS) && /fill="currentColor"/.test(ICONS),
  'icons.tsx is missing the eye glyph')
assert('the crossed-out twin is gone with the hidden-state button',
  !/EyeOffIcon/.test(ICONS) && !/EyeOffIcon/.test(BUTTON),
  'a glyph nothing can render is still in the bundle')
assert('the stylesheet rule for the button exists', /\.dab-peek-btn\{/.test(CSS))

// ── 6. copy ─────────────────────────────────────────────────────────────────
console.log('\n--- copy ---')
for (const key of ['peekHide']) {
  const hits = I18N.match(new RegExp(`\\b${key}:`, 'g')) ?? []
  check(`"${key}" is in both dictionaries`, hits.length, 2)
}
// The label for a state whose control no longer exists would be a dead entry, and
// `check:ui` would fail on it — asserted here too so the reason is written down.
assert('no label survives for the removed hidden-state button',
  !/\bpeekShow:/.test(I18N), 'peekShow is still in the dictionaries')
// The mode is a way of looking, not a preference: persisting it would reopen the
// app with no interface and nothing on screen to explain why.
assert('the mode is not written to the config',
  !/persistConfig|saveConfig|cfg\./.test(code(PEEK)),
  'peek.ts touches the config — a hidden interface would be restored on the next boot')
assert('and not restored from it', !/localStorage|sessionStorage/.test(code(PEEK)),
  'peek.ts persists the mode in web storage')

// ── 7. the behaviour itself ─────────────────────────────────────────────────
console.log('\n--- the mode, exercised ---')
// A minimal document: the module only ever touches documentElement's attributes,
// one getElementById probe and activeElement. `HTMLElement` is stubbed because the
// focus drop is an `instanceof` test — the point of it is that a focused control
// keeps receiving keys while it is invisible, so it is worth keeping the real
// check rather than loosening the source to suit this harness.
class FakeHTMLElement { blurred = false; blur(): void { this.blurred = true } }
;(globalThis as any).HTMLElement = FakeHTMLElement
const attrs = new Set<string>()
const listeners = new Set<() => void>()
let handlers = new Map<string, Array<(e: any) => void>>()
const fakeDocument = {
  documentElement: {
    setAttribute: (name: string) => { attrs.add(name) },
    removeAttribute: (name: string) => { attrs.delete(name) },
    hasAttribute: (name: string) => attrs.has(name),
  },
  getElementById: () => ({ id: 'root' }),
  activeElement: null,
  addEventListener: (type: string, fn: (e: any) => void) => {
    handlers.set(type, [...(handlers.get(type) ?? []), fn])
  },
  removeEventListener: (type: string, fn: (e: any) => void) => {
    handlers.set(type, (handlers.get(type) ?? []).filter(h => h !== fn))
  },
}
;(globalThis as any).document = fakeDocument
const { PEEK_ATTR, isPeeking, setPeeking, registerPeek } = await import('../src/client/peek.ts')

check('starts visible', isPeeking(), false)
setPeeking(true)
check('hiding sets the attribute', attrs.has(PEEK_ATTR), true)
check('and reports the new state', isPeeking(), true)
// Idempotent: a caller that sets the mode it is already in must not churn the DOM.
setPeeking(true)
check('setting the same mode again is a no-op', attrs.has(PEEK_ATTR), true)
setPeeking(false)
check('showing removes the attribute', attrs.has(PEEK_ATTR), false)

// The plugin-lifetime half: the two exits, and the dispose that restores.
const disposed: Array<() => void> = []
registerPeek({ effect: (cb: () => () => void) => { disposed.push(cb()) } } as any)
const clickHandler = (handlers.get('click') ?? [])[0]
const keyHandler = (handlers.get('keydown') ?? [])[0]
assert('a click is listened for', clickHandler !== undefined)
assert('a key is listened for', keyHandler !== undefined)

/** One synthetic event, with the two calls the handler is expected to make. */
const ev = (extra: Record<string, unknown> = {}) => {
  const seen = { prevented: false, stopped: false }
  return {
    seen,
    event: {
      ...extra,
      preventDefault: () => { seen.prevented = true },
      stopPropagation: () => { seen.stopped = true },
    },
  }
}

if (clickHandler !== undefined && keyHandler !== undefined) {
  for (const [name, fire] of [['a click', clickHandler], ['a key', keyHandler]] as const) {
    setPeeking(true)
    const { seen, event } = ev()
    fire(event)
    check(`${name} shows the interface`, isPeeking(), false)
    check(`${name} is consumed`, [seen.prevented, seen.stopped], [true, true])
  }
  // ANY key, not just the documented one: a modifier press must leave as well,
  // because "which key" is exactly the thing a stuck user would get wrong.
  setPeeking(true)
  keyHandler(ev({ key: 'Shift', shiftKey: true }).event)
  check('a modifier key leaves too', isPeeking(), false)

  // The handler must be inert while the mode is off — otherwise every ordinary
  // click in the app would be prevented and stopped, breaking the whole UI.
  setPeeking(false)
  const idleClick = ev()
  clickHandler(idleClick.event)
  check('an ordinary click is untouched', [idleClick.seen.prevented, idleClick.seen.stopped], [false, false])
  const idleKey = ev({ key: 'a' })
  keyHandler(idleKey.event)
  check('and an ordinary keystroke is untouched', [idleKey.seen.prevented, idleKey.seen.stopped], [false, false])
}

// An HMR reload, or the plugin being disabled, must not leave an empty screen.
setPeeking(true)
for (const fn of disposed) fn()
check('disposal gives the interface back', isPeeking(), false)
check('and it unregisters both exits',
  (handlers.get('click') ?? []).length === 0 && (handlers.get('keydown') ?? []).length === 0,
  true)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
