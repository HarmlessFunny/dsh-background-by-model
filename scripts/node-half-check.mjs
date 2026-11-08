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
 *     go wrong (a dead edge, an edge answering with junk, a corrupt cache);
 *   - a holiday slot is READ-ONLY: a file dropped into it is ignored by every
 *     read, and writing, deleting and URL-fetching are all refused — that is
 *     what makes the festival art impossible to swap;
 *   - an ordinary rule slot still writes, reads back and deletes as before;
 *   - a hand-edited config cannot point a holiday at another rule's image.
 *
 * `globalThis.fetch` is REPLACED for the whole run (see the stub below). Every
 * picture comes from Bilibili's image CDN now (./src/profile and ./src/holiday
 * name the addresses), and a suite that needs a CDN to be up — or that asserts
 * today's bytes of a file it does not own — fails for reasons that have nothing
 * to do with this code. What IS asserted about the addresses is their SHAPE
 * (content hash, webp transform) and the order the edges are tried in, both of
 * which are this repository's decisions.
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
//
// Two homes, tried in order, because a sandbox can deny the platform temp dir
// while leaving the working tree writable (the failure is an EACCES from
// mkdtemp, not a test failure, and it would abort the whole suite).
const homeBase = (() => {
  const candidates = [tmpdir(), join(process.cwd(), 'node_modules', '.cache')]
  for (const base of candidates) {
    try { mkdirSync(base, { recursive: true }); return base } catch { /* next */ }
  }
  return process.cwd()
})()
const HOME = mkdtempSync(join(homeBase, 'dsh-bg-check-'))
process.env.DSH_HOME = HOME
const DATA = join(HOME, '.dsh-background-by-model-data')

// A file:// URL, not a path: on Windows the ESM loader rejects `E:\…` outright.
const { apply } = await import(new URL('../lib/index.js', import.meta.url).href)
// The shape this build writes: fixture manifests declare it, and the stale case
// declares one less. Read from the source, so a bump moves the fixtures with it
// instead of turning every preset check into a "stale profile".
const SCHEMA_VERSION = Number(
  /export const SCHEMA_VERSION = (\d+)/.exec(readFileSync(new URL('../src/schema.ts', import.meta.url), 'utf8'))?.[1],
)
if (!Number.isFinite(SCHEMA_VERSION)) {
  console.error('could not read SCHEMA_VERSION from src/schema.ts')
  process.exit(1)
}

// ── the network, stubbed ───────────────────────────────────────────────────
// A real 2×2 WebP, 38 bytes: the node half validates a download by its magic
// bytes, so the stub has to answer with something that IS an image. Small on
// purpose — nothing here is about how big the real art is.
const WEBP = Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAdQpeL0rv+BiOh/AAA=', 'base64')
const fetchLog = []
let downMirrors = []  // substrings; a URL containing one throws (a dead CDN edge)
let junkBody = false  // answer 200 with a non-image (a broken proxy, an error page)
// Additive knobs for the recommended-profile checks below, which need a body
// that is not an image at all, an edge that is up but broken, and an edge that
// lies about how much it is sending.
let jsonBody = null      // when set, every edge answers with these exact bytes
let httpStatus = 200     // when not 2xx, every live edge answers with this
let claimedLength = null // when set, edges announce this content-length instead
// An edge having a BAD MOMENT: the next N requests answer 503, which is a status
// the profile's retry policy treats as weather (see `presetRetryable`, ./src/preset)
// — the only knob here that models a failure which goes away by itself.
let flaky = 0
// A directory of files served by name, which is what the recommended profile's
// pictures are now addressed by (the tail of a BFS path): the stub answers by FILE
// NAME, and a name it does not hold is a 404 — which is how "this address has no
// picture behind it" is reproduced here.
let routes = null        // Map<filename, Buffer>

