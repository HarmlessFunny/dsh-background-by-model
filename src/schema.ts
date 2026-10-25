/**
 * The persisted configuration shape — declared exactly ONCE, for both halves.
 *
 * The types, the key lists, the defaults and the pure normalizers live here and
 * both halves import them, so adding a field means editing this file and the two
 * halves cannot disagree about the shape. (This was written twice until 0.3.2,
 * when a field declared on one side was silently dropped by the other side's
 * sanitizer.) The host also logs one warning per unknown key while sanitizing a
 * write (`warnUnknownConfigKeys` in `src/index.ts`), so a field that reaches the
 * node half without being declared here shows up in the log.
 *
 * Nothing here may touch the DOM, Node or the Cordis context: it is imported by
 * the browser bundle and by the node half alike.
 */

import { HOLIDAYS } from './holiday'
import type { HolidayDef } from './holiday'

/** Placement state of one background image (zoom + fractional center + intrinsic size). */
export interface BgState { zoom: number; x: number; y: number; iw: number; ih: number }

export const DEFAULT_BG_STATE: BgState = { zoom: 1, x: 0, y: 0, iw: 0, ih: 0 }

/**
 * One image of a rule: its slot and everything that belongs to THAT picture — its
 * layout mode, its framing, its theme colour and the three paint effects.
 *
 * All of them are per image because all of them are properties of a picture: two
 * wallpapers in one rotation (a 3:2 photo and a tall screenshot) do not want the
 * same layout mode, the same accent or the same exposure, and one rule-level value
 * forced each picture to accept the other's compromise. A rule's own `color` is
 * therefore only what a rule with no image left paints (see `BgRule.color`).
 */
export interface BgImage {
  /** Image slot; the bytes live in `modelbg-<slot>` under the data dir. */
  slot: string
  /**
   * How THIS image meets the viewport (see `BgMode`).
   *
   * An entry with no `bgMode` KEY predates per-image modes; `normalizeImage` lifts
   * the rule-level mode a schema-5 config carried onto it rather than resetting it
   * to the default.
   */
  bgMode: BgMode
  /** This image's framing (zoom + fractional center + intrinsic size). */
  bgState: BgState
  /**
   * This image's own theme colour as `[h, s, l]`, or null for "follow the system
   * theme while THIS image is on screen".
   *
   * Null is an opinion, not an absence: it is what the clear button stores, and it
   * is deliberately NOT the rule's colour — that distinction is what makes a
   * rotation through a green, a red and a system-themed picture expressible. An
   * entry with no `color` KEY predates per-image colours; `normalizeImage` lifts
   * the rule's colour onto it so an upgrade keeps its theme.
   */
  color: [number, number, number] | null
  /**
   * How opaque THIS wallpaper is (0..1).
   *
   * An entry with no `opacity` KEY predates per-image effects; `normalizeImage`
   * lifts the rule-level opacity a schema-9 config carried onto it, so an upgrade
   * keeps what was on screen.
   */
  opacity: number
  /**
   * THIS image's brightness, in percent: `0` is a black screen, `100` the picture
   * as its file has it, `WALLPAPER_BRIGHTNESS_MAX` the ceiling.
   *
   * OPTIONAL on purpose, exactly like the rule-level field it replaced: the
   * absence means "untouched", and `rBrightness` (./client/state) is the only place
   * it becomes `DEFAULT_WALLPAPER_BRIGHTNESS`. A default written into the config
   * would make an upgrade rewrite every rule — and, worse here, it would erase the
   * difference between "never touched this picture" and "chose 100 for it".
   */
  brightness?: number
  /** THIS image's blur (px, 0..60) — NOT the interface part blur. */
  blur: number
}

/** Adaptive placement of a background image. */
export type BgMode = 'fit' | 'fill' | 'stretch' | 'tile' | 'center'

/** Every accepted `bgMode`, in UI order. */
export const BG_MODES: readonly BgMode[] = ['fit', 'fill', 'stretch', 'tile', 'center']

// ── Multi-image rotation ───────────────────────────────────────────────────

/** How a rule walks its own image list. */
export type RotateOrder = 'order' | 'shuffle'

/** Every accepted `rotate.order`, in UI order. */
export const ROTATE_ORDERS: readonly RotateOrder[] = ['order', 'shuffle']

/** Fastest allowed dwell time — below this the cross-fade never settles. */
export const ROTATE_MIN_MS = 5_000
/** Slowest allowed dwell time (24 h): one image per day is still "rotation". */
export const ROTATE_MAX_MS = 24 * 60 * 60 * 1000

/**
 * Multi-image rotation, per rule.
 *
 * OFF by default: switching images costs memory, bandwidth and CPU on a wallpaper
 * nobody asked to animate. `advanceOnSwitch` steps once when the model switch
 * lands on this rule, so "a different picture every time" needs no timer at all.
 *
 * There is deliberately no fade here: how long a switch takes is the GLOBAL switch
 * effect's business (`TransitionConfig`), because a rule has no notion of a
 * transition. A per-rule `fadeMs` from 0.7.x is lifted into the global duration on
 * read (see `legacyFadeMs`).
 */
