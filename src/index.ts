/**
 * Node half of dsh-background-by-model: file-backed rule persistence.
 *
 * Owns the `~/.dsh/.dsh-background-by-model-data/` store and exposes the RPC
 * surface on the plugin's own `/dsh-background-by-model` channel (never the shared
 * `/api`, which slash commands own).
 *
 *   theme-config.json     the ordered rule list + the global interface settings
 *   theme-config.json.bak the last config that parsed, rotated in before every save
 *   modelbg-<slot>        one background image (raw bytes, no extension; the MIME is
 *                         sniffed from the magic bytes when served)
 *   holiday-cache/<tag>/  festival art downloaded from the CDN, one directory per
 *                         pinned release, deliberately NOT in the slot namespace
 *
 * Images travel as data URLs over the RPC channel; there is no separate HTTP image
 * route. A legacy single-wallpaper / video-background store is migrated to rule 1
 * on first read.
 */
import { access, mkdir, readFile, writeFile, rm, rename, readdir, stat } from 'node:fs/promises'
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
// Which stored image files nothing points at any more — the decision lives in
// ./store, which both halves import and neither side's runtime can reach into.
import { orphanSlots, referencedSlots } from './store'

export const name = 'dsh-background-by-model'
export const inject = ['connection', 'webServer']

const DATA_DIR = '.dsh-background-by-model-data'
const CONFIG_FILE = 'theme-config.json'
/**
 * The last config that was known to parse, kept beside the live one.
 *
 * A config file is the whole rule list, and it is rewritten on every edit. Writing
 * it in place meant a crash, a full disk or a pulled power cable could leave half a
 * JSON document behind — which `readConfig` greets by silently falling back to the
 * defaults, so the next slider drag would persist those defaults over the ruined
 * file and the original rules were gone for good. Two pieces fix that, and they are
 * one feature: the write is atomic (temp + rename), and the previous good file is
 * rotated to `.bak` before it is replaced, so even a lost file has a copy.
 */
const CONFIG_BACKUP = 'theme-config.json.bak'
/** Suffix of the in-flight write. Deliberately outside `listSlots`' `modelbg-` prefix. */
const CONFIG_TEMP = '.tmp'
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
 * The art is fetched from the `assets` repository the first time a holiday needs it
 * (see `readHolidayAsset`), never shipped in the package.
 *
 * The reference is a **release tag**, never a branch: runtime art has to be
 * immutable, and a branch reference would let a reshuffle of the documentation
 * screenshots silently kill a shipped feature. One tag also means one version of
 * everything the plugin fetches (art, profile, README screenshots). A MOVED tag
 * does not reach jsDelivr's edge on its own, so new art means a new tag, never a
 * force-push of the old one.
 */
const HOLIDAY_ASSETS_REPO = 'HarmlessFunny/assets'
const HOLIDAY_ASSETS_REF = 'v0.1.0'
const HOLIDAY_ASSETS_DIR = 'dsh-background-by-model/holiday'
/**
 * Mirrors, tried in order: jsDelivr is reachable where `raw.githubusercontent.com`
 * is not, and raw is the fallback for a CDN that is blocked or down. Both serve the
 * same version, so a fallback cannot mix revisions.
 */
const HOLIDAY_ASSET_HOSTS: readonly string[] = [
  `https://cdn.jsdelivr.net/gh/${HOLIDAY_ASSETS_REPO}@${HOLIDAY_ASSETS_REF}/${HOLIDAY_ASSETS_DIR}`,
  `https://raw.githubusercontent.com/${HOLIDAY_ASSETS_REPO}/${HOLIDAY_ASSETS_REF}/${HOLIDAY_ASSETS_DIR}`,
]
/**
 * Sub-directory of the store holding downloaded festival art: one directory per
 * release of the asset repository, one file per asset inside it.
 *
 * NOT part of the slot namespace, and must never become part of it: files are named
 * after the ASSET and their parent after the pinned release, never after a slot, so
 * nothing here can be mistaken for a user's `modelbg-<slot>`. That is what lets a
 * holiday slot stay read-only while the art itself is downloaded.
 *
 * The version segment is load-bearing: a cache keyed by asset name alone would
 * answer a NEW generation with the OLD bytes and say nothing about it. With the tag
 * in the path, a build that pins a new tag looks in a directory nobody has written
 * to yet, so the first holiday after an update is a miss. Superseded generations
 * are swept by `pruneHolidayCache`.
 */
