/**
 * The persisted configuration shape — declared exactly ONCE, for both halves.
 *
 * This shape used to be written out twice: the node half owns persistence and
 * sanitizes every write, the browser half owns the UI and its own reading of the
 * same file. A field added to only one side was silently dropped by the other
 * side's sanitizer — the matching slider stayed live in memory, `writeConfig`
 * wrote a config without it, and the next load fell back to the default.
 * `blurs.rightbar` / `rightbarOpacity` in 0.3.2 was exactly that bug, and the key
 * lists were duplicated 6 times across the two halves, so it was due to happen.
 *
 * The types, the key lists, the defaults and the pure normalizers therefore live
 * here and both halves import them: adding a field means editing this file, and
 * the two halves cannot disagree about the shape. The host additionally logs one
 * warning per unknown key while sanitizing a write (see `warnUnknownConfigKeys`
 * in `src/index.ts`), so a field that reaches the node half without being
 * declared here shows up in the host log instead of quietly disappearing.
 *
 * Nothing in this module may touch the DOM, Node or the Cordis context: it is
 * imported by the browser bundle and by the node half alike.
 */

import { HOLIDAYS } from './holiday'
import type { HolidayDef } from './holiday'

/** Placement state of one background image (zoom + fractional center + intrinsic size). */
export interface BgState { zoom: number; x: number; y: number; iw: number; ih: number }

export const DEFAULT_BG_STATE: BgState = { zoom: 1, x: 0, y: 0, iw: 0, ih: 0 }

/**
 * One image of a rule: its slot, plus everything that belongs to THAT image —
 * its framing and its theme color.
 *
 * The framing is per image rather than per rule because a crop is a property of
 * a picture: two wallpapers with different aspect ratios share the rule's
 * `bgMode`, opacity and blur, but a single `fit` framing computed for one of
 * them is simply wrong for the other.
 *
 * The theme color is per image for the same reason one step further out: a rule
 * is a rotation through several pictures, and pictures that were collected for
 * different moods do not share one accent. A rule's own `color` therefore means
 * something narrower than it used to (see `BgRule.color`) — it is what a rule
 * with no image left paints.
 */
