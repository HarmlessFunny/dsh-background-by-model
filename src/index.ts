/**
 * Node half of dsh-background-by-model: file-backed rule persistence.
 *
 * Owns the `~/.dsh/.dsh-background-by-model-data/` store and exposes a small RPC
 * surface on the dedicated `/dsh-background-by-model` channel (never the shared
 * `/api`, so slash commands stay intact).
 *
 *   theme-config.json   the ordered rule list + the global interface settings
 *   modelbg-<slot>      one background image per rule (raw bytes, no extension;
 *                       the MIME is sniffed from the magic bytes when served)
 *   holiday-cache/      festival art downloaded from the CDN, one file per
 *                       holiday asset — deliberately NOT a slot (see below)
 *
 * Images travel as data URLs over the RPC channel — there is no separate HTTP
 * image route. A legacy single-wallpaper / video-background store is migrated
 * to rule 1 on first read.
 */
import { access, mkdir, readFile, writeFile, rm, rename, readdir } from 'node:fs/promises'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
// The holiday calendar: the node half only needs the fixed slot ids and
// the asset names (the date maths belongs to the browser half).
import { HOLIDAYS } from './holiday'
// The persisted shape lives in ./schema, shared verbatim with the browser half.
import { SCHEMA_VERSION, SLOT_RE, normalizeConfig } from './schema'
import type { BgState, ThemeConfig } from './schema'
// Which download failures are worth another round, and how long to wait before
// it — shared with the browser half, which owns what a failed attempt keeps (see
// ./preset for why the two questions live in one module).
import { PRESET_ATTEMPTS, presetRetryDelayMs, presetRetryable } from './preset'
import type { FetchFailure } from './preset'

export const name = 'dsh-background-by-model'
export const inject = ['connection', 'webServer']

const DATA_DIR = '.dsh-background-by-model-data'
const CONFIG_FILE = 'theme-config.json'
const IMAGE_PREFIX = 'modelbg-'
// Files owned by earlier versions (the single wallpaper slot, a background
// video and its upload temp); removed by the one-shot legacy migration.
const LEGACY_WALLPAPER = 'wallpaper.jpg'
const LEGACY_FILES = [
  'wallpaper.mp4', 'wallpaper.webm', 'wallpaper.ogv', 'wallpaper.mov',
  'wallpaper.mkv', 'wallpaper.video', 'wallpaper.upload.tmp',
]
// Network-URL wallpaper fetch: cap the download and time it out so a bad link
// can't stall the UI or fill the drive.
const WALLPAPER_FETCH_MAX = 25 * 1024 * 1024
const WALLPAPER_FETCH_TIMEOUT = 20_000

/**
 * Where the festival art is hosted, and which revision of it this build wants.
 *
 * The two holiday wallpapers used to ship inside the package. They do not any
 * more: they were 746 KB of the 1.1 MB tarball — two thirds of everything anyone
 * downloaded — for art that is looked at on one day a year, and they are the one
 * part of the package that is a picture rather than code. The bytes now live in
 * the `assets` repository beside the README screenshots and are fetched from a
 * CDN the first time a holiday actually needs one (see `readHolidayAsset`).
 *
 * The reference is a **release tag**, never a branch. Runtime art has to be
 * immutable: a branch reference would let a later reshuffle of the documentation
 * screenshots silently kill a shipped feature, on a day nobody is watching, with
 * nothing in the log — and jsDelivr serves a version reference as immutable,
 * which is exactly what a file that never changes wants. A tag says that to the
 * CDN in the same breath as it says it to a human: `v0.1.0` is the reference the
 * README's screenshots and the recommended profile are read at, so one release
 * of the assets repository is one version of every byte this plugin fetches,
 * where a raw commit hash was a value nobody could compare against anything.
 * The cost is unchanged — new art means a new tag there and a new value here —
 * with one addition: a tag that is MOVED does not reach jsDelivr's edge on its
 * own (the reference is served as immutable), so re-pointing one means a purge
 * request. Cutting a new tag is the cheap move.
 */
const HOLIDAY_ASSETS_REPO = 'HarmlessFunny/assets'
const HOLIDAY_ASSETS_REF = 'v0.1.0'
const HOLIDAY_ASSETS_DIR = 'dsh-background-by-model/holiday'
/**
 * Mirrors, tried in order. jsDelivr first because it is reachable from networks
 * where `raw.githubusercontent.com` is not; raw second because a CDN can be
 * blocked, rate-limited or down, and one dead mirror must not cost the easter
 * egg. Every mirror serves the same version, so a fallback cannot mix revisions.
 */
const HOLIDAY_ASSET_HOSTS: readonly string[] = [
  `https://cdn.jsdelivr.net/gh/${HOLIDAY_ASSETS_REPO}@${HOLIDAY_ASSETS_REF}/${HOLIDAY_ASSETS_DIR}`,
  `https://raw.githubusercontent.com/${HOLIDAY_ASSETS_REPO}/${HOLIDAY_ASSETS_REF}/${HOLIDAY_ASSETS_DIR}`,
]
/**
 * Sub-directory of the store holding downloaded festival art.
 *
 * It is NOT part of the slot namespace and must never become part of it: the
 * cached files are named after the ASSET (`mid-autumn.webp`), not after a slot,
 * so nothing here can ever be mistaken for a user's `modelbg-<slot>`. That is
 * what lets a holiday slot stay read-only — `writeImage` still refuses it, and
 * the store still never holds a `modelbg-h-*` file — while the art itself is
 * now fetched rather than shipped.
 */