const HOLIDAY_CACHE_DIR = 'holiday-cache'
/** Cap and timeout for one asset download; these files are 228 KB and 500 KB. */
const HOLIDAY_FETCH_MAX = 8 * 1024 * 1024
const HOLIDAY_FETCH_TIMEOUT = 10_000

/**
 * The recommended profile, served from the same assets repository as the festival
 * art — as a DIRECTORY in the store's own shape: a readable `theme-config.json`
 * plus one raw file per slot. Publishing it is a `cp` out of the data directory,
 * not an export step.
 *
 * Nothing lists the images: the request set is DERIVED from the config's own
 * `rules[].images[].slot`, so adding a wallpaper is a rule entry and a file.
 *
 * Referenced by the same release tag as the art (one tag = one version of
 * everything the plugin fetches). The re-pointed-tag case is why `presetKey`
 * exists: an edge that has not been purged can still answer with the previous
 * bytes of the same URL, and a resumed download must not glue two revisions
 * together (see `fetchPresetConfig`). A profile written for a config shape this
 * build cannot read is refused by the `preset.json` gate.
 */
const PRESET_ASSETS_REPO = 'HarmlessFunny/assets'
const PRESET_ASSETS_REF = 'v0.1.0'
const PRESET_ASSET_DIR = 'dsh-background-by-model/preset'
/** The shape gate: `{"version": 9}` — see SCHEMA_VERSION in ./schema. */
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
 * Caps for the profile, now per file rather than for one document: a profile is a
 * SET of transfers, and each has a different way of going wrong.
 *
 * The count is the one that matters — the request set is derived from the config,
 * so a hostile config could name a thousand slots and turn one button press into a
 * thousand downloads. `SLOT_RE` bounds each name, `PRESET_IMAGE_COUNT_MAX` bounds
 * how many there are, and the running TOTAL is bounded on the client, which is the
 * only side that sees more than one file.
 *
 * The timeout is set by measurement: a 350 KB wallpaper takes a second or two over
 * jsDelivr, and the fallback mirror is the slower one, so a tight budget would fail
 * exactly in the situation it exists for.
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
const configBackupPath = (): string => dshHomePath(DATA_DIR, CONFIG_BACKUP)
const configTempPath = (): string => dshHomePath(DATA_DIR, `${CONFIG_FILE}${CONFIG_TEMP}`)
const legacyWallpaperPath = (): string => dshHomePath(DATA_DIR, LEGACY_WALLPAPER)
const imagePath = (slot: string): string => dshHomePath(DATA_DIR, `${IMAGE_PREFIX}${slot}`)
const holidayCachePath = (asset: string): string =>
  dshHomePath(DATA_DIR, HOLIDAY_CACHE_DIR, HOLIDAY_ASSETS_REF, asset)

const exists = async (p: string): Promise<boolean> => { try { await access(p); return true } catch { return false } }

/**
 * One-shot migration of the pre-0.3 store. Idempotent: the rewritten config carries
 * `rules`, so the next read short-circuits.
 *
 * Anything without a `rules` array is an old config: its single wallpaper becomes
 * rule 1 (`m1`, empty match = pure fallback) carrying the old colour, layout mode,
 * opacity, blur and framing, and the remaining legacy files (background video,
 * upload temp) are removed.
 *
 * A store with NO config file at all is NOT migrated: it is handed through as `{}`.
 * Filling it in as `rules: []` would be the same thing the sanitizer reads as "the
 * user deleted every rule", while a fresh install is the opposite of that —
 * `normalizeConfig` turns a config that names no rule list into one blank rule.
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
      // Written in the new shape directly, so the file describes what the plugin
      // holds. The old rule-level mode and paint effects become this image's own
      // (`normalizeRule` performs the same lift for every other rule) — the shape
      // below is what that lift would produce, spelled out once.
      images: [{
        slot: 'm1',
        bgMode: typeof r.bgMode === 'string' ? r.bgMode : 'fit',
        bgState: (r.bgState ?? {}) as Partial<BgState>,
        color: Array.isArray(r.color) ? r.color : null,
        opacity: typeof r.wallpaperOpacity === 'number' ? r.wallpaperOpacity : 1,
        // The pre-0.3 store had no brightness control at all, so the only honest
        // value to give the migrated picture is the one it has always been shown
        // at: untouched — which is the ABSENT key, not a written 100.
        ...(typeof r.brightness === 'number' ? { brightness: r.brightness } : {}),
        blur: typeof r.blur === 'number' ? r.blur : 0,
      }],
      match: '',
      enabled: true,
      color: Array.isArray(r.color) ? r.color : null,
    }],
    opacities: r.opacities,
    settingsOpacity: r.settingsOpacity,
    chatTextOpacity: r.chatTextOpacity,
    trajectoryOpacity: r.trajectoryOpacity,
    rightbarOpacity: r.rightbarOpacity,
  }
  try {
    // Through the same atomic write every other save uses: this one REPLACES a
    // config the user still has, so a crash mid-migration would otherwise leave
    // nothing to read back — and the pre-migration file is worth keeping as the
    // backup, which is exactly what that path does.
    await writeConfigFile(serializeConfig(next))
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

/** The exact bytes a config file should hold. */
function serializeConfig(config: unknown): string {
  return JSON.stringify(config, null, 2)
}

