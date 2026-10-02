/**
 * End-to-end checks for the NODE half — `pnpm check:node`.
 *
 * Runs against the built bundle (`lib/index.js`) through the real RPC handler,
 * with `DSH_HOME` redirected to a throwaway directory first, so it exercises the
 * actual persistence path without ever touching the user's `~/.dsh`.
 *
 * It covers the things that only exist at this layer:
 *
 *   - the holiday block survives the shared sanitizer on the way to disk;
 *   - the wallpapers bundled in the package are served from an EMPTY slot, and
 *     are not copied into the data directory to do it;
 *   - a holiday slot is READ-ONLY: a file dropped into it is ignored by every
 *     read, and writing, deleting and URL-fetching are all refused — that is
 *     what makes the festival art impossible to swap;
 *   - an ordinary rule slot still writes, reads back and deletes as before;
 *   - a hand-edited config cannot point a holiday at another rule's image.
 *
 * Needs `lib/` to be built; `pnpm test` runs tsdown first. Plain `.mjs` on
 * purpose — no dependency, no transform.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// MUST precede the import below: dsh-home-path resolves $DSH_HOME per call, but
// the plugin module reads it as soon as the first RPC arrives, and pointing this
// at the real home would rewrite the user's live config.
const HOME = mkdtempSync(join(tmpdir(), 'dsh-bg-check-'))
process.env.DSH_HOME = HOME
const DATA = join(HOME, '.dsh-background-by-model-data')

// A file:// URL, not a path: on Windows the ESM loader rejects `E:\…` outright.
const { apply } = await import(new URL('../lib/index.js', import.meta.url).href)

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

let handler = null
apply({
  inject: (_deps, cb) => cb({
    webServer: { register: (spec) => { handler = spec.handler; return () => {} } },
    connection: { requestRejection: () => undefined },
    effect: (cb) => cb(),
  }),
})
check('the RPC handler registers itself', typeof handler === 'function')
if (typeof handler !== 'function') process.exit(1)

/** One call through the real handler, envelope and URL included. */
async function call(method, payload = {}) {
  const full = `dshBackgroundByModel/${method}`
  const req = {
    method: 'POST',
    url: `/dsh-background-by-model/${full}`,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'check', method: full, payload }))
    },
  }
  let out = ''
  await handler(req, { writeHead() {}, end(b) { if (b !== undefined && b !== null) out += b.toString() } })
  return JSON.parse(out).result
}
const dataUrl = async (slot) => (await call('readImage', { slot })).value?.dataUrl ?? null
const kb = (u) => Math.round(Buffer.from(u.slice(u.indexOf(',') + 1), 'base64').length / 1024)
const readConfig = async () => (await call('read')).value.config

console.log('\n--- the holiday block through the shared sanitizer ---')
const first = await readConfig()
const h = first.holidays
check('the block exists at all', h !== undefined)
check('the override is ON with no config at all (easter egg: it just works)', h.enabled === true)
check('one entry per built-in holiday, in HOLIDAYS order',
  JSON.stringify(h.items.map(i => i.id)) === JSON.stringify(['mid-autumn', 'national-day']),
  JSON.stringify(h.items.map(i => i.id)))
check('slots are the fixed holiday slots, not rule slots',
  JSON.stringify(h.items.map(i => i.images[0].slot)) === JSON.stringify(['h-midautumn', 'h-nationalday']))
check('bgMode defaults to fill, not a rule default', h.items.every(i => i.bgMode === 'fill'))
check('each entry is switched on by default', h.items.every(i => i.enabled === true))
check('color starts filled in — it is a constant, not derived from the art',
  h.items.every(i => Array.isArray(i.color) && i.color.length === 3))
check('nothing in the shape offers to swap the image',
  h.items.every(i => !('useBundled' in i) && !('image' in i) && !('asset' in i)),
  JSON.stringify(Object.keys(h.items[0])))

console.log('\n--- the packaged wallpapers are served from an empty slot ---')
const mid = await dataUrl('h-midautumn')
const nat = await dataUrl('h-nationalday')
check('mid-autumn is served as webp', mid?.startsWith('data:image/webp;base64,') === true,
  mid === null ? 'null' : `${kb(mid)} KB`)