const HOLIDAY_CACHE_DIR = 'holiday-cache'
/** Cap and timeout for one asset download; these files are 228 KB and 500 KB. */
const HOLIDAY_FETCH_MAX = 8 * 1024 * 1024
const HOLIDAY_FETCH_TIMEOUT = 10_000

/**
 * The recommended profile, served from the same assets repository as the
 * festival art — as a DIRECTORY, in the store's own shape.
 *
 * It used to be one theme file with every wallpaper inlined as base64: 2.9 MB
 * where 99.8% of the bytes were a picture, so changing the `match` string of one
 * rule meant finding it inside a single line of several hundred thousand
 * characters. Now the published layout is exactly the layout of
 * `~/.dsh/.dsh-background-by-model-data/` — a readable `theme-config.json` and
 * one raw file per slot — which makes the configuration editable in place and
 * makes publishing it a `cp` out of the data directory rather than a special
 * export step. The bytes on the wire are the same; only their arrangement is
 * different.
 *
 * Nothing lists the images: the request set is DERIVED from the config's own
 * `rules[].images[].slot`, so adding a wallpaper is adding a rule entry and a
 * file, with no second place to keep in sync.
 *
 * Referenced by the same **release tag** as the festival art. This used to be a
 * branch, and deliberately: the reason the art is immutable — a reshuffle of the
 * assets repository would make a shipped feature disappear SILENTLY, on a day
 * nobody is watching — does not apply to a profile, because a profile fails
 * LOUDLY (the user is looking at the button and gets an error naming what went
 * missing), and a branch bought the ability to correct a bad recommendation
 * without a plugin release.
 *
 * That trade is now the other way round. What a branch also bought was a plugin
 * whose bytes could change under the user between the build and the click, and
 * with one tag covering the screenshots, the festival art and this profile, one
 * release of the assets repository is one version of everything the plugin
 * fetches — the same value in the README, in `HOLIDAY_ASSETS_REF` and here. The
 * price is that correcting one JSON file now costs a tag in `assets`, a new
 * value in this file and a release on npm, and that MOVING the tag does not
 * reach jsDelivr's edge by itself (it is served as immutable, and the purge tool
 * is the only way to re-point it) — so a correction is a new tag, never a
 * force-push of the old one.
 *
 * The re-pointed-tag case is why `presetKey` survives this change: an edge that
 * has not been purged can still answer with the previous bytes of the same URL,
 * so two fetches of "the profile" are not guaranteed to be one revision, and a
 * press that resumes must not glue them together. See `fetchPresetConfig`.
 *
 * The risk that IS real — a profile written for a config shape this build cannot
 * read — is what `preset.json` exists for (see `fetchPresetConfig`).
 */
const PRESET_ASSETS_REPO = 'HarmlessFunny/assets'
const PRESET_ASSETS_REF = 'v0.1.0'
const PRESET_ASSET_DIR = 'dsh-background-by-model/preset'
/** The shape gate: `{"version": 6}` — see SCHEMA_VERSION in ./schema. */
const PRESET_MANIFEST = 'preset.json'
const PRESET_CONFIG = 'theme-config.json'
/** Images are named after the slot they fill, exactly as they are on disk. */
const PRESET_IMAGE_PREFIX = 'modelbg-'
/** Mirrors, tried in order — same reason as the festival art's. */
const PRESET_ASSET_HOSTS: readonly string[] = [
  `https://cdn.jsdelivr.net/gh/${PRESET_ASSETS_REPO}@${PRESET_ASSETS_REF}/${PRESET_ASSET_DIR}`,
  `https://raw.githubusercontent.com/${PRESET_ASSETS_REPO}/${PRESET_ASSETS_REF}/${PRESET_ASSET_DIR}`,
]

/**
 * Caps for the profile, now per file rather than for one document.
 *
 * Three of them, because a profile is now a SET of transfers and each has a
 * different way of going wrong. The manifest and the config are small by nature
 * — a manifest is one field, a config is a few kilobytes of JSON — so their caps
 * are what stops a mirror from answering with something enormous instead. The
 * images are the payload, so their cap is about the content.
 *
 * The count is the one that matters: the request set is derived from the config,
 * so a hostile or broken config could name a thousand slots and turn one button
 * press into a thousand downloads. `SLOT_RE` bounds each name and
 * `PRESET_IMAGE_COUNT_MAX` bounds how many names there can be. The running TOTAL
 * of what those transfers add up to is bounded on the client instead, because
 * these calls are independent and this side never sees more than one file.
 *
 * The timeout is set by measurement, not by symmetry with the festival art's
 * 10 s. A 350 KB wallpaper takes a second or two over jsDelivr from a normal
 * connection, and the mirror that exists for the case where jsDelivr does not
 * answer is the slower one — so a tight budget would fail exactly in the
 * situation it was written for. A minute tolerates a slow link and is still
 * bounded; the user is watching a button that says it is downloading, which is
 * the one place waiting is honest.
 */
const PRESET_MANIFEST_MAX = 64 * 1024
const PRESET_CONFIG_MAX = 1024 * 1024
const PRESET_IMAGE_MAX = 8 * 1024 * 1024
const PRESET_IMAGE_COUNT_MAX = 64
const PRESET_FETCH_TIMEOUT = 60_000

// The config shape, its defaults and its sanitizers are shared with the browser
// half — see ./schema, the module that keeps the two halves from drifting.

