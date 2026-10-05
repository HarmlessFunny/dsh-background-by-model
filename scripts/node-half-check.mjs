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
 *   - the festival art is FETCHED on demand and cached under `holiday-cache/`,
 *     keyed by asset and never by slot — including the three ways the fetch can
 *     go wrong (a dead mirror, a mirror answering with junk, a corrupt cache);
 *   - a holiday slot is READ-ONLY: a file dropped into it is ignored by every
 *     read, and writing, deleting and URL-fetching are all refused — that is
 *     what makes the festival art impossible to swap;
 *   - an ordinary rule slot still writes, reads back and deletes as before;
 *   - a hand-edited config cannot point a holiday at another rule's image.
 *
 * `globalThis.fetch` is REPLACED for the whole run (see the stub below). The art
 * lives on a CDN now, and a suite that needs a CDN to be up — or that asserts
 * today's bytes of a file it does not own — fails for reasons that have nothing
 * to do with this code.
 *
 * Needs `lib/` to be built; `pnpm test` runs tsdown first. Plain `.mjs` on
 * purpose — no dependency, no transform.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
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

// ── the network, stubbed ───────────────────────────────────────────────────
// A real 2×2 WebP, 38 bytes: the node half validates a download by its magic
// bytes, so the stub has to answer with something that IS an image. Small on
// purpose — nothing here is about how big the real art is.
const WEBP = Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAdQpeL0rv+BiOh/AAA=', 'base64')
const fetchLog = []
let downMirrors = []  // substrings; a URL containing one throws (a dead mirror)
let junkBody = false  // answer 200 with a non-image (a broken proxy, an error page)
// Additive knobs for the recommended-profile checks below, which need a body
// that is not an image at all, a mirror that is up but broken, and a mirror that
// lies about how much it is sending.
let jsonBody = null      // when set, every mirror answers with these exact bytes
let httpStatus = 200     // when not 2xx, every live mirror answers with this
let claimedLength = null // when set, mirrors announce this content-length instead
// A mirror having a BAD MOMENT: the next N requests answer 503, which is a status
// the profile's retry policy treats as weather (see `presetRetryable`, ./src/preset)
// — the only knob here that models a failure which goes away by itself.
let flaky = 0
// A whole directory served file by file, which is what the recommended profile
// has become: the stub answers by FILE NAME, and a name it does not hold is a
// 404 — which is how "the author renamed one wallpaper" is reproduced here.
let routes = null        // Map<filename, Buffer>

globalThis.fetch = async (url) => {
  const target = String(url)
  fetchLog.push(target)
  if (downMirrors.some(d => target.includes(d))) throw new Error('mirror down')
  if (flaky > 0) {
    flaky--
    return { ok: false, status: 503, headers: new Headers({}), async arrayBuffer() { return new ArrayBuffer(0) } }
  }
  if (routes !== null) {
    const body = routes.get(target.slice(target.lastIndexOf('/') + 1))
    if (body === undefined) return { ok: false, status: 404, headers: new Headers({}), async arrayBuffer() { return new ArrayBuffer(0) } }
    return {
      ok: true, status: 200,
      headers: new Headers({ 'content-length': String(body.length) }),
      async arrayBuffer() { return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) },
    }
  }
  const body = jsonBody !== null
    ? Buffer.from(jsonBody)
    : junkBody ? Buffer.from('<html>not an image</html>') : WEBP
  return {
    ok: httpStatus >= 200 && httpStatus < 300,
    status: httpStatus,
    headers: new Headers({ 'content-length': String(claimedLength ?? body.length) }),
    // A pooled Buffer's `buffer` is bigger than the Buffer; send only its bytes.
    async arrayBuffer() { return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) },
  }
}

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
const bytes = (u) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64').length
const readConfig = async () => (await call('read')).value.config

console.log('\n--- the holiday block through the shared sanitizer ---')
const first = await readConfig()
const h = first.holidays
check('the block exists at all', h !== undefined)
check('the override is OFF with no config at all (the shipped default)', h.enabled === false)
check('one entry per built-in holiday, in HOLIDAYS order',
  JSON.stringify(h.items.map(i => i.id)) === JSON.stringify(['mid-autumn', 'national-day']),
  JSON.stringify(h.items.map(i => i.id)))
check('slots are the fixed holiday slots, not rule slots',
  JSON.stringify(h.items.map(i => i.images[0].slot)) === JSON.stringify(['h-midautumn', 'h-nationalday']))
// The mode belongs to the IMAGE since 0.7.5: one value per rule could not letterbox
// a tall screenshot without also letterboxing the landscape photo beside it, and a
// holiday is the case where the picture's own answer is the only one there is.
check('the layout mode is the IMAGE\'s now, and a holiday image is full-bleed',
  h.items.every(i => i.images[0].bgMode === 'fill'))
check('and no holiday carries a rule-level mode any more', h.items.every(i => !('bgMode' in i)),
  JSON.stringify(Object.keys(h.items[0])))
check('each entry is switched on by default', h.items.every(i => i.enabled === true))
check('color starts filled in — it is a constant, not derived from the art',
  h.items.every(i => Array.isArray(i.color) && i.color.length === 3))
// …and so is every IMAGE's: a festival's palette belongs to the picture, so an
// entry that only themed the rule would paint the system theme the moment the
// render layer read the image's own color (which is where a theme color lives
// since 0.7.1).
check('and every holiday IMAGE carries that same color',
  h.items.every(i => Array.isArray(i.images[0].color) && i.images[0].color.length === 3),
  JSON.stringify(h.items.map(i => i.images[0].color)))