export interface BgRotation {
  enabled: boolean
  /** Dwell time per image, ms (`ROTATE_MIN_MS`..`ROTATE_MAX_MS`). */
  intervalMs: number
  /** `order` walks the list top-down; `shuffle` never repeats the current image. */
  order: RotateOrder
  /** Step once when this rule becomes the active one. */
  advanceOnSwitch: boolean
}

/** Everything off: the shipped default, and what a config predating this feature gets. */
export const DEFAULT_ROTATION: BgRotation = {
  enabled: false,
  intervalMs: 60_000,
  order: 'order',
  advanceOnSwitch: false,
}

/** A fresh rotation block (never hand out the shared default object). */
export function defaultRotation(): BgRotation { return { ...DEFAULT_ROTATION } }

/**
 * Main interface opacities (0..1), global (Interface page) — each part is the token
 * set it owns:
 *   `bg`       `--dsw-alias-bg-base`
 *   `sidebar`  `--dsw-specific-sidebar-fill`
 *   `card`     `--dsw-alias-bg-layer-1/2/3`, `--dsw-specific-menu` (and its alias
 *              `--dsw-menu-surface-fill`)
 *   `code`     `--dsw-alias-markdown-code-block`, `…-banner`
 *   `input`    `--dsw-specific-input-major`
 */
export const PART_OPACITY_KEYS = ['bg', 'sidebar', 'card', 'code', 'input'] as const

/** Per-part main interface opacities (0..1), keyed BY the list above. */
export type PartOpacities = Record<(typeof PART_OPACITY_KEYS)[number], number>

// A fresh install starts on the author's own profile — these are the Interface
// tab's numbers as the recommended profile on the asset host carries them — so the
// one-click download adds pictures rather than changing this tab. The two settings
// this tab does not own are NOT copied from it: the holiday switch ships off (see
// DEFAULT_HOLIDAYS_ENABLED) and the duration keeps the 320 ms cross-fade.
//
// `bg` is 0 on purpose: the main background is entirely the wallpaper (and the
// host's own canvas while there is none — the palette and its ink come from the
// colour, not from this alpha). A config that omits one of these keys lands on the
// same value, so a missing key and a fresh install never show two different panels.
export const DEFAULT_PART_OPACITIES: PartOpacities = { bg: 0, sidebar: 0.1, card: 1, code: 0.81, input: 0.88 }

// There is deliberately NO per-part interface blur beside these: frosting a column
// only blurs the wallpaper behind it, which the wallpaper layer's own per-rule
// `blur` already does (see `applyWpEffects`).

// ── Wallpaper switch transition (global) ───────────────────────────────────

/** Longest allowed switch duration; 0 is a hard cut. */
export const TRANSITION_MAX_MS = 3_000

/**
 * What a wallpaper CHANGE looks like. Global by design: a rule has no notion of a
 * transition, and there is exactly ONE duration for every switch.
 *
 * `fade` is the cross-fade every earlier release performed, so the shipped default
 * changes nothing for anyone who upgrades.
 */
export type TransitionEffect = 'fade' | 'none' | 'zoom' | 'slide'

/** Every accepted `effect`, in UI order. */
export const TRANSITION_EFFECTS: readonly TransitionEffect[] = ['fade', 'none', 'zoom', 'slide']

/** The timing function, global along with the effect; `ease` is the curve the existing cross-fade ran on. */
export type TransitionEasing = 'ease' | 'linear' | 'ease-out' | 'ease-in-out'

/** Every accepted `easing`, in UI order. */
export const TRANSITION_EASINGS: readonly TransitionEasing[] = ['ease', 'linear', 'ease-out', 'ease-in-out']

/** The global wallpaper-switch transition. No `enabled`: off and `none` are one state. */
export interface TransitionConfig {
  /** What a change looks like. `none` is a hard cut whatever the duration says. */
  effect: TransitionEffect
  /** Timing function of the animation. */
  easing: TransitionEasing
  /** How long a change takes, in ms (`0` = a hard cut, max `TRANSITION_MAX_MS`). */
  durationMs: number
}

/** The shipped default: the cross-fade this plugin already performed, at 320 ms. */
export const DEFAULT_TRANSITION: TransitionConfig = {
  effect: 'fade',
  easing: 'ease',
  durationMs: 320,
}

/** A fresh transition block (never hand out the shared default object). */
export function defaultTransition(): TransitionConfig { return { ...DEFAULT_TRANSITION } }

/**
 * One model rule: a match string plus everything the background needs while it
 * is the active rule. Every appearance field lives HERE rather than globally —
 * the settings UI edits a rule, and the render layer follows whichever rule the
 * current model selected.
 */
export interface BgRule {
  /** Stable id; also the render key. */
  id: string
  /**
   * Case-insensitive substring tested against the current model text (provider,
   * model id and display name joined with spaces). An EMPTY string never matches
   * on its own — that rule then only ever serves as the fallback.
   */
  match: string
  /**
   * The rule's images, in order. `images[0]` is painted when no rotation runs.
   *
   * The list may legitimately be EMPTY: the rule then paints its own colour alone,
   * or nothing at all when it has none either — see `ruleCanPaint`, which is what
   * matching asks. A pre-0.7 config's single `slot`/`bgState` pair is lifted into a
   * one-entry list on read (`normalizeRule`), so only this shape is ever written.
   */
  images: BgImage[]
  /** Disabled rules are skipped by matching AND by the fallback pick. */
  enabled: boolean
  /**
   * The theme colour of the rule ITSELF: what an image-less rule paints from. Null
   * = follow the system theme.
   *
   * It is NOT a default for the rule's images (each carries its own, and never
   * inherits this one at paint time). The only inheritance is the one-shot lift
   * `normalizeImage` performs for configs written before per-image colours.
   */
  color: [number, number, number] | null
  // There is deliberately NO `bgMode`, `wallpaperOpacity`, `brightness` or `blur`
  // here: the layout mode and the three paint effects all belong to each image
  // (`BgImage`). A config that carried them at the rule level is lifted on read —
  // see `normalizeRule`.
  /** How the rule cycles `images`; off by default. */
  rotate: BgRotation
}