export interface BgImage {
  /** Image slot; the bytes live in `modelbg-<slot>` under the data dir. */
  slot: string
  /** This image's framing (zoom + fractional center + intrinsic size). */
  bgState: BgState
  /**
   * This image's own theme color as `[h, s, l]`, or null for "follow the system
   * theme while THIS image is on screen".
   *
   * Null is an opinion, not an absence: it is the state the clear button puts an
   * image in, and it is deliberately NOT the rule's color — an image's color is
   * the image's, which is what makes a rotation through a green, a red and a
   * system-themed picture expressible at all. The rule's own color only applies
   * when the rule has no image to speak for it.
   *
   * Written by every release from 0.7.1 on. An entry that predates the field has
   * no `color` KEY at all, which is exactly how `normalizeImage` tells "this
   * image never had a color of its own" from "this image was explicitly cleared"
   * — and why the rule's color is lifted onto such an entry on read rather than
   * being quietly dropped.
   */
  color: [number, number, number] | null
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
/** Longest allowed cross-fade; 0 is a hard cut. */
export const ROTATE_FADE_MAX_MS = 3_000

/**
 * Multi-image rotation, per rule.
 *
 * OFF by default, and that is a deliberate product decision: switching images by
 * itself costs memory, bandwidth and CPU on a wallpaper that nobody asked to
 * animate. `intervalMs` is the dwell time, `order` picks the next image, and
 * `advanceOnSwitch` also steps once when the model switch lands on this rule —
 * so a model can have "a different picture every time" without any timer at all.
 */
export interface BgRotation {
  enabled: boolean
  /** Dwell time per image, ms (`ROTATE_MIN_MS`..`ROTATE_MAX_MS`). */
  intervalMs: number
  /** `order` walks the list top-down; `shuffle` never repeats the current image. */
  order: RotateOrder
  /** Step once when this rule becomes the active one. */
  advanceOnSwitch: boolean
  /** Cross-fade duration in ms (0 = hard cut, max `ROTATE_FADE_MAX_MS`). */
  fadeMs: number
}

/** Everything off: the shipped default, and what a config predating this feature gets. */
export const DEFAULT_ROTATION: BgRotation = {
  enabled: false,
  intervalMs: 60_000,
  order: 'order',
  advanceOnSwitch: false,
  fadeMs: 320,
}

/** A fresh rotation block (never hand out the shared default object). */
export function defaultRotation(): BgRotation { return { ...DEFAULT_ROTATION } }

/**
 * Main interface opacities (0..1), global (Interface page):
 *   `bg`      main background (`--dsw-alias-bg-base`)
 *   `sidebar` sidebar (`--dsw-specific-sidebar-fill`)
 *   `card`    cards/panels (`--dsw-alias-bg-layer-1/2/3`, `--dsw-specific-menu`
 *             and its 0.1.7 alias `--dsw-menu-surface-fill`)
 *   `input`   input/control surfaces (`--dsw-specific-input-major`)
 */
export const PART_OPACITY_KEYS = ['bg', 'sidebar', 'card', 'input'] as const

/** Per-part main interface opacities (0..1), keyed BY the list above. */
export type PartOpacities = Record<(typeof PART_OPACITY_KEYS)[number], number>

export const DEFAULT_PART_OPACITIES: PartOpacities = { bg: 0.85, sidebar: 0.93, card: 1, input: 1 }

/**
 * Interface blur (px, 0..60), global (Interface page):
 *   `bg`         main background (AppFrame grid)
 *   `sidebar`    sidebar column
 *   `card`       cards/panels (center + details columns, dialog option panels)
 *   `settings`   settings panel
 *   `chat`       conversation text region (message column of the chat view)
 *   `trajectory` trajectory view surface
 *   `rightbar`   file-preview panel — the right sidebar a file click opens
 *   `input`      input/control surfaces ([data-composer-card], [data-cordis-panel])
 */
export const PART_BLUR_KEYS = ['bg', 'sidebar', 'card', 'settings', 'chat', 'trajectory', 'rightbar', 'input'] as const

/** Per-part interface blur (px, 0..60), keyed BY the list above. */
export type PartBlurs = Record<(typeof PART_BLUR_KEYS)[number], number>

export const DEFAULT_PART_BLURS: PartBlurs = {
  bg: 0, sidebar: 0, card: 0, settings: 0, chat: 0, trajectory: 0, rightbar: 0, input: 0,
}

// ── Wallpaper switch transition (global) ───────────────────────────────────

/**
 * What a wallpaper CHANGE looks like. Global by design — a rule has no notion of
 * a transition — while the DURATION stays the rule's own `rotate.fadeMs` unless
 * `durationMode` is switched to `unified`.
 *
 * `fade` is the cross-fade every release so far performed, so the shipped
 * default is exactly the behaviour of the build before this setting existed:
 * adding a global switch must not change what anybody already sees.
 */
export type TransitionEffect = 'fade' | 'none' | 'zoom' | 'slide'

/** Every accepted `effect`, in UI order. */
export const TRANSITION_EFFECTS: readonly TransitionEffect[] = ['fade', 'none', 'zoom', 'slide']

/**
 * The transition's timing function, global along with the effect.
 *
 * `ease` is the curve the cross-fade already ran on, so the default does not
 * move either.
 */
export type TransitionEasing = 'ease' | 'linear' | 'ease-out' | 'ease-in-out'

/** Every accepted `easing`, in UI order. */
export const TRANSITION_EASINGS: readonly TransitionEasing[] = ['ease', 'linear', 'ease-out', 'ease-in-out']

/**
 * Where the transition's DURATION comes from.
 *
 * `per-rule` is the default and keeps every rule's own `rotate.fadeMs`
 * authoritative — including a rule that deliberately asks for a hard cut — so
 * this setting changes nothing on upgrade and the per-rule control stays
 * meaningful. `unified` overrides all of them with `durationMs`, for the
 * reading in which the switch is one thing rather than one thing per model.
 */
export type TransitionDurationMode = 'per-rule' | 'unified'

/** Every accepted `durationMode`, in UI order. */
export const TRANSITION_DURATION_MODES: readonly TransitionDurationMode[] = ['per-rule', 'unified']

/**
 * The global wallpaper-switch transition.
 *
 * There is deliberately no `enabled`: switching it off and picking `none` are
 * the same state, and two controls that mean one thing is how a panel starts
 * contradicting itself.
 */
export interface TransitionConfig {
  /** What a change looks like. `none` is a hard cut whatever the duration says. */
  effect: TransitionEffect
  /** Timing function of the animation. */
  easing: TransitionEasing
  /** Whether the duration is each rule's own, or the one below for all of them. */
  durationMode: TransitionDurationMode
  /** Duration used while `durationMode` is `unified` (0 = a hard cut). */
  durationMs: number
}

/** The shipped default: the cross-fade this plugin already performed, at 320 ms,
 *  with every rule's own duration still in charge. */
export const DEFAULT_TRANSITION: TransitionConfig = {
  effect: 'fade',
  easing: 'ease',
  durationMode: 'per-rule',
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
   * The rule's images, in order. `images[0]` is the one painted when no rotation
   * is running. The list may legitimately be EMPTY (every picture removed): the
   * rule then paints its own theme color alone, or nothing at all when it has no
   * color either — see `ruleCanPaint`, which is what matching asks.
   *
   * This replaced the single `slot`/`bgState` pair in 0.7.0. A config written by
   * an earlier version is lifted to `[{ slot, bgState }]` on read (see
   * `normalizeRule`), so both shapes live on ONE in-memory shape and only the new
   * one is ever written back — the same "declare it once" rule as this file's
   * header.
   */
  images: BgImage[]
  /** Disabled rules are skipped by matching AND by the fallback pick. */
  enabled: boolean
  /**
   * The theme color of the rule ITSELF: what an image-less rule paints the
   * interface from. Null = that rule falls back to the system theme.
   *
   * It is not a default for the rule's images — each of those carries its own
   * (`BgImage.color`) and never inherits this one at paint time. The only
   * inheritance that exists is a one-shot LIFT at read time for configs written
   * before per-image colors, so a rule that was themed before 0.7.1 comes back
   * looking exactly the same (see `normalizeImage`).
   */
  color: [number, number, number] | null
  bgMode: BgMode
  /** Wallpaper layer opacity (0..1). */
  wallpaperOpacity: number
  /** Wallpaper layer blur (px, 0..60) — NOT the interface part blur. */
  blur: number
  /** How the rule cycles `images`; off by default. */
  rotate: BgRotation
}

/** Every slot a rule owns, in order. The one thing the render and store layers
 *  ask of the image list, so a rule's slots are never enumerated ad hoc. */
export function ruleSlots(rule: BgRule): string[] {
  return rule.images.map(i => i.slot)
}

/**
 * Whether a rule has anything to show at all: an image, or a theme color of its
 * own. Used by matching (`usable` in ./client/modelbg) and by the panel's copy.
 *
 * An image is the obvious way a rule paints, and until 0.7 it was the ONLY one —
 * which stopped being true the moment the last image became removable. A
 * rule-level theme color is the second: it recolors the interface through the
 * token palette with no wallpaper involved, so a rule whose pictures were all
 * removed still paints, and treating it as unusable made every control left on
 * its card (the wheel, the swatches, the clear-to-system-theme button) dead — the
 * one state where the panel was confidently showing a lie. It also silently
 * handed the model to the NEXT rule, so clearing the default rule's images put
 * another model's wallpaper on the screen.
 *
 * Note that a per-image color (0.7.1) does not enter this question at all: an
 * image is already enough, so the answer here is about the IMAGE LIST being
 * non-empty, never about what those images are painted in.
 *
 * A rule with no image and no color of its own paints nothing: the system theme
 * is not a paint of this rule's own, so such a rule is skipped by matching, which
 * is what makes a freshly added rule (empty, colorless) invisible until the user
 * gives it something.
 */
export function ruleCanPaint(rule: BgRule): boolean {
  return rule.enabled && (ruleSlots(rule).length > 0 || rule.color !== null)
}

/**
 * One built-in holiday override.
 *
 * Deliberately the SAME shape as a rule — an alias rather than an extension: the
 * render layer resolves whatever `ruleById` returns, so making a holiday a rule
 * is what lets the wallpaper, the theme color, the layout mode and the framing
 * all work without a second code path. `id` and `slot` are fixed by `HOLIDAYS` —
 * the sanitizer overwrites them from the definition, so a hand-edited config can
 * never point a holiday at another rule's slot.
 *
 * There is deliberately nothing here about the IMAGE. A holiday's wallpaper is
 * the one bundled in the package (under `holiday/`), the node half serves it
 * straight out of there, and a holiday slot is read-only — no entry point takes
 * bytes for it. The feature is an easter egg, not a thing to configure.
 *
 * Its theme colors are forced from the definition for the same reason, one level
 * deeper: a holiday's color belongs to it, so `normalizeHolidayRule` rewrites both
 * the rule's color and every image's. That is also what makes a future holiday
 * with SEVERAL pictures (a rotation through festival art, each piece with its own
 * palette) a change to `HOLIDAYS` and its assets alone, rather than a second code
 * path in the render layer.
 */
export type HolidayRule = BgRule

/** The holiday override: one master switch plus one entry per built-in holiday. */
export interface HolidaysConfig {
  /**
   * While on, a holiday whose window contains today replaces the rule the model
   * resolved to. On unless it is explicitly turned off — the switch on the Config
   * page is an off-ramp, not an opt-in.
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
  /** Global per-part blur (Interface page). */
  blurs: PartBlurs
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
   * Surface opacity of the file-preview panel (0..1). `null` = never touched, so
   * the panel keeps following `opacities.bg`: the panel's only surface IS
   * `--dsw-alias-bg-base`, which the main-background slider already re-emits, so
   * an untouched card must stay indistinguishable from the interface behind it.
   */
  rightbarOpacity: number | null
  /**
   * Extract a rule's theme color from its own image when the rule has none yet.
   * Only ever FILLS an empty color — a color the user picked or that an earlier
   * extraction produced is never overwritten, so this cannot fight the user.
   */
  autoExtract: boolean
  /** Built-in holiday overrides (中秋 / 国庆), switched off as a whole. */
  holidays: HolidaysConfig
}

/** 100% = untouched host surface; zero would blank the page by default. */
export const DEFAULT_SETTINGS_OPACITY = 1
export const DEFAULT_CHAT_TEXT_OPACITY = 0
/** 100% = untouched host surface; zero would blank the page by default. */
export const DEFAULT_TRAJECTORY_OPACITY = 1
/** `null` = the file-preview panel still follows the main background. */
export const DEFAULT_RIGHTBAR_OPACITY: number | null = null
/** Picking an image should just work; the toggle is there for people who don't want it. */
export const DEFAULT_AUTO_EXTRACT = true
/**
 * Holiday overrides are ON out of the box: the point is that the background
 * changes by itself on the day and changes back the next morning. The single
 * switch on the Config page is the off-ramp, so only an explicit `false` turns
 * the feature off.
 */
export const DEFAULT_HOLIDAYS_ENABLED = true

/**
 * `#RRGGBB` → the `[h, s, l]` triple every rule stores (`s` and `l` in 0..1), or
 * null when the string is not a hex color.
 *
 * A holiday names its color as hex because that is how a color is quoted, and a
 * hand-converted triple is a magic number nothing downstream can check. The
 * conversion lives here rather than in ./holiday because `[h, s, l]` is this
 * module's own rule shape.
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
 * Holidays default to `fill` rather than a rule's `fit`: these are full-bleed
 * festival wallpapers, and `fit` would letterbox them on every aspect ratio the
 * art was not cut for.
 */
export function defaultHolidayRule(def: HolidayDef): HolidayRule {
  // The definition's own color, never an extracted one — see hexToHsl. It is
  // written BOTH on the rule (what an image-less festival would paint) and on the
  // image (what actually paints today), because those are two different slots in
  // the shape now and a holiday that only filled one of them would look themed or
  // unthemed depending on which branch the render layer happened to read.
  const color = hexToHsl(def.color)
  return {
    id: def.id,
    // Exactly one image: a holiday's art is the package's, so there is nothing
    // for a second entry to point at and nothing for a rotation to walk.
    images: [{ slot: def.slot, bgState: { ...DEFAULT_BG_STATE }, color }],
    match: '',
    enabled: true,
    color,
    bgMode: 'fill',
    wallpaperOpacity: 1,
    blur: 0,
    rotate: defaultRotation(),
  }
}

/** Every built-in holiday at its default, in `HOLIDAYS` order. */
export function defaultHolidayRules(): HolidayRule[] {
  return HOLIDAYS.map(defaultHolidayRule)
}

/** A default config with independent nested objects (never hand out the shared ones). */
export function freshThemeConfig(): ThemeConfig {
  return {
    rules: [],
    opacities: { ...DEFAULT_PART_OPACITIES },
    blurs: { ...DEFAULT_PART_BLURS },
    transition: defaultTransition(),
    settingsOpacity: DEFAULT_SETTINGS_OPACITY,
    chatTextOpacity: DEFAULT_CHAT_TEXT_OPACITY,
    trajectoryOpacity: DEFAULT_TRAJECTORY_OPACITY,
    rightbarOpacity: DEFAULT_RIGHTBAR_OPACITY,
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
 * The persisted SHAPE this build writes: 5 = the global wallpaper-switch
 * transition (`transition`) is part of the config; 4 = a theme color belongs to
 * an IMAGE (`images[].color`), and a rule's own color is what an image-less rule
 * paints.
 *
 * Declared here, with the shape itself, and published by the node half on every
 * `read`. The browser half compares it before it writes anything: a client bundle
 * from a newer release can be served to a page whose host process is still
 * running an OLDER node half (update the package, then just refresh the page),
 * and that older sanitizer would silently drop every rule it does not understand.
 * Knowing the shape up front is what lets the client hold its writes and say so
 * instead.
 *
 * Both bumps so far were of that kind, not cosmetic. 2 → 3 was "an empty image
 * list is legal": a schema-2 host refuses one, so once this bundle could PRODUCE
 * an empty rule, every write was at risk of erasing the user's rule list — the
 * failure mode is data loss, and it arrived on the first slider drag after
 * emptying a rule. 3 → 4 is `images[].color`: the field is unknown to a schema-3
 * sanitizer, which REBUILDS each image entry from the keys it knows, so a color
 * the user set would survive in memory until the next reload and then be gone —
 * a silent, per-image loss that no warning would accompany. 4 → 5 is
 * `transition`, the same mechanism one level up: a schema-4 sanitizer rebuilds
 * the whole config from the keys it knows, so the effect, the easing and the
 * unified duration would all be dropped on the first write after a refresh
 * paired a new client bundle with an older host process. The check is a plain
 * `>=`, so an older host lands in the hold-writes path automatically.
 */
export const SCHEMA_VERSION = 5

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
    // 0 is a legal value (a hard cut), so it must not be treated as "absent".
    fadeMs: clamp(r.fadeMs, 0, ROTATE_FADE_MAX_MS, d.fadeMs),
  }
}

/** Own-property test for values that may be anything at all (a raw JSON entry). */
function hasOwn(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key)
}