check('the rule color and the image color agree to the digit',
  h.items.every(i => JSON.stringify(i.color) === JSON.stringify(i.images[0].color)))
check('nothing in the shape offers to swap the image',
  h.items.every(i => !('useBundled' in i) && !('image' in i) && !('asset' in i)),
  JSON.stringify(Object.keys(h.items[0])))

console.log('\n--- a fresh store opens on one blank rule, and only a fresh one does ---')
// `first` is this run's very first read, of a data directory with no config file
// in it — the state a new install is in. It has to come back with the rule the
// panel needs to show a drop target, not with an empty list and a "no rules yet"
// hint the user has no control left to act on.
check('a store with no config file reads as exactly one rule',
  first.rules.length === 1, JSON.stringify(first.rules.map(r => r.id)))
check('that rule is blank: no matching, no colour, nothing to paint',
  first.rules[0].match === '' && first.rules[0].color === null
  && first.rules[0].images.length === 0 && first.rules[0].enabled === true,
  JSON.stringify(first.rules[0]))
check('and it is rule 1, so it doubles as the fallback',
  first.rules[0].id === 'r1', first.rules[0].id)
// The distinction the seed rests on, and the reason it is not done by counting: a
// MISSING rule list means nothing has ever been configured, while an EXPLICIT
// empty one is a user who deleted every rule — only the first may be filled in.
await call('writeConfig', { config: { ...first, rules: [] } })
check('a rule list the user emptied stays empty (nothing is conjured back in)',
  (await readConfig()).rules.length === 0)
await call('writeConfig', { config: first })

console.log('\n--- a fresh install starts on the published profile, not on per-key safety ---')
// These are the Interface numbers the recommended profile on the asset host
// carries, and they are asserted HERE by value: a constant changed without the
// profile (or the other way round) then fails this check instead of drifting
// quietly out of step.
check('the main background starts fully transparent (the wallpaper IS the window)',
  first.opacities.bg === 0)
check('the left panel, the code plate and the inputs carry the profile\'s numbers',
  first.opacities.sidebar === 0.1 && first.opacities.code === 0.81 && first.opacities.input === 0.88,
  JSON.stringify(first.opacities))
check('the cards stay opaque', first.opacities.card === 1)
check('and so do the blurs — only the input & controls are frosted, at 60 px',
  first.blurs.input === 60 && first.blurs.bg === 0 && first.blurs.card === 0 && first.blurs.settings === 0,
  JSON.stringify(first.blurs))
check('the settings panel stays opaque', first.settingsOpacity === 1)
check('the conversation text box and the trajectory view carry their tints',
  first.chatTextOpacity === 0.35 && first.trajectoryOpacity === 0.73,
  `${first.chatTextOpacity} / ${first.trajectoryOpacity}`)
check('and the file-preview panel is OWNED from the first run',
  first.rightbarOpacity === 0.45, String(first.rightbarOpacity))
// The state a fresh config must NOT swallow. `null` here is not "missing": it is
// what every release so far has WRITTEN for a preview panel nobody ever dragged,
// so reading it as an absent key would silently repaint that panel in every
// existing configuration — a change nobody asked for, with nothing in the log.
await call('writeConfig', { config: { ...first, rightbarOpacity: null } })
check('an explicit null preview panel still follows the main background',
  (await readConfig()).rightbarOpacity === null)
await call('writeConfig', { config: { ...first, rightbarOpacity: 0.62 } })
check('and a panel with a number of its own keeps it', (await readConfig()).rightbarOpacity === 0.62)
await call('writeConfig', { config: { ...first, rightbarOpacity: 'x' } })
check('while a hand-edit that is not a number lands on the shipped 45%',
  (await readConfig()).rightbarOpacity === 0.45)
// Hand the store back to the sections below in the state it found it.
await call('writeConfig', { config: first })

console.log('\n--- the festival art is fetched on demand, and cached ---')
const CACHE = join(DATA, 'holiday-cache')
const asked = (fragment) => fetchLog.filter(u => u.includes(fragment)).length
const cached = (asset) => (existsSync(join(CACHE, asset)) ? readFileSync(join(CACHE, asset)) : null)
/** The pinned revision in either URL shape — jsDelivr writes `@<sha>`, raw does not. */
const revision = (u) => (u.match(/@?([0-9a-f]{40})/) ?? [])[1]

// Loading the plugin and reading the config must not fetch anything: the art is
// gated on the calendar, and today is not a holiday.
check('reading the config fetches nothing', fetchLog.length === 0, JSON.stringify(fetchLog))

const mid = await dataUrl('h-midautumn')
check('a holiday slot is served as webp', mid?.startsWith('data:image/webp;base64,') === true,
  mid === null ? 'null' : `${bytes(mid)} B`)
check('and serving it took exactly one download', fetchLog.length === 1, JSON.stringify(fetchLog))
check('pinned to a commit, never to a branch',
  revision(fetchLog[0]) !== undefined && !fetchLog[0].includes('@main'), fetchLog[0])
check('from the holiday asset path, named by the definition',
  fetchLog[0].endsWith('/dsh-background-by-model/holiday/mid-autumn.webp'), fetchLog[0])
check('the served bytes are the downloaded ones', mid !== null && bytes(mid) === WEBP.length)
check('cached under holiday-cache/, keyed by ASSET and not by slot',
  cached('mid-autumn.webp')?.equals(WEBP) === true,
  JSON.stringify(existsSync(CACHE) ? readdirSync(CACHE) : []))