/**
 * Ceiling on the wallpaper layer's brightness, in percent.
 *
 * Above 100 is the half a wallpaper-extraction palette cannot compensate for, and
 * it is the reason the control exists at all: an underexposed photo or a dim
 * monitor. 200 % is where a second stop stops telling two dark pictures apart —
 * everything above it is blown out to white.
 */
export const WALLPAPER_BRIGHTNESS_MAX = 200

/** The brightness a picture starts on: the image exactly as its file has it. */
export const DEFAULT_WALLPAPER_BRIGHTNESS = 100

/**
 * One image entry for a place that CREATES a picture rather than reads one back
 * (a fresh holiday, and every upload in the panel).
 *
 * The two effects whose neutral value is also the shipped default are written
 * explicitly (`opacity`, `blur`), even though `normalizeImage` would default them:
 * the read-time lifts key off the ABSENCE of a key, so an entry created without one
 * would come back as "written before this field existed" and inherit whatever the
 * rule happened to carry. `brightness` is the one field whose absence is meaningful
 * (see `BgImage.brightness`), so it is left out — "untouched" is exactly what a new
 * picture is.
 */
export function defaultImage(
  slot: string,
  color: [number, number, number] | null = null,
  bgMode: BgMode = 'fit',
): BgImage {
  return {
    slot,
    bgMode,
    bgState: { ...DEFAULT_BG_STATE },
    color,
    opacity: 1,
    // No `brightness` key: absence is "untouched", and `rBrightness` is the one
    // place that becomes 100 (see BgImage.brightness).
    blur: 0,
  }
}

/** Every slot a rule owns, in order. The one thing the render and store layers
 *  ask of the image list, so a rule's slots are never enumerated ad hoc. */
export function ruleSlots(rule: BgRule): string[] {
  return rule.images.map(i => i.slot)
}

/**
 * Whether a rule has anything to show at all: an image, or a theme colour of its
 * own. Used by matching (`usable` in ./client/modelbg) and by the panel's copy.
 *
 * The rule's own colour counts because it recolours the interface with no
 * wallpaper involved: a rule whose pictures were all removed still paints, and
 * treating it as unusable handed the model to the NEXT rule (another model's
 * wallpaper on screen) while every control left on its card went dead. Per-image
 * colours do not enter the question at all — an image is already enough.
 *
 * A rule with neither paints nothing, so matching skips it: a freshly added rule
 * stays invisible until the user gives it something.
 */
export function ruleCanPaint(rule: BgRule): boolean {
  return rule.enabled && (ruleSlots(rule).length > 0 || rule.color !== null)
}

/**
 * One built-in holiday override — the SAME shape as a rule, by alias rather than
 * extension.
 *
 * The render layer resolves whatever `ruleById` returns, so a holiday is a rule and
 * the wallpaper, colour, mode and framing all work without a second code path.
 * `id`, the image list and every colour come from `HOLIDAYS` on read
 * (`normalizeHolidayRule`), so a hand-edited config can neither point a festival
 * at another picture nor paint it in a colour it does not have. Its bytes are the
 * file the definition names, downloaded by the node half on the day it is needed;
 * the slot is read-only and nothing about its source reaches the config file.
 */
export type HolidayRule = BgRule

/** The holiday override: one master switch plus one entry per built-in holiday. */
export interface HolidaysConfig {
  /**
   * While on, a holiday whose window contains today replaces the rule the model
   * resolved to. Ships off (see DEFAULT_HOLIDAYS_ENABLED).
   */
  enabled: boolean
  /** One entry per `HOLIDAYS` definition, in that order. */
  items: HolidayRule[]
}

/** The persisted plugin configuration. */
export interface ThemeConfig {  /** Ordered rules: matching runs top→bottom, rule 1 doubles as the fallback. */
  rules: BgRule[]
  /** Global per-part opacities (Interface page). */
  opacities: PartOpacities
  /**
   * Global wallpaper-switch transition (Config page): the effect and easing
   * every change uses, plus where its duration comes from.
   */
  transition: TransitionConfig
  /** Settings-panel opacity (0..1). */
  settingsOpacity: number
  /** Translucent tint over the conversation text region (0 = none, 1 = solid). */
  chatTextOpacity: number
  /** Translucent tint over the trajectory view surface (0 = none, 1 = solid). */
  trajectoryOpacity: number
  /**
   * Surface opacity of the file-preview panel (0..1). `null` = never owned, so the
   * panel follows `opacities.bg` — its only surface IS `--dsw-alias-bg-base`.
   */
  rightbarOpacity: number | null
  /**
   * Tint behind a function page in the centre column (0..1) — 插件, 自动化任务 and
   * every page a plugin registers. ONE value for all of them, told apart by WHERE
   * they are (each brings its own root element and hashed class names).
   *
   * `0` means the plugin adds nothing and the page keeps the host's own surface
   * (see DEFAULT_PAGE_OPACITY).
   */
  pageOpacity: number
  /**
   * Extract a rule's theme color from its own image when the rule has none yet.
   * Only ever FILLS an empty color — a color the user picked or that an earlier
   * extraction produced is never overwritten, so this cannot fight the user.
   */
  autoExtract: boolean
  /** Built-in holiday overrides (中秋 / 国庆), switched off as a whole. */
  holidays: HolidaysConfig
}