const dataDir = (): string => dshHomePath(DATA_DIR)
const configPath = (): string => dshHomePath(DATA_DIR, CONFIG_FILE)
const legacyWallpaperPath = (): string => dshHomePath(DATA_DIR, LEGACY_WALLPAPER)
const imagePath = (slot: string): string => dshHomePath(DATA_DIR, `${IMAGE_PREFIX}${slot}`)
const holidayCachePath = (asset: string): string => dshHomePath(DATA_DIR, HOLIDAY_CACHE_DIR, asset)

const exists = async (p: string): Promise<boolean> => { try { await access(p); return true } catch { return false } }

/**
 * One-shot migration of the pre-0.3 store.
 *
 * Anything without a `rules` array is an old config: its single wallpaper
 * becomes rule 1 (`m1`, empty match = pure fallback) carrying the old color,
 * layout mode, opacity, blur and framing, and the remaining legacy files
 * (background video, upload temp) are removed. Idempotent: the rewritten config
 * carries `rules`, so the next read short-circuits.
 *
 * The one case that is NOT a migration — a store with no config file at all — is
 * handed through untouched rather than being filled in as `rules: []`. That empty
 * list would be the same thing the sanitizer reads as "the user deleted every
 * rule", and a fresh install is the opposite of that: `normalizeConfig` turns a
 * config that names no rule list into the one blank rule the panel opens on.
 */
async function migrateLegacy(raw: unknown): Promise<unknown> {
  const r = (raw ?? {}) as Record<string, unknown>
  if (Array.isArray(r.rules)) return r
  const hasWallpaper = await exists(legacyWallpaperPath())
  if (Object.keys(r).length === 0 && !hasWallpaper) return {}

  if (hasWallpaper) {
    const target = imagePath('m1')
    try {
      // Windows rename refuses to overwrite (EEXIST): drop the target first.
      await rm(target, { force: true })
      await rename(legacyWallpaperPath(), target)
    } catch (e) {
      console.warn('dsh-background-by-model: could not adopt the legacy wallpaper', e)
    }
  }
  for (const f of LEGACY_FILES) {
    try { await rm(dshHomePath(DATA_DIR, f), { force: true }) } catch { /* best effort */ }
  }

  const next = {
    rules: [{
      id: 'm1',
      // The image list, written in the new shape directly: the sanitizer would
      // lift an old `slot`/`bgState` pair anyway, but leaving a legacy shape on
      // disk until the first write means the file no longer describes what the
      // plugin actually holds. The mode travels with the picture now — the old
      // rule-level value is what this image's own mode starts as, which is the
      // same lift `normalizeRule` performs for every other rule.
      images: [{
        slot: 'm1',
        bgMode: typeof r.bgMode === 'string' ? r.bgMode : 'fit',
        bgState: (r.bgState ?? {}) as Partial<BgState>,
      }],
      match: '',
      enabled: true,
      color: Array.isArray(r.color) ? r.color : null,
      wallpaperOpacity: typeof r.wallpaperOpacity === 'number' ? r.wallpaperOpacity : 1,
      blur: typeof r.blur === 'number' ? r.blur : 0,
    }],
    opacities: r.opacities,
    blurs: r.blurs,
    settingsOpacity: r.settingsOpacity,
    chatTextOpacity: r.chatTextOpacity,
    trajectoryOpacity: r.trajectoryOpacity,
    rightbarOpacity: r.rightbarOpacity,
  }
  try {
    await writeFile(configPath(), JSON.stringify(next, null, 2), 'utf8')
  } catch (e) {
    console.warn('dsh-background-by-model: could not rewrite the migrated config', e)
  }
  return next
}

async function ensureDir(): Promise<void> {
  try {
    await mkdir(dataDir(), { recursive: true })
  } catch (e) {
    console.warn(`dsh-background-by-model: cannot create data dir "${dataDir()}"`, e)
  }
}

async function readConfig(): Promise<ThemeConfig> {
  await ensureDir()
  let raw: unknown = {}
  try {
    raw = JSON.parse(await readFile(configPath(), 'utf8'))
  } catch {
    // First run (no file yet) or unreadable config — fall back to defaults.
    raw = {}
  }
  return normalizeConfig(await migrateLegacy(raw))
}

// ── Two-half drift guard ───────────────────────────────────────────────────
// The shape lives in ./schema now, so this can only fire when one half adds a
// field the shared shape does not declare yet (a half-built edit, a stale
// bundle, or a hand-edited JSON). Without it the sanitizer drops the field
// silently: the slider stays live in memory, the disk copy loses it, and the
// next load quietly falls back to the default. Warn once per key so the drift
// shows up in the host log instead.
const LEGACY_CONFIG_KEYS = new Set(['color', 'bgMode', 'wallpaperOpacity', 'blur', 'bgState'])
// Pre-0.7 / pre-0.7.5 rule fields: `normalizeRule` deliberately LIFTS these into
// the image list, so they are not drift and must not be reported as such. `bgMode`
// joined them in 0.7.5: the rule-level layout mode a schema-5 config carries is read
// once and handed to every image entry, which is a migration, not a mismatch.
const LEGACY_RULE_KEYS = new Set(['slot', 'bgState', 'bgMode'])
// Nested fields an older shape carried and the sanitizer consumes on purpose:
// the per-rule `rotate.fadeMs` is folded into the global transition duration on
// read (`legacyFadeMs` in ./schema), so a config that still has it is being
// migrated rather than drifting.
const LEGACY_NESTED_KEYS = new Set(['rules[].rotate.fadeMs'])
const warnedConfigKeys = new Set<string>()