check('mid-autumn is the bundled 228 KB file', mid !== null && Math.abs(kb(mid) - 228) <= 4,
  `${mid === null ? '-' : kb(mid)} KB`)
check('national-day is the bundled 500 KB file', nat !== null && Math.abs(kb(nat) - 500) <= 4,
  `${nat === null ? '-' : kb(nat)} KB`)
check('an empty non-holiday slot stays empty', await dataUrl('m9') === null)
check('serving them wrote nothing to the data directory',
  !existsSync(join(DATA, 'modelbg-h-midautumn')) && !existsSync(join(DATA, 'modelbg-h-nationalday')))

// A one-pixel PNG, to have real bytes to try to plant and to write normally.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64')
const pngUrl = `data:image/png;base64,${png.toString('base64')}`
const withHolidays = (mutate) => ({ ...first, holidays: { enabled: true, items: mutate(first.holidays.items) } })

console.log('\n--- a holiday slot is read-only ---')
mkdirSync(DATA, { recursive: true })
writeFileSync(join(DATA, 'modelbg-h-midautumn'), png)
check('a file dropped into the slot is ignored; the package art is served',
  (await dataUrl('h-midautumn'))?.startsWith('data:image/webp') === true)
check('and the other holiday is untouched',
  (await dataUrl('h-nationalday'))?.startsWith('data:image/webp') === true)
check('an explicit write to a holiday slot is refused',
  (await call('writeImage', { slot: 'h-midautumn', dataUrl: pngUrl })).value === false)
check('a delete of a holiday slot is refused',
  (await call('deleteImage', { slot: 'h-midautumn' })).value === false)
check('the refused delete left the file where it was — nothing half-happened',
  existsSync(join(DATA, 'modelbg-h-midautumn')))
check('a URL fetch into a holiday slot is refused before it downloads',
  (await call('fetchImageUrl', { slot: 'h-nationalday', url: 'https://example.invalid/x.png' })).value?.error === 'read-only slot')
rmSync(join(DATA, 'modelbg-h-midautumn'), { force: true })

console.log('\n--- an ordinary rule slot is still the user\'s ---')
check('a rule slot accepts a write', (await call('writeImage', { slot: 'm9', dataUrl: pngUrl })).value === true)
check('and reads back the bytes it was given',
  (await dataUrl('m9'))?.startsWith('data:image/png;base64,') === true)
check('and appears in the stored-slot list', (await call('read')).value.slots.includes('m9'))
check('and deletes', (await call('deleteImage', { slot: 'm9' })).value === true)
check('leaving it empty again', await dataUrl('m9') === null)

console.log('\n--- the image-swap flag is gone from the shape ---')
// A 0.6.0 client still sends this field. It has to be dropped by the shared
// sanitizer rather than persisted and re-read, and the art must be served anyway.
await call('writeConfig', { config: withHolidays(items => items.map(i => ({ ...i, useBundled: false }))) })
check('a leftover useBundled is dropped, not persisted',
  (await readConfig()).holidays.items.every(i => !('useBundled' in i)))
check('and the bundled art is served regardless',
  (await dataUrl('h-midautumn'))?.startsWith('data:image/webp') === true)

console.log('\n--- the holiday theme colors are fixed, and are the ones asked for ---')
// The definitions quote a hex color and ./schema converts it to the `[h, s, l]`
// triple a rule stores. The expected triples are written out HERE, by hand, so
// the conversion cannot be checked against itself.
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) <= 1e-6
const colors = (await readConfig()).holidays.items.map(i => i.color)
check('mid-autumn is #384A77 -> hsl(222.85714285714286, 0.36, 0.3431372549019608)',
  Array.isArray(colors[0]) && near(colors[0][0], 222.85714285714286)
  && near(colors[0][1], 0.36) && near(colors[0][2], 0.3431372549019608),
  JSON.stringify(colors[0]))
check('national-day is #FFF6EB -> hsl(33, 1, 0.9607843137254902)',
  Array.isArray(colors[1]) && near(colors[1][0], 33)
  && near(colors[1][1], 1) && near(colors[1][2], 0.9607843137254902),
  JSON.stringify(colors[1]))