// The three tint alphas and the panel opacity are the profile's values as well
// (see DEFAULT_PART_OPACITIES). `rightbarOpacity` is the one default whose TYPE
// carries a second state: `null` means "follow `opacities.bg`", which a fresh
// config is no longer in (see `normalizeRightbarOpacity`).
export const DEFAULT_SETTINGS_OPACITY = 1
export const DEFAULT_CHAT_TEXT_OPACITY = 0.35
export const DEFAULT_TRAJECTORY_OPACITY = 0.73
export const DEFAULT_RIGHTBAR_OPACITY: number | null = 0.45
/**
 * Function pages ship UNPAINTED. The other tints above repaint a surface that was
 * already there; this item ADDS one, so a non-zero default would repaint every
 * page of every setup on upgrade. At zero the plugin writes nothing at all.
 */
export const DEFAULT_PAGE_OPACITY = 0
/** Picking an image should just work; the toggle is there for people who don't want it. */
export const DEFAULT_AUTO_EXTRACT = true
/**
 * Holiday overrides ship OFF: a fresh install paints what the model rules say and
 * nothing else, and the Config page's single switch is how the feature is asked
 * for. (The recommended profile turns it ON — that is a configuration somebody
 * chose.)
 */
export const DEFAULT_HOLIDAYS_ENABLED = false

/**
 * `#RRGGBB` → the `[h, s, l]` triple every rule stores (`s` and `l` in 0..1), or
 * null when the string is not a hex colour.
 *
 * Holidays name their colour as hex (`HOLIDAYS`) because a hand-converted triple
 * is a magic number nothing downstream can check.
 */
export function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (m === null) return null
  const n = parseInt(m[1]!, 16)
  const r = ((n >> 16) & 0xff) / 255
  const g = ((n >> 8) & 0xff) / 255
  const b = (n & 0xff) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  // Grey: no hue to name, and the saturation formula below would divide by zero.
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = 60 * (((g - b) / d) % 6)
  else if (max === g) h = 60 * ((b - r) / d + 2)
  else h = 60 * ((r - g) / d + 4)
  if (h < 0) h += 360
  // Clamped like every other color this module stores: the float arithmetic
  // above lands a hair outside the range on a saturated input (a pure #FFF6EB
  // gives s = 1.0000000000000008), and that would travel into the token
  // generator as an out-of-range channel.
  return [clamp(h, 0, 360, 0), clamp01(s, 0), clamp01(l, 0.5)]
}

/**
 * One holiday's appearance, untouched.
 *
 * The mode is `fill` rather than a rule's `fit`: full-bleed festival art would be
 * letterboxed by `fit` on every aspect ratio it was not cut for.
 */
export function defaultHolidayRule(def: HolidayDef): HolidayRule {
  // Written on BOTH the rule (what an image-less festival paints) and the image
  // (what actually paints), because the render layer reads one or the other.
  const color = hexToHsl(def.color)
  return {
    id: def.id,
    // Exactly one image: a holiday's art is the single file its definition names.
    images: [defaultImage(def.slot, color, 'fill')],
    match: '',
    enabled: true,
    color,
    rotate: defaultRotation(),
  }
}

/** Every built-in holiday at its default, in `HOLIDAYS` order. */
export function defaultHolidayRules(): HolidayRule[] {
  return HOLIDAYS.map(defaultHolidayRule)
}

/** The id of the one rule a fresh install opens on — the id `nextRuleId` mints for an empty list. */
export const BLANK_RULE_ID = 'r1'

/**
 * A rule with nothing in it yet: no picture, no match string, no colour — a fresh
 * install's rule 1 and the "add rule" tile alike.
 *
 * Valid rather than half-built: `ruleCanPaint` skips it until it has something of
 * its own, so it cannot steal the fallback from rule 1. It deliberately carries NO
 * image entry: a rule paints its FIRST image, and a placeholder slot left the
 * picture the user added next in position 2. The slot is allocated on arrival.
 */
export function blankRule(id: string): BgRule {
  return {
    id,
    images: [],
    match: '', enabled: true, color: null,
    rotate: defaultRotation(),
  }
}

/**
 * A default config with independent nested objects (never the shared ones).
 *
 * Seeded with one blank rule: an empty list has no rule card, and the card is the
 * only drop target a first picture has. Deleting every rule is still reachable and
 * is described by `ruleNoneHint`.
 */
