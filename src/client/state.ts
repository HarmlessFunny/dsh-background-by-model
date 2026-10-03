import type { BgImage, BgRule, BgState, BgMode, HolidayRule, ThemeConfig, PartOpacities, PartBlurs, TransitionConfig } from './types'
// The switch's decision (which effect, how long, whether it runs at all) is pure
// and lives in ./transition — it is checked without a browser by
// `scripts/transition-check.ts`, so the render layer only has to apply it.
import { resolveFadeMs } from './transition'
// The persisted shape, its key lists, its defaults and its sanitizers all live in
// ../schema, shared verbatim with the node half — a field declared on one side
// only used to be silently dropped by the other side's sanitizer.
import {
  DEFAULT_BG_STATE, DEFAULT_CHAT_TEXT_OPACITY, DEFAULT_PART_BLURS, DEFAULT_PART_OPACITIES,
  DEFAULT_SETTINGS_OPACITY, DEFAULT_TRAJECTORY_OPACITY, DEFAULT_TRANSITION, PART_BLUR_KEYS, PART_OPACITY_KEYS,
  clamp, clamp01, defaultRotation, freshThemeConfig, normalizeConfig, normalizeRotation, normalizeRule,
  ruleSlots,
} from '../schema'

export { DEFAULT_BG_STATE, normalizeRule, ruleSlots }

const PALETTE: Array<[number, number, number]> = [
  [356, 0.72, 0.55], [24, 0.78, 0.55], [44, 0.8, 0.55], [152, 0.62, 0.5],
  [174, 0.68, 0.48], [208, 0.72, 0.55], [252, 0.68, 0.6], [300, 0.64, 0.58],
]
export { PALETTE }

/** The defaults every accessor falls back to; the shape itself lives in ../schema. */
export const DEFAULT_CONFIG: ThemeConfig = freshThemeConfig()

// In-memory mirror of the file-backed store; the UI reads and mutates this and
// it is synced to disk via the RPC layer.
export let cfg: ThemeConfig = freshThemeConfig()

// ── Image cache (slot → data URL) ──────────────────────────────────────────
// Rule images are fetched lazily per slot; only the active rule's bytes are
// needed to paint, the rest are loaded when their card is expanded.
//
// Two URLs are kept per slot: the DATA URL is what gets persisted and embedded
// in an export, while the DISPLAY URL is an object URL derived from it. Painting
// goes through the display URL because `background-image: url(data:…)` is
// re-decoded on every assignment — a visible stall on every model switch for a
// multi-megabyte wallpaper — whereas a blob URL is served from the browser's
// memory cache after the first load.
const images = new Map<string, string>()
const displayUrls = new Map<string, string>()

function revokeDisplay(slot: string): void {
  const url = displayUrls.get(slot)
  if (url === undefined) return
  displayUrls.delete(slot)
  // Deferred on purpose: the wallpaper layer may still be painting this URL
  // while the replacement fades in over it, and revoking it mid-fade would blank
  // the wallpaper behind the incoming image for a frame.
  window.setTimeout(() => {
    try { URL.revokeObjectURL(url) } catch { /* not a live object URL (e.g. fallback) */ }
  }, 2000)
}

export function setImage(slot: string, url: string | null): void {
  revokeDisplay(slot)
  if (url === null) images.delete(slot)
  else images.set(slot, url)
}
/** Persisted data URL (RPC / export). Use `displayImageOf` to paint it. */
export function imageOf(slot: string): string | null { return images.get(slot) ?? null }

/** Paintable URL for one slot, created on first use and cached; falls back to
 *  the data URL when no object URL can be built. */
export function displayImageOf(slot: string): string | null {
  const cached = displayUrls.get(slot)
  if (cached !== undefined) return cached
  const data = images.get(slot)
  if (data === undefined) return null
  const made = toObjectUrl(data)
  if (made === null) return data
  displayUrls.set(slot, made)
  return made
}

function toObjectUrl(dataUrl: string): string | null {
  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null
    const comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    const meta = dataUrl.slice(0, comma)
    if (!/;base64$/i.test(meta)) return null
    const mime = meta.slice(5, -7) || 'image/jpeg'
    const bin = atob(dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return URL.createObjectURL(new Blob([bytes], { type: mime }))
  } catch {
    return null
  }
}

export function clearImages(): void {
  for (const slot of Array.from(displayUrls.keys())) revokeDisplay(slot)
  images.clear()
}

// ── Active rule (what the render layer follows) ────────────────────────────
export let activeRuleId: string | null = null
export let activeMatched = false
export let modelLabel = ''

/**
 * Which image of the ACTIVE rule is painted right now.
 *
 * Deliberately NOT persisted: a background that comes back on image 3 of 7 after
 * a reload, with no way to say why, is worse than one that starts at the first
 * image every time. Clamped to the rule's own length on every read, so an index
 * left over from a longer list can never point at nothing.
 */
let rotIndex = 0