/**
 * Whether a string is a config this build would accept: JSON, and an object.
 *
 * Deliberately looser than `normalizeConfig` (which accepts anything and defaults
 * every field): this is the test for "is there something worth keeping", so a
 * schema-3 file and a hand-edited one both count. What it rejects is the two ways a
 * write can be interrupted — half a document, and an empty one.
 */
function parsesAsConfig(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  } catch {
    return false
  }
}

/**
 * Write one config file so that no reader can ever see a partial document, keeping
 * the previous good one as `.bak`.
 *
 * Two steps, in this order, because the order is what makes the copy worth having:
 *
 *   1. the file on disk NOW is copied to `theme-config.json.bak` — but only when it
 *      parses. A corrupted live file must never overwrite the last good backup, or
 *      the first write after the corruption would also destroy the copy that could
 *      have replaced it;
 *   2. the new bytes go to a temp name and are RENAMED over the live path. A rename
 *      is atomic within one directory, so a crash either leaves the old file or the
 *      new one — never half of either.
 *
 * The rename is not `writeFile` for the same reason: writing in place truncates
 * first, and a crash between the truncation and the last byte is exactly the state
 * that used to eat a rule list.
 */
async function writeConfigFile(text: string): Promise<void> {
  await ensureDir()
  const target = configPath()
  try {
    const current = await readFile(target, 'utf8')
    if (parsesAsConfig(current)) {
      const backupTemp = `${configBackupPath()}${CONFIG_TEMP}`
      await writeFile(backupTemp, current, 'utf8')
      await renameOver(backupTemp, configBackupPath())
    }
  } catch {
    // No live file (first write), or an unreadable one — either way there is
    // nothing worth keeping, and the new bytes are about to become the live one.
  }
  const temp = configTempPath()
  await writeFile(temp, text, 'utf8')
  await renameOver(temp, target)
}

/**
 * `rename` over an existing file, which replaces it atomically on POSIX.
 *
 * Windows refuses to rename onto a name that exists (EEXIST / EPERM), so the one
 * platform that cannot do this in one step gets a two-step fallback — and the
 * difference matters: unlinking first leaves a window with NO file, which is the
 * state this whole function exists to avoid, so on POSIX the unlink must never be
 * attempted. The fallback is only reached when the rename itself said the target is
 * in the way, which is exactly the Windows case.
 */
async function renameOver(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code
    if (code !== 'EEXIST' && code !== 'EPERM' && code !== 'ENOTEMPTY') throw e
    await rm(to, { force: true })
    await rename(from, to)
  }
}

/**
 * The last good config that can be restored, as raw text — or null when there is
 * none.
 *
 * Two candidates, in order of authority: the live file (when it parses, which is
 * the ordinary case and costs one read) and the `.bak`. The backup is only
 * consulted for a live file that is missing or corrupt, so a half-written document
 * from an interrupted save is answered with the copy rather than with the shipped
 * defaults — which is the difference between "your rules are back" and "your rules
 * were never there".
 */