export function freshThemeConfig(): ThemeConfig {
  return {
    rules: [blankRule(BLANK_RULE_ID)],
    opacities: { ...DEFAULT_PART_OPACITIES },
    transition: defaultTransition(),
    settingsOpacity: DEFAULT_SETTINGS_OPACITY,
    chatTextOpacity: DEFAULT_CHAT_TEXT_OPACITY,
    trajectoryOpacity: DEFAULT_TRAJECTORY_OPACITY,
    rightbarOpacity: DEFAULT_RIGHTBAR_OPACITY,
    pageOpacity: DEFAULT_PAGE_OPACITY,
    autoExtract: DEFAULT_AUTO_EXTRACT,
    holidays: { enabled: DEFAULT_HOLIDAYS_ENABLED, items: defaultHolidayRules() },
  }
}

// ── Sanitizers ─────────────────────────────────────────────────────────────
// Pure coercions from a possibly-old / possibly-hand-edited JSON value into the
// shape above. Both halves run THESE, so a clamp can never differ between what
// the UI shows and what lands on disk.

/** Slot names reach the filesystem, so they are strictly whitelisted. */
export const SLOT_RE = /^[A-Za-z0-9_-]{1,32}$/

/**
 * The persisted SHAPE this build writes, published by the node half on every `read`
 * and compared by the browser half before it writes anything.
 *
 * Why: a newer client bundle can be served to a page whose host still runs an OLDER
 * node half. That sanitizer rebuilds the config from the keys it knows, dropping
 * every field it cannot see — in silence, on the first write. Knowing the shape up
 * front lets the client hold its writes and say so (`canWriteConfig`, ./client/rpc).
 *
 * Every bump so far was data loss, not cosmetics:
 *
 *   3  an empty image list became legal (a schema-2 host refuses one)
 *   4  `images[].color`            — new field
 *   5  `transition`                — new field; per-rule `fadeMs` lifted into it
 *   6  `images[].bgMode`           — new field, plus the RULE-level mode lifted
 *   7  `brightness`                — new field
 *   8  `pageOpacity`               — new field
 *   9  REMOVAL of `blurs`          — a schema-8 host would re-add it with its own
 *                                    defaults (60 px of frosting) on the first write
 *   10 `images[].opacity` / `brightness` / `blur` — new fields, plus the RULE-level
 *                                    trio lifted onto every entry. The move is why
 *                                    this number had to move at all: a schema-9 host
 *                                    rebuilds each entry from the keys it knows, so
 *                                    it would drop all three in silence AND keep
 *                                    reading the rule-level values that no longer
 *                                    exist — a wallpaper silently back at 100%.
 */
export const SCHEMA_VERSION = 10

export function clamp(n: unknown, lo: number, hi: number, def: number): number {
  return typeof n === 'number' && isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def
}

export const clamp01 = (n: unknown, def: number): number => clamp(n, 0, 1, def)

export function normalizeBgState(s: Partial<BgState> | undefined): BgState {
  const v = s ?? {}
  return {
    zoom: clamp(v.zoom, 0.1, 10, 1),
    x: typeof v.x === 'number' && isFinite(v.x) ? v.x : 0,
    y: typeof v.y === 'number' && isFinite(v.y) ? v.y : 0,
    iw: typeof v.iw === 'number' && v.iw > 0 ? v.iw : 0,
    ih: typeof v.ih === 'number' && v.ih > 0 ? v.ih : 0,
  }
}

/** One `[h, s, l]` triple, or null when the value is not a complete finite triple. */
export function normalizeHsl(raw: unknown): [number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null
  if (!raw.every(n => typeof n === 'number' && isFinite(n))) return null
  return [clamp(raw[0], 0, 360, 220), clamp(raw[1], 0, 1, 0.55), clamp(raw[2], 0, 1, 0.25)]
}

/** Coerce one persisted rotation block; a config without one gets the shipped default. */
export function normalizeRotation(raw: unknown): BgRotation {
  const r = (raw ?? {}) as Partial<BgRotation>
  const d = DEFAULT_ROTATION
  return {
    // Only an explicit `true` turns rotation on: it is the one setting here that
    // spends the user's bandwidth and CPU, so it never becomes on by accident.
    enabled: r.enabled === true,
    intervalMs: clamp(r.intervalMs, ROTATE_MIN_MS, ROTATE_MAX_MS, d.intervalMs),
    order: ROTATE_ORDERS.includes(r.order as RotateOrder) ? (r.order as RotateOrder) : d.order,
    advanceOnSwitch: r.advanceOnSwitch === true,
  }
}

/** Own-property test for values that may be anything at all (a raw JSON entry). */
function hasOwn(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key)
}

/**
 * The duration a config written before the switch effect carries on any of its
 * rules, or `undefined` when it carries none worth adopting.
 *
 * `rotate.fadeMs` was the per-rule duration from 0.7.0 on, and it had NO control
 * anywhere — it could only be hand-edited, which is why the global setting
 * replaced it. This is the one-shot lift that keeps such a hand-tuned value from
 * being silently dropped on upgrade: the first rule whose value differs from the
 * 320 ms every build shipped is adopted as the global duration. Values that are
 * all the default are ignored, so an ordinary config keeps the ordinary default,
 * and rules that DISAGREE cannot be represented by one global number — the first
 * deliberate value wins, and the others are gone with the field they lived on.
 */