/**
 * Coerce one persisted transition block; a config written before this setting
 * existed has no `transition` key at all and gets the shipped default, which is
 * the behaviour it already had.
 *
 * `durationMs` is clamped with `0` kept as a real value (a hard cut) rather than
 * read as "absent" — the same trap `rotate.fadeMs` documents one level down.
 */
export function normalizeTransition(raw: unknown): TransitionConfig {
  const t = (raw ?? {}) as Partial<TransitionConfig>
  const d = DEFAULT_TRANSITION
  return {
    effect: TRANSITION_EFFECTS.includes(t.effect as TransitionEffect) ? (t.effect as TransitionEffect) : d.effect,
    easing: TRANSITION_EASINGS.includes(t.easing as TransitionEasing) ? (t.easing as TransitionEasing) : d.easing,
    durationMode: TRANSITION_DURATION_MODES.includes(t.durationMode as TransitionDurationMode)
      ? (t.durationMode as TransitionDurationMode)
      : d.durationMode,
    durationMs: clamp(t.durationMs, 0, ROTATE_FADE_MAX_MS, d.durationMs),
  }
}

/**
 * Coerce one persisted image entry, or null when it lacks a usable slot.
 *
 * `inherit` is the RULE's own color, and it is applied only to an entry that has
 * no `color` key at all — the shape every release before 0.7.1 wrote, where a
 * rule's color was the only color there was. Lifting it here, once, is what makes
 * an upgrade a no-op on screen: a themed wallpaper keeps its theme instead of
 * silently dropping to the system palette, and it happens in the shared sanitizer
 * so both halves lift identically.
 *
 * The KEY's presence is the whole distinction, which is why `null` is not the
 * same as absent: an entry with `color: null` is an image the user explicitly set
 * to "follow the system theme", and re-inheriting the rule's color over that
 * would undo a deliberate choice on every load.
 */