// A color is a fact about the holiday, not about the config that mentions it.
await call('writeConfig', { config: withHolidays(items => items.map(i => ({ ...i, color: [1, 0.5, 0.5] }))) })
const forced = (await readConfig()).holidays.items.map(i => i.color)
check('a hand-edited holiday color is replaced by the definition\'s',
  near(forced[0]?.[0], 222.85714285714286) && near(forced[1]?.[2], 0.9607843137254902),
  JSON.stringify(forced))

console.log('\n--- a hand-edited config cannot redirect a holiday ---')
await call('writeConfig', {
  config: {
    ...first,
    holidays: {
      enabled: true,
      items: [
        { ...first.holidays.items[0], images: [{ slot: 'm1' }], slot: 'm1', id: 'mid-autumn' },
        { ...first.holidays.items[1], images: [{ slot: 'm1' }, { slot: 'm2' }], id: 'national-day' },
        { id: 'not-a-real-holiday', images: [{ slot: 'm2' }], enabled: true },
      ],
    },
  },
})
const repaired = (await readConfig()).holidays
check('a lying slot is replaced by the definition slot',
  JSON.stringify(repaired.items.map(i => i.images[0].slot)) === JSON.stringify(['h-midautumn', 'h-nationalday']),
  JSON.stringify(repaired.items.map(i => i.images[0].slot)))
check('a holiday can never end up with more than its one packaged image',
  repaired.items.every(i => i.images.length === 1))
check('an unknown holiday id is dropped', repaired.items.length === 2)

// The switch is an off-ramp, so only an explicit `false` takes it down: this is
// the same "absent means on" rule the per-holiday switch already uses.
await call('writeConfig', { config: { ...first, holidays: { enabled: false, items: first.holidays.items } } })
check('an explicit false turns the override off', (await readConfig()).holidays.enabled === false)
await call('writeConfig', { config: { ...first, holidays: { enabled: 'yes', items: first.holidays.items } } })
check('anything that is not false leaves it on (off-ramp, not opt-in)',
  (await readConfig()).holidays.enabled === true)
await call('writeConfig', { config: withHolidays(items => items) })
check('an explicit true persists', (await readConfig()).holidays.enabled === true)

// A config written by a release that predates the feature has no block at all.
const withoutHolidays = { ...first }
delete withoutHolidays.holidays
await call('writeConfig', { config: withoutHolidays })
check('a config with no holiday block heals to the defaults',
  (await readConfig()).holidays.items.length === 2)

console.log('\n--- a rule owns a LIST of images (0.7), and old configs still load ---')
// A rule exactly as 0.6 wrote it: a single `slot` + `bgState` pair. The shared
// sanitizer has to lift it into the image list, or every existing profile loses
// its wallpaper on upgrade.
const legacyRule = {
  id: 'r-legacy', slot: 'm7', match: 'legacy', enabled: true, color: null,
  bgMode: 'fit', wallpaperOpacity: 0.8, blur: 3, bgState: { zoom: 2.5, x: 0.25, y: 0.75, iw: 1920, ih: 1080 },
}
const legacyWarnings = []
const realWarn = console.warn
console.warn = (...a) => { legacyWarnings.push(a.join(' ')) }
await call('writeConfig', { config: { ...first, rules: [legacyRule] } })
console.warn = realWarn
const lifted = (await readConfig()).rules[0]
check('the legacy slot became the rule\'s only image', lifted.images.length === 1 && lifted.images[0].slot === 'm7',
  JSON.stringify(lifted.images))
check('and its framing came along', lifted.images[0].bgState.zoom === 2.5 && lifted.images[0].bgState.iw === 1920,
  JSON.stringify(lifted.images[0].bgState))
check('the legacy fields are gone from the shape', !('slot' in lifted) && !('bgState' in lifted),
  JSON.stringify(Object.keys(lifted)))
check('and are not reported as drift (the sanitizer lifts them on purpose)',
  !legacyWarnings.some(w => w.includes('rules[].slot') || w.includes('rules[].bgState')),
  JSON.stringify(legacyWarnings))