export function setActive(ruleId: string | null, matched: boolean): void {
  // Every switch starts at the rule's FIRST image. Without this, a model switch
  // from a 7-image rule to a 2-image one would land on whatever index survived.
  if (ruleId !== activeRuleId) rotIndex = 0
  activeRuleId = ruleId
  activeMatched = matched
}
export function setModelLabel(label: string): void { modelLabel = label }

/** The image index the render layer is on, clamped into `rule`'s own range. */
export function imageIndexOf(rule: BgRule): number {
  if (rule.images.length === 0) return 0
  const i = Math.floor(rotIndex)
  return i >= 0 && i < rule.images.length ? i : 0
}

/** Point the active rule at another of its images (the rotation's one mutator). */
export function setRotIndex(i: number): void { rotIndex = Math.floor(i) }

/** The image the active rule is painting now, or null when it has none. */
export function activeImage(): BgImage | null {
  const rule = activeRule()
  if (rule === null) return null
  return rule.images[imageIndexOf(rule)] ?? null
}

/** Slot of the active rule's current image; '' when there is nothing to paint. */
export function activeSlot(): string { return activeImage()?.slot ?? '' }

/**
 * The theme color in force right now, or null for "follow the system theme".
 *
 * Two rungs, in this order and no others:
 *   1. the color of the IMAGE that is on screen, when the rule has one;
 *   2. the rule's own color, which is all an image-less rule has to paint with.
 *
 * There is deliberately no third rung where an image INHERITS its rule's color:
 * a rule's color is not a default for its pictures (see `BgRule.color`). If it
 * were, a rotation through a green picture, a red one and a system-themed one
 * could not be expressed at all — clearing a picture's color would only hand it
 * back to the rule's, and the clear button would look broken. Images that predate
 * per-image colors get the rule's color LIFTED onto them at read time instead
 * (`normalizeImage`), so nothing loses its theme on upgrade.
 *
 * The image is the one being PAINTED (`imageIndexOf`), not the one the panel has
 * selected — the panel's selection is an editing cursor and must not repaint the
 * interface while the user is fixing another picture's framing.
 */
export function activeColor(): [number, number, number] | null {
  const rule = activeRule()
  if (rule === null) return null
  if (rule.images.length === 0) return rule.color
  return activeImage()?.color ?? null
}

/**
 * One rule by id — from the USER's list first, then from the holiday overrides.
 *
 * Every render accessor (`rWp` / `rColor` / `rBgMode` / `rBgState` …) resolves
 * through here, so teaching this one function about holidays is what makes an
 * active holiday paint through the entire existing pipeline instead of needing a
 * parallel one.
 */
export function ruleById(id: string): BgRule | null {
  return cfg.rules.find(r => r.id === id)
    ?? cfg.holidays.items.find(r => r.id === id)
    ?? null
}
export function activeRule(): BgRule | null {
  return activeRuleId === null ? null : ruleById(activeRuleId)
}

/** One holiday override entry, or null for an unknown id. */
export function holidayById(id: string): HolidayRule | null {
  return cfg.holidays.items.find(r => r.id === id) ?? null
}

// ── Rule factories / allocation ────────────────────────────────────────────
/**
 * A fresh rule, holding NO image yet.
 *
 * It used to be born with an allocated slot and an empty entry, which is what put
 * a blank tile at position 1 of a new rule's strip — and, worse, stopped the
 * picture the user added next from being the first one (a rule paints its first
 * image). A rule with no pictures is a valid state: `ruleCanPaint` (./schema) skips
 * it — it has no image and no color yet — until either arrives, and the slot is
 * allocated when the first picture does.
 */
export function newRule(id: string): BgRule {
  return {
    id,
    images: [],
    match: '', enabled: true, color: null,
    bgMode: 'fit', wallpaperOpacity: 1, blur: 0,
    rotate: defaultRotation(),
  }
}

/** Every slot any rule owns — the user's rules and the holiday entries alike. */
export function takenSlots(): Set<string> {
  const taken = new Set<string>()
  for (const rule of cfg.rules) for (const slot of ruleSlots(rule)) taken.add(slot)
  for (const rule of cfg.holidays.items) for (const slot of ruleSlots(rule)) taken.add(slot)
  return taken
}

/**
 * First free image slot (`m1`, `m2`, …).
 *
 * Scans EVERY slot in the config, not just the primary one of each rule: with
 * several images per rule, "the slots this file already uses" is the only set
 * that can be safely handed out, and a collision here would silently point two
 * cards at the same bytes (and let one card's delete orphan the other).
 */
export function nextSlot(): string {
  const taken = takenSlots()
  for (let i = 1; i < 1000; i++) {
    const slot = `m${i}`
    if (!taken.has(slot)) return slot
  }
  return `m${Date.now()}`
}