export function normalizeImage(raw: unknown, inherit: [number, number, number] | null = null): BgImage | null {
  const i = (raw ?? {}) as Partial<BgImage>
  if (typeof i.slot !== 'string' || !SLOT_RE.test(i.slot)) return null
  return {
    slot: i.slot,
    bgState: normalizeBgState(i.bgState as Partial<BgState> | undefined),
    color: hasOwn(i, 'color') ? normalizeHsl(i.color) : inherit,
  }
}

/**
 * Coerce one persisted rule, or null when it names no image AT ALL.
 *
 * Accepts BOTH image shapes: the 0.7 list (`images`), and the single
 * `slot`/`bgState` pair every earlier version wrote — the latter is lifted to a
 * one-entry list here rather than at a dozen call sites, which is what keeps the
 * rest of the codebase free of "old config" branches. Duplicate slots inside one
 * rule are dropped: two entries pointing at the same bytes would only make the
 * rotation look stuck.
 *
 * The rule's color is resolved FIRST and handed to every image entry, because it
 * is what an entry written before 0.7.1 inherits (`normalizeImage`). The rule keeps
 * it as well: it is not a default for its images at paint time any more, but it
 * is still what the rule paints once its last picture is gone.
 *
 * An EMPTY list is a legitimate rule, not a broken one: removing a rule's last
 * picture has to be expressible, and forcing an entry back in is what produced a
 * phantom blank image that took slot 1 and could never be deleted again (the next
 * upload landed at position 2 and the rule kept painting nothing). What such a
 * rule then does is `ruleCanPaint`'s business: with a color of its own it paints
 * the interface, with neither it is skipped by matching — which the card's own
 * hint says in so many words. Only a rule that names no image anywhere — no list,
 * no legacy slot, or a slot that could never be a filename — is dropped.
 */