function warnUnknownConfigKeys(raw: unknown, normalized: ThemeConfig): void {
  if (raw === null || typeof raw !== 'object') return
  const r = raw as Record<string, unknown>
  const warned = (id: string): void => {
    if (warnedConfigKeys.has(id)) return
    warnedConfigKeys.add(id)
    console.warn(`dsh-background-by-model: ignoring unknown config field "${id}" (declared in one half only?)`)
  }
  // The normalized object IS the authoritative key set — it is what the
  // sanitizer in ./schema emits, so no second list can fall behind.
  const known = new Set(Object.keys(normalized))
  for (const key of Object.keys(r)) {
    // Pre-0.3 top-level fields: migrateLegacy turns them into rule 1.
    if (!known.has(key) && !LEGACY_CONFIG_KEYS.has(key)) warned(key)
  }
  const groups: Array<[string, object]> = [['blurs', normalized.blurs], ['opacities', normalized.opacities]]
  for (const [group, have] of groups) {
    const got = r[group]
    if (got === null || typeof got !== 'object') continue
    const keys = new Set(Object.keys(have))
    for (const key of Object.keys(got as Record<string, unknown>)) {
      if (!keys.has(key)) warned(`${group}.${key}`)
    }
  }
  // Fixed-shape nested objects, as opposed to the dynamic-key maps above: every
  // key of `transition` is declared, so an unknown one is drift rather than a
  // name the user chose — and the sanitizer REBUILDS the object, which would
  // otherwise drop it in silence. `holidays` is deliberately absent: its `items`
  // are keyed by holiday id and are already rebuilt from `HOLIDAYS`.
  const shapes: Array<[string, unknown, object]> = [['transition', r.transition, normalized.transition]]
  for (const [label, got, known] of shapes) {
    if (got === null || typeof got !== 'object') continue
    const keys = new Set(Object.keys(known))
    for (const key of Object.keys(got as Record<string, unknown>)) {
      if (!keys.has(key)) warned(`${label}.${key}`)
    }
  }
  // Rule fields drift the same way; every rule goes through one sanitizer, so
  // comparing the first sent rule with the first normalized one is enough.
  const sent = Array.isArray(r.rules) ? r.rules[0] : undefined
  const have = normalized.rules[0]
  if (sent !== null && typeof sent === 'object' && have !== undefined) {
    const rule = sent as Record<string, unknown>
    const keys = new Set(Object.keys(have))
    for (const key of Object.keys(rule)) {
      if (!keys.has(key) && !LEGACY_RULE_KEYS.has(key)) warned(`rules[].${key}`)
    }
    // The rule's own nested objects drift one level deeper, and a field that
    // lives only in the client bundle would be dropped here in silence — which
    // is exactly the bug this whole function exists to make audible. `images` is
    // compared at its first entry: every entry goes through the same sanitizer,
    // and a second shape check would only ever repeat this one.
    const nested: Array<[string, unknown, unknown]> = [
      ['rules[].rotate', rule.rotate, have.rotate],
      [
        'rules[].images[]',
        Array.isArray(rule.images) ? rule.images[0] : undefined,
        have.images[0],
      ],
    ]
    for (const [label, got, known] of nested) {
      if (got === null || typeof got !== 'object' || known === null || known === undefined) continue
      const knownKeys = new Set(Object.keys(known as object))
      for (const key of Object.keys(got as Record<string, unknown>)) {
        if (!knownKeys.has(key) && !LEGACY_NESTED_KEYS.has(`${label}.${key}`)) warned(`${label}.${key}`)
      }
    }
  }
}

async function writeConfig(config: unknown): Promise<boolean> {
  await ensureDir()
  try {
    const normalized = normalizeConfig(config)
    warnUnknownConfigKeys(config, normalized)
    await writeFile(configPath(), JSON.stringify(normalized, null, 2), 'utf8')
    return true
  } catch (e) {
    console.error(`dsh-background-by-model: failed to write "${CONFIG_FILE}"`, e)
    return false
  }
}

/**
 * Sniff an image's MIME from its leading magic bytes, or null when the bytes are
 * not a recognised image at all.
 *
 * The null answer is what a DOWNLOAD is checked against (see `fetchHolidayAsset`):
 * a CDN that answers 200 with an error page, a captive-portal redirect or a
 * truncated body has to be rejected, and neither a status code nor a
 * `content-type` header survives contact with a misconfigured mirror. The magic
 * bytes of the payload are the only claim that cannot lie.
 */
function imageMimeOrNull(buf: Buffer): string | null {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp'
  return null
}

/**
 * Sniff an image's MIME from its leading magic bytes (defaults to JPEG).
 *
 * The default is deliberate for the bytes a USER uploaded: an unrecognised format
 * is better served as a JPEG and left to the browser than refused outright — the
 * browser decides, and it can sniff what this list does not know.
 */
function sniffImageMime(buf: Buffer): string {
  return imageMimeOrNull(buf) ?? 'image/jpeg'
}

/**
 * Read one slot as a data URL, or null when it has nothing to serve.
 *
 * Two very different sources behind one answer. A holiday slot resolves to the
 * festival art — downloaded on demand and cached, never shipped (see
 * `readHolidayAsset`). Everything else is the user's own bytes on disk. Both are
 * resolved lazily, so neither is read, fetched or even looked for until a
 * wallpaper actually needs it.
 *
 * `null` is a legitimate answer for a holiday — offline, a blocked CDN, a cold
 * cache — and the caller is built for it: `pickHoliday` treats "no bytes" as
 * "this holiday does not take over" and the model rules keep painting. A
 * festival that cannot be downloaded must never blank the interface.
 */
