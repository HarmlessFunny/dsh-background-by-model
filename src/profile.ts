/**
 * The recommended profile: the author's own rule list, and the pictures it paints.
 *
 * SHIPPED IN THE PACKAGE, not fetched from a repository. It used to be a directory
 * of files on an asset host — a manifest, a config and one wallpaper per slot —
 * which meant the button needed GitHub (through a CDN) to work at all, and that the
 * config it installed was a REMOTE DOCUMENT this build had to trust, gate by schema
 * version, and bound in size. The rules and their numbers are a design decision that
 * travels with the code that reads them, so they live here, beside the sanitizer
 * that defines the shape.
 *
 * What is still downloaded is the pictures, from Bilibili's image CDN. Only the
 * pixels are remote, and the mapping from slot to URL is this module's — so the
 * request set is a constant, not something a remote file can choose.
 *
 * Nothing here may touch the DOM, Node or Cordis: both halves import it, and
 * `scripts/preset-check.ts` reads it on plain node.
 */
import {
  DEFAULT_AGENT_ACCESS,
  DEFAULT_AUTO_EXTRACT,
  DEFAULT_CHAT_TEXT_OPACITY,
  DEFAULT_PAGE_OPACITY,
  DEFAULT_PART_OPACITIES,
  DEFAULT_REV,
  DEFAULT_RIGHTBAR_OPACITY,
  DEFAULT_SETTINGS_OPACITY,
  DEFAULT_TRAJECTORY_OPACITY,
  SCHEMA_VERSION,
  defaultImage,
  defaultHolidayRules,
  defaultRotation,
  defaultTransition,
} from './schema.ts'
import type { BgRule, ThemeConfig } from './schema.ts'

/**
 * Where the pictures are hosted.
 *
 * Three hosts, tried in order, and they are not mirrors of each other by
 * configuration — `i0`/`i1`/`i2.hdslb.com` are separate BFS edges that answer the
 * same path with the same bytes (verified by sha1), which is the same arrangement
 * the festival art already relies on.
 */
export const PROFILE_HOSTS: readonly string[] = [
  'https://i0.hdslb.com',
  'https://i1.hdslb.com',
  'https://i2.hdslb.com',
]

/**
 * The BFS transform that turns the uploaded PNG into the file this plugin stores.
 *
 * Load-bearing, and the reason it is spelled out once here:
 *
 *   - the UPLOADED files are 2.4–12 MB PNGs (76 MB for the set). `PRESET_IMAGE_MAX`
 *     is 8 MB and the store keeps full fidelity, so serving them as uploaded would
 *     both refuse the largest ones and put a 76 MB wallpaper collection on disk;
 *   - `@3840w.webp` answers 250–365 KB at 3840×2160, which is what the previous
 *     asset host served and what an existing store already holds — the sha1 of the
 *     bytes is identical, so this is the same picture, not a re-encode;
 *   - the suffix is plain arithmetic rather than a CDN feature that may move: the
 *     path before it is `bfs/new_dyn/<sha1 of the upload>`, i.e. CONTENT-ADDRESSED,
 *     so a URL here can never be re-pointed at different bytes the way a git tag
 *     can.
 */
const BFS_SUFFIX = '@3840w.webp'

/**
 * Slot → BFS path, for the seven wallpapers the profile is made of.
 *
 * The slots are `m1`..`m7` rather than names, because a slot is a FILENAME
 * (`modelbg-<slot>`) and `nextSlot` hands out exactly this namespace. The mapping
 * to a model is the rule list below, never the slot name.
 */
const IMAGE_PATHS: readonly { slot: string; path: string }[] = [
  { slot: 'm1', path: '/bfs/new_dyn/e4565384e7e5b2d75756e577f505534b4168597.png' },
  { slot: 'm2', path: '/bfs/new_dyn/aa6e8649701c91e5ac8f43ff28b97a924168597.png' },
  { slot: 'm3', path: '/bfs/new_dyn/5da92b31df5ee2a20b17ec6be353cf5c4168597.png' },
  { slot: 'm4', path: '/bfs/new_dyn/14bb1e53cb2c13ca80bd23e3c1d2a04e4168597.png' },
  { slot: 'm5', path: '/bfs/new_dyn/f51fff40de2d6eaa5a73d177f7bbfa794168597.png' },
  { slot: 'm6', path: '/bfs/new_dyn/cfa71d4e60a2f12aaeec3efe1aa680b34168597.png' },
  { slot: 'm7', path: '/bfs/new_dyn/c09d34b79d9b447d7db98da68b97afc54168597.png' },
]

/** Every slot the profile installs, in list order — the download set. */
export const PROFILE_SLOTS: readonly string[] = IMAGE_PATHS.map(i => i.slot)