async function readConfigFile(): Promise<{ text: string; source: 'live' | 'backup' } | null> {
  try {
    const text = await readFile(configPath(), 'utf8')
    if (parsesAsConfig(text)) return { text, source: 'live' }
  } catch {
    // No live file: a fresh install, or the file was removed by `resetStore`.
  }
  try {
    const text = await readFile(configBackupPath(), 'utf8')
    if (!parsesAsConfig(text)) return null
    // Put the recovered copy back where the next read expects it, so one recovery
    // is enough and `writeConfigFile` can rotate from a real live file again.
    try {
      await writeConfigFile(text)
    } catch (e) {
      console.warn('dsh-background-by-model: could not restore the config from its backup', e)
    }
    console.warn(
      'dsh-background-by-model: "theme-config.json" was missing or unreadable; restored the last saved copy from "theme-config.json.bak"',
    )
    return { text, source: 'backup' }
  } catch {
    return null
  }
}

async function readConfig(): Promise<ThemeConfig> {
  await ensureDir()
  const file = await readConfigFile()
  let raw: unknown = {}
  if (file !== null) {
    try {
      raw = JSON.parse(file.text)
    } catch {
      // `readConfigFile` already tested this, so the only way here is a file that
      // changed between the two reads — answer with the defaults, as before.
      raw = {}
    }
  }
  return normalizeConfig(await migrateLegacy(raw))
}

/**
 * The config, plus whether it is safe to decide what the store still owns from it.
 *
 * `readConfig` deliberately swallows a corrupt file and answers with the last good
 * copy (or, when there is none, with defaults) — right for painting and WRONG as a
 * basis for deleting images, because a store whose config could not be read at all
 * would then have zero referenced slots and every file on disk would look like an
 * orphan. That is the one way this feature could destroy a wallpaper collection, so
 * the two cases are told apart here and the sweep refuses rather than guesses:
 *
 *   - a live file that parses to an object → trusted (its rules are what they say);
 *   - no live file, and no backup either → trusted. A fresh store has images only
 *     if something wrote them, and nothing did;
 *   - a live file that is there but does not parse, or is not an object → the
 *     BACKUP is the answer, and only because it is exactly the config `readConfig`
 *     would restore: pruning against it is pruning against the rules the user is
 *     about to get back. When there is no parseable backup, this is `untrusted` and
 *     the sweep refuses.
 *
 * The untrusted branch deliberately does NOT go through `migrateLegacy`: that one
 * WRITES a repaired config back to disk for the shapes earlier releases left
 * behind, and running it here would turn "refuse to delete" into "quietly rewrite
 * whatever the user's broken file said, then delete against the rewrite". The
 * display answer for an unreadable file is the sanitizer's defaults, computed
 * without touching the disk.
 */
async function readConfigForSweep(): Promise<{ config: ThemeConfig; trusted: boolean }> {
  await ensureDir()
  let live: string | null = null
  try {
    live = await readFile(configPath(), 'utf8')
  } catch {
    live = null
  }
  if (live !== null && parsesAsConfig(live)) {
    return { config: normalizeConfig(await migrateLegacy(JSON.parse(live))), trusted: true }
  }
  let backup: string | null = null
  try {
    backup = await readFile(configBackupPath(), 'utf8')
  } catch {
    backup = null
  }
  if (backup !== null && parsesAsConfig(backup)) {
    return { config: normalizeConfig(JSON.parse(backup)), trusted: true }
  }
  // No live file and no backup: nothing has ever been configured here.
  if (live === null && backup === null) return { config: normalizeConfig({}), trusted: true }
  return { config: normalizeConfig({}), trusted: false }
}

