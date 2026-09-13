import type { BgRule, BgState, BgMode, ThemeConfig, PartOpacities, PartBlurs } from './types'

export const DEFAULT_BG_STATE: BgState = { zoom: 1, x: 0, y: 0, iw: 0, ih: 0 }

const BG_MODES: BgMode[] = ['fit', 'fill', 'stretch', 'tile', 'center']
const PALETTE: Array<[number, number, number]> = [
  [356, 0.72, 0.55], [24, 0.78, 0.55], [44, 0.8, 0.55], [152, 0.62, 0.5],
  [174, 0.68, 0.48], [208, 0.72, 0.55], [252, 0.68, 0.6], [300, 0.64, 0.58],
]
export { PALETTE }

export const DEFAULT_CONFIG: ThemeConfig = {
  rules: [],
  opacities: { bg: 0.85, sidebar: 0.93, card: 1, input: 1 },
  blurs: { bg: 0, sidebar: 0, card: 0, settings: 0, chat: 0, trajectory: 0, rightbar: 0, input: 0 },
  settingsOpacity: 1,
  chatTextOpacity: 0,
  // 100% = untouched host surface; zero would blank the page by default.
  trajectoryOpacity: 1,
  // null = keep tracking the main background (the panel's host surface is the
  // very token that slider rewrites), so an upgrade changes nothing until the
  // user drags the file-preview card.
  rightbarOpacity: null,
}

function freshConfig(): ThemeConfig {
  return {
    rules: [],
    opacities: { ...DEFAULT_CONFIG.opacities },
    blurs: { ...DEFAULT_CONFIG.blurs },
    settingsOpacity: DEFAULT_CONFIG.settingsOpacity,
    chatTextOpacity: DEFAULT_CONFIG.chatTextOpacity,
    trajectoryOpacity: DEFAULT_CONFIG.trajectoryOpacity,
    rightbarOpacity: DEFAULT_CONFIG.rightbarOpacity,
  }
}

// In-memory mirror of the file-backed store; the UI reads and mutates this and
// it is synced to disk via the RPC layer.
export let cfg: ThemeConfig = freshConfig()

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
const clamp01 = (n: unknown, def: number): number =>
  typeof n === 'number' && isFinite(n) ? Math.min(1, Math.max(0, n)) : def
const clamp = (n: unknown, lo: number, hi: number, def: number): number =>
  typeof n === 'number' && isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def

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
  for (const k of ['bg', 'sidebar', 'card', 'input'] as const) {
    out[k] = clamp01(o[k], DEFAULT_CONFIG.opacities[k])
  }
  return out
}
export function rBlurs(): PartBlurs {
  const b = cfg.blurs ?? {}
  const out = {} as PartBlurs
  for (const k of ['bg', 'sidebar', 'card', 'settings', 'chat', 'trajectory', 'rightbar', 'input'] as const) {
    out[k] = clamp(b[k], 0, 60, DEFAULT_CONFIG.blurs[k])
  }
  return out
}
export function rSop(): number { return clamp01(cfg.settingsOpacity, DEFAULT_CONFIG.settingsOpacity) }
export function rChatTextOpacity(): number { return clamp01(cfg.chatTextOpacity, DEFAULT_CONFIG.chatTextOpacity) }
export function rTrajectoryOpacity(): number { return clamp01(cfg.trajectoryOpacity, DEFAULT_CONFIG.trajectoryOpacity) }
/** Own opacity of the file-preview panel; while unowned it IS the main background's. */
export function rRightbarOpacity(): number {
  const own = cfg.rightbarOpacity
  return typeof own === 'number' && isFinite(own) ? clamp01(own, 1) : rOps().bg
}

// ── Normalization ──────────────────────────────────────────────────────────
function adoptBgState(s: Partial<BgState>): BgState {
  return {
    zoom: clamp(s.zoom, 0.1, 10, 1),
    x: typeof s.x === 'number' && isFinite(s.x) ? s.x : 0,
    y: typeof s.y === 'number' && isFinite(s.y) ? s.y : 0,
    iw: typeof s.iw === 'number' && s.iw > 0 ? s.iw : 0,
    ih: typeof s.ih === 'number' && s.ih > 0 ? s.ih : 0,
  }
}

/** Coerce one persisted rule, or null when it lacks a usable id/slot. */
export function normalizeRule(raw: unknown): BgRule | null {
  const r = (raw ?? {}) as Partial<BgRule>
  const id = typeof r.id === 'string' && r.id !== '' ? r.id : null
  const slot = typeof r.slot === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(r.slot) ? r.slot : null
  if (id === null || slot === null) return null
  const c = r.color
  const color: [number, number, number] | null =
    Array.isArray(c) && c.length === 3 && c.every(n => typeof n === 'number' && isFinite(n))
      ? [clamp(c[0], 0, 360, 220), clamp(c[1], 0, 1, 0.55), clamp(c[2], 0, 1, 0.25)]
      : null
  return {
    id,
    slot,
    match: typeof r.match === 'string' ? r.match : '',
    enabled: r.enabled !== false,
    color,
    bgMode: BG_MODES.includes(r.bgMode as BgMode) ? (r.bgMode as BgMode) : 'fit',
    wallpaperOpacity: clamp01(r.wallpaperOpacity, 1),
    blur: clamp(r.blur, 0, 60, 0),
    bgState: adoptBgState((r.bgState ?? {}) as Partial<BgState>),
  }
}

/** Move a possibly-absent partial config into the shape the UI reads. */
export function adoptConfig(raw: unknown): void {
  const c = (raw ?? {}) as Partial<ThemeConfig>
  const rules = Array.isArray(c.rules)
    ? c.rules.map(normalizeRule).filter((r): r is BgRule => r !== null)
    : []
  const ops = (c.opacities ?? {}) as Partial<PartOpacities>
  const bl = (c.blurs ?? {}) as Partial<PartBlurs>
  const blurs = {} as PartBlurs
  for (const k of ['bg', 'sidebar', 'card', 'settings', 'chat', 'trajectory', 'rightbar', 'input'] as const) {
    blurs[k] = clamp(bl[k], 0, 60, DEFAULT_CONFIG.blurs[k])
  }
  cfg = {
    rules,
    opacities: {
      bg: clamp01(ops.bg, DEFAULT_CONFIG.opacities.bg),
      sidebar: clamp01(ops.sidebar, DEFAULT_CONFIG.opacities.sidebar),
      card: clamp01(ops.card, DEFAULT_CONFIG.opacities.card),
      input: clamp01(ops.input, DEFAULT_CONFIG.opacities.input),
    },
    blurs,
    settingsOpacity: clamp01(c.settingsOpacity, DEFAULT_CONFIG.settingsOpacity),
    chatTextOpacity: clamp01(c.chatTextOpacity, DEFAULT_CONFIG.chatTextOpacity),
    trajectoryOpacity: clamp01(c.trajectoryOpacity, DEFAULT_CONFIG.trajectoryOpacity),
    // Absent or non-numeric keeps "follow the main background" (see ThemeConfig).
    rightbarOpacity: typeof c.rightbarOpacity === 'number' && isFinite(c.rightbarOpacity)
      ? clamp01(c.rightbarOpacity, 1)
      : null,
  }
  // A rule that vanished (import/removal) must not stay active.
  if (activeRuleId !== null && !rules.some(r => r.id === activeRuleId)) {
    activeRuleId = null
    activeMatched = false
  }
}

export function resetConfig(): void {
  cfg = freshConfig()
  clearImages()
  activeRuleId = null
  activeMatched = false
  modelLabel = ''
}