check('a legacy rule gets the shipped rotation defaults',
  lifted.rotate.enabled === false && lifted.rotate.intervalMs === 60_000
  && lifted.rotate.order === 'order' && lifted.rotate.advanceOnSwitch === false && lifted.rotate.fadeMs === 320,
  JSON.stringify(lifted.rotate))

// The list itself: order, dedupe, and what an unusable entry does.
const multiRule = {
  id: 'r-multi', match: 'multi', enabled: true, color: null, bgMode: 'fill',
  wallpaperOpacity: 1, blur: 0,
  images: [
    { slot: 'm2', bgState: { zoom: 1, x: 0, y: 0, iw: 800, ih: 600 } },
    { slot: 'm3', bgState: { zoom: 1.5, x: 0.1, y: 0.2, iw: 1600, ih: 900 } },
    { slot: 'm3', bgState: { zoom: 9 } },
    { slot: 'bad slot!', bgState: {} },
    { slot: 'm4', bgState: { zoom: 0.5 } },
  ],
  rotate: { enabled: true, intervalMs: 30_000, order: 'shuffle', advanceOnSwitch: true, fadeMs: 700 },
}
await call('writeConfig', { config: { ...first, rules: [legacyRule, multiRule] } })
const rules = (await readConfig()).rules
check('every image keeps its order', JSON.stringify(rules[1].images.map(i => i.slot)) === JSON.stringify(['m2', 'm3', 'm4']),
  JSON.stringify(rules[1].images.map(i => i.slot)))
check('a duplicated slot is dropped', rules[1].images.length === 3)
check('an unusable slot is dropped', !rules[1].images.some(i => i.slot.startsWith('bad')))
check('each image keeps its OWN framing',
  rules[1].images[1].bgState.zoom === 1.5 && rules[1].images[2].bgState.zoom === 0.5,
  JSON.stringify(rules[1].images.map(i => i.bgState.zoom)))
check('the rotation block survives as written',
  JSON.stringify(rules[1].rotate) === JSON.stringify(multiRule.rotate), JSON.stringify(rules[1].rotate))

// An EMPTY image list is a legitimate rule, and it has to survive the round trip
// as an empty list: forcing an entry back in is what produced a phantom blank
// image at position 1 that could never be deleted, so a rule that uploaded a
// picture afterwards kept painting nothing.
const emptied = { ...multiRule, id: 'r-empty', images: [] }
await call('writeConfig', { config: { ...first, rules: [emptied] } })
const empty = (await readConfig()).rules
check('a rule the user emptied stays empty (nothing is conjured back in)',
  empty.length === 1 && Array.isArray(empty[0].images) && empty[0].images.length === 0,
  JSON.stringify(empty[0]?.images))
check('an emptied rule keeps its identity and settings',
  empty[0].id === 'r-empty' && empty[0].match === 'multi' && empty[0].bgMode === 'fill')
// A list whose entries are ALL unusable is the same state, not a broken rule.
await call('writeConfig', { config: { ...first, rules: [{ ...multiRule, id: 'r-junk', images: [{ slot: 'no good' }] }] } })
const junk = (await readConfig()).rules
check('a list of entirely unusable slots lands as an empty rule, not as a broken one',
  junk.length === 1 && junk[0].images.length === 0, JSON.stringify(junk.map(r => r.images)))
// The genuine pre-0.7 garbage — no list at all AND no usable slot — is still dropped.
await call('writeConfig', { config: { ...first, rules: [{ id: 'r-noslot', match: 'x', enabled: true }] } })
check('a rule that names no image anywhere is still dropped',
  (await readConfig()).rules.length === 0)
// The shape the host announces is what the browser half gates its writes on: it
// holds EVERY write against a host that reports less than it writes (see
// SCHEMA_VERSION in ./src/schema), because that host's sanitizer would drop the
// rules it cannot read. 3 = a rule may keep an empty image list.
const announced = (await call('read')).value.schema
check('the host announces the shape it sanitizes with', announced === 3, String(announced))
// An emptied rule keeps the color it had: that color is what it paints while it
// has no wallpaper, so it is not a field to clean up.
await call('writeConfig', {
  config: { ...first, rules: [{ ...emptied, color: [210, 0.5, 0.4], match: 'deepseek' }] },
})
const kept = (await readConfig()).rules
check('an emptied rule keeps its theme color (that is what it paints now)',
  kept.length === 1 && kept[0].images.length === 0 && Array.isArray(kept[0].color) && kept[0].color[0] === 210,
  JSON.stringify({ images: kept[0]?.images, color: kept[0]?.color }))