export function legacyFadeMs(rawRules: unknown): number | undefined {
  if (!Array.isArray(rawRules)) return undefined
  for (const entry of rawRules) {
    const rotate = (entry as { rotate?: unknown } | null | undefined)?.rotate
    if (rotate === null || typeof rotate !== 'object') continue
    const value = (rotate as { fadeMs?: unknown }).fadeMs
    if (typeof value !== 'number' || !isFinite(value)) continue
    if (value === DEFAULT_TRANSITION.durationMs) continue
    return clamp(value, 0, TRANSITION_MAX_MS, DEFAULT_TRANSITION.durationMs)
  }
  return undefined
}

/**
 * Coerce one persisted transition block; a config without one gets the shipped
 * default, which is what it was already showing.
 *
 * `legacyMs` is the per-rule `fadeMs` this shape replaced (`legacyFadeMs`), adopted
 * only when the incoming config carries no `durationMs` of its own. `0` is kept as
 * a real value (a hard cut), not read as "absent".
 */
export function normalizeTransition(raw: unknown, legacyMs?: number): TransitionConfig {
  const t = (raw ?? {}) as Partial<TransitionConfig>
  const d = DEFAULT_TRANSITION
  const fallback = typeof legacyMs === 'number' && isFinite(legacyMs) ? legacyMs : d.durationMs
  return {
    effect: TRANSITION_EFFECTS.includes(t.effect as TransitionEffect) ? (t.effect as TransitionEffect) : d.effect,
    easing: TRANSITION_EASINGS.includes(t.easing as TransitionEasing) ? (t.easing as TransitionEasing) : d.easing,
    durationMs: clamp(t.durationMs, 0, TRANSITION_MAX_MS, fallback),
  }
}

/**
 * What an image entry inherits from the RULE it sits in, for the one-shot lifts.
 *
 * Every field is the rule-level value the shape carried before the effects moved
 * down (schema 9), or the neutral value when the rule never had one. It is an
 * object rather than four positional arguments because four booleans-or-numbers in
 * a row is how a lift ends up handing a blur to the brightness slider.
 */
export interface ImageInherit {
  color: [number, number, number] | null
  opacity: number
  /** `undefined` = the rule never named one, so the entry must not either. */
  brightness: number | undefined
  blur: number
}

/** The inherit block for a caller that has no rule-level values at all. */
export const DEFAULT_IMAGE_INHERIT: ImageInherit = {
  color: null,
  opacity: 1,
  brightness: undefined,
  blur: 0,
}

/**
 * Coerce one persisted image entry, or null when it lacks a usable slot.
 *
 * `inherit` is the rule-level block this entry may take its values from, and each
 * field is lifted ONLY when the entry has no key of its own — that absence is the
 * whole signal. `color: null` is a deliberate "follow the system theme" and must
 * not be re-inherited on every load; `brightness` keeps its key absent when neither
 * side ever named one, so an upgrade never writes a default nobody chose.
 *
 * `inheritMode` is the same one-shot lift for the layout mode. It is the caller's to
 * resolve because the callers answer differently: a user rule passes the mode its
 * config carried at the RULE level (schema 5), a holiday passes its own `fill`. An
 * entry that HAS a `bgMode` key keeps it, even when it equals the default.
 */
export function normalizeImage(
  raw: unknown,
  inherit: ImageInherit = DEFAULT_IMAGE_INHERIT,
  inheritMode: BgMode = 'fit',
): BgImage | null {
  const i = (raw ?? {}) as Partial<BgImage>
  if (typeof i.slot !== 'string' || !SLOT_RE.test(i.slot)) return null
  const image: BgImage = {
    slot: i.slot,
    bgMode: BG_MODES.includes(i.bgMode as BgMode) ? (i.bgMode as BgMode) : inheritMode,
    bgState: normalizeBgState(i.bgState as Partial<BgState> | undefined),
    color: hasOwn(i, 'color') ? normalizeHsl(i.color) : inherit.color,
    // The two effects whose neutral value is also the shipped default: a key can be
    // written back without changing what anyone was looking at, so it always is.
    opacity: clamp01(i.opacity, inherit.opacity),
    blur: clamp(i.blur, 0, 60, inherit.blur),
  }
  // Brightness is the one field whose ABSENCE is information (see BgImage), so the
  // key is settled separately: an entry that named one keeps it, an entry that did
  // not takes the rule's only if the rule had one, and otherwise it stays absent.
  const brightness = i.brightness === undefined
    ? inherit.brightness
    : clamp(i.brightness, 0, WALLPAPER_BRIGHTNESS_MAX, DEFAULT_WALLPAPER_BRIGHTNESS)
  if (brightness !== undefined) image.brightness = brightness
  return image
}

/**
 * Coerce one persisted rule, or null when it names no image ANYWHERE.
 *
 * Both image shapes are accepted here and nowhere else: the 0.7 list (`images`),
 * and the single `slot`/`bgState` pair every earlier version wrote, lifted into a
 * one-entry list. That is what keeps the rest of the codebase free of "old config"
 * branches. Duplicate slots inside one rule are dropped — two entries pointing at
 * the same bytes only make a rotation look stuck.
 *
 * The rule's colour is resolved FIRST and handed to every image entry (what a
 * pre-0.7.1 entry inherits), and the rule keeps it: it is what the rule paints once
 * its last picture is gone. The layout mode makes the same trip from the RULE level
 * a pre-0.7.5 config carries, so the user's choice survives the move.
 *
 * An EMPTY list is a legitimate rule: removing a rule's last picture has to be
 * expressible. `ruleCanPaint` decides what such a rule then does.
 */
