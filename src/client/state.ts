import type { BgRule, BgState, BgMode, ThemeConfig, PartOpacities, PartBlurs } from './types'
// The persisted shape, its key lists, its defaults and its sanitizers all live in
// ../schema, shared verbatim with the node half — a field declared on one side
// only used to be silently dropped by the other side's sanitizer.
import {
  DEFAULT_BG_STATE, DEFAULT_CHAT_TEXT_OPACITY, DEFAULT_PART_BLURS, DEFAULT_PART_OPACITIES,
  DEFAULT_SETTINGS_OPACITY, DEFAULT_TRAJECTORY_OPACITY, PART_BLUR_KEYS, PART_OPACITY_KEYS,
  clamp, clamp01, freshThemeConfig, normalizeConfig, normalizeRule,
} from '../schema'

export { DEFAULT_BG_STATE, normalizeRule }

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

export function setActive(ruleId: string | null, matched: boolean): void {
  activeRuleId = ruleId
  activeMatched = matched
}
export function setModelLabel(label: string): void { modelLabel = label }

export function ruleById(id: string): BgRule | null {
  return cfg.rules.find(r => r.id === id) ?? null
}
export function activeRule(): BgRule | null {
  return activeRuleId === null ? null : ruleById(activeRuleId)
}

// ── Rule factories / allocation ────────────────────────────────────────────
export function newRule(id: string, slot: string): BgRule {
  return {
    id, slot, match: '', enabled: true, color: null,
    bgMode: 'fit', wallpaperOpacity: 1, blur: 0,
    bgState: { ...DEFAULT_BG_STATE },
  }
}

/** First free image slot (`m1`, `m2`, …). */
export function nextSlot(): string {
  const taken = new Set(cfg.rules.map(r => r.slot))
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

// ── Accessors used by the render layer (they follow the ACTIVE rule) ───────
export function rHasColor(): boolean { return activeRule()?.color !== null && activeRule() !== null }
export function rColor(): [number, number, number] { return activeRule()?.color ?? [220, 0.55, 0.25] }
export function rBgMode(): BgMode { return activeRule()?.bgMode ?? 'fit' }
export function rWop(): number { return clamp01(activeRule()?.wallpaperOpacity, 1) }
export function rBl(): number { return clamp(activeRule()?.blur, 0, 60, 0) }
export function rBgState(): BgState { return activeRule()?.bgState ?? DEFAULT_BG_STATE }
/** Paintable URL of the active rule's image, or null when it has none. */
export function rWp(): string | null {
  const rule = activeRule()
  return rule === null ? null : displayImageOf(rule.slot)
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
  // A rule that vanished (import/removal) must not stay active.
  if (activeRuleId !== null && !cfg.rules.some(r => r.id === activeRuleId)) {
    activeRuleId = null
    activeMatched = false
  }
}

export function resetConfig(): void {
  cfg = freshThemeConfig()
  clearImages()
  activeRuleId = null
  activeMatched = false
  modelLabel = ''
}