async function readImage(slot: string): Promise<string | null> {
  const asset = holidayAssetFor(slot)
  if (asset !== null) {
    const art = await readHolidayAsset(asset)
    return art === null ? null : toDataUrl(art)
  }
  const own = await readFileOrNull(imagePath(slot))
  return own === null ? null : toDataUrl(own)
}

async function readFileOrNull(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path)
  } catch {
    return null
  }
}

function toDataUrl(buf: Buffer): string {
  return `data:${sniffImageMime(buf)};base64,${buf.toString('base64')}`
}

/** Downloads in flight, so two read paths asking at once share one transfer. */
const holidayInFlight = new Map<string, Promise<Buffer | null>>()

/**
 * One holiday's art: from the cache if it is there and sound, otherwise from the
 * network.
 *
 * The cached copy is validated rather than trusted — a process killed mid-write
 * (or a full disk) would otherwise leave a permanently truncated file that every
 * later read happily serves, and the holiday would be broken forever with no way
 * back short of deleting a file nobody knows about. A cache entry that is not an
 * image is treated exactly like a miss and overwritten by the next download.
 *
 * The in-flight map matters because the two readers can race: the boot hydrate
 * and the midnight rollover timer both ask for the same slot, and the timer
 * fires precisely when a machine that was asleep all day is waking up. Without
 * it that is two simultaneous half-megabyte transfers for one picture.
 */
async function readHolidayAsset(asset: string): Promise<Buffer | null> {
  const cached = await readFileOrNull(holidayCachePath(asset))
  if (cached !== null && imageMimeOrNull(cached) !== null) return cached
  const running = holidayInFlight.get(asset)
  if (running !== undefined) return await running
  const task = downloadHolidayAsset(asset).finally(() => { holidayInFlight.delete(asset) })
  holidayInFlight.set(asset, task)
  return await task
}

/** Try every mirror in turn; the first usable answer is cached and returned. */
async function downloadHolidayAsset(asset: string): Promise<Buffer | null> {
  for (const host of HOLIDAY_ASSET_HOSTS) {
    const buf = await fetchHolidayAsset(`${host}/${asset}`)
    if (buf === null) continue
    await writeHolidayCache(asset, buf)
    return buf
  }
  return null
}

/** Wait, without pulling in `node:timers/promises` for one line. */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/**
 * One asset over the wire, or WHY it did not arrive.
 *
 * Never throws: a holiday that cannot be fetched is a holiday that does not paint
 * today, and a profile file that cannot be fetched is a sentence on the button —
 * neither is an error path the caller should have to wrap. What it answers with
 * instead is the reason, because the two callers treat those differently: the
 * profile asks `presetRetryable` whether the reason is weather (./preset) and the
 * festival art takes the null and waits for the next apply.
 *
 * The `content-length` check is a courtesy — a mirror that announces a huge body
 * never gets to send it — while the post-read size check is the one that holds.
 *
 * Deliberately says nothing about WHAT the bytes are: the festival art and the
 * recommended profile are both "a file from the assets repository", and the one
 * thing they do not share is how a payload is recognised (magic bytes vs JSON).
 * That check belongs to the caller, which is the only half that knows what it
 * asked for.
 */
async function fetchAsset(
  url: string, max: number, timeout: number,
): Promise<{ ok: true; buf: Buffer } | { ok: false; reason: FetchFailure }> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeout)
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctl.signal })
    if (!res.ok) return { ok: false, reason: fetchFailureForStatus(res.status) }
    const announced = Number(res.headers.get('content-length') ?? '')
    if (isFinite(announced) && announced > max) return { ok: false, reason: 'oversized' }
    const arr = await res.arrayBuffer()
    if (arr.byteLength > max) return { ok: false, reason: 'oversized' }
    if (arr.byteLength === 0) return { ok: false, reason: 'empty' }
    return { ok: true, buf: Buffer.from(arr) }
  } catch {
    // The abort this side armed is the one failure it can tell apart from the
    // rest: `fetch` rejects the same way for a dead network, and there the mirror
    // never answered at all rather than answering too late.
    return { ok: false, reason: ctl.signal.aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The status codes worth another round: 5xx is a mirror having a bad moment, 429
 * is one asking to be left alone for a bit, 408 is one giving up on us.
 *
 * Every other non-2xx means the file is not there — jsDelivr answers a path
 * outside the repository with 403, both hosts answer a missing file with 404 — and
 * the profile follows a BRANCH, so that answer has to arrive fast and unchanged.
 */
function fetchFailureForStatus(status: number): FetchFailure {
  return status >= 500 || status === 429 || status === 408 ? 'server' : 'missing'
}

/**
 * One festival picture, or null when no mirror served an image.
 *
 * One round, deliberately, unlike the profile's (see `fetchPresetFile`): this is
 * fetched during boot, on the day, before the first wallpaper is painted, and a
 * retry round would add its delay to that first paint. The art does not need one
 * either — it is cached once it arrives, and every later read tries again, while a
 * button press has no later read of its own.
 */
async function fetchHolidayAsset(url: string): Promise<Buffer | null> {
  const got = await fetchAsset(url, HOLIDAY_FETCH_MAX, HOLIDAY_FETCH_TIMEOUT)
  return !got.ok || imageMimeOrNull(got.buf) === null ? null : got.buf
}

/**
 * One file out of the profile directory, or null when no mirror served it.
 *
 * Every mirror is asked in every round, so a round is "all the hosts there are"
 * and the rounds are the retry: the case this exists for is a mirror that answers
 * 502 on one round and correctly on the next, on the sixth of seven files, with
 * six good downloads behind it. A round in which every failure was terminal — the
 * file is not there, or it is too big — ends the attempts outright, so "the author
 * renamed a file" still costs exactly two requests and a sentence naming the slot
 * (see `presetRetryable`, ./preset).
 */
async function fetchPresetFile(name: string, max: number): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= PRESET_ATTEMPTS; attempt++) {
    let retryable = false
    for (const host of PRESET_ASSET_HOSTS) {
      const got = await fetchAsset(`${host}/${name}`, max, PRESET_FETCH_TIMEOUT)
      if (got.ok) return got.buf
      // Any mirror worth retrying makes the ROUND worth repeating: jsDelivr
      // answering 404 while raw answers 503 is a round that has not been answered
      // yet, not a file that is gone.
      if (presetRetryable(got.reason)) retryable = true
    }
    if (!retryable || attempt === PRESET_ATTEMPTS) return null
    await sleep(presetRetryDelayMs(attempt))
  }
  return null
}

