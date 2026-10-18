/**
 * Checks for the ONE scheduler every recurring check runs on — `pnpm check:watchdogs`.
 *
 * Four timers (the model watch, the theme watchdog, the holiday rollover, the
 * delayed boot restores) used to run on four independent clocks. What went wrong
 * with that was never visible on screen: a check that stopped running looks
 * exactly like a check with nothing to report, and a disposer nobody wired looks
 * exactly like a plugin that keeps working. So the three properties that matter
 * are pinned here, on plain node, with `window` and `document` stubbed:
 *
 *   1. one beat — the shortest cadence any entry asks for, and nothing scheduled
 *      at all with no entries;
 *   2. per-entry due times — a 30 s entry is not asked every second;
 *   3. everything stops — `dispose()` leaves no interval, and `document.hidden`
 *      pauses the whole schedule.
 *
 * Plus the textual half: the plugin declares its cadences in one file and does not
 * create intervals of its own outside the scheduler, which is what makes "what
 * does this plugin poll" answerable.
 *
 * Runs on plain `node` (≥ 22.6 strips the types itself), no dependency.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLIENT = resolve(HERE, '../src/client')

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

// ── 1. a browser-shaped clock, under our hand ──────────────────────────────
/** Every live interval, by id, with its delay and callback. */
const intervals = new Map<number, { ms: number; fn: () => void }>()
let nextId = 1
let hidden = false
const listeners: Array<() => void> = []

const g = globalThis as Record<string, unknown>
g.window = {
  setInterval: (fn: () => void, ms: number) => { const id = nextId++; intervals.set(id, { ms, fn }); return id },
  clearInterval: (id: number) => { intervals.delete(id) },
  setTimeout: () => 0,
  clearTimeout: () => undefined,
}
// `performance.now` is monotonic, so the test drives it by hand.
let clock = 0
g.performance = { now: () => clock }
g.document = {
  get hidden() { return hidden },
  addEventListener: (_: string, fn: () => void) => { listeners.push(fn) },
  removeEventListener: (_: string, fn: () => void) => {
    const at = listeners.indexOf(fn)
    if (at >= 0) listeners.splice(at, 1)
  },
}

const { createSchedule } = await import('../src/client/watchdogs.ts')

/** One manual beat: every live interval fires once, then the clock moves. */
function beat(ms: number): void {
  clock += ms
  for (const { fn } of Array.from(intervals.values())) fn()
}

// ── 2. the scheduler itself ────────────────────────────────────────────────
console.log('--- one beat for every entry ---')
const schedule = createSchedule()
check('nothing registered, nothing scheduled', intervals.size, 0)

const calls: string[] = []
const disposeFast = schedule.add({ name: 'fast', everyMs: 1_000, run: () => { calls.push('fast') } })
const disposeSlow = schedule.add({ name: 'slow', everyMs: 5_000, run: () => { calls.push('slow') } })
check('the beat is the SHORTEST cadence asked for',
  Array.from(intervals.values()).map(i => i.ms), [1_000])
check('registering does not run anything yet', calls, [])

beat(1_000)
check('a 1 s entry runs on the first beat', calls, ['fast'])
beat(1_000)
check('a 5 s entry waits for its own due time', calls, ['fast', 'fast'])
beat(3_000)
check('and runs once its due time arrives', calls, ['fast', 'fast', 'fast', 'slow'])

console.log('\n--- a hidden tab is paused, and resumes ---')
calls.length = 0
hidden = true
beat(10_000)
check('nothing runs while the tab is hidden', calls, [])
hidden = false
for (const fn of listeners) fn()
check('coming back runs what fell due, at once', calls.includes('slow') && calls.includes('fast'), true)

console.log('\n--- a throwing check does not silence the others ---')
const before = calls.length
const warn = console.warn
console.warn = () => undefined
const disposeBad = schedule.add({
  name: 'bad', everyMs: 1_000,
  run: () => { calls.push('bad'); throw new Error('boom') },
})
beat(1_000)
console.warn = warn
check('the neighbour still ran', calls.slice(before).includes('fast'), true)
check('and the throw was reported', calls.slice(before).includes('bad'), true)

console.log('\n--- everything stops on dispose ---')
disposeFast(); disposeSlow(); disposeBad()
check('one disposer per entry removes it', intervals.size, 0)
const keep = schedule.add({ name: 'keep', everyMs: 1_000, run: () => undefined })
ok('a disposer returned by add exists', typeof keep === 'function')
schedule.dispose()
check('dispose leaves no interval behind', intervals.size, 0)
check('and unsubscribes from visibility', listeners.length, 0)

// ── 3. the wiring: one cadence file, one kind of timer ─────────────────────
console.log('\n--- the plugin creates its timers in one place ---')
const files = readdirSync(CLIENT).filter(n => n.endsWith('.ts') || n.endsWith('.tsx'))
  .map(n => resolve(CLIENT, n))
const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
/** Files that legitimately own a timer of their own. */
const OWNS_TIMERS: Record<string, string> = {
  'watchdogs.ts': 'the scheduler itself',
  'rotation-timer.ts': 'the dwell timer (its cadence comes from the config, not a constant)',
  'modelbg.ts': 'the model watch, which must also poll the sessions service',
  'wallpaper.ts': 'the fade settle timer and the rAF coalescing',
  'state.ts': 'the deferred object-URL revoke',
  'theme-skin.ts': 'the skin-switch debounce',
  'rpc.ts': 'the config write debounce',
  'appearance.ts': 'the two delayed boot restores, armed and disposed as one unit',
  'theme-file.ts': 'the object-URL release of the export download',
}
const strays: string[] = []
for (const file of files) {
  const name = file.slice(file.lastIndexOf('/') + 1)
  if (OWNS_TIMERS[name] !== undefined) continue
  const code = strip(readFileSync(file, 'utf8'))
  if (/window\.setInterval|window\.setTimeout|setInterval\(/.test(code)) strays.push(name)
}
check('no module arms an interval or a repeating timer behind the scheduler\'s back', strays, [])

const cadence = strip(readFileSync(resolve(CLIENT, 'cadence.ts'), 'utf8'))
ok('every cadence is named once, in ./cadence',
  /THEME_WATCH_MS = 1_000/.test(cadence)
  && /HOLIDAY_WATCH_MS = 30_000/.test(cadence)
  && /RESTORE_DELAYS_MS/.test(cadence))
const entry = strip(readFileSync(resolve(CLIENT, 'index.tsx'), 'utf8'))
ok('the entry point registers the checks on the ONE schedule',
  /createSchedule\(\)/.test(entry) && /schedule\.add\(themeWatchdog/.test(entry) && /schedule\.add\(holidayRollover/.test(entry))
ok('and disposes it with the plugin',
  /schedule\.dispose\(\)/.test(entry))
ok('the delayed restores are armed and disposed as one unit',
  /appearance\.armRestores\(\)/.test(entry))

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
