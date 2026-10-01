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
  JSON.stringify(h.items.map(i => i.slot)) === JSON.stringify(['h-midautumn', 'h-nationalday']))
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
        { ...first.holidays.items[0], slot: 'm1', id: 'mid-autumn' },
        { ...first.holidays.items[1], slot: 'm1', id: 'national-day' },
        { id: 'not-a-real-holiday', slot: 'm2', enabled: true },
      ],
    },
  },
})
const repaired = (await readConfig()).holidays
check('a lying slot is replaced by the definition slot',
  JSON.stringify(repaired.items.map(i => i.slot)) === JSON.stringify(['h-midautumn', 'h-nationalday']),
  JSON.stringify(repaired.items.map(i => i.slot)))
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

console.log('\n--- the config on disk round-trips ---')
const onDisk = JSON.parse(readFileSync(join(DATA, 'theme-config.json'), 'utf8'))
check('holidays are persisted', Array.isArray(onDisk.holidays?.items) && onDisk.holidays.items.length === 2)
check('and carry no image-swap flag to disk', onDisk.holidays.items.every(i => !('useBundled' in i)))
check('and the fixed colors are what landed on disk',
  near(onDisk.holidays.items[0]?.color?.[0], 222.85714285714286)
  && near(onDisk.holidays.items[1]?.color?.[2], 0.9607843137254902),
  JSON.stringify(onDisk.holidays.items.map(i => i.color)))

rmSync(HOME, { recursive: true, force: true })
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