/**
 * The profile's shape gate and its configuration, in one answer.
 *
 * Two files, fetched in order, because they answer different questions. The
 * manifest says what SHAPE the config is written for, and a config written for a
 * shape this build cannot read is refused here — before anything is downloaded
 * in earnest and long before anything is deleted. The config then says what the
 * profile IS.
 *
 * The sanitizer runs on this side, and that is not merely tidiness: the list of
 * images to download is DERIVED from `rules[].images[].slot`, so an unsanitized
 * config would let a remote file choose what this process requests. After
 * `normalizeConfig` every slot has passed `SLOT_RE` (see `normalizeImage`), and
 * the only names left to reject are the holiday slots — which a config CAN name,
 * legally, inside `holidays.items`, and which have no file at all.
 *
 * Holiday slots are dropped rather than refused. They are unwritable by design
 * (`writeImage` refuses them), so a rule that points at one is already inert on
 * the client; failing the whole profile over a slot nothing could ever fill
 * would be a worse answer than ignoring it.
 *
 * Nothing is cached to disk, unlike the festival art. That cache exists because
 * the art is fetched on a schedule without anyone asking and must work offline
 * afterwards; this is a button whose entire point is to fetch what is there NOW.
 */
async function fetchPresetConfig(): Promise<
  { ok: true; version: number; config: ThemeConfig; slots: string[] } | { ok: false; error: string }