export function normalizeRule(raw: unknown): BgRule | null {
  // `slot` / `bgState` / `bgMode` and the three paint effects are read but not
  // declared on `BgRule` any more: they are the shapes earlier releases wrote, and
  // this function is where they are lifted — the first pair into the image entry,
  // the layout mode and the effects into EVERY entry's own fields. Typing them here
  // is what keeps the rest of the codebase free of "old config" branches.
  const r = (raw ?? {}) as Partial<BgRule> & {
    slot?: unknown
    bgState?: unknown
    bgMode?: unknown
    wallpaperOpacity?: unknown
    brightness?: unknown
    blur?: unknown
  }
  const id = typeof r.id === 'string' && r.id !== '' ? r.id : null
  if (id === null) return null
  const color = normalizeHsl(r.color)
  // The rule-level mode a config written before 0.7.5 carries, resolved ONCE here
  // and handed to every image entry below. `fit` when the field is absent or
  // unusable — the same default a fresh rule's first picture gets, so a config
  // that never named a mode cannot tell this lift apart from a new rule.
  const mode: BgMode = BG_MODES.includes(r.bgMode as BgMode) ? (r.bgMode as BgMode) : 'fit'
  // The same trip for the three effects a schema-9 config carried on the RULE. Each
  // value is resolved once and handed down, so every picture of one rule starts out
  // looking exactly as that rule did — which is what the user was already seeing.
  // Brightness stays `undefined` when the rule never named one, and that absence
  // travels with it (see `normalizeImage`).
  const inherit: ImageInherit = {
    color,
    opacity: clamp01(r.wallpaperOpacity, 1),
    brightness: r.brightness === undefined
      ? undefined
      : clamp(r.brightness, 0, WALLPAPER_BRIGHTNESS_MAX, DEFAULT_WALLPAPER_BRIGHTNESS),
    blur: clamp(r.blur, 0, 60, 0),
  }
  const images: BgImage[] = []
  const seen = new Set<string>()
  const hadList = Array.isArray(r.images)
  if (hadList) {
    for (const entry of r.images as unknown[]) {
      const image = normalizeImage(entry, inherit, mode)
      if (image === null || seen.has(image.slot)) continue
      seen.add(image.slot)
      images.push(image)
    }
  }
  const legacySlot = typeof r.slot === 'string' && SLOT_RE.test(r.slot) ? r.slot : null
  if (images.length === 0 && legacySlot !== null) {
    // Synthesized, not read: the pre-0.7 pair has no image entry of its own, so
    // the rule's color, mode and effects are what this image starts out with (the
    // same lift as above, for the shape that has no key to be absent from).
    const image: BgImage = {
      slot: legacySlot,
      bgMode: mode,
      bgState: normalizeBgState(r.bgState as Partial<BgState> | undefined),
      color,
      opacity: inherit.opacity,
      blur: inherit.blur,
    }
    if (inherit.brightness !== undefined) image.brightness = inherit.brightness
    images.push(image)
  }
  // Nothing usable anywhere: a pre-0.7 rule whose slot was empty or malformed.
  if (images.length === 0 && !hadList) return null
  const rotate = normalizeRotation(r.rotate)
  // One picture is not a rotation: the panel DISABLES the switch below two images,
  // so a rule that keeps `enabled` set — arriving from an imported file, or written
  // back after a picture was removed somewhere else — shows a switch that reads
  // "on" and cannot be turned off until another picture arrives. The normalizer is
  // the one place load, import and persist all pass through.
  if (images.length < 2) rotate.enabled = false
  // No rule-level `wallpaperOpacity` / `brightness` / `blur` in what comes out: the
  // three moved down to the entries above, and writing them back at the rule level
  // would let a later reader lift its own output.
  return {
    id,
    images,
    match: typeof r.match === 'string' ? r.match : '',
    enabled: r.enabled !== false,
    color,
    rotate,
  }
}

/**
 * Coerce one persisted holiday entry.
 *
 * `id`, the image list and every theme colour come from the DEFINITION, never from
 * disk: a stale or hand-edited value would orphan the wallpaper, point the holiday
 * at a rule's image, or paint a festival in a colour it does not have. The layout
 * mode and the rotation stay the definition's own for the same reason (a festival
 * is never swapped or cycled). Everything else is sanitized like a rule's field.
 */