const nat = await dataUrl('h-nationalday')
check('the other holiday is a transfer of its own', asked('national-day.webp') === 1, JSON.stringify(fetchLog))
check('and is served and cached the same way',
  nat?.startsWith('data:image/webp;base64,') === true && cached('national-day.webp')?.equals(WEBP) === true)
check('an empty non-holiday slot stays empty', await dataUrl('m9') === null)
check('no holiday slot ever reaches the store as a file',
  !existsSync(join(DATA, 'modelbg-h-midautumn')) && !existsSync(join(DATA, 'modelbg-h-nationalday')))

// The cache is the whole point of the exercise: the second boot of the day, and
// every boot for the rest of the year, must be answered from disk.
const warm = fetchLog.length
check('a second read is answered from the cache, with no second download',
  (await dataUrl('h-midautumn')) === mid && fetchLog.length === warm,
  `${fetchLog.length - warm} new request(s)`)

// The boot hydrate and the midnight rollover can both ask for the same cold
// asset, and the rollover fires exactly when a machine that slept all day wakes.
rmSync(join(CACHE, 'mid-autumn.webp'), { force: true })
const raced = await Promise.all([dataUrl('h-midautumn'), dataUrl('h-midautumn')])
check('two simultaneous cold reads share one download',
  fetchLog.length === warm + 1 && raced[0] === raced[1] && raced[0] === mid,
  `${fetchLog.length - warm} new request(s)`)

// A dead first mirror must cost a retry, not the holiday.
rmSync(join(CACHE, 'national-day.webp'), { force: true })
const beforeFallback = fetchLog.length
downMirrors = ['cdn.jsdelivr.net']
const viaFallback = await dataUrl('h-nationalday')
check('a dead first mirror falls through to the second',
  viaFallback === nat && fetchLog.length === beforeFallback + 2
  && fetchLog[beforeFallback].includes('cdn.jsdelivr.net')
  && fetchLog[beforeFallback + 1].includes('raw.githubusercontent.com'),
  JSON.stringify(fetchLog.slice(beforeFallback)))
check('and both mirrors serve the same pinned revision',
  revision(fetchLog[beforeFallback]) === revision(fetchLog[beforeFallback + 1]),
  `${revision(fetchLog[beforeFallback])} vs ${revision(fetchLog[beforeFallback + 1])}`)
check('the fallback bytes are cached exactly like the primary\'s',
  cached('national-day.webp')?.equals(WEBP) === true)
downMirrors = []

// Every mirror down: a holiday with no bytes, which is the state the client is
// built to fall through — never an exception and never a blank wallpaper.
rmSync(join(CACHE, 'national-day.webp'), { force: true })
downMirrors = ['cdn.jsdelivr.net', 'raw.githubusercontent.com']
check('with every mirror down the holiday has no bytes, and does not throw',
  (await dataUrl('h-nationalday')) === null)
check('and a failed fetch caches nothing', cached('national-day.webp') === null)
downMirrors = []

// A CDN that answers 200 with an error page is the failure a status-code check
// cannot see, and it must not be cached as if it were art.
junkBody = true
rmSync(join(CACHE, 'national-day.webp'), { force: true })
check('a mirror answering 200 with a non-image is rejected, not cached',
  (await dataUrl('h-nationalday')) === null && cached('national-day.webp') === null)
junkBody = false

// A cache file that is not an image is a MISS, not a permanent sentence: a
// process killed mid-write would otherwise break the holiday beyond the reach of
// anyone who does not know the file exists.
writeFileSync(join(CACHE, 'mid-autumn.webp'), Buffer.from('not an image at all'))
check('a corrupt cache entry is discarded and re-downloaded',
  (await dataUrl('h-midautumn')) === mid && cached('mid-autumn.webp')?.equals(WEBP) === true)
// Put the cache back for the sections below, which read both holidays.
await dataUrl('h-nationalday')

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

// A color is a fact about the holiday, not about the config that mentions it —
// and there are two places a config can now mention one, so both are forced.
await call('writeConfig', {
  config: withHolidays(items => items.map(i => ({
    ...i,
    color: [1, 0.5, 0.5],
    images: i.images.map(im => ({ ...im, color: [1, 0.5, 0.5] })),
  }))),
})
const afterEdit = (await readConfig()).holidays.items
const forced = afterEdit.map(i => i.color)
check('a hand-edited holiday color is replaced by the definition\'s',
  near(forced[0]?.[0], 222.85714285714286) && near(forced[1]?.[2], 0.9607843137254902),
  JSON.stringify(forced))
check('and so is a hand-edited color on its IMAGE',
  near(afterEdit[0]?.images[0].color?.[0], 222.85714285714286)
  && near(afterEdit[1]?.images[0].color?.[2], 0.9607843137254902),
  JSON.stringify(afterEdit.map(i => i.images[0].color)))