> {
  const manifestRaw = await fetchPresetFile(PRESET_MANIFEST, PRESET_MANIFEST_MAX)
  if (manifestRaw === null) return { ok: false, error: 'download failed' }
  let manifest: unknown
  try {
    manifest = JSON.parse(manifestRaw.toString('utf8'))
  } catch {
    return { ok: false, error: 'not a profile' }
  }
  const declared = (manifest as { version?: unknown } | null)?.version
  if (typeof declared !== 'number' || !isFinite(declared)) return { ok: false, error: 'not a profile' }
  if (declared > SCHEMA_VERSION) return { ok: false, error: 'newer version' }

  const configRaw = await fetchPresetFile(PRESET_CONFIG, PRESET_CONFIG_MAX)
  if (configRaw === null) return { ok: false, error: 'download failed' }
  let raw: unknown
  try {
    raw = JSON.parse(configRaw.toString('utf8'))
  } catch {
    return { ok: false, error: 'not a profile' }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not a profile' }
  const config = normalizeConfig(raw)

  const slots = new Set<string>()
  for (const rule of config.rules) {
    for (const image of rule.images) {
      if (holidayAssetFor(image.slot) !== null) continue
      slots.add(image.slot)
    }
  }
  if (slots.size > PRESET_IMAGE_COUNT_MAX) return { ok: false, error: 'too many images' }
  return { ok: true, version: declared, config, slots: [...slots] }
}

/**
 * One of the profile's wallpapers, as a data URL ready to be written into a slot.
 *
 * The same two checks the festival art gets, for the same reason: the bytes must
 * actually be an image (`imageMimeOrNull`, never the `content-type` header — the
 * mirror serves extensionless files as `application/octet-stream`), and the slot
 * must be one this process is willing to write. The slot name is re-checked here
 * because this is a public RPC: the list this side hands out is not the only
 * thing a caller could ask for.
 */
async function fetchPresetImage(
  slot: string,
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  if (!SLOT_RE.test(slot) || holidayAssetFor(slot) !== null) return { ok: false, error: 'bad slot' }
  const buf = await fetchPresetFile(`${PRESET_IMAGE_PREFIX}${slot}`, PRESET_IMAGE_MAX)
  if (buf === null) return { ok: false, error: 'download failed' }
  const mime = imageMimeOrNull(buf)
  if (mime === null) return { ok: false, error: 'not an image' }
  return { ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
}

/**
 * Cache one downloaded asset, atomically and best-effort.
 *
 * Written to a temp name and renamed into place, so a reader never sees a partial
 * file even if this process dies between the two calls. A failure to cache is
 * logged and otherwise ignored: the bytes are already in hand and the caller is
 * waiting for them — losing the cache costs a re-download next time, and failing
 * the read over it would cost the holiday.
 */
async function writeHolidayCache(asset: string, buf: Buffer): Promise<void> {
  try {
    await ensureDir()
    await mkdir(dshHomePath(DATA_DIR, HOLIDAY_CACHE_DIR), { recursive: true })
    const target = holidayCachePath(asset)
    const temp = `${target}.tmp`
    await writeFile(temp, buf)
    await rename(temp, target)
  } catch (e) {
    console.warn(`dsh-background-by-model: could not cache the "${asset}" holiday art`, e)
  }
}

/**
 * The wallpaper a holiday slot resolves to, or null when the slot is not a
 * holiday's.
 *
 * This mapping is the ONLY thing that makes a holiday slot read-only, so both
 * `readImage` and `writeImage` go through it rather than each testing the holiday
 * list on their own. It reads no config: the festival art has stopped being a
 * fallback that a flag could disable. What changed is only WHERE the bytes come
 * from — the slot's identity, and its refusal to accept a write, are untouched.
 */
function holidayAssetFor(slot: string): string | null {
  return HOLIDAYS.find(h => h.slot === slot)?.asset ?? null
}

/** Persist one rule image (null removes it); false keeps the previous file. */
async function writeImage(slot: string, dataUrl: string | null): Promise<boolean> {
  // A holiday slot is not the user's: refusing the write (rather than merely
  // ignoring whatever a file there holds) is what keeps the festival art
  // unswappable. This is the one funnel every write, delete and URL fetch goes
  // through, so the invariant cannot be bypassed one entry point at a time. It
  // still holds now that the art is downloaded rather than shipped: the download
  // caches under `holiday-cache/`, keyed by asset, and never into a slot.
  if (holidayAssetFor(slot) !== null) return false
  await ensureDir()
  try {
    if (dataUrl === null) {
      await rm(imagePath(slot), { force: true })
      return true
    }
    const m = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
    if (!m) return false
    await writeFile(imagePath(slot), Buffer.from(m[1]!, 'base64'))
    return true
  } catch (e) {
    console.error(`dsh-background-by-model: failed to write the image for slot "${slot}"`, e)
    return false
  }
}

/** Every image slot currently stored on disk. */
async function listSlots(): Promise<string[]> {
  try {
    const entries = await readdir(dataDir())
    return entries
      .filter(name => name.startsWith(IMAGE_PREFIX))
      .map(name => name.slice(IMAGE_PREFIX.length))
      .filter(slot => SLOT_RE.test(slot))
  } catch {
    return []
  }
}

/**
 * Empty the store: the config and every rule image, and nothing else.
 *
 * The hard reset behind "use the recommended profile", and it has to be a real
 * one rather than a config overwrite. `nextSlot` hands out `m1`, `m2`, … — a
 * running counter, not a random token — so a profile and a store that both have
 * pictures collide on those names as a matter of course. Emptying first is what
 * makes the profile's own slots free to write, and it is why this feature needs
 * no slot remapping: there is nothing left to collide with.
 *
 * `holiday-cache/` is deliberately untouched. It is not the user's
 * configuration: it is downloaded festival art that belongs to no slot, costs a
 * network round trip to get back, and has nothing to do with which profile is
 * selected.
 *
 * Best-effort per entry — one unremovable file must not abort the rest and leave
 * the store half wiped — but the failures are logged rather than swallowed,
 * because the caller is about to write a fresh config over whatever survives.
 */
async function resetStore(): Promise<boolean> {
  let ok = true
  try {
    await rm(configPath(), { force: true })
  } catch (e) {
    ok = false
    console.warn(`dsh-background-by-model: failed to remove "${CONFIG_FILE}"`, e)
  }
  for (const slot of await listSlots()) {
    try {
      await rm(imagePath(slot), { force: true })
    } catch (e) {
      ok = false
      console.warn(`dsh-background-by-model: failed to remove the image for slot "${slot}"`, e)
    }
  }
  return ok
}

/**
 * Download an image from a network URL into one slot (replacing its bytes).
 * Returns { ok, dataUrl?, error? }; never throws.
 */
async function fetchImageUrl(slot: string, url: string | null): Promise<{ ok: boolean; dataUrl?: string | null; error?: string }> {
  // Checked BEFORE the download: a holiday slot cannot accept the bytes, so
  // fetching them first would burn a transfer to throw it away.
  if (holidayAssetFor(slot) !== null) return { ok: false, error: 'read-only slot' }
  if (url === null) {
    const ok = await writeImage(slot, null)
    return { ok, dataUrl: null, error: ok ? undefined : 'remove failed' }
  }
  let parsed: URL
  try { parsed = new URL(url) } catch { return { ok: false, error: 'invalid url' } }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, error: 'unsupported scheme' }
  let res: Response
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), WALLPAPER_FETCH_TIMEOUT)
    try { res = await fetch(url, { redirect: 'follow', signal: ctl.signal }) }
    finally { clearTimeout(timer) }
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'network error' }
  }
  if (!res.ok) return { ok: false, error: `http ${res.status}` }
  const ct = res.headers.get('content-type') ?? ''
  if (ct && !/^image\//.test(ct)) return { ok: false, error: 'not an image' }
  let buf: Buffer
  try {
    const arr = await res.arrayBuffer()
    if (arr.byteLength === 0) return { ok: false, error: 'empty response' }
    if (arr.byteLength > WALLPAPER_FETCH_MAX) return { ok: false, error: 'too large' }
    buf = Buffer.from(arr)
  } catch {
    return { ok: false, error: 'read failed' }
  }
  const dataUrl = `data:${sniffImageMime(buf)};base64,${buf.toString('base64')}`
  const ok = await writeImage(slot, dataUrl)
  return ok ? { ok: true, dataUrl } : { ok: false, error: 'write failed' }
}

/** The host's default model selection — the client's fallback when the
 *  per-session model services are unavailable. */