/**
 * Identity of this generation of the built-in profile.
 *
 * Only one thing reads it: what a failed download KEEPS for the next press
 * (`PresetHeld.key` in ./preset). Editing the rules or the pictures below must bump
 * it, or a retry could staple a wallpaper from the old set to a config from the new
 * one — the same reason the remote profile was compared by value rather than
 * assumed. Nothing else in the plugin persists it.
 */
export const RECOMMENDED_REVISION = 'builtin-1'

/**
 * The URL one slot's wallpaper is fetched from, on the first host — `${host}${url}`
 * is how a caller builds the other two.
 *
 * Returns null for a slot this profile does not carry, and that null is the whole
 * whitelist: `fetchPresetImage` (./index) answers `bad slot` for it, so a caller on
 * the public RPC cannot name a file of its own.
 */
export function profileImagePath(slot: string): string | null {
  const entry = IMAGE_PATHS.find(i => i.slot === slot)
  return entry === undefined ? null : `${entry.path}${BFS_SUFFIX}`
}

/**
 * One rule of the profile: the match string, its picture and that picture's color.
 *
 * The color is a per-image value (schema 10), and the triple here is the one the
 * profile has always carried — an HSL accent per model, used to tint the interface
 * while its wallpaper is on screen.
 */
function profileRule(id: string, match: string, slot: string, color: [number, number, number]): BgRule {
  return {
    id,
    images: [defaultImage(slot, color, 'fill')],
    match,
    enabled: true,
    color: null,
    rotate: defaultRotation(),
  }
}

/**
 * The profile, as a fresh config every call.
 *
 * ORDER IS THE FALLBACK: matching runs top→bottom and the first usable rule is what
 * an unmatched model gets, so `deepseek` leads — the model this plugin was written
 * for. Everything below the rules is the interface numbers a fresh install already
 * starts on (`DEFAULT_PART_OPACITIES` and friends), which is what makes installing
 * the profile "add the rules and the pictures" on a clean store.
 *
 * Deliberately NOT taken from `freshThemeConfig()`: that one seeds a single BLANK
 * rule, and this one must not inherit it.
 */
export function recommendedConfig(): ThemeConfig {
  return {
    rules: [
      profileRule('r1', 'deepseek', 'm3', [191.88931210132625, 0.5046198735613555, 0.82]),
      profileRule('r2', 'gpt', 'm1', [263.5122459614382, 0.31076923076923096, 0.82]),
      profileRule('r3', 'claude', 'm2', [18.923814597762384, 0.5486699795381468, 0.6]),
      profileRule('r4', 'qwen', 'm4', [26.25977410947, 0.6228354978354975, 0.82]),
      profileRule('r5', 'glm', 'm5', [30.15559737458117, 0.6552284141830319, 0.7646280172718907]),
      profileRule('r6', 'kimi', 'm6', [229.39645097591443, 0.5752269829617896, 0.2]),
      profileRule('r7', 'grok', 'm7', [217.3791348600509, 0.7702645947081058, 0.2]),
    ],
    opacities: { ...DEFAULT_PART_OPACITIES },
    transition: defaultTransition(),
    settingsOpacity: DEFAULT_SETTINGS_OPACITY,
    chatTextOpacity: DEFAULT_CHAT_TEXT_OPACITY,
    trajectoryOpacity: DEFAULT_TRAJECTORY_OPACITY,
    rightbarOpacity: DEFAULT_RIGHTBAR_OPACITY,
    pageOpacity: DEFAULT_PAGE_OPACITY,
    autoExtract: DEFAULT_AUTO_EXTRACT,
    // This is a configuration somebody CHOSE, which is the one reason the festival
    // overrides ship on here and off in `freshThemeConfig` (see
    // DEFAULT_HOLIDAYS_ENABLED).
    holidays: { enabled: true, items: defaultHolidayRules() },
    // ...but an AUTHORISATION is not a configuration, so this one stays off even
    // here: pressing "use the recommended profile" asks for a look, not for an
    // agent to be allowed to rewrite it. The user grants that on its own switch.
    agentAccess: DEFAULT_AGENT_ACCESS,
    rev: DEFAULT_REV,
  }
}

/**
 * The profile as the document both imports consume — the same shape `exportTheme`
 * writes, so everything downstream (the wipe, the slot loop) is the hand-picked
 * file's path.
 *
 * `images` is filled by the caller as the downloads land, which is what makes a
 * partially downloaded profile a resumable one rather than an all-or-nothing press.
 */
export function recommendedThemeFile(images: Record<string, string> = {}): {
  version: number
  exportedAt: string
  config: ThemeConfig
  images: Record<string, string>
} {
  return {
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    config: recommendedConfig(),
    images,
  }
}