export function normalizeRule(raw: unknown): BgRule | null {
  const r = (raw ?? {}) as Partial<BgRule> & { slot?: unknown; bgState?: unknown }
  const id = typeof r.id === 'string' && r.id !== '' ? r.id : null
  if (id === null) return null
  const color = normalizeHsl(r.color)
  const images: BgImage[] = []
  const seen = new Set<string>()
  const hadList = Array.isArray(r.images)
  if (hadList) {
    for (const entry of r.images as unknown[]) {
      const image = normalizeImage(entry, color)
      if (image === null || seen.has(image.slot)) continue
      seen.add(image.slot)
      images.push(image)
    }
  }
  const legacySlot = typeof r.slot === 'string' && SLOT_RE.test(r.slot) ? r.slot : null
  if (images.length === 0 && legacySlot !== null) {
    // Synthesized, not read: the pre-0.7 pair has no image entry of its own, so
    // the rule's color is what this image starts out with (the same lift as
    // above, for the shape that has no `color` key to be absent from).
    images.push({ slot: legacySlot, bgState: normalizeBgState(r.bgState as Partial<BgState> | undefined), color })
  }
  // Nothing usable anywhere: a pre-0.7 rule whose slot was empty or malformed.
  if (images.length === 0 && !hadList) return null
  const mode: BgMode = BG_MODES.includes(r.bgMode as BgMode) ? (r.bgMode as BgMode) : 'fit'
  return {
    id,
    images,
    match: typeof r.match === 'string' ? r.match : '',
    enabled: r.enabled !== false,
    color,
    bgMode: mode,
    wallpaperOpacity: clamp01(r.wallpaperOpacity, 1),
    blur: clamp(r.blur, 0, 60, 0),
    rotate: normalizeRotation(r.rotate),
  }
}