globalThis.fetch = async (url) => {
  const target = String(url)
  fetchLog.push(target)
  if (downMirrors.some(d => target.includes(d))) throw new Error('edge down')
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

// The transport is a PREFIX ROUTE on `webServer`, registered inside an
// `ctx.inject(['connection', 'webServer'])` scope — the same shape the connection
// plugin uses to mount `/api`.
//
// The stub mirrors the contract that matters, including the one that broke the
// release: `connection.rpc.handle` is NOT used, because the host registers that
// route through the CONNECTION service's own context, which cannot resolve
// `webServer` and throws before the entry activates.
let handler = null
let registeredPath = null
const requested = []
// The agent tools, as this composition would register them: name plus the `when`
// condition that is the access switch. Collected rather than executed, because
// what has to be true here is WHICH tools exist and what gates them.
const registeredTools = new Map()
const toolService = {
  register(definition, options) {
    registeredTools.set(definition.name, { definition, options })
    return () => { registeredTools.delete(definition.name) }
  },
}
const root = {
  // The deps decide what the scope is given: `ctx.inject(['tools'], …)` must hand
  // its callback a context carrying the TOOL registry, while the RPC channel below
  // asks for connection/webServer. Handing every scope the same stub put the tools
  // registration into a context with no `tools` at all, which is the crash this
  // shape exists to prevent in the real profile too.
  inject(deps, cb) {
    requested.push(...deps)
    const scope = {
      effect: (fn) => fn(),
      config: undefined,
    }
    if (deps.includes('tools')) scope.tools = toolService
    if (deps.includes('webServer')) scope.webServer = { register: (spec) => { registeredPath = spec.path; handler = spec.handler; return () => {} } }
    if (deps.includes('connection')) scope.connection = { requestRejection: () => undefined }
    cb(scope)
  },
  // A reserved cordis field: reading it is the bug `ctx.config` caused once.
  get config() { throw new Error('cannot get property "config" without inject') },
}
apply(root)
check('the RPC route registers itself', typeof handler === 'function')
check('on the plugin\'s own prefix', registeredPath, '/dsh-background-by-model')
check('and asks for the services it reads',
  requested.includes('connection') && requested.includes('webServer'), JSON.stringify(requested))
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
// There is no per-surface interface blur any more (0.8.1). The profile carries
// none, and a build that grew one back without a slider would frost the input for
// every fresh install, since 60 px was its default.
check('and the profile carries no interface blur at all', !('blurs' in first),
  JSON.stringify(Object.keys(first)))
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
/**
 * The URL fragment one asset is known by, and the generation directory its cache
 * lives in. Both are DERIVED from the definition (the BFS path is content-
 * addressed), so a new upload moves this test with the art instead of leaving a
 * stale constant behind — which is exactly what the pinned release tag used to be.
 */
const SRC = {
  mid: '/bfs/new_dyn/42e22801827aff71267b03c95fcfd7834168597.png@1672w.webp',
  nat: '/bfs/new_dyn/30e97211189f7869dae83b909d2a3cc84168597.png@3456w.webp',
}
const GEN_OF = { mid: '42e22801', nat: '30e97211' }
const asked = (fragment) => fetchLog.filter(u => u.includes(fragment)).length
/** `holiday-cache/<content hash>/` — one per holiday, both in use. */
const GEN = join(CACHE, GEN_OF.mid)
const GEN_NAT = join(CACHE, GEN_OF.nat)
const cached = (asset, dir = GEN) => (existsSync(join(dir, asset)) ? readFileSync(join(dir, asset)) : null)
cached.nat = (asset) => cached(asset, GEN_NAT)

// Loading the plugin and reading the config must not fetch anything: the art is
// gated on the calendar, and today is not a holiday.
check('reading the config fetches nothing', fetchLog.length === 0, JSON.stringify(fetchLog))

const mid = await dataUrl('h-midautumn')
check('a holiday slot is served as webp', mid?.startsWith('data:image/webp;base64,') === true,
  mid === null ? 'null' : `${bytes(mid)} B`)
check('and serving it took exactly one download', fetchLog.length === 1, JSON.stringify(fetchLog))
check('from the image host, at the path the definition names',
  fetchLog[0] === `https://i0.hdslb.com${SRC.mid}`, fetchLog[0])
// The transform is load-bearing: without the `@<width>w.webp` suffix the CDN
// answers the uploaded PNG, which for 国庆 is 10 MB — past `PRESET_IMAGE_MAX`, and
// the reason the suffix is part of the definition rather than added at the call.
check('with the webp transform, never the raw upload',
  /@\d+w\.webp$/.test(fetchLog[0]) && !fetchLog[0].endsWith('.png'), fetchLog[0])
check('the served bytes are the downloaded ones', mid !== null && bytes(mid) === WEBP.length)
check('cached under holiday-cache/<content hash>/, keyed by ASSET and not by slot',
  cached('mid-autumn.webp')?.equals(WEBP) === true,
  JSON.stringify(existsSync(GEN) ? readdirSync(GEN) : []))
check('and that directory is derived from the URL, so new art lands in a new one',
  existsSync(GEN) && GEN_OF.mid === /new_dyn\/([0-9a-f]{8})/.exec(SRC.mid)[1], GEN)

const nat = await dataUrl('h-nationalday')
check('the other holiday is a transfer of its own', asked(SRC.nat) === 1, JSON.stringify(fetchLog))
check('and is served and cached in its own generation directory',
  nat?.startsWith('data:image/webp;base64,') === true
  && cached.nat('national-day.webp')?.equals(WEBP) === true
  && existsSync(GEN_NAT) && !existsSync(join(GEN, 'national-day.webp')),
  JSON.stringify(existsSync(CACHE) ? readdirSync(CACHE) : []))
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
rmSync(join(GEN, 'mid-autumn.webp'), { force: true })
const raced = await Promise.all([dataUrl('h-midautumn'), dataUrl('h-midautumn')])
check('two simultaneous cold reads share one download',
  fetchLog.length === warm + 1 && raced[0] === raced[1] && raced[0] === mid,
  `${fetchLog.length - warm} new request(s)`)

// A dead first host must cost a retry, not the holiday.
rmSync(join(GEN_NAT, 'national-day.webp'), { force: true })
const beforeFallback = fetchLog.length
downMirrors = ['i0.hdslb.com']
const viaFallback = await dataUrl('h-nationalday')
check('a dead first host falls through to the second',
  viaFallback === nat && fetchLog.length === beforeFallback + 2
  && fetchLog[beforeFallback].startsWith('https://i0.hdslb.com')
  && fetchLog[beforeFallback + 1].startsWith('https://i1.hdslb.com'),
  JSON.stringify(fetchLog.slice(beforeFallback)))
// The three edges serve identical bytes, so the path has to be the same one on
// both — a fallback that shifted the path would be serving different art.
check('and the second edge is asked for the same path',
  fetchLog[beforeFallback].slice(fetchLog[beforeFallback].indexOf('/bfs'))
  === fetchLog[beforeFallback + 1].slice(fetchLog[beforeFallback + 1].indexOf('/bfs')),
  `${fetchLog[beforeFallback]} vs ${fetchLog[beforeFallback + 1]}`)
check('the fallback bytes are cached exactly like the primary\'s',
  cached.nat('national-day.webp')?.equals(WEBP) === true)
downMirrors = []

// Every host down: a holiday with no bytes, which is the state the client is
// built to fall through — never an exception and never a blank wallpaper.
rmSync(join(GEN_NAT, 'national-day.webp'), { force: true })
downMirrors = ['i0.hdslb.com', 'i1.hdslb.com', 'i2.hdslb.com']
check('with every host down the holiday has no bytes, and does not throw',
  (await dataUrl('h-nationalday')) === null)
check('and every edge was tried', fetchLog.filter(u => u.includes('hdslb.com') && u.includes(SRC.nat)).length >= 3,
  JSON.stringify(fetchLog.slice(-3)))
check('and a failed fetch caches nothing', cached.nat('national-day.webp') === null)
downMirrors = []

// A CDN that answers 200 with an error page is the failure a status-code check
// cannot see, and it must not be cached as if it were art.
junkBody = true
rmSync(join(GEN_NAT, 'national-day.webp'), { force: true })
check('a host answering 200 with a non-image is rejected, not cached',
  (await dataUrl('h-nationalday')) === null && cached.nat('national-day.webp') === null)
junkBody = false

// A cache file that is not an image is a MISS, not a permanent sentence: a
// process killed mid-write would otherwise break the holiday beyond the reach of
// anyone who does not know the file exists.
writeFileSync(join(GEN, 'mid-autumn.webp'), Buffer.from('not an image at all'))
check('a corrupt cache entry is discarded and re-downloaded',
  (await dataUrl('h-midautumn')) === mid && cached('mid-autumn.webp')?.equals(WEBP) === true)
// Put the cache back for the sections below, which read both holidays.
await dataUrl('h-nationalday')

// THE reason the cache is keyed by a GENERATION and not by the asset name alone: a
// build that names new art must not be answered with the previous upload's bytes —
// and it must not be answered silently, on a day nobody is watching. The
// generation is now derived from the content hash in the URL, so this is
// self-maintaining; what is checked here is that the sweep still recognises an
// unknown directory (any earlier release's tag, or a hand-made one) as superseded.
const STALE = join(CACHE, 'v0.0.9')
mkdirSync(STALE, { recursive: true })
writeFileSync(join(STALE, 'mid-autumn.webp'), Buffer.from('an older generation'))
rmSync(join(GEN_NAT, 'national-day.webp'), { force: true })
const afterPrune = await dataUrl('h-nationalday')
check('art missing from the current generation is re-downloaded, not read stale',
  afterPrune === nat && cached.nat('national-day.webp')?.equals(WEBP) === true)
check('and the generation it superseded is dropped once the new art is on disk',
  !existsSync(STALE), JSON.stringify(existsSync(CACHE) ? readdirSync(CACHE) : []))
check('while both generations in use are left exactly where they are',
  existsSync(join(GEN, 'mid-autumn.webp')) && existsSync(join(GEN_NAT, 'national-day.webp')),
  JSON.stringify(existsSync(CACHE) ? readdirSync(CACHE) : []))

// The upgrade path: 0.7.9 cached FLAT files (`holiday-cache/<asset>`), so an
// install that already had the art has a second shape lying in the cache root.
// It is never read — the path carries the tag now — and the same sweep takes it,
// which is what makes an upgrade clean up after itself instead of leaving those
// bytes there for good.
writeFileSync(join(CACHE, 'mid-autumn.webp'), Buffer.from('the flat 0.7.9 layout'))
rmSync(join(GEN, 'mid-autumn.webp'), { force: true })
const afterLegacy = await dataUrl('h-midautumn')
check('a flat cache file from the previous layout is never read, and is swept',
  afterLegacy === mid && cached('mid-autumn.webp')?.equals(WEBP) === true
  && !existsSync(join(CACHE, 'mid-autumn.webp')),
  JSON.stringify(existsSync(CACHE) ? readdirSync(CACHE) : []))

// The tag-keyed layout of 0..0.10 — one directory per pinned assets release. It is
// never read either (the path carries a content hash now), and the same sweep takes
// it, so an upgrade replaces the mechanism instead of leaving 40 MB behind.
const OLD_TAG = join(CACHE, 'v0.1.0')
mkdirSync(OLD_TAG, { recursive: true })
writeFileSync(join(OLD_TAG, 'mid-autumn.webp'), Buffer.from('the tag-keyed layout'))
rmSync(join(GEN, 'mid-autumn.webp'), { force: true })
const afterTagged = await dataUrl('h-midautumn')
check('a tag-keyed cache directory from the previous layout is never read, and is swept',
  afterTagged === mid && cached('mid-autumn.webp')?.equals(WEBP) === true && !existsSync(OLD_TAG),
  JSON.stringify(existsSync(CACHE) ? readdirSync(CACHE) : []))

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

console.log('\n--- the interface blur was removed (0.8.1), and an old file still loads ---')
// Every 0.8.0 config on disk carries `blurs`. The sanitizer now drops it, which is
// a migration rather than drift — and the drop has to be real, not cosmetic: a
// reply that carried the field back would hand the DEFAULTS (input at 60 px) to a
// build that has no slider for them, and the next write would persist that.
const blurWarnings = []
console.warn = (...a) => { blurWarnings.push(a.join(' ')) }
await call('writeConfig', {
  config: {
    ...first,
    blurs: { bg: 0, sidebar: 0, card: 0, settings: 0, chat: 0, trajectory: 0, rightbar: 0, input: 60 },
  },
})
console.warn = realWarn
const deblurred = await readConfig()
check('the field is dropped from the shape',
  !('blurs' in deblurred), JSON.stringify(Object.keys(deblurred)))
check('and dropping it is not reported as drift — it is a migration',
  !blurWarnings.some(w => w.includes('blurs')), JSON.stringify(blurWarnings))
await call('writeConfig', { config: first })

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
// belongs to an image (`images[].bgMode`) instead of to the rule, 7 = a rule
// carries its wallpaper brightness (`brightness`), 8 = the config carries the
// page tint (`pageOpacity`), 9 = the per-surface interface blur (`blurs`) is GONE
// — the first bump for a removal, and it cuts the other way: a schema-8 sanitizer
// rebuilds the config from the keys it knows, so it would re-add that field with
// its own defaults. 10 = the three paint effects (`images[].opacity`,
// `images[].brightness`, `images[].blur`) moved from the rule onto every image.
const announced = (await call('read')).value.schema
check('the host announces the shape it sanitizes with', announced === 11, String(announced))
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

// ── the three paint effects belong to the PICTURE ───────────────────────────
// Opacity, brightness and blur were RULE settings through schema 9: one value for
// every picture of a rotation. They belong to the picture, like the layout mode and
// the framing beside it — a daylight photo and a night shot in one rotation do not
// want the same exposure, and one rule-level value forced at least one of them into
// the other's compromise. Two things have to hold, and this section is both:
//
//   1. the LIFT — a schema-9 config carries the trio on the RULE, so each one has to
//      reach every image entry on read rather than being reset to the default;
//   2. the ABSENCE — `brightness` has no shipped value written back, because "no
//      key" is what tells "untouched" from "chosen at 100".
console.log('\n--- the three paint effects belong to each image ---')
const effectsOf = (rule) => rule.images.map(i => ({
  opacity: i.opacity,
  brightness: i.brightness,
  blur: i.blur,
}))
// The lift, from the shape a schema-9 config actually has: the trio on the RULE,
// several pictures under it, none of which carries a key of its own.
await call('writeConfig', {
  config: {
    ...first,
    rules: [{ ...multiRule, id: 'r-lift', wallpaperOpacity: 0.6, brightness: 40, blur: 7 }],
  },
})
const liftedEffects = (await readConfig()).rules[0]
check('a rule-level opacity becomes every image\'s own',
  liftedEffects.images.every(i => i.opacity === 0.6), JSON.stringify(effectsOf(liftedEffects)))
check('so does the brightness',
  liftedEffects.images.every(i => i.brightness === 40), JSON.stringify(effectsOf(liftedEffects)))
check('and the blur',
  liftedEffects.images.every(i => i.blur === 7), JSON.stringify(effectsOf(liftedEffects)))
check('while the rule keeps no copy of any of them',
  !('wallpaperOpacity' in liftedEffects) && !('brightness' in liftedEffects) && !('blur' in liftedEffects),
  JSON.stringify(Object.keys(liftedEffects)))
// An entry with its OWN value is left alone — that is the entire point of the move.
await call('writeConfig', {
  config: {
    ...first,
    rules: [{
      ...multiRule, id: 'r-mixed-effects', wallpaperOpacity: 0.6, brightness: 40, blur: 7,
      images: [
        { slot: 'm2', bgState: {}, opacity: 0.2, brightness: 180, blur: 0 },
        { slot: 'm3', bgState: {} },
      ],
    }],
  },
})
const mixedEffects = effectsOf((await readConfig()).rules[0])
check('a per-image value survives beside the inherited one',
  mixedEffects, [{ opacity: 0.2, brightness: 180, blur: 0 }, { opacity: 0.6, brightness: 40, blur: 7 }])
// The clamps, per image: a drag can never store a value the next load would trim.
await call('writeConfig', {
  config: {
    ...first,
    rules: [{
      ...multiRule, id: 'r-clamp-effects',
      images: [{ slot: 'm2', bgState: {}, opacity: 4, brightness: 9999, blur: 900 }],
    }],
  },
})
const clampedEffects = (await readConfig()).rules[0].images[0]
check('opacity stops at 1', clampedEffects.opacity === 1, String(clampedEffects.opacity))
check('brightness stops at the shared ceiling, 200%',
  clampedEffects.brightness === 200, String(clampedEffects.brightness))
check('and blur stops at 60 px', clampedEffects.blur === 60, String(clampedEffects.blur))
await call('writeConfig', {
  config: {
    ...first,
    rules: [{
      ...multiRule, id: 'r-clamp-effects',
      images: [{ slot: 'm2', bgState: {}, opacity: -1, brightness: -20, blur: -5 }],
    }],
  },
})
const flooredEffects = (await readConfig()).rules[0].images[0]
check('the floors are all zero, not negative numbers',
  flooredEffects.opacity === 0 && flooredEffects.brightness === 0 && flooredEffects.blur === 0,
  JSON.stringify(flooredEffects))
await call('writeConfig', {
  config: {
    ...first,
    rules: [{ ...multiRule, id: 'r-junk-effects', images: [{ slot: 'm2', bgState: {}, opacity: 'x', brightness: 'bright', blur: 'soft' }] }],
  },
})
const junkEffects = (await readConfig()).rules[0].images[0]
check('junk falls back to the neutral values',
  junkEffects.opacity === 1 && junkEffects.brightness === 100 && junkEffects.blur === 0,
  JSON.stringify(junkEffects))
// The absent case, which is the one that matters most: a picture written before the
// field existed (and a rule that never named one) comes back with NO brightness key
// at all, so nothing on this side has rewritten a config to state what its owner
// was already looking at. A client that renders the absence itself (`rBrightness`)
// could otherwise no longer tell "untouched" from "chosen at 100".
await call('writeConfig', { config: { ...first, rules: [multiRule] } })
const untouched = (await readConfig()).rules[0]
check('an image with no brightness anywhere keeps no key at all',
  untouched.images.every(i => !('brightness' in i)), JSON.stringify(untouched.images.map(i => Object.keys(i))))
// A holiday's effects are the user's, on its single image; the shipped one is absent.
const holidayEffects = (await readConfig()).holidays.items.map(i => i.images[0])
check('a holiday image starts with no brightness key',
  holidayEffects.every(i => !('brightness' in i)), JSON.stringify(holidayEffects.map(i => Object.keys(i))))
check('and with the shipped opacity and blur',
  holidayEffects.every(i => i.opacity === 1 && i.blur === 0), JSON.stringify(holidayEffects))
// A schema-9 holiday carried the trio on the ENTRY's parent (the rule); those have to
// reach its single image too, or a dimmed festival wallpaper would come back at 100%.
// The image is stripped back to the pre-move shape first: an entry that HAS the keys
// keeps them (which is what the check above asserts), so the lift can only be
// exercised by an entry that has none.
await call('writeConfig', {
  config: {
    ...first,
    holidays: {
      enabled: false,
      items: first.holidays.items.map(i => ({
        ...i,
        wallpaperOpacity: 0.5,
        brightness: 70,
        blur: 4,
        images: i.images.map(image => ({ slot: image.slot, bgMode: image.bgMode, bgState: image.bgState, color: image.color })),
      })),
    },
  },
})
const liftedHoliday = (await readConfig()).holidays.items[0].images[0]
check('a rule-level trio reaches a holiday image as well',
  liftedHoliday.opacity === 0.5 && liftedHoliday.brightness === 70 && liftedHoliday.blur === 4,
  JSON.stringify(liftedHoliday))
// And every field is DECLARED, so the drift guard stays quiet about it: a warning
// here would mean the browser half can write an effect the node half has never heard
// of, which is the silent-loss bug the guard exists to make audible.
const effectWarnings = []
console.warn = (...a) => { effectWarnings.push(a.join(' ')) }
await call('writeConfig', {
  config: { ...first, rules: [{ ...multiRule, images: [{ slot: 'm2', bgState: {}, opacity: 0.7, brightness: 60, blur: 2 }] }] },
})
console.warn = realWarn
check('the per-image effects are declared, not drift',
  !effectWarnings.some(w => w.includes('rules[].images[].')),
  JSON.stringify(effectWarnings))

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

// ── the image store's orphans ──────────────────────────────────────────────
// Every image is stored at full fidelity, so replacing one writes a NEW slot and
// only the path that removed the old entry deletes its file. An interrupted write,
// a hand-edited config or a rule deleted mid-upload all leave a `modelbg-<slot>`
// file no config names — and it is invisible: boot reads the slots the config
// references, so nothing ever loads, paints or reports it. It only shows up as a
// number in `du`. These checks are about the two RPC methods that surface it.
console.log('\n--- the store reports what nothing points at, and clears exactly that ---')
// A config whose single rule owns ONE picture, and three files on disk: the used
// one, one nothing names, and one at a holiday slot — which no config can ever own
// (the festival art lives in `holiday-cache/`, the slot is read-only), so it is
// residue by definition and the one thing a cleanup must be able to clear.
const storeConfig = {
  ...first,
  rules: [{
    id: 'r-store', images: [{ slot: 'm1', bgMode: 'fit', bgState: {}, color: null }],
    match: '', enabled: true, color: null, wallpaperOpacity: 1, brightness: 100, blur: 0,
    rotate: { enabled: false, intervalMs: 60000, order: 'order', advanceOnSwitch: false },
  }],
}
await call('writeConfig', { config: storeConfig })
await call('writeImage', { slot: 'm1', dataUrl: pngUrl })
await call('writeImage', { slot: 'm2', dataUrl: pngUrl })
await call('writeImage', { slot: 'm3', dataUrl: pngUrl })
writeFileSync(join(DATA, 'modelbg-h-midautumn'), png)
const usage = (await call('storeUsage')).value
check('the report counts every image file in the store', usage.files === 4, JSON.stringify(usage))
check('the used bytes are one picture', usage.usedBytes === png.length, String(usage.usedBytes))
check('and the orphans are the other three', usage.orphanBytes === png.length * 3, String(usage.orphanBytes))
check('the two add up to the total, so a card can print either',
  usage.usedBytes + usage.orphanBytes === usage.totalBytes, JSON.stringify(usage))
check('the orphans are named, with their sizes',
  JSON.stringify(usage.orphans.map(o => o.slot).sort()) === JSON.stringify(['h-midautumn', 'm2', 'm3']),
  JSON.stringify(usage.orphans))
// Read-only is the whole point of the split: asking the question must not answer it.
check('reporting deleted nothing', existsSync(join(DATA, 'modelbg-m2')) && existsSync(join(DATA, 'modelbg-m3')))

// `keep` is the browser half's live slot list, which exists because an upload
// writes the bytes BEFORE the config that names them: a report landing in that
// window must not call the new picture an orphan. It can only SPARE a slot.
const withKeep = (await call('storeUsage', { keep: ['m2'] })).value
check('a slot the client still holds is spared', withKeep.orphanBytes === png.length * 2, String(withKeep.orphanBytes))
check('and it is not listed as an orphan', !withKeep.orphans.some(o => o.slot === 'm2'),
  JSON.stringify(withKeep.orphans))
check('a malformed keep entry spares nothing', (await call('storeUsage', { keep: ['../etc/passwd', 7] })).value.orphanBytes === png.length * 3)

// The sweep. `keep` here is what the report was given, so the two agree by
// construction — and a file that is spared is still there afterwards.
const swept = (await call('pruneOrphans', { keep: ['m2'] })).value
check('the sweep removes the orphans and only the orphans',
  JSON.stringify(swept.removed.sort()) === JSON.stringify(['h-midautumn', 'm3']), JSON.stringify(swept))
check('and reports the bytes it freed', swept.freedBytes === png.length * 2, String(swept.freedBytes))
check('nothing failed', swept.failed.length === 0, JSON.stringify(swept.failed))
check('the spared slot is untouched', existsSync(join(DATA, 'modelbg-m2')))
check('the used picture is untouched, and still serves its bytes',
  (await dataUrl('m1'))?.startsWith('data:image/png') === true)
check('the config is untouched by the sweep',
  JSON.stringify((await readConfig()).rules[0].images.map(i => i.slot)) === JSON.stringify(['m1']))
// A second sweep with the SAME keep has nothing left to do — the button reads
// "nothing to clean", and pressing it again costs no deletions.
check('a second sweep with the same keep finds nothing',
  (await call('pruneOrphans', { keep: ['m2'] })).value.removed.length === 0)
// …and once the client stops naming it, the spared file is an orphan too: `keep`
// is a grace period, not a permanent exemption.
check('an unreferenced file the client stopped naming is collected next time',
  JSON.stringify((await call('pruneOrphans', {})).value.removed) === JSON.stringify(['m2']),
  JSON.stringify(readdirSync(DATA)))
check('leaving the store with just the used picture',
  readdirSync(DATA).filter(n => n.startsWith('modelbg-')).join(',') === 'modelbg-m1',
  readdirSync(DATA).join(', '))
// Hand the store back to the sections below in the state they expect: the
// multi-image rule the next section reads off disk.
await call('writeConfig', { config: { ...first, rules: [multiRule] } })

// The one way this feature could destroy a collection: a `theme-config.json` that
// is THERE but does not parse. `readConfig` answers with the last good COPY now (or
// with defaults when there is none) — and for a cleanup, answering with defaults is
// catastrophic, because it would see zero referenced slots and call every file on
// disk an orphan.
//
// So there are two answers, and the backup is what decides which one:
//
//   - corrupt (or missing) live file, WITH a parseable `.bak` → the backup IS the
//     config `readConfig` restores, so the sweep runs against it. Pruning against
//     the rules the user is about to get back is the only user in that moment who
//     has an opinion worth honouring: refusing would also be safe, but it would
//     leave the button dead on a machine that is already healed;
//   - corrupt live file and NO usable backup → UNTRUSTED, and the sweep refuses
//     rather than guesses. Nothing on disk can be told apart from an orphan there.
console.log('\n--- an unreadable config: the backup answers, or the sweep refuses ---')
await call('writeImage', { slot: 'm1', dataUrl: pngUrl })
await call('writeImage', { slot: 'm2', dataUrl: pngUrl })
const goodConfig = readFileSync(join(DATA, 'theme-config.json'), 'utf8')
check('there is a config and two pictures to lose',
  existsSync(join(DATA, 'modelbg-m1')) && existsSync(join(DATA, 'modelbg-m2')))
// Every write rotates the previous good file into `.bak`, so one round-trip through
// `writeConfig` is enough to have a copy that names these two pictures.
await call('writeConfig', { config: { ...first, rules: [multiRule] } })
check('a save leaves a backup of the file it replaced',
  existsSync(join(DATA, 'theme-config.json.bak')), readdirSync(DATA).join(', '))
writeFileSync(join(DATA, 'theme-config.json'), '{ this is not json')
const brokenUsage = (await call('storeUsage')).value
check('the report still answers what is on disk', brokenUsage.files >= 2, JSON.stringify(brokenUsage))
check('and the backup makes it trustworthy', brokenUsage.trusted === true, JSON.stringify(brokenUsage.trusted))
// Reading a corrupt live file heals from the copy rather than serving defaults.
const healed = await readConfig()
check('a corrupt config is read back from the backup, not as a fresh install',
  healed.rules.length === 1 && healed.rules[0].images.length === 3,
  JSON.stringify(healed.rules.map(r => r.images.length)))
check('and the live file is rewritten, so one recovery is enough',
  JSON.parse(readFileSync(join(DATA, 'theme-config.json'), 'utf8')).rules[0].images.length === 3)
// With no backup to fall back on, the same corruption is the dangerous case again:
// numbers are still reported, the button is disabled, and the sweep refuses.
rmSync(join(DATA, 'theme-config.json.bak'), { force: true })
writeFileSync(join(DATA, 'theme-config.json'), '{ this is not json')
const orphanUsage = (await call('storeUsage')).value
check('with no backup the report is flagged untrusted',
  orphanUsage.trusted === false, JSON.stringify(orphanUsage.trusted))
const orphanSweep = (await call('pruneOrphans', {})).value
check('and the sweep refuses', orphanSweep.refused === true, JSON.stringify(orphanSweep))
check('deleting nothing at all', orphanSweep.removed.length === 0, JSON.stringify(orphanSweep.removed))
check('both pictures are still on disk',
  existsSync(join(DATA, 'modelbg-m1')) && existsSync(join(DATA, 'modelbg-m2')),
  readdirSync(DATA).join(', '))
// A config that is valid JSON but not an OBJECT is the same hazard: the sanitizer
// would seed a blank rule, and every file would look unreferenced.
writeFileSync(join(DATA, 'theme-config.json'), '[1, 2, 3]')
check('an array is not a config either', (await call('storeUsage')).value.trusted === false)
check('and is refused the same way', (await call('pruneOrphans', {})).value.refused === true)
// With the file restored, the same store cleans normally — the refusal is about the
// broken file, not a permanent lockout.
writeFileSync(join(DATA, 'theme-config.json'), goodConfig)
check('a repaired config restores the button', (await call('storeUsage')).value.trusted === true)
check('and the sweep runs again', (await call('pruneOrphans', {})).value.refused === false)
// A store with NO config file is not this case: nothing has ever been configured,
// so nothing is on disk to protect. (The backup is gone too — otherwise the copy
// would be the answer, which the recovery checks above cover.)
rmSync(join(DATA, 'theme-config.json'), { force: true })
rmSync(join(DATA, 'theme-config.json.bak'), { force: true })
check('a missing config is trusted, not refused', (await call('storeUsage')).value.trusted === true)
// Hand the store back the way the next section reads it off disk: the multi-image
// rule, and the bytes its slots name.
await call('writeConfig', { config: { ...first, rules: [multiRule] } })
await call('writeImage', { slot: 'm2', dataUrl: pngUrl })
await call('writeImage', { slot: 'm3', dataUrl: pngUrl })
await call('writeImage', { slot: 'm4', dataUrl: pngUrl })

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

// ── the config is written atomically, with a copy of the last good file ─────
// The config file is the whole rule list, and it is rewritten on every edit. A
// write in place meant a crash (or a full disk, or a pulled cable) could leave half
// a document behind — which `readConfig` greets by falling back to defaults, and the
// next drag then persists those defaults over the ruin. Two things fix it, and both
// have to be TRUE of the shipped build rather than merely intended:
//
//   1. a save rotates the file it replaces into `theme-config.json.bak`, but ONLY
//      when that file parses — a corrupt live file must never overwrite the last
//      good copy;
//   2. the new bytes go to a temp name and are RENAMED over the live path, so a
//      reader (or a crash) can only ever see the old document or the new one.
console.log('\n--- an atomic write, and a backup that is never the corrupt file ---')
await call('writeConfig', { config: { ...first, rules: [{ ...multiRule, id: 'r-atomic-1' }] } })
const firstSave = readFileSync(join(DATA, 'theme-config.json'), 'utf8')
await call('writeConfig', { config: { ...first, rules: [{ ...multiRule, id: 'r-atomic-2' }] } })
const secondSave = readFileSync(join(DATA, 'theme-config.json'), 'utf8')
check('the new config is the live file', secondSave.includes('r-atomic-2'), secondSave.slice(0, 80))
check('and the previous one is in the backup',
  readFileSync(join(DATA, 'theme-config.json.bak'), 'utf8') === firstSave,
  readFileSync(join(DATA, 'theme-config.json.bak'), 'utf8').slice(0, 80))
check('no temp file is left behind',
  readdirSync(DATA).every(n => !n.endsWith('.tmp')), readdirSync(DATA).join(', '))
// The dangerous rotation: a corrupt live file must not replace the good backup, or
// the first save after the corruption would also destroy the copy that heals it.
writeFileSync(join(DATA, 'theme-config.json'), '{ interrupted')
await call('writeConfig', { config: { ...first, rules: [{ ...multiRule, id: 'r-atomic-3' }] } })
check('a corrupt live file does NOT overwrite the backup',
  readFileSync(join(DATA, 'theme-config.json.bak'), 'utf8') === firstSave,
  readFileSync(join(DATA, 'theme-config.json.bak'), 'utf8').slice(0, 80))
check('and the save itself still lands',
  readFileSync(join(DATA, 'theme-config.json'), 'utf8').includes('r-atomic-3'))

// ── the revision: two writers, and the one that must lose ──────────────────
// The settings panel and (with agent access on) the agent's tools both hold a whole
// copy of this file. Each write names the revision it started from, so the LOSER is
// told instead of silently overwriting — the failure that costs an edit nobody can
// explain. Exercised through the real handler because the check runs there.
console.log('\n--- a stale write is refused, and a current one is accepted ---')
const revBase = await readConfig()
const revSeen = revBase.rev
check('every write stamps a revision one past the file it replaced',
  typeof revSeen === 'number' && revSeen >= 0, String(revSeen))
// Writer A (the panel) writes from the revision it saw.
const ackA = (await call('writeConfig', {
  config: { ...revBase, rules: [{ ...multiRule, id: 'r-rev-a' }] },
  expectedRev: revSeen,
})).value
check('a write from the current revision is accepted', ackA?.ok === true, JSON.stringify(ackA))
check('and it answers the revision it produced', ackA.rev === revSeen + 1, JSON.stringify(ackA))
// Writer B held a copy read BEFORE A wrote, so it is stale by one.
const ackB = (await call('writeConfig', {
  config: { ...revBase, rules: [{ ...multiRule, id: 'r-rev-b' }] },
  expectedRev: revSeen,
})).value
check('a write from a stale revision is REFUSED', ackB?.ok === false && ackB.conflict === true,
  JSON.stringify(ackB))
check('and the refusal carries the config that won',
  ackB.config?.rules?.[0]?.id === 'r-rev-a', JSON.stringify(ackB.config?.rules?.map(r => r.id)))
// The one thing the refusal must never do: leave B's edit on disk.
check('the stale edit did NOT reach the file',
  (await readConfig()).rules[0].id === 'r-rev-a', (await readConfig()).rules.map(r => r.id).join(','))
// B can retry against what it was handed, and that write is no longer stale.
const retry = (await call('writeConfig', {
  config: { ...ackB.config, rules: [{ ...multiRule, id: 'r-rev-b' }] },
  expectedRev: ackB.rev,
})).value
check('a retry against the handed-back revision is accepted', retry?.ok === true, JSON.stringify(retry))
check('and lands', (await readConfig()).rules[0].id === 'r-rev-b')
// A caller with no opinion (an older browser bundle) still writes: it cannot be
// stale against a revision it has never heard of.
const legacyAck = (await call('writeConfig', { config: { ...revBase, rules: [{ ...multiRule, id: 'r-rev-c' }] } })).value
check('a write naming no revision still lands (an older bundle)',
  legacyAck?.ok === true && (await readConfig()).rules[0].id === 'r-rev-c', JSON.stringify(legacyAck))

// ── the agent-access switch reaches the file, and fails closed ─────────────
console.log('\n--- agent access is stored, off by default, and only an explicit true ---')
const fresh = await readConfig()
check('a fresh store has the tools off', fresh.agentAccess === false,
  JSON.stringify(fresh.agentAccess))
await call('writeConfig', { config: { ...fresh, agentAccess: true } })
check('the switch round-trips when granted', (await readConfig()).agentAccess === true)
await call('writeConfig', { config: { ...(await readConfig()), agentAccess: false } })
check('and when revoked', (await readConfig()).agentAccess === false)
await call('writeConfig', { config: { ...(await readConfig()), agentAccess: 'yes' } })
check('a truthy string in a hand-edited file does not grant it',
  (await readConfig()).agentAccess === false)
// `readRev` is the poll the panel runs while the switch is on. It answers ONE
// number, because pulling the config every few seconds to learn "no" is the
// expensive way to ask.
const revAnswer = (await call('readRev', {})).value
check('readRev answers just the revision',
  typeof revAnswer?.rev === 'number' && Object.keys(revAnswer).length === 1, JSON.stringify(revAnswer))

// ── the tools themselves: present, gated, and bounded ─────────────────────
// Registered at `apply()` time, so what this asserts is the REGISTRATION: the two
// names, and the `when` condition that decides whether the model ever sees them.
// A tool whose `when` is missing would be visible forever — the "switched off but
// still in the context" failure the switch exists to prevent.
console.log('\n--- the agent tools are registered, and gated by the switch ---')
check('two tools, and no third', registeredTools.size === 2, [...registeredTools.keys()].join(', '))
const themeTool = registeredTools.get('background_theme')
const editTool = registeredTools.get('background_edit')
check('the read side is background_theme', themeTool !== undefined)
check('the write side is background_edit', editTool !== undefined)
// The gate is what keeps a closed switch from costing context.
check('both carry a `when` condition', typeof themeTool?.options?.when === 'function'
  && typeof editTool?.options?.when === 'function')
// `when` reads the STORE, so it must answer per the config on disk, not a constant.
const gateEditTool = editTool.options.when
check('with access off the gate is closed', (await gateEditTool({})) === false)
await call('writeConfig', { config: { ...(await readConfig()), agentAccess: true } })
check('with access on the gate opens', (await gateEditTool({})) === true)
await call('writeConfig', { config: { ...(await readConfig()), agentAccess: false } })
check('and revoking closes it again on the very next ask', (await gateEditTool({})) === false)
// The write tool's parameter space is what the model reads: it must not carry an
// action this build cannot perform, or the model will ask for one.
const actions = editTool.definition.parameters.properties.action.enum
check('the write tool offers exactly the eight actions it implements',
  actions.length === 8 && actions.includes('add_image') && actions.includes('set_image')
  && actions.includes('adopt_recommended'),
  actions.join(', '))
// Nothing may offer to empty the store: that is the user's decision about their own
// data, not an edit an agent can make.
check('and offers no store reset',
  !actions.some(a => a.includes('reset') || a.includes('clear') || a.includes('wipe')), actions.join(', '))
// The one destructive action is named for what it INSTALLS, not for what it
// deletes, and it is the only one that demands confirmation.
check('the destructive action is adopt_recommended', actions.includes('adopt_recommended'))
check('and it is gated on an explicit confirm',
  editTool.definition.parameters.properties.confirm !== undefined)

// The panel's own loop, simulated exactly: write, record what the host answered,
// write again with THAT number. This is the "click + twice" bug in protocol terms —
// with the revision not recorded, the second write names a number the disk has
// already passed, is refused, and hands back a config without the first edit.
console.log('\n--- a panel that records the answer can write twice in a row ---')
const loopBase = await readConfig()
let panelSeen = loopBase.rev
const firstClick = (await call('writeConfig', {
  config: { ...loopBase, rules: [...loopBase.rules, { id: 'r-click-1', images: [], match: '', enabled: true, color: null, rotate: { enabled: false, intervalMs: 60000, order: 'order', advanceOnSwitch: false } }] },
  expectedRev: panelSeen,
})).value
check('the first click is accepted', firstClick?.ok === true, JSON.stringify(firstClick?.ok))
// What the fix does: adopt the revision the host answered with.
panelSeen = firstClick.rev
const secondClick = (await call('writeConfig', {
  config: { ...(await readConfig()), rules: [...(await readConfig()).rules, { id: 'r-click-2', images: [], match: '', enabled: true, color: null, rotate: { enabled: false, intervalMs: 60000, order: 'order', advanceOnSwitch: false } }] },
  expectedRev: panelSeen,
})).value
check('and the second click is accepted too, without retrying', secondClick?.ok === true,
  JSON.stringify(secondClick?.ok))
const afterClicks = await readConfig()
check('so both clicks are in the file',
  ['r-click-1', 'r-click-2'].every(id => afterClicks.rules.some(r => r.id === id)),
  afterClicks.rules.map(r => r.id).join(','))
// And the bug itself, reproduced: a panel that does NOT record the answer.
const stuck = (await readConfig()).rev
const lost = (await call('writeConfig', {
  config: { ...afterClicks, rules: [] },
  expectedRev: stuck - 1,
})).value
check('a panel that forgot the answer looks stale and is refused',
  lost?.ok === false && lost.conflict === true, JSON.stringify(lost?.ok))
const afterLost = await readConfig()
check('which is exactly the edit that would have vanished',
  afterLost.rules.length > 0, String(afterLost.rules.length))

console.log('\n--- adopt_recommended: confirm first, and nothing deleted when it cannot run ---')
// The handler needs a context; the tool's own `execute` is what carries the gate,
// so it is called directly with a host that would blow up on use — proving the
// refusal happens BEFORE anything is touched, not after.
const editExecute = editTool.definition.execute
const explodingHost = new Proxy({}, {
  get() { throw new Error('the host must not be reached without confirm: true') },
})
const refused = await editExecute({ action: 'adopt_recommended' }, { agent: undefined, signal: undefined })
check('without confirm it is refused', refused?.ok === false, JSON.stringify(refused?.ok))
check('and the refusal says why, and what it would do',
  typeof refused?.error === 'string' && refused.error.includes('confirm'), JSON.stringify(refused?.error))
// Explicit false is refused too: a caller that reasoned itself into "false" must
// not be read as "absent, therefore yes".
const refusedFalse = await editExecute({ action: 'adopt_recommended', confirm: false }, {})
check('confirm: false is refused as well', refusedFalse?.ok === false, JSON.stringify(refusedFalse?.ok))

// A tool-added picture lands in `fill`, like the recommended profile's do: the
// default was `fit`, which letterboxes every wallpaper that is not already the
// window's aspect ratio — and the tool is the path with no panel to fix it after.
console.log('\n--- a tool-added picture lands in fill ---')
const beforeAdd = await readConfig()
check('there is a rule to add it to', beforeAdd.rules.length > 0, String(beforeAdd.rules.length))
const added = await editExecute({ action: 'add_image', url: 'https://example.invalid/a.png' }, {})
check('add_image succeeds', added?.ok === true, JSON.stringify(added))
const addedImage = (await readConfig()).rules[0].images.at(-1)
check('and the picture it added is filled, not letterboxed',
  addedImage?.bgMode === 'fill', JSON.stringify(addedImage?.bgMode))
check('and it carries no colour of its own, so the extractor may theme it',
  addedImage?.color === null, JSON.stringify(addedImage?.color))
// The other half of "no colour is needed": a rule created with no colour is
// paintable as soon as it has a picture, because the picture's own palette is what
// themes the interface. `matchColor` is for the picture-less rule, and nothing else.
const madeRule = await editExecute({ action: 'set_rule', match: 'made-without-a-colour' }, {})
check('a rule can be created without naming a colour', madeRule?.ok === true, JSON.stringify(madeRule))
const madeBack = (await readConfig()).rules.find(r => r.match === 'made-without-a-colour')
check('and it follows the system theme until a picture is added',
  madeBack !== undefined && madeBack.color === null, JSON.stringify(madeBack?.color))

// Now the real thing, through the host the plugin wired: fetch every wallpaper,
// wipe, write. `fetch` is stubbed in this harness, so the seven pictures arrive.
const beforeAdopt = await readConfig()
const beforeRules = beforeAdopt.rules.map(r => r.match).join(',')
const adoptResult = await editExecute({ action: 'adopt_recommended', confirm: true }, {})
check('with confirm: true the profile is installed', adoptResult?.ok === true, JSON.stringify(adoptResult))
const afterAdopt = await readConfig()
check('and the rules are the built-in profile\'s, not the previous ones',
  afterAdopt.rules.map(r => r.match).join(',') !== beforeRules
  && afterAdopt.rules.length === 7, afterAdopt.rules.map(r => r.match).join(','))
check('every picture the profile names is on disk',
  afterAdopt.rules.every(r => r.images.length === 1)
  && (await dataUrl(afterAdopt.rules[0].images[0].slot))?.startsWith('data:image/') === true)
// The load-bearing one: a panel still holding the pre-adoption config must NOT be
// able to write it back. `resetStore` zeroed the history, so without the floor the
// panel's saved revision could match the profile's first one and win.
check('the adopted profile lands AHEAD of the revision it replaced',
  afterAdopt.rev > beforeAdopt.rev, `${beforeAdopt.rev} -> ${afterAdopt.rev}`)
const staleSave = (await call('writeConfig', {
  config: { ...beforeAdopt, rules: beforeAdopt.rules },
  expectedRev: beforeAdopt.rev,
})).value
check('so a panel still holding the replaced rules is refused', staleSave?.ok === false
  && staleSave.conflict === true, JSON.stringify(staleSave?.ok))
check('and the profile survives that refusal',
  (await readConfig()).rules.length === 7, String((await readConfig()).rules.length))
// The user's own wallpapers are the thing this deletes, so the holiday art — which
// belongs to no slot and costs a round trip — is spared, exactly as `resetStore` does.
check('the downloaded festival art is not taken with it',
  existsSync(CACHE) && readdirSync(CACHE).length > 0, readdirSync(CACHE).join(', '))

// The RPC path the panel now takes. Same operation as the tool, reached without a
// model in the loop — and the reason it exists is the revision: the wipe empties the
// config on disk, so a panel that sequenced the wipe itself would then write with a
// revision the emptied store has never heard of. One call answers that revision.
console.log('\n--- the panel installs the profile in one call, and gets the revision back ---')
const beforePanelAdopt = await readConfig()
const panelAdopt = (await call('adoptRecommended', {})).value
check('one call installs it', panelAdopt?.ok === true, JSON.stringify(panelAdopt?.ok))
check('and answers the revision it landed on',
  typeof panelAdopt?.rev === 'number', JSON.stringify(panelAdopt?.rev))
check('which is AHEAD of the one it replaced, so a stale panel write is refused',
  panelAdopt.rev > beforePanelAdopt.rev, `${beforePanelAdopt.rev} -> ${panelAdopt?.rev}`)
// What the caller does with the answer: adopt it, then save again. Both work.
const afterPanel = await readConfig()
check('the store holds the profile', afterPanel.rules.length === 7,
  String(afterPanel.rules.length))
check('and the revision it answered is the one on disk',
  afterPanel.rev === panelAdopt.rev, `${afterPanel.rev} vs ${panelAdopt.rev}`)


// ── the recommended profile ────────────────────────────────────────────────
// The profile is no longer a directory of files fetched from a repository: its
// RULES are compiled into the bundle (src/profile.ts) and only the pictures come
// over the network, from Bilibili's image CDN at content-addressed paths. So what
// is left to check here is one request per slot, the constant table that decides
// WHICH requests, and the failure modes — every one of them a VALUE, not a throw.
console.log('\n--- the recommended profile is a set of pictures, and nothing else ---')
// The node half no longer has a manifest or config to fetch: that method is gone
// outright, which is the honest assertion — a leftover would keep answering.
check('the old manifest/config method is not a method any more',
  (await call('fetchPresetConfig')).ok === false, JSON.stringify((await call('fetchPresetConfig')).error?.message))
// The profile's own table is what a request resolves through. The stub answers by
// PATH, so a slot the table does not carry has no URL at all and cannot reach it.
const PROFILE_SRC = {
  m1: 'e4565384e7e5b2d75756e577f505534b4168597',
  m2: 'aa6e8649701c91e5ac8f43ff28b97a924168597',
  m3: '5da92b31df5ee2a20b17ec6be353cf5c4168597',
}
const profilePath = (slot) => `/bfs/new_dyn/${PROFILE_SRC[slot]}.png@3840w.webp`
/**
 * The stub routes by FILE NAME (what is left after the last `/`), which for these
 * URLs is `<hash>.png@3840w.webp` — the path component the CDN actually keys on.
 * Nothing about the host participates, so all three edges answer identically.
 */
const profileKey = (slot) => profilePath(slot).slice(profilePath(slot).lastIndexOf('/') + 1)
routes = new Map([
  [profileKey('m1'), WEBP],
  [profileKey('m2'), WEBP],
])
const beforeImage = fetchLog.length
const oneImage = (await call('fetchPresetImage', { slot: 'm1' })).value
check('one wallpaper is one request, on the first edge',
  oneImage?.ok === true && fetchLog.length === beforeImage + 1
  && fetchLog[beforeImage] === `https://i0.hdslb.com${profilePath('m1')}`,
  JSON.stringify(fetchLog.slice(beforeImage)))
check('and it arrives as a data URL of the sniffed bytes',
  oneImage?.dataUrl?.startsWith('data:image/webp;base64,') === true
  && bytes(oneImage.dataUrl) === WEBP.length,
  `mime=${oneImage?.dataUrl?.slice(0, 24)} bytes=${oneImage?.dataUrl ? bytes(oneImage.dataUrl) : 'none'}`)
// The transform, which is what keeps a 12 MB upload from being the thing this
// downloads (see BFS_SUFFIX in src/profile.ts).
check('the URL carries the webp transform rather than the raw upload',
  fetchLog[beforeImage].endsWith('@3840w.webp'), fetchLog[beforeImage])

// A holiday slot is refused BEFORE anything is requested, exactly as a write to one
// is — the bytes could never be stored even if they were fetched.
const beforeRefusal = fetchLog.length
check('a holiday slot is refused before it downloads',
  (await call('fetchPresetImage', { slot: 'h-midautumn' })).value?.error === 'bad slot'
  && fetchLog.length === beforeRefusal)
// And so is a well-formed slot the profile does not carry: the table is the
// whitelist on a public RPC, so a caller cannot name a file of its own choosing.
const beforeUnknown = fetchLog.length
check('a slot the profile does not carry is refused before it downloads',
  (await call('fetchPresetImage', { slot: 'm9' })).value?.error === 'bad slot'
  && fetchLog.length === beforeUnknown)
const beforeBadName = fetchLog.length
check('a malformed slot name is refused before it downloads',
  (await call('fetchPresetImage', { slot: '../theme-config.json' })).value?.error === 'bad slot'
  && fetchLog.length === beforeBadName)

// The failure this fetcher owes a fast answer to: the path is gone. All three edges
// are asked once — three requests, no waiting — and the answer is a value.
const beforeMissing = fetchLog.length
check('a wallpaper no edge answers for fails, and says so',
  JSON.stringify((await call('fetchPresetImage', { slot: 'm7' })).value)
  === JSON.stringify({ ok: false, error: 'download failed' })
  && fetchLog.length === beforeMissing + 3
  && fetchLog.slice(beforeMissing).map(u => new URL(u).host).join(',')
    === 'i0.hdslb.com,i1.hdslb.com,i2.hdslb.com',
  JSON.stringify(fetchLog.slice(beforeMissing)))

// The failure the retry exists for: EVERY edge has a bad moment at once, so the
// round has not been answered — and the file is asked again after a delay instead
// of the whole profile failing. Measured in requests, because "it worked" is not
// the claim; "it worked because it asked again" is.
flaky = 3
const beforeFlaky = fetchLog.length
check('when every edge fails once the file is asked again, and still arrives',
  (await call('fetchPresetImage', { slot: 'm2' })).value?.ok === true
  && fetchLog.length === beforeFlaky + 4
  && fetchLog[beforeFlaky].startsWith('https://i0.')
  && fetchLog[beforeFlaky + 3].startsWith('https://i0.'),
  JSON.stringify(fetchLog.slice(beforeFlaky)))
flaky = 0
routes.set(profileKey('m3'), Buffer.from('<html>not an image</html>'))
check('a wallpaper that is not an image is refused, not written',
  (await call('fetchPresetImage', { slot: 'm3' })).value?.error === 'not an image')

// The second edge, per file, for the same reason the art has one — and with the
// SAME path, because three edges that answered different paths would be serving
// different pictures under one name.
downMirrors = ['i0.hdslb.com']
const beforeImageFallback = fetchLog.length
check('a dead first edge falls through to the second for one wallpaper',
  (await call('fetchPresetImage', { slot: 'm1' })).value?.ok === true
  && fetchLog.length === beforeImageFallback + 2
  && fetchLog[beforeImageFallback].startsWith('https://i0.')
  && fetchLog[beforeImageFallback + 1].startsWith('https://i1.'),
  JSON.stringify(fetchLog.slice(beforeImageFallback)))
downMirrors = []
routes = null

// Every way one transfer can fail without a working network, each one a VALUE.
downMirrors = ['i0.hdslb.com', 'i1.hdslb.com', 'i2.hdslb.com']
check('with every edge down there is no wallpaper, and no exception',
  (await call('fetchPresetImage', { slot: 'm1' })).value?.error === 'download failed')
downMirrors = []
httpStatus = 500
// A permanently broken edge is the other half of the retry: the budget is a budget.
// Three rounds over three edges is nine requests and then it is over — a retry that
// kept going would leave the user watching a button that never answers.
const beforeBroken = fetchLog.length
check('a 500 is not a wallpaper, and the retries are finite',
  (await call('fetchPresetImage', { slot: 'm1' })).value?.error === 'download failed'
  && fetchLog.length === beforeBroken + 9,
  `${fetchLog.length - beforeBroken} request(s)`)
httpStatus = 200
// The size cap is the courtesy check: an edge that announces more than the cap never
// gets to send it. Claimed, not sent — an 8 MB body would only make the suite slow.
claimedLength = 64 * 1024 * 1024
check('an edge announcing an oversized body is refused before it is read',
  (await call('fetchPresetImage', { slot: 'm1' })).value?.error === 'download failed')
claimedLength = null
check('and nothing about the profile is written to the store',
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
// The backup goes WITH it: a `.bak` left behind would be restored by the next read,
// silently undoing the replacement that `wipeFirst` exists to perform — the one
// place where a safety net would be a bug.
check('and so is the backup of the config it replaced',
  !existsSync(join(DATA, 'theme-config.json.bak')), readdirSync(DATA).join(', '))
check('and every rule image with it',
  readdirSync(DATA).filter(n => n.startsWith('modelbg-')).length === 0,
  readdirSync(DATA).join(', '))
// `holiday-cache/` is not the user's configuration: it is downloaded, it belongs
// to no slot, and re-fetching it is a network round trip for nothing.
check('but the downloaded festival art is left where it is',
  cached('mid-autumn.webp')?.equals(WEBP) === true
  && cached.nat('national-day.webp')?.equals(WEBP) === true,
  JSON.stringify(existsSync(CACHE) ? readdirSync(CACHE) : []))
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