// ── Two-half drift guard ───────────────────────────────────────────────────
// The shape lives in ./schema, so this only fires when one half adds a field the
// shared shape does not declare yet (a half-built edit, a stale bundle, a hand-edited
// JSON) — which the sanitizer would otherwise drop in silence. One warning per key,
// so the drift shows up in the host log.
const LEGACY_CONFIG_KEYS = new Set(['color', 'bgMode', 'wallpaperOpacity', 'blur', 'bgState', 'blurs'])
// Fields `normalizeRule` / `legacyFadeMs` LIFT on purpose: a migration, not drift.
// The three paint effects joined this list when they moved onto the image (schema
// 10) — a schema-9 config carries them at the rule level, and `normalizeRule` hands
// each one to every entry rather than dropping it.
const LEGACY_RULE_KEYS = new Set(['slot', 'bgState', 'bgMode', 'wallpaperOpacity', 'brightness', 'blur'])
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
    // Fields an older shape carried on purpose: the pre-0.3 ones `migrateLegacy`
    // turns into rule 1, and `blurs`, which the sanitizer drops.
    if (!known.has(key) && !LEGACY_CONFIG_KEYS.has(key)) warned(key)
  }
  const groups: Array<[string, object]> = [['opacities', normalized.opacities]]
  for (const [group, have] of groups) {
    const got = r[group]
    if (got === null || typeof got !== 'object') continue
    const keys = new Set(Object.keys(have))
    for (const key of Object.keys(got as Record<string, unknown>)) {
      if (!keys.has(key)) warned(`${group}.${key}`)
    }
  }
  // Fixed-shape nested objects: every key of `transition` is declared, so an unknown
  // one is drift — and the sanitizer rebuilds the object, dropping it in silence.
  // `holidays` is absent: its items are rebuilt from `HOLIDAYS` anyway.
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
  try {
    const normalized = normalizeConfig(config)
    warnUnknownConfigKeys(config, normalized)
    await writeConfigFile(serializeConfig(normalized))
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
 * neither a status code nor a `content-type` header survives contact with a
 * misconfigured mirror, so the payload's own magic bytes are the only claim that
 * cannot lie.
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
 * Sniff an image's MIME (defaults to JPEG). The default is deliberate for the bytes
 * a USER uploaded: an unrecognised format is better served as a JPEG and left to
 * the browser, which can sniff what this list does not know.
 */
function sniffImageMime(buf: Buffer): string {
  return imageMimeOrNull(buf) ?? 'image/jpeg'
}

/**
 * Read one slot as a data URL, or null when it has nothing to serve.
 *
 * Two sources behind one answer: a holiday slot resolves to the festival art
 * (downloaded on demand, never shipped — see `readHolidayAsset`), everything else is
 * the user's own bytes on disk.
 *
 * `null` is legitimate for a holiday — offline, a blocked CDN, a cold cache — and
 * the caller is built for it: `pickHoliday` treats "no bytes" as "this holiday does
 * not take over". A festival that cannot be downloaded must never blank the screen.
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
 * The cached copy is VALIDATED rather than trusted: a process killed mid-write would
 * otherwise leave a truncated file that every later read serves, breaking the holiday
 * forever. A cache entry that is not an image is treated as a miss.
 *
 * The in-flight map exists because the boot hydrate and the midnight rollover can
 * ask for the same slot at the same moment (a machine waking from sleep).
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
 * Never throws: a festival that cannot be fetched simply does not paint today, and a
 * profile file that cannot be fetched is a sentence on the button. It answers with
 * the reason instead, because the two callers treat it differently — the profile
 * asks `presetRetryable` (./preset), the art waits for the next apply.
 *
 * The `content-length` check is a courtesy; the post-read size check is the one that
 * holds. It says nothing about WHAT the bytes are: magic bytes vs JSON is the
 * caller's check, because only the caller knows what it asked for.
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
 * The status codes worth another round: 5xx is a mirror having a bad moment, 429 one
 * asking to be left alone, 408 one giving up on us. Every other non-2xx means the
 * file is not there (jsDelivr answers 403 outside the repository, 404 for a missing
 * file), and that answer must arrive fast and unchanged.
 */
function fetchFailureForStatus(status: number): FetchFailure {
  return status >= 500 || status === 429 || status === 408 ? 'server' : 'missing'
}

/**
 * One festival picture, or null when no mirror served an image.
 *
 * One round, unlike the profile's (`fetchPresetFile`): this is fetched during boot,
 * before the first wallpaper is painted, and a retry round would delay that paint.
 * The art is cached once it arrives and every later read tries again.
 */
async function fetchHolidayAsset(url: string): Promise<Buffer | null> {
  const got = await fetchAsset(url, HOLIDAY_FETCH_MAX, HOLIDAY_FETCH_TIMEOUT)
  return !got.ok || imageMimeOrNull(got.buf) === null ? null : got.buf
}

/**
 * One file out of the profile directory, or null when no mirror served it.
 *
 * Every mirror is asked in every round, so a round is "all the hosts there are" and
 * the rounds are the retry (a mirror that answers 502 once and correctly the next
 * time, on the sixth of seven files). A round whose failures were all terminal — the
 * file is gone, or too big — ends the attempts outright, so a renamed file costs two
 * requests and a sentence naming the slot (`presetRetryable`, ./preset).
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
 * Two files in order: the manifest says what SHAPE the config is written for, and a
 * config this build cannot read is refused here — before anything is downloaded in
 * earnest, long before anything is deleted. The config then says what the profile IS.
 *
 * The sanitizer runs on this side on purpose: the download list is DERIVED from
 * `rules[].images[].slot`, so an unsanitized config would let a remote file choose
 * what this process requests. After `normalizeConfig` every slot has passed `SLOT_RE`
 * (`normalizeImage`). Holiday slots are then DROPPED rather than refused: they are
 * named legally in `holidays.items`, have no file at all, and `writeImage` refuses
 * them anyway, so a rule pointing at one is already inert on the client.
 *
 * Nothing is cached to disk, unlike the festival art: that cache exists because the
 * art is fetched on a schedule and must work offline afterwards, while this is a
 * button whose whole point is to fetch what is there NOW.
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
  // ONE direction is a refusal. A profile written for a NEWER shape cannot be read
  // at all, so it is refused before a single wallpaper is fetched.
  //
  // A profile written for an OLDER shape is ACCEPTED, and that is the documented
  // contract (`SCHEMA_VERSION` in ./schema): the shared sanitizer lifts what it can
  // and defaults what the file predates. Refusing it — which an earlier 0.9.0 build
  // did — makes the button unusable for as long as the asset host lags this build,
  // which is the normal state between a plugin release and an assets tag.
  if (declared > SCHEMA_VERSION) {
    console.warn(`dsh-background-by-model: the recommended profile declares schema ${declared}, this build writes ${SCHEMA_VERSION}`)
    return { ok: false, error: 'newer version' }
  }
  if (declared < SCHEMA_VERSION) {
    console.warn(`dsh-background-by-model: the recommended profile is written for schema ${declared}; importing it with defaults for the fields it predates`)
  }

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
 * Temp name + rename, so no reader ever sees a partial file. A failure is logged
 * and otherwise ignored: the bytes are in hand and the caller is waiting; losing
 * the cache only costs a re-download.
 */
async function writeHolidayCache(asset: string, buf: Buffer): Promise<void> {
  try {
    await ensureDir()
    await mkdir(dshHomePath(DATA_DIR, HOLIDAY_CACHE_DIR, HOLIDAY_ASSETS_REF), { recursive: true })
    const target = holidayCachePath(asset)
    const temp = `${target}.tmp`
    await writeFile(temp, buf)
    await rename(temp, target)
    await pruneHolidayCache()
  } catch (e) {
    console.warn(`dsh-background-by-model: could not cache the "${asset}" holiday art`, e)
  }
}

/**
 * Drop every generation of the cache except the one this build reads.
 *
 * Called AFTER a successful download, never before it: a pinned release that turns
 * out to be unreachable must not cost the user the art they already had.
 *
 * It walks the cache ROOT and compares GENERATION names, never asset names, so the
 * generation in use cannot be touched. That also makes an upgrade clean up after
 * itself (0.7.9's flat `holiday-cache/<asset>` files are removed here).
 */
async function pruneHolidayCache(): Promise<void> {
  try {
    const root = dshHomePath(DATA_DIR, HOLIDAY_CACHE_DIR)
    for (const entry of await readdir(root)) {
      if (entry === HOLIDAY_ASSETS_REF) continue
      await rm(dshHomePath(DATA_DIR, HOLIDAY_CACHE_DIR, entry), { recursive: true, force: true })
    }
  } catch (e) {
    console.warn('dsh-background-by-model: could not prune the older holiday art', e)
  }
}

/**
 * The wallpaper a holiday slot resolves to, or null when the slot is not a
 * holiday's.
 *
 * This mapping is the ONLY thing that makes a holiday slot read-only, so `readImage`
 * and `writeImage` both go through it instead of testing the holiday list each.
 */
function holidayAssetFor(slot: string): string | null {
  return HOLIDAYS.find(h => h.slot === slot)?.asset ?? null
}

/** Persist one rule image (null removes it); false keeps the previous file. */
async function writeImage(slot: string, dataUrl: string | null): Promise<boolean> {
  // A holiday slot is not the user's. The one funnel every write, delete and URL
  // fetch goes through, so the read-only invariant cannot be bypassed one entry
  // point at a time. (The download caches under `holiday-cache/<tag>/`, never here.)
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
 * Empty the store: the config, its backup and every rule image, and nothing else.
 *
 * The hard reset behind "use the recommended profile", and it has to be a real one
 * rather than a config overwrite: `nextSlot` hands out `m1`, `m2`, … as a running
 * counter, so a profile and a store that both have pictures collide on those names
 * as a matter of course. Emptying first is what makes the profile's own slots free
 * to write, which is why no slot remapping is needed.
 *
 * The backup goes WITH the live file: a `.bak` left behind would be restored by the
 * next read, which would quietly undo the very replacement this call exists to
 * perform (`applyThemeFile`'s `wipeFirst`).
 *
 * `holiday-cache/` is deliberately untouched: downloaded art that belongs to no
 * slot and costs a round trip to get back. Pruning generations is
 * `pruneHolidayCache`'s job.
 *
 * Best-effort per entry (one unremovable file must not leave the store half wiped),
 * but failures are logged, because a fresh config is about to be written over
 * whatever survives.
 */
async function resetStore(): Promise<boolean> {
  let ok = true
  for (const path of [configPath(), configBackupPath()]) {
    try {
      await rm(path, { force: true })
    } catch (e) {
      ok = false
      console.warn(`dsh-background-by-model: failed to remove "${CONFIG_FILE}"`, e)
    }
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
 * What the image store occupies, and which of it nothing points at any more.
 *
 * Read-only: it reports, it never deletes. Splitting the two is what lets the panel
 * show a number before asking, and it is also the only honest way to answer "how
 * much would this free" — a cleanup whose size is announced AFTER the fact is a
 * cleanup nobody agrees to.
 *
 * `keep` is the browser half's own slot list. It is unioned with the config ON DISK
 * rather than replacing it because the two are not written at the same moment: an
 * upload writes the bytes first and the config that names them a moment later, so a
 * read landing in between would see a file the store is about to legitimately own.
 * The union can only ever make the report SMALLER (a slot is spared), which is the
 * safe direction for something whose answer is "delete these files".
 *
 * A file that cannot be stat'd is still listed, at 0 bytes: it exists as far as
 * `readdir` is concerned, and hiding it would leave a residue the panel claims is
 * not there.
 *
 * `trusted` is false when the config file on disk is there but unreadable (see
 * `readConfigForSweep`). The numbers are then still reported — the user asked what
 * the store occupies, and that question has an answer — but the caller must not
 * delete: with no trustworthy rule list, EVERY file would look like an orphan.
 */
async function storeUsage(keep: readonly string[]): Promise<{
  totalBytes: number
  usedBytes: number
  orphanBytes: number
  files: number
  slots: string[]
  orphans: Array<{ slot: string; bytes: number }>
  trusted: boolean
}> {
  const stored = await listSlots()
  const { config, trusted } = await readConfigForSweep()
  const referenced = referencedSlots(config.rules)
  // A `modelbg-h-*` file is an artifact no config can own — the holiday art is
  // downloaded into `holiday-cache/`, and the slot is read-only — so it is never
  // spared by `referencedSlots`. That is deliberate: this is the only way such a
  // file is ever cleared.
  const orphans = orphanSlots(stored, referenced, keep)
  const sizes = new Map<string, number>()
  let totalBytes = 0
  for (const slot of stored) {
    let bytes = 0
    try { bytes = (await stat(imagePath(slot))).size } catch { /* listed, unmeasurable */ }
    sizes.set(slot, bytes)
    totalBytes += bytes
  }
  let orphanBytes = 0
  for (const slot of orphans) orphanBytes += sizes.get(slot) ?? 0
  return {
    totalBytes,
    usedBytes: totalBytes - orphanBytes,
    orphanBytes,
    files: stored.length,
    slots: stored,
    orphans: orphans.map(slot => ({ slot, bytes: sizes.get(slot) ?? 0 })),
    trusted,
  }
}

/**
 * Delete every stored image nothing points at, and report what was removed.
 *
 * `keep` is the caller's live slot list, with the same meaning and the same
 * union-with-disk rule as `storeUsage`. The answer carries the freed byte count so
 * the panel can say what happened, and `failed` names the slots that resisted —
 * a cleanup that removed six of seven files and said "done" would leave the user
 * with a number that never goes down and no way to learn why.
 *
 * Failures are per file and never abort the sweep: one locked file must not protect
 * the other six. Nothing else in the store is touched — the config, the festival art
 * and the released generations under `holiday-cache/` are all outside this walk.
 *
 * REFUSES on an unreadable config (`trusted: false`): every file would look
 * unreferenced, and this is the one operation in the plugin that could delete a
 * whole wallpaper collection in a single press. A refusal costs a number on a card;
 * guessing costs the user their pictures.
 */
async function pruneOrphans(keep: readonly string[]): Promise<{ removed: string[]; failed: string[]; freedBytes: number; refused: boolean }> {
  const usage = await storeUsage(keep)
  if (!usage.trusted) {
    console.warn('dsh-background-by-model: refusing to prune — "theme-config.json" is unreadable, so nothing on disk can be told apart from an orphan')
    return { removed: [], failed: [], freedBytes: 0, refused: true }
  }
  const removed: string[] = []
  const failed: string[] = []
  let freedBytes = 0
  for (const entry of usage.orphans) {
    try {
      await rm(imagePath(entry.slot), { force: true })
      removed.push(entry.slot)
      freedBytes += entry.bytes
    } catch (e) {
      failed.push(entry.slot)
      console.warn(`dsh-background-by-model: failed to remove the orphaned image for slot "${entry.slot}"`, e)
    }
  }
  return { removed, failed, freedBytes, refused: false }
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

export const RPC_CHANNEL = '/dsh-background-by-model'
/** One request's ceiling. The host's own bridge uses the same number. */
const RPC_BODY_MAX = 300 * 1024 * 1024
/** The namespace half of every endpoint on it: `dshBackgroundByModel/read`. */
const RPC_NS = 'dshBackgroundByModel'
/** What one method answers: a value, or an error the interface can render. */
type RpcReply = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string; details: object } }

/**
 * One RPC method, as `ConnectionRpcHandler` delivers it: `(endpoint, payload,
 * signal, peer)`, with the endpoint spelled `dshBackgroundByModel/<method>`.
 * Envelope parsing, the body cap, the 401/403 fence and the method-match check
 * belong to the connection service (see `apply`).
 */
export async function handleRpcMethod(ctx: any, endpoint: unknown, payload: unknown): Promise<RpcReply> {
  // Narrowed here, once: the registry's typings hand the endpoint over as
  // `unknown`, and every branch below needs a real name.
  if (typeof endpoint !== 'string') {
    return { ok: false, error: { code: 'dsh-background-by-model/bad-request', message: 'missing endpoint', details: {} } }
  }
  const method = endpoint.startsWith(`${RPC_NS}/`) ? endpoint.slice(RPC_NS.length + 1) : ''
  const rawSlot = (payload as { slot?: unknown } | null)?.slot
  const slot = typeof rawSlot === 'string' && SLOT_RE.test(rawSlot) ? rawSlot : null
  // The browser half's live slots, for the two store methods: anything it names is
  // not an orphan even when the config on disk does not name it yet. Only real slot
  // names get through, so a malformed payload cannot widen the spared set.
  const rawKeep = (payload as { keep?: unknown } | null)?.keep
  const keep = Array.isArray(rawKeep)
    ? rawKeep.filter((s): s is string => typeof s === 'string' && SLOT_RE.test(s))
    : []
  try {
    switch (method) {
      case 'read':
        // `schema` is the shape this half writes, published so a newer browser
        // bundle can refuse to send a config this one would mangle (SCHEMA_VERSION).
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
        // ordinary answer the button renders, not a broken plugin.
        return { ok: true, value: await fetchPresetConfig() }
      case 'fetchPresetImage':
        if (slot === null) return { ok: true, value: { ok: false, error: 'bad slot' } }
        return { ok: true, value: await fetchPresetImage(slot) }
      case 'resetStore':
        return { ok: true, value: await resetStore() }
      // The two store-reporting methods. `storeUsage` is read-only and answers the
      // panel's card; `pruneOrphans` is the only one that deletes, and only what
      // that same report called an orphan.
      case 'storeUsage':
        return { ok: true, value: await storeUsage(keep) }
      case 'pruneOrphans':
        return { ok: true, value: await pruneOrphans(keep) }
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
  // A PREFIX ROUTE ON `webServer`, not `connection.rpc.handle`, and this is not a
  // preference: `rpc.handle` captures the CONNECTION SERVICE's own context and
  // registers through it (`register()` does `owner.webServer.register(...)`), while
  // that service declares no `webServer` dependency — so the call throws
  // "cannot get property webServer without inject" and the entry never activates.
  // Registering here keeps the same Host/Origin fence: `requestRejection` is the
  // connection service's own admission check, asked explicitly per request.
  //
  // Wrapped in `ctx.inject` so this does not run before `webServer` exists; that is
  // the shape the connection plugin itself uses to mount `/api`.
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