// Hostile / stale values go through the same clamp every half shares.
await call('writeConfig', {
  config: {
    ...first,
    rules: [{ ...multiRule, rotate: { enabled: 'yes', intervalMs: 10, order: 'zigzag', advanceOnSwitch: 'yes', fadeMs: 999_999 } }],
  },
})
const clamped = (await readConfig()).rules[0].rotate
check('only an explicit true turns the rotation on', clamped.enabled === false, JSON.stringify(clamped.enabled))
check('a too-fast dwell is clamped up', clamped.intervalMs === 5_000, String(clamped.intervalMs))
check('an unknown order falls back to sequential', clamped.order === 'order', String(clamped.order))
check('a truthy-but-not-true switch stays off', clamped.advanceOnSwitch === false, String(clamped.advanceOnSwitch))
check('an absurd fade is clamped', clamped.fadeMs === 3_000, String(clamped.fadeMs))
// 0 fade is a legal value (a hard cut), so it must not be read as "absent".
await call('writeConfig', { config: { ...first, rules: [{ ...multiRule, rotate: { ...multiRule.rotate, fadeMs: 0 } }] } })
check('a zero fade is kept, not defaulted', (await readConfig()).rules[0].rotate.fadeMs === 0)

// A field only the (newer) client knows about, one level down inside a rule.
const nestedWarnings = []
console.warn = (...a) => { nestedWarnings.push(a.join(' ')) }
await call('writeConfig', {
  config: { ...first, rules: [{ ...multiRule, rotate: { ...multiRule.rotate, bogus: 1 } }] },
})
console.warn = realWarn
check('nested drift inside rules[].rotate is reported',
  nestedWarnings.some(w => w.includes('rules[].rotate.bogus')), JSON.stringify(nestedWarnings))
check('and the unknown key is not persisted', !('bogus' in (await readConfig()).rules[0].rotate))

// Every image of one rule is independent bytes on disk — that is what makes a
// per-image delete safe and a rotation possible at all.
const pngA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
await call('writeConfig', { config: { ...first, rules: [multiRule] } })
check('image 1 of a rule writes', (await call('writeImage', { slot: 'm2', dataUrl: pngUrl })).value === true)
check('image 2 of the same rule writes independently',
  (await call('writeImage', { slot: 'm3', dataUrl: `data:image/png;base64,${pngA.toString('base64')}` })).value === true)
const stored = (await call('read')).value.slots
check('both appear in the stored-slot list',
  ['m2', 'm3'].every(s => stored.includes(s)) === true)
check('deleting one leaves the other', await (async () => {
  await call('deleteImage', { slot: 'm2' })
  return (await dataUrl('m2')) === null && (await dataUrl('m3')) !== null
})())
await call('deleteImage', { slot: 'm3' })

console.log('\n--- the config on disk round-trips ---')
const onDisk = JSON.parse(readFileSync(join(DATA, 'theme-config.json'), 'utf8'))
check('holidays are persisted', Array.isArray(onDisk.holidays?.items) && onDisk.holidays.items.length === 2)
check('and carry no image-swap flag to disk', onDisk.holidays.items.every(i => !('useBundled' in i)))
check('and the fixed colors are what landed on disk',
  near(onDisk.holidays.items[0]?.color?.[0], 222.85714285714286)
  && near(onDisk.holidays.items[1]?.color?.[2], 0.9607843137254902),
  JSON.stringify(onDisk.holidays.items.map(i => i.color)))
// The multi-image rule is written in the NEW shape only — no `slot`/`bgState`
// leftovers that a future reader could mistake for the current fields.
check('the rule list lands on disk as image lists',
  Array.isArray(onDisk.rules?.[0]?.images) && onDisk.rules[0].images.length === 3
  && !('slot' in onDisk.rules[0]) && !('bgState' in onDisk.rules[0]),
  JSON.stringify(onDisk.rules?.[0]))

rmSync(HOME, { recursive: true, force: true })
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