console.log('\n--- a hand-edited config cannot redirect a holiday ---')
await call('writeConfig', {
  config: {
    ...first,
    holidays: {
      enabled: true,
      items: [
        // The `bgMode` pair is the part that moved in 0.7.5: the rule-level one is a
        // stale duplicate of a field the shape no longer has, and the per-image one
        // is the temptation to letterbox a full-bleed festival. Neither may win.
        { ...first.holidays.items[0], images: [{ slot: 'm1', bgMode: 'fit' }], slot: 'm1', id: 'mid-autumn', bgMode: 'fit' },
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
check('a hand-edited layout mode cannot letterbox a festival wallpaper',
  repaired.items.every(i => i.images[0].bgMode === 'fill'),
  JSON.stringify(repaired.items.map(i => i.images[0].bgMode)))

// The switch writes a real boolean, and that is the only thing honoured: the
// absent field of a config written before the feature existed, and junk from a
// hand-edit, both take the shipped default — OFF, which is also what a fresh
// install gets.
await call('writeConfig', { config: { ...first, holidays: { enabled: true, items: first.holidays.items } } })
check('an explicit true turns the override on', (await readConfig()).holidays.enabled === true)
await call('writeConfig', { config: { ...first, holidays: { enabled: false, items: first.holidays.items } } })
check('an explicit false turns the override off', (await readConfig()).holidays.enabled === false)
await call('writeConfig', { config: { ...first, holidays: { enabled: 'yes', items: first.holidays.items } } })
check('and anything that is not a boolean lands on the shipped default, also off',
  (await readConfig()).holidays.enabled === false)
await call('writeConfig', { config: withHolidays(items => items) })
check('an explicit true persists (the recommended profile turns it on)',
  (await readConfig()).holidays.enabled === true)

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
  bgMode: 'fill', wallpaperOpacity: 0.8, blur: 3, bgState: { zoom: 2.5, x: 0.25, y: 0.75, iw: 1920, ih: 1080 },
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
check('the legacy fields are gone from the shape',
  !('slot' in lifted) && !('bgState' in lifted) && !('bgMode' in lifted),
  JSON.stringify(Object.keys(lifted)))
check('and are not reported as drift (the sanitizer lifts them on purpose)',
  !legacyWarnings.some(w => w.includes('rules[].slot') || w.includes('rules[].bgState') || w.includes('rules[].bgMode')),
  JSON.stringify(legacyWarnings))
// 0.7.5 moved the layout mode onto the image as well, and this is the lift that
// keeps a 填充 wallpaper from quietly letterboxing on the next load: the
// synthesized image has to carry what the rule-level field said.
check('the rule-level layout mode became the image\'s own',
  lifted.images[0].bgMode === 'fill', JSON.stringify(lifted.images[0].bgMode))
check('a legacy rule gets the shipped rotation defaults',
  lifted.rotate.enabled === false && lifted.rotate.intervalMs === 60_000
  && lifted.rotate.order === 'order' && lifted.rotate.advanceOnSwitch === false,
  JSON.stringify(lifted.rotate))
// 0.7.1 moved the theme color onto the image, and this is the ONE piece of it that
// touches configs written by every earlier release: an image entry with no
// `color` KEY at all is a picture that never had a color of its own, so the
// rule's color becomes its color. Without the lift every themed wallpaper would
// quietly revert to the system palette on upgrade. (`legacyRule` has no color
// either, so the lift has to invent nothing here.)
check('a colorless legacy rule lifts to a colorless image',
  lifted.images[0].color === null, JSON.stringify(lifted.images[0].color))

const themedLegacy = { ...legacyRule, id: 'r-themed', match: 'themed', color: [210, 0.5, 0.4] }
const clearedLegacy = {
  ...legacyRule, id: 'r-cleared', match: 'cleared', color: [210, 0.5, 0.4],
  // The 0.7.1 shape, hand-written: this image was explicitly cleared to "follow the
  // system theme". The key is what tells that apart from the entry above.
  images: [{ slot: 'm8', bgState: {}, color: null }],
}
await call('writeConfig', { config: { ...first, rules: [themedLegacy, clearedLegacy] } })
const liftedTwice = (await readConfig()).rules
check('the lift reaches the pre-0.7 single-slot shape too',
  Array.isArray(liftedTwice[0].images[0].color) && liftedTwice[0].images[0].color[0] === 210,
  JSON.stringify(liftedTwice[0].images[0].color))
check('an image explicitly set to the system theme does NOT inherit the rule color',
  liftedTwice[1].images[0].color === null, JSON.stringify(liftedTwice[1].images[0].color))

// The list itself: order, dedupe, and what an unusable entry does. Note the
// rule-level `bgMode` below: this whole block is the OLD shape, which is why the
// images leave without one and have to come back with the rule's value.
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
  rotate: { enabled: true, intervalMs: 30_000, order: 'shuffle', advanceOnSwitch: true },
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
check('and the rule-level layout mode reached each one of them',
  rules[1].images.every(i => i.bgMode === 'fill'),
  JSON.stringify(rules[1].images.map(i => i.bgMode)))
check('the rule itself kept no mode to disagree with them', !('bgMode' in rules[1]),
  JSON.stringify(Object.keys(rules[1])))
check('the rotation block survives as written',
  JSON.stringify(rules[1].rotate) === JSON.stringify(multiRule.rotate), JSON.stringify(rules[1].rotate))

// The same lift the legacy block above covers, for the 0.7 LIST shape — the one
// actually in the wild, where a rule could already hold several pictures but had
// exactly one color between them. Every entry inherits it, so a two-picture rule
// that looked themed before the upgrade still does.
const themedList = { ...multiRule, id: 'r-themed-list', color: [210, 0.5, 0.4] }
await call('writeConfig', { config: { ...first, rules: [themedList] } })
const themedImages = (await readConfig()).rules[0].images
check('a 0.7 image list inherits the rule\'s color, image by image',
  themedImages.length === 3 && themedImages.every(i => Array.isArray(i.color) && i.color[0] === 210),
  JSON.stringify(themedImages.map(i => i.color)))
// The list shape, written in the NEW shape: each entry keeps its own value, and a
// null stays null (that is the state the clear button puts one entry in).
const tintedList = {
  ...multiRule, id: 'r-tinted-list',
  images: [
    { slot: 'm2', bgState: {}, color: [10, 0.5, 0.5] },
    { slot: 'm3', bgState: {}, color: null },
    { slot: 'm4', bgState: {}, color: [200, 0.6, 0.5] },
  ],
}
await call('writeConfig', { config: { ...first, rules: [tintedList] } })
const tintedImages = (await readConfig()).rules[0].images
check('per-image colors survive independently, in order, null included',
  JSON.stringify(tintedImages.map(i => i.color)) === JSON.stringify([[10, 0.5, 0.5], null, [200, 0.6, 0.5]]),
  JSON.stringify(tintedImages.map(i => i.color)))
// The same round trip for the layout mode, which is now a per-image field with an
// inheritance path behind it: each entry keeps its own, and one of them is allowed
// to be a value the OTHER entries do not share — that is the point of the move, and
// a sanitizer that normalized them to the first entry's value would pass every test
// above and still collapse the feature.
const mixedModes = {
  ...multiRule, id: 'r-mixed-modes',
  images: [
    { slot: 'm2', bgMode: 'stretch', bgState: {} },
    { slot: 'm3', bgMode: 'center', bgState: {} },
    { slot: 'm4', bgState: {} },
  ],
}
await call('writeConfig', { config: { ...first, rules: [mixedModes] } })
check('per-image layout modes survive independently and in order',
  JSON.stringify((await readConfig()).rules[0].images.map(i => i.bgMode))
    === JSON.stringify(['stretch', 'center', 'fill']),
  JSON.stringify((await readConfig()).rules[0].images.map(i => i.bgMode)))

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
  empty[0].id === 'r-empty' && empty[0].match === 'multi' && !('bgMode' in empty[0]))
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
// rules it cannot read. 3 = a rule may keep an empty image list (0.7), 4 = a
// theme color belongs to an image (`images[].color`, 0.7.1), 5 = the global
// switch transition (`transition`) is part of the config, 6 = the layout mode
// belongs to an image (`images[].bgMode`) instead of to the rule.
const announced = (await call('read')).value.schema
check('the host announces the shape it sanitizes with', announced === 6, String(announced))
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
    rules: [{ ...multiRule, rotate: { enabled: 'yes', intervalMs: 10, order: 'zigzag', advanceOnSwitch: 'yes' } }],
  },
})
const clamped = (await readConfig()).rules[0].rotate
check('only an explicit true turns the rotation on', clamped.enabled === false, JSON.stringify(clamped.enabled))
check('a too-fast dwell is clamped up', clamped.intervalMs === 5_000, String(clamped.intervalMs))
check('an unknown order falls back to sequential', clamped.order === 'order', String(clamped.order))
check('a truthy-but-not-true switch stays off', clamped.advanceOnSwitch === false, String(clamped.advanceOnSwitch))

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

// ── the global switch transition ───────────────────────────────────────────
// A config written before this setting existed has no `transition` key at all,
// and it has to come back as the cross-fade those releases already performed —
// adding a global setting must not change what anybody was already seeing.
// `first` is a full read, so it ALWAYS carries a `transition` block; the key has
// to be dropped to exercise the path a pre-0.7.5 file actually takes.
const { transition: _omitTransition, ...preTransition } = first
await call('writeConfig', { config: { ...preTransition, rules: [multiRule] } })
const trDefault = (await readConfig()).transition
check('a config without a transition gets the shipped one',
  JSON.stringify(trDefault) === JSON.stringify({ effect: 'fade', easing: 'ease', durationMs: 320 }),
  JSON.stringify(trDefault))
// The duration is ONE global value: a rule has no notion of a transition, so
// there is nothing per-rule left to defer to.
await call('writeConfig', {
  config: { ...first, transition: { effect: 'zoom', easing: 'linear', durationMs: 900 } },
})
const trSet = (await readConfig()).transition
check('the chosen effect, easing and duration land on disk',
  trSet.effect === 'zoom' && trSet.easing === 'linear' && trSet.durationMs === 900,
  JSON.stringify(trSet))
// Hostile / stale values go through the same shared sanitizer as everything else.
await call('writeConfig', {
  config: { ...first, transition: { effect: 'warp', easing: 'bounce', durationMs: 999_999 } },
})
const trBad = (await readConfig()).transition
check('an unknown effect falls back to the cross-fade', trBad.effect === 'fade', String(trBad.effect))
check('an unknown easing falls back', trBad.easing === 'ease', String(trBad.easing))
check('an absurd duration is clamped', trBad.durationMs === 3_000, String(trBad.durationMs))
// 0 ms is a legal value (a hard cut), so it must not be read as "absent".
await call('writeConfig', { config: { ...first, transition: { ...trDefault, durationMs: 0 } } })
check('a zero duration is kept, not defaulted', (await readConfig()).transition.durationMs === 0)

// ── the per-rule fade this replaced is folded in, not dropped ──────────────
// `rotate.fadeMs` was the per-rule duration from 0.7.0 on and had NO control
// anywhere: it could only be hand-edited, which is why the global setting
// replaced it. A hand-tuned value must survive that, or upgrading would silently
// re-time somebody's switch.
const foldedWarnings = []
console.warn = (...a) => { foldedWarnings.push(a.join(' ')) }
await call('writeConfig', {
  config: { ...preTransition, rules: [{ ...multiRule, rotate: { ...multiRule.rotate, fadeMs: 1_200 } }] },
})
console.warn = realWarn
const folded = await readConfig()
check('a hand-tuned per-rule fade becomes the global duration',
  folded.transition.durationMs === 1_200, String(folded.transition.durationMs))
check('and is gone from the rule that carried it', !('fadeMs' in folded.rules[0].rotate),
  JSON.stringify(folded.rules[0].rotate))
// It is consumed ON PURPOSE, so it is not drift and must not be reported as such.
check('and is not reported as drift',
  !foldedWarnings.some(w => w.includes('rules[].rotate.fadeMs')), JSON.stringify(foldedWarnings))
// A deliberate hard cut (0, which is a real value) folds the same way.
await call('writeConfig', {
  config: { ...preTransition, rules: [{ ...multiRule, rotate: { ...multiRule.rotate, fadeMs: 0 } }] },
})
check('a hand-set 0 (a deliberate hard cut) folds in too',
  (await readConfig()).transition.durationMs === 0)
// The shipped default is not "a deliberate value": a config whose rules all carry
// the 320 ms every build wrote keeps the ordinary default.
await call('writeConfig', {
  config: { ...preTransition, rules: [{ ...multiRule, rotate: { ...multiRule.rotate, fadeMs: 320 } }] },
})
check('the default per-rule fade leaves the default global duration',
  (await readConfig()).transition.durationMs === 320)
// An explicit global duration always wins over a legacy field sitting beside it.
await call('writeConfig', {
  config: {
    ...first,
    transition: { effect: 'fade', easing: 'ease', durationMs: 500 },
    rules: [{ ...multiRule, rotate: { ...multiRule.rotate, fadeMs: 1_200 } }],
  },
})
check('an explicit global duration is not overridden by the legacy field',
  (await readConfig()).transition.durationMs === 500)
// A field only the (newer) client knows about, inside the fixed-shape block:
// `transition` is rebuilt by the sanitizer, so without the drift guard a typo
// would disappear with nothing in the host log to explain it.
const trWarnings = []
console.warn = (...a) => { trWarnings.push(a.join(' ')) }
await call('writeConfig', { config: { ...first, transition: { ...trDefault, bogus: 1 } } })
console.warn = realWarn
check('drift inside transition is reported',
  trWarnings.some(w => w.includes('transition.bogus')), JSON.stringify(trWarnings))
check('and the unknown transition key is not persisted', !('bogus' in (await readConfig()).transition))

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
// The per-image color is written with its KEY present even when it is null. That
// is not cosmetic: an absent key is what the read-time lift treats as "written
// before 0.7.1", so writing `null` as "absent" would re-inherit the rule's color
// over an image the user cleared, on every single load.
check('every image entry carries its own color on disk',
  onDisk.rules[0].images.every(i => 'color' in i && i.color === null),
  JSON.stringify(onDisk.rules[0].images.map(i => i.color)))

// …and a real per-image color round-trips through the file, next to a sibling
// that was explicitly cleared.
await call('writeConfig', {
  config: {
    ...first,
    rules: [{
      ...multiRule, id: 'r-tinted-disk',
      images: [
        { slot: 'm2', bgState: {}, color: [10, 0.5, 0.5] },
        { slot: 'm3', bgState: {}, color: null },
        { slot: 'm4', bgState: {}, color: [200, 0.6, 0.5] },
      ],
    }],
  },
})
const tintedOnDisk = JSON.parse(readFileSync(join(DATA, 'theme-config.json'), 'utf8')).rules[0]
check('each image color lands on disk as that image\'s own field',
  JSON.stringify(tintedOnDisk.images.map(i => i.color)) === JSON.stringify([[10, 0.5, 0.5], null, [200, 0.6, 0.5]]),
  JSON.stringify(tintedOnDisk.images.map(i => i.color)))
check('a cleared image is an explicit null, not an absent key',
  'color' in tintedOnDisk.images[1] && tintedOnDisk.images[1].color === null,
  JSON.stringify(Object.keys(tintedOnDisk.images[1])))

// ── the recommended profile ────────────────────────────────────────────────
// A profile is a DIRECTORY in the store's own shape — a manifest, a config and
// one raw file per slot — so it is hand-editable where it is hosted and a tweak
// costs no plugin release. The config decides which files exist: the request set
// is derived from it, so this covers the derivation as much as the download.
// Unlike the festival art none of it is cached, and every failure is a VALUE.
console.log('\n--- the recommended profile arrives file by file ---')
// One rule that is fine, and one that names a HOLIDAY slot. That second one is
// legal in a config and can never have a file — the festival art lives in its own
// directory and belongs to no slot — so it must be dropped from the request set
// rather than asked for and failed on.
const presetConfig = {
  rules: [
    { id: 'r-cdn', match: 'anything', images: [{ slot: 'm1' }, { slot: 'm2' }] },
    { id: 'r-holiday', match: 'never', images: [{ slot: 'h-midautumn' }] },
  ],
}
const presetDir = () => new Map([
  ['preset.json', Buffer.from(JSON.stringify({ version: 6 }))],
  ['theme-config.json', Buffer.from(JSON.stringify(presetConfig))],
  ['modelbg-m1', WEBP],
  ['modelbg-m2', WEBP],
])
routes = presetDir()
const beforeHead = fetchLog.length
const head = (await call('fetchPresetConfig')).value
check('the manifest and the config are fetched, and the config is sanitized',
  head?.ok === true && head.version === 6 && head.config?.rules?.length === 2, JSON.stringify(head?.error ?? head?.version))
check('and it cost exactly two requests, manifest first',
  fetchLog.length === beforeHead + 2
  && fetchLog[beforeHead].endsWith('/dsh-background-by-model/preset/preset.json')
  && fetchLog[beforeHead + 1].endsWith('/dsh-background-by-model/preset/theme-config.json'),
  JSON.stringify(fetchLog.slice(beforeHead)))
// The one place this feature's reference differs from the festival art's, on
// purpose: a branch, so a bad recommendation can be corrected in the assets
// repository instead of waiting for a plugin release. A profile fails LOUDLY
// (the user is looking at the button), which is what makes that safe.
check('and it follows the branch, not a pinned commit',
  fetchLog.slice(beforeHead).every(u => u.includes('@main') && revision(u) === undefined),
  JSON.stringify(fetchLog.slice(beforeHead)))
// THE trap of this shape: `holidays.items` legally carries h-midautumn and
// h-nationalday, and a rule may name one too, while the store can never hold a
// `modelbg-h-*` file (see the read-only section above). Asking for one would fail
// the whole profile on a file the plugin itself guarantees cannot exist.
check('the slots are derived from the rules, and the holiday slot is dropped',
  JSON.stringify(head?.slots) === JSON.stringify(['m1', 'm2']), JSON.stringify(head?.slots))

// One wallpaper, measured: the bytes are the served ones and the MIME is sniffed
// from them rather than read off a header — the asset host serves these
// extensionless files as `application/octet-stream`.
const beforeImage = fetchLog.length
const oneImage = (await call('fetchPresetImage', { slot: 'm1' })).value
check('one wallpaper is one request, and it is the file the slot names',
  oneImage?.ok === true && fetchLog.length === beforeImage + 1
  && fetchLog[beforeImage].endsWith('/preset/modelbg-m1'),
  JSON.stringify(fetchLog.slice(beforeImage)))
check('and it arrives as a data URL of the sniffed bytes',
  oneImage?.dataUrl?.startsWith('data:image/webp;base64,') === true
  && bytes(oneImage.dataUrl) === WEBP.length,
  `mime=${oneImage?.dataUrl?.slice(0, 24)} bytes=${oneImage?.dataUrl ? bytes(oneImage.dataUrl) : 'none'}`)

// A holiday slot is refused BEFORE anything is requested, exactly as a write to
// one is — the bytes could never be stored even if they were fetched.
const beforeRefusal = fetchLog.length
check('a holiday slot is refused before it downloads',
  (await call('fetchPresetImage', { slot: 'h-midautumn' })).value?.error === 'bad slot'
  && fetchLog.length === beforeRefusal)
// And so is a name that is not a slot at all: this is a public RPC, so the list
// the node half hands out is not the only thing a caller could ask for.
const beforeBadName = fetchLog.length
check('a malformed slot name is refused before it downloads',
  (await call('fetchPresetImage', { slot: '../theme-config.json' })).value?.error === 'bad slot'
  && fetchLog.length === beforeBadName)

// The strict half: a file the config names and the host does not have. It has to
// be an error NAMING the slot rather than a profile that is quietly missing a
// picture — that distinction is the whole reason a branch reference is allowed.
// And it has to arrive FAST: the file is provably absent, so the retry rounds
// below must not be spent on it — one request per mirror, and no waiting.
const beforeMissing = fetchLog.length
check('a named wallpaper the host does not have fails, and says which',
  JSON.stringify((await call('fetchPresetImage', { slot: 'm9' })).value)
  === JSON.stringify({ ok: false, error: 'download failed' })
  && fetchLog.length === beforeMissing + 2
  && fetchLog.slice(beforeMissing).filter(u => u.includes('cdn.jsdelivr.net')).length === 1
  && fetchLog.slice(beforeMissing).filter(u => u.includes('raw.githubusercontent.com')).length === 1,
  JSON.stringify(fetchLog.slice(beforeMissing)))

// The failure the retry exists for: BOTH mirrors have a bad moment at once, so the
// round has not been answered — and the file is asked again after a delay instead
// of the whole profile failing. Measured in requests, because "it worked" is not
// the claim; "it worked because it asked again" is.
flaky = 2
const beforeFlaky = fetchLog.length
check('a mirror that fails once is asked again, and the file still arrives',
  (await call('fetchPresetImage', { slot: 'm2' })).value?.ok === true
  && fetchLog.length === beforeFlaky + 3
  && fetchLog[beforeFlaky].includes('cdn.jsdelivr.net')
  && fetchLog[beforeFlaky + 1].includes('raw.githubusercontent.com')
  && fetchLog[beforeFlaky + 2].includes('cdn.jsdelivr.net'),
  JSON.stringify(fetchLog.slice(beforeFlaky)))
// Hygiene rather than an assertion: a leaked counter here would make every later
// check fail for a reason that has nothing to do with what it is checking.
flaky = 0
routes.set('modelbg-m3', Buffer.from('<html>not an image</html>'))
check('a wallpaper that is not an image is refused, not written',
  (await call('fetchPresetImage', { slot: 'm3' })).value?.error === 'not an image')

// The second mirror, per file, for the same reason the art has one.
downMirrors = ['cdn.jsdelivr.net']
const beforeImageFallback = fetchLog.length
check('a dead jsDelivr falls through to the raw mirror for one wallpaper',
  (await call('fetchPresetImage', { slot: 'm1' })).value?.ok === true
  && fetchLog.length === beforeImageFallback + 2
  && fetchLog[beforeImageFallback].includes('cdn.jsdelivr.net')
  && fetchLog[beforeImageFallback + 1].includes('raw.githubusercontent.com'),
  JSON.stringify(fetchLog.slice(beforeImageFallback)))
downMirrors = []
routes = null

// Every way the profile can fail without a working directory, each one a VALUE.
// The codes are told apart because the page turns them into different sentences:
// "retry", "do not retry, it is not a profile", "update the plugin", "nobody
// should install this".
downMirrors = ['cdn.jsdelivr.net', 'raw.githubusercontent.com']
jsonBody = JSON.stringify({ version: 6 })
check('with every mirror down there is no profile, and no exception',
  (await call('fetchPresetConfig')).value?.error === 'download failed')
downMirrors = []
httpStatus = 500
// A permanently broken mirror is the other half of the retry: the budget is a
// budget. Three rounds over two mirrors is six requests and then it is over — a
// retry that kept going would leave the user watching a button that never answers.
const beforeBroken = fetchLog.length
check('a mirror answering 500 is not a profile, and the retries are finite',
  (await call('fetchPresetConfig')).value?.error === 'download failed'
  && fetchLog.length === beforeBroken + 6,
  JSON.stringify(fetchLog.slice(beforeBroken).length))
httpStatus = 200
// The failure a status code cannot see, and the one that matters most now that
// the reference is a branch: a CDN answering 200 with an error page.
jsonBody = '<html><body>404: Not Found</body></html>'
check('a mirror answering 200 with a non-JSON manifest is not a profile',
  (await call('fetchPresetConfig')).value?.error === 'not a profile')
jsonBody = JSON.stringify({ version: 'six' })
check('nor is a manifest whose version is not a number',
  (await call('fetchPresetConfig')).value?.error === 'not a profile')
// The gate itself: a profile written for a shape this build cannot read. Refused
// before a single wallpaper is requested, which is the point of asking early.
const beforeNewer = fetchLog.length
jsonBody = JSON.stringify({ version: 99 })
check('a profile written for a newer shape is refused before anything is fetched',
  (await call('fetchPresetConfig')).value?.error === 'newer version'
  && fetchLog.length === beforeNewer + 1,
  JSON.stringify(fetchLog.slice(beforeNewer)))
jsonBody = JSON.stringify({ version: 6 })
routes = new Map([
  ['preset.json', Buffer.from(JSON.stringify({ version: 6 }))],
  ['theme-config.json', Buffer.from('not json at all')],
])
check('a config that is not JSON is not a profile',
  (await call('fetchPresetConfig')).value?.error === 'not a profile')
routes.set('theme-config.json', Buffer.from(JSON.stringify(['not', 'an', 'object'])))
check('nor is a config that is a JSON array',
  (await call('fetchPresetConfig')).value?.error === 'not a profile')
// A config is untrusted input that decides how many times this process will go to
// the network, so the count is capped before any of it is requested.
routes.set('theme-config.json', Buffer.from(JSON.stringify({
  rules: [{ id: 'r-many', images: Array.from({ length: 65 }, (_, i) => ({ slot: `s${i}` })) }],
})))
check('a config naming more images than the cap is refused outright',
  (await call('fetchPresetConfig')).value?.error === 'too many images')
// The size cap is the courtesy check: a mirror that announces more than the cap
// never gets to send it. Claimed, not sent — an 8 MB body in a test would only
// make the suite slow without testing anything the header does not. Back to the
// plain stub, since the directory above would answer before these knobs apply.
routes = null
claimedLength = 64 * 1024 * 1024
jsonBody = JSON.stringify({ version: 6 })
check('a mirror announcing an oversized body is refused before it is read',
  (await call('fetchPresetConfig')).value?.error === 'download failed')
claimedLength = null
jsonBody = null
check('nothing about the profile is written to the store',
  readdirSync(DATA).filter(n => n.endsWith('.json')).length === 1
  && !existsSync(join(DATA, 'preset.json'))
  && !existsSync(join(DATA, 'recommended.json')),
  readdirSync(DATA).join(', '))

// ── the store reset a profile is written into ──────────────────────────────
// "Use the recommended profile" replaces the store rather than merging into it,
// and it has to: `nextSlot` hands out m1, m2, … — a counter, not a random token
// — so a profile and a store that both have pictures collide on those names as a
// matter of course. Emptying first is what makes the profile's own slots free.
console.log('\n--- the store can be emptied, without taking the festival art with it ---')
await call('writeImage', { slot: 'm1', dataUrl: pngUrl })
await call('writeImage', { slot: 'm2', dataUrl: pngUrl })
check('there is a store to empty', existsSync(join(DATA, 'theme-config.json'))
  && readdirSync(DATA).filter(n => n.startsWith('modelbg-')).length >= 2,
  readdirSync(DATA).join(', '))
check('the reset reports success', (await call('resetStore')).value === true)
check('the config is gone', !existsSync(join(DATA, 'theme-config.json')))
check('and every rule image with it',
  readdirSync(DATA).filter(n => n.startsWith('modelbg-')).length === 0,
  readdirSync(DATA).join(', '))
// `holiday-cache/` is not the user's configuration: it is downloaded, it belongs
// to no slot, and re-fetching it is a network round trip for nothing.
check('but the downloaded festival art is left where it is',
  cached('mid-autumn.webp')?.equals(WEBP) === true && cached('national-day.webp')?.equals(WEBP) === true)
// An emptied store is a fresh store, and a fresh store opens on the one blank
// rule (see the top of this file) — the reset is not allowed to leave the panel
// with no drop target either.
const refilled = (await readConfig()).rules
check('and reading an emptied store is a fresh install: one blank rule, not an error',
  refilled.length === 1 && refilled[0].images.length === 0, JSON.stringify(refilled))
// The user's own wallpapers are the thing this feature destroys, and the only
// thing that has to be true afterwards is that it is honest about it: no bytes
// may survive at a slot the profile is about to write. Nothing else is promised,
// because nothing else is true — there is no undo.
check('and the profile can then be written into the empty store',
  (await call('writeImage', { slot: 'm1', dataUrl: pngUrl })).value === true
  && (await dataUrl('m1'))?.startsWith('data:image/png') === true)

rmSync(HOME, { recursive: true, force: true })
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