function defaultModel(ctx: any): { provider: string; model: string } | null {
  try {
    const service = typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : undefined
    const selection = service?.currentSelection?.()
    if (selection && typeof selection.provider === 'string' && typeof selection.model === 'string') {
      return { provider: selection.provider, model: selection.model }
    }
  } catch {
    // Service absent on this host — the client degrades to rule 1.
  }
  return null
}

const NS = 'dshBackgroundByModel'
const RPC_CHANNEL = '/dsh-background-by-model'
const RPC_BODY_MAX = 300 * 1024 * 1024

/** Dispatch one decoded RPC method to the matching persistence routine and
 *  return the wire `result` half of the server-response envelope. */
async function handleRpcMethod(
  ctx: any,
  endpoint: string,
  payload: unknown,
): Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string; details: object } }> {
  const method = endpoint.slice(`${NS}/`.length)
  const rawSlot = (payload as { slot?: unknown } | null)?.slot
  const slot = typeof rawSlot === 'string' && SLOT_RE.test(rawSlot) ? rawSlot : null
  try {
    switch (method) {
      case 'read':
        // `schema` is the persisted shape this half writes, published so a newer
        // browser bundle can refuse to send it a config it would mangle — see
        // SCHEMA_VERSION in ./schema. It is part of the response, not of the
        // config file: the file's shape is the config's own business.
        return { ok: true, value: { config: await readConfig(), slots: await listSlots(), schema: SCHEMA_VERSION } }
      case 'writeConfig':
        return { ok: true, value: await writeConfig((payload as { config?: unknown } | null)?.config ?? {}) }
      case 'readImage':
        if (slot === null) return { ok: true, value: { dataUrl: null } }
        return { ok: true, value: { dataUrl: await readImage(slot) } }
      case 'writeImage':
        if (slot === null) return { ok: true, value: false }
        return { ok: true, value: await writeImage(slot, ((payload as { dataUrl?: unknown } | null)?.dataUrl ?? null) as string | null) }
      case 'deleteImage':
        if (slot === null) return { ok: true, value: false }
        return { ok: true, value: await writeImage(slot, null) }
      case 'fetchImageUrl':
        if (slot === null) return { ok: true, value: { ok: false, error: 'bad slot' } }
        return { ok: true, value: await fetchImageUrl(slot, ((payload as { url?: unknown } | null)?.url ?? null) as string | null) }
      case 'fetchPresetConfig':
        // The failure is a VALUE, not an RPC error: "the CDN is down" is an
        // ordinary answer this feature has to render, and it must not look like
        // the plugin being broken.
        return { ok: true, value: await fetchPresetConfig() }
      case 'fetchPresetImage':
        if (slot === null) return { ok: true, value: { ok: false, error: 'bad slot' } }
        return { ok: true, value: await fetchPresetImage(slot) }
      case 'resetStore':
        return { ok: true, value: await resetStore() }
      case 'defaultModel':
        return { ok: true, value: defaultModel(ctx) }
      default:
        return { ok: false, error: { code: 'dsh-background-by-model/bad-request', message: `unknown endpoint ${endpoint}`, details: { issues: [] } } }
    }
  } catch (e) {
    return { ok: false, error: { code: 'dsh-background-by-model/internal', message: e instanceof Error ? e.message : String(e), details: {} } }
  }
}

export function apply(ctx: any): void {
  // Register the RPC channel inside a connection+webServer-injected scope,
  // exactly as the connection plugin mounts its own `/api` transport. Doing this
  // synchronously in `apply` fails with "cannot get property webServer without
  // inject" on hosts where webServer is not yet resolvable at apply time.
  ctx.inject(['connection', 'webServer'], (webCtx: any) => {
    webCtx.effect(
      () => webCtx.webServer.register({
        kind: 'prefix',
        path: RPC_CHANNEL,
        handler: async (req: any, res: any) => {
          const rejection = webCtx.connection.requestRejection(req)
          if (rejection !== undefined) {
            res.writeHead(rejection)
            res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
            return
          }
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: { code: 'dsh-background-by-model/bad-request', message: 'expected POST', details: {} } }))
            return
          }
          const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
          const endpoint = pathname.startsWith(`${RPC_CHANNEL}/`) ? pathname.slice(RPC_CHANNEL.length + 1) : undefined
          if (endpoint === undefined || endpoint.length === 0) {
            res.writeHead(404)
            res.end()
            return
          }
          const chunks: Buffer[] = []
          let received = 0
          for await (const chunk of req) {
            const buf = chunk as Buffer
            received += buf.byteLength
            if (received > RPC_BODY_MAX) {
              res.writeHead(413, { connection: 'close' })
              res.end()
              req.destroy()
              return
            }
            chunks.push(buf)
          }
          let env: { type?: unknown; rpcId?: unknown; method?: unknown; payload?: unknown }
          try {
            env = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: { code: 'dsh-background-by-model/bad-request', message: 'body is not JSON', details: {} } }))
            return
          }
          if (env === null || typeof env !== 'object' || env.type !== 'client-request' || typeof env.rpcId !== 'string' || typeof env.method !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: { code: 'dsh-background-by-model/bad-request', message: 'invalid client-request envelope', details: {} } }))
            return
          }
          if (env.method !== endpoint) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ type: 'server-response', rpcId: env.rpcId, result: { ok: false, error: { code: 'dsh-background-by-model/bad-request', message: `method ${env.method} does not match endpoint ${endpoint}`, details: { issues: [] } } } }))
            return
          }
          const result = await handleRpcMethod(ctx, endpoint, env.payload)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ type: 'server-response', rpcId: env.rpcId, result }))
        },
      }),
      'dsh-background-by-model: rpc channel',
    )
  })
}