export function normalizeHolidayRule(def: HolidayDef, raw: unknown): HolidayRule {
  const r = (raw ?? {}) as Partial<HolidayRule> & {
    bgState?: unknown
    wallpaperOpacity?: unknown
    brightness?: unknown
    blur?: unknown
  }
  const base = defaultHolidayRule(def)
  return {
    ...base,
    // Only an explicit `false` disables the entry.
    enabled: r.enabled !== false,
    // MODE, COLOUR and the ROTATION come from `base`: a festival is one picture and
    // is never swapped or cycled. The three paint effects and the framing stay the
    // user's, and the lift below honours BOTH places they can arrive from: the
    // image entry (this shape) and the rule-level fields a schema-9 config carried.
    images: base.images.map(image => {
      const stored = r.images?.[0] as Partial<BgImage> | undefined
      const merged: BgImage = {
        slot: image.slot,
        bgMode: image.bgMode,
        bgState: normalizeBgState((stored?.bgState ?? r.bgState) as Partial<BgState> | undefined),
        color: image.color,
        opacity: clamp01(stored?.opacity ?? legacyWallpaperOpacity(r.wallpaperOpacity), image.opacity),
        blur: clamp(stored?.blur ?? r.blur, 0, 60, image.blur),
      }
      // A holiday's shipped 100% is not written as a key unless the user set one:
      // absence is what tells "untouched" from "chose 100" (see BgImage.brightness).
      const brightness = stored?.brightness === undefined
        ? (r.brightness === undefined
            ? undefined
            : clamp(r.brightness, 0, WALLPAPER_BRIGHTNESS_MAX, DEFAULT_WALLPAPER_BRIGHTNESS))
        : clamp(stored.brightness, 0, WALLPAPER_BRIGHTNESS_MAX, DEFAULT_WALLPAPER_BRIGHTNESS)
      if (brightness !== undefined) merged.brightness = brightness
      return merged
    }),
  }
}

/**
 * The rule-level opacity a schema-9 holiday entry carried, or `undefined` so the
 * caller can tell "absent" from "set to 1" and leave `clamp01` its default.
 */
function legacyWallpaperOpacity(raw: unknown): number | undefined {
  return typeof raw === 'number' && isFinite(raw) ? raw : undefined
}

/** Coerce the whole holiday block; unknown ids are dropped, missing ones defaulted. */
export function normalizeHolidays(raw: unknown): HolidaysConfig {
  const r = (raw ?? {}) as Partial<HolidaysConfig>
  const stored = new Map<string, unknown>()
  if (Array.isArray(r.items)) {
    for (const item of r.items) {
      const id = (item as { id?: unknown } | null | undefined)?.id
      if (typeof id === 'string') stored.set(id, item)
    }
  }
  return {
    // A real boolean is honoured; anything else lands on the shipped default
    // (OFF). The per-HOLIDAY `enabled` inside each item is a different switch.
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_HOLIDAYS_ENABLED,
    items: HOLIDAYS.map(def => normalizeHolidayRule(def, stored.get(def.id))),
  }
}

/**
 * The file-preview panel's own opacity: a number is the card's own value, `null` is
 * "never owned, follow `opacities.bg`", and a MISSING key is the shipped 45%.
 *
 * `null` has to survive as itself: every release so far persisted it for a panel the
 * user never dragged, so treating it as missing would silently hand the shipped 45%
 * to every configuration that was following the main background.
 */
function normalizeRightbarOpacity(v: unknown): number | null {
  if (v === null) return null
  if (typeof v === 'number' && isFinite(v)) return clamp01(v, 1)
  return DEFAULT_RIGHTBAR_OPACITY
}

/** Coerce an unknown persisted value into a valid ThemeConfig, falling back per-field. */
export function normalizeConfig(raw: unknown): ThemeConfig {
  const r = (raw ?? {}) as Partial<ThemeConfig>
  // A MISSING rule list and an EMPTY one are two different answers, and this is the
  // only place that can tell them apart. Missing means nothing has ever been
  // configured here: the list starts where the panel starts, on one blank rule.
  // Present-and-empty is a user who deleted every rule, and seeding it would
  // resurrect a rule on every read — the one thing "delete" must not mean.
  const rules = Array.isArray(r.rules)
    ? r.rules.map(normalizeRule).filter((x): x is BgRule => x !== null)
    : [blankRule(BLANK_RULE_ID)]
  const ops = (r.opacities ?? {}) as Partial<PartOpacities>
  const opacities = {} as PartOpacities
  for (const k of PART_OPACITY_KEYS) {
    opacities[k] = clamp01(ops[k], DEFAULT_PART_OPACITIES[k])
  }
  return {
    rules,
    opacities,
    transition: normalizeTransition(r.transition, legacyFadeMs(r.rules)),
    settingsOpacity: clamp01(r.settingsOpacity, DEFAULT_SETTINGS_OPACITY),
    chatTextOpacity: clamp01(r.chatTextOpacity, DEFAULT_CHAT_TEXT_OPACITY),
    trajectoryOpacity: clamp01(r.trajectoryOpacity, DEFAULT_TRAJECTORY_OPACITY),
    // A real number is the card's own value, an explicit `null` is still "follow
    // the main background", and only a key that is not there at all takes the
    // shipped default — see normalizeRightbarOpacity for why the middle one must
    // not be treated as missing.
    rightbarOpacity: normalizeRightbarOpacity(r.rightbarOpacity),
    // Pages are a plain alpha with no "never touched" state to keep apart from
    // zero: a config written before this field existed reads as the untouched
    // zero, which is the behaviour it was written under.
    pageOpacity: clamp01(r.pageOpacity, DEFAULT_PAGE_OPACITY),
    // Only an explicit `false` turns it off, so a config written before this
    // option existed starts with the helpful default.
    autoExtract: r.autoExtract !== false,
    holidays: normalizeHolidays(r.holidays),
  }
}