/** Unique rule id (independent from the slot so removals never renumber). */
export function nextRuleId(): string {
  const taken = new Set(cfg.rules.map(r => r.id))
  for (let i = 1; i < 10000; i++) {
    const id = `r${i}`
    if (!taken.has(id)) return id
  }
  return `r${Date.now()}`
}

/** Patch one rule's rotation block, through the shared sanitizer so a live edit
 *  can never hold a value the next load would clamp differently. */
export function patchRotation(rule: BgRule, patch: Partial<BgRule['rotate']>): void {
  rule.rotate = normalizeRotation({ ...rule.rotate, ...patch })
}

/** Re-sanitize one rule in place, so what the UI holds equals what would persist. */
export function normalizeRuleInPlace(rule: BgRule): void {
  const normalized = normalizeRule(rule)
  if (normalized !== null) Object.assign(rule, normalized)
}

// ── Accessors used by the render layer (they follow the ACTIVE rule) ───────
export function rHasColor(): boolean { return activeColor() !== null }
export function rColor(): [number, number, number] { return activeColor() ?? [220, 0.55, 0.25] }
export function rBgMode(): BgMode { return activeRule()?.bgMode ?? 'fit' }
export function rWop(): number { return clamp01(activeRule()?.wallpaperOpacity, 1) }
export function rBl(): number { return clamp(activeRule()?.blur, 0, 60, 0) }
/** Framing of the CURRENT image (per image, see BgImage). */
export function rBgState(): BgState { return activeImage()?.bgState ?? DEFAULT_BG_STATE }
/** Rotation of the active rule; the shipped default when nothing is active. */
export function rRotation(): BgRule['rotate'] { return activeRule()?.rotate ?? defaultRotation() }
/**
 * The GLOBAL wallpaper-switch transition (effect, easing, where the duration
 * comes from).
 *
 * Read from the config on every apply rather than cached: the Config page edits
 * it while a wallpaper is on screen, and the next switch has to use what the
 * user just chose.
 */
export function rTransition(): TransitionConfig { return cfg.transition ?? DEFAULT_TRANSITION }
/**
 * Duration the next switch runs for, in ms (`0` = a hard cut).
 *
 * The two rungs are `resolveFadeMs`'s business (./transition): the global effect
 * can veto the animation outright, the global duration can override every rule,
 * and otherwise the rule's own `rotate.fadeMs` decides — which is what keeps this
 * setting from changing anything for a config that predates it.
 */
export function rFadeMs(): number { return resolveFadeMs(rTransition(), rRotation().fadeMs) }
/** Paintable URL of the active rule's CURRENT image, or null when it has none. */
export function rWp(): string | null {
  const slot = activeSlot()
  return slot === '' ? null : displayImageOf(slot)
}
export function rOps(): PartOpacities {
  const o = cfg.opacities ?? {}
  const out = {} as PartOpacities
  for (const k of PART_OPACITY_KEYS) {
    out[k] = clamp01(o[k], DEFAULT_PART_OPACITIES[k])
  }
  return out
}
export function rBlurs(): PartBlurs {
  const b = cfg.blurs ?? {}
  const out = {} as PartBlurs
  for (const k of PART_BLUR_KEYS) {
    out[k] = clamp(b[k], 0, 60, DEFAULT_PART_BLURS[k])
  }
  return out
}
export function rSop(): number { return clamp01(cfg.settingsOpacity, DEFAULT_SETTINGS_OPACITY) }
export function rChatTextOpacity(): number { return clamp01(cfg.chatTextOpacity, DEFAULT_CHAT_TEXT_OPACITY) }
export function rTrajectoryOpacity(): number { return clamp01(cfg.trajectoryOpacity, DEFAULT_TRAJECTORY_OPACITY) }
/** Own opacity of the file-preview panel; while unowned it IS the main background's. */
export function rRightbarOpacity(): number {
  const own = cfg.rightbarOpacity
  return typeof own === 'number' && isFinite(own) ? clamp01(own, 1) : rOps().bg
}

// ── Normalization ──────────────────────────────────────────────────────────
// The sanitizers are the shared ones from ../schema (the same code the node half
// runs before writing to disk), so what the UI shows and what is persisted can
// never be clamped differently.

/** Move a possibly-absent partial config into the shape the UI reads. */
export function adoptConfig(raw: unknown): void {
  cfg = normalizeConfig(raw)
  // A rule that vanished (import/removal) must not stay active — and a holiday
  // that is still in `cfg.holidays.items` legitimately stays active, which is
  // why this asks `ruleById` instead of scanning `cfg.rules` directly.
  if (activeRuleId !== null && ruleById(activeRuleId) === null) {
    activeRuleId = null
    activeMatched = false
  }
  // The list this index belonged to is gone (an import can replace it wholesale),
  // so the first image is the only index that is certainly valid.
  rotIndex = 0
}

export function resetConfig(): void {
  cfg = freshThemeConfig()
  clearImages()
  activeRuleId = null
  activeMatched = false
  modelLabel = ''
  rotIndex = 0
}