/**
 * Coerce one persisted holiday entry.
 *
 * `id`, `images` and every theme color (the rule's and each image's) come from
 * the DEFINITION, never from disk: a holiday's slot is the only thing tying it to
 * its bytes, and its theme color is a fixed part of what that holiday looks like —
 * so a stale or hand-edited value would either orphan the wallpaper, point the
 * holiday at a rule's image, or paint a festival in a color it does not have.
 * Everything else is sanitized exactly like a rule's field — except the image
 * list and the rotation, which stay the definition's own single image and stay
 * off, so a festival can never be swapped or cycled.
 */
export function normalizeHolidayRule(def: HolidayDef, raw: unknown): HolidayRule {
  const r = (raw ?? {}) as Partial<HolidayRule> & { bgState?: unknown }
  const base = defaultHolidayRule(def)
  return {
    ...base,
    // Only an explicit `false` disables the entry, so a config written before
    // this feature existed starts with every holiday usable.
    enabled: r.enabled !== false,
    bgMode: BG_MODES.includes(r.bgMode as BgMode) ? (r.bgMode as BgMode) : base.bgMode,
    wallpaperOpacity: clamp01(r.wallpaperOpacity, base.wallpaperOpacity),
    blur: clamp(r.blur, 0, 60, base.blur),
    // A holiday's own framing is still the user's: which part of the festival art
    // fills the screen is a taste question, and the editor allows it. Its COLOR is
    // not — it comes from `base` (the definition), like the slot beside it, so the
    // `hasOwn` lift in normalizeImage can never reach a holiday and a hand-edited
    // per-image color cannot repaint a festival.
    images: base.images.map(image => ({
      slot: image.slot,
      bgState: normalizeBgState((r.images?.[0]?.bgState ?? r.bgState) as Partial<BgState> | undefined),
      color: image.color,
    })),
  }
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
    // Only an explicit `false` turns the feature off — the same "absent means
    // on" rule the per-item switch uses, so a config predating the feature (or
    // one whose hidden panel was never opened) keeps working.
    enabled: r.enabled !== false,
    items: HOLIDAYS.map(def => normalizeHolidayRule(def, stored.get(def.id))),
  }
}

/** Coerce an unknown persisted value into a valid ThemeConfig, falling back per-field. */
export function normalizeConfig(raw: unknown): ThemeConfig {
  const r = (raw ?? {}) as Partial<ThemeConfig>
  const rules = Array.isArray(r.rules)
    ? r.rules.map(normalizeRule).filter((x): x is BgRule => x !== null)
    : []
  const ops = (r.opacities ?? {}) as Partial<PartOpacities>
  const bl = (r.blurs ?? {}) as Partial<PartBlurs>
  const blurs = {} as PartBlurs
  for (const k of PART_BLUR_KEYS) {
    blurs[k] = clamp(bl[k], 0, 60, DEFAULT_PART_BLURS[k])
  }
  const opacities = {} as PartOpacities
  for (const k of PART_OPACITY_KEYS) {
    opacities[k] = clamp01(ops[k], DEFAULT_PART_OPACITIES[k])
  }
  return {
    rules,
    opacities,
    blurs,
    transition: normalizeTransition(r.transition),
    settingsOpacity: clamp01(r.settingsOpacity, DEFAULT_SETTINGS_OPACITY),
    chatTextOpacity: clamp01(r.chatTextOpacity, DEFAULT_CHAT_TEXT_OPACITY),
    trajectoryOpacity: clamp01(r.trajectoryOpacity, DEFAULT_TRAJECTORY_OPACITY),
    // Anything but a real number means "not owned yet" — including the absent
    // field of a config written before this option existed.
    rightbarOpacity: typeof r.rightbarOpacity === 'number' && isFinite(r.rightbarOpacity)
      ? clamp01(r.rightbarOpacity, 1)
      : DEFAULT_RIGHTBAR_OPACITY,
    // Only an explicit `false` turns it off, so a config written before this
    // option existed starts with the helpful default.
    autoExtract: r.autoExtract !== false,
    holidays: normalizeHolidays(r.holidays),
  }
}
