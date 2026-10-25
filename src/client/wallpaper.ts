import { rWp, rBgState, rBl, rWop, rBrightness, rOps, rSop, rColor, rHasColor, rBgMode, rChatTextOpacity, rTrajectoryOpacity, rRightbarOpacity, rPageOpacity, rFadeMs, rTransition } from './state'
import type { PartOpacities } from './types'
// The switch's decision is pure and checked without a browser
// (scripts/transition-check.ts); this file only applies it to the two layers.
import { transitionPlan } from './transition'
import type { LayerStyle } from './transition'
import { paletteFadeAllowed, paletteFadeCss, paletteFadeInline } from './palette-fade'
import type { PaletteFadeScope } from './palette-fade'
import { genTokens, toRgba } from './utils/color'
import { markOwnSheet } from './components/ui.css'

/**
 * `data-ds-dark-theme` value the plugin writes while it forces its own dark
 * palette. The host treats the attribute as a boolean (`toggleAttribute`), so a
 * plugin-specific value still matches every `body[data-ds-dark-theme]` rule
 * while staying distinguishable from the host's own write — which is what lets
 * `releaseOwnScheme` hand the flag back without clobbering the host's scheme.
 */
export const OWN_SCHEME = 'dsh-background-by-model'
const DARK_ATTR = 'data-ds-dark-theme'

/**
 * Marker on <html> while the plugin owns a palette. The dialog/trajectory rules
 * below redirect NO-fallback tokens (`--dsw-alias-bg-layer-*`) to plugin-owned
 * variables, so they may only match while those variables are actually written:
 * without the gate a palette-less state would leave them reading a
 * guaranteed-invalid value (transparent panels) instead of handing the surface
 * back to the host untouched.
 */
const THEMED_ATTR = 'data-dab-themed'

let wpEl: HTMLDivElement | null = null
let appliedTokenNames: string[] = []
let tokenStyleEl: HTMLStyleElement | null = null

function ensureTokenStyle(): HTMLStyleElement {
  if (tokenStyleEl?.isConnected) return tokenStyleEl
  tokenStyleEl = document.createElement('style')
  tokenStyleEl.dataset.plugin = 'dsh-background-by-model-tokens'
  markOwnSheet(tokenStyleEl)
  document.head.appendChild(tokenStyleEl)
  return tokenStyleEl
}

function clearCustomTokens(): void {
  if (tokenStyleEl) tokenStyleEl.textContent = ''
  for (const name of appliedTokenNames) document.body.style.removeProperty(name)
  appliedTokenNames = []
  // Whatever follows must repaint from scratch: the fingerprints that guard the
  // token rule and the part opacities describe a stylesheet that no longer exists.
  baseTokenKey = ''
  lastBgKey = ''
  // The themed gate goes with the rule it gates. Leaving it on <html> after the
  // variables it makes reachable are gone is exactly the declared-but-unset
  // state THEMED_ATTR exists to prevent (transparent panels), and a teardown that
  // only cleared this sheet used to leave it behind.
  document.documentElement.removeAttribute(THEMED_ATTR)
}

/** Drop every surface the plugin owns: the variables the scoped
 *  dialog/trajectory rules read, and the inline backgrounds written onto the
 *  AppFrame columns. Used when no palette is available and at teardown — without
 *  it the last color's surfaces outlive the color that produced them. */
function clearOwnedSurfaces(): void {
  discoverParts()
  const root = document.documentElement
  for (const name of OWNED_SURFACE_VARS) root.style.removeProperty(name)
  for (const el of [frameEl, centerEl, detailsEl]) el?.style.removeProperty('background')
}

// Solid surface tokens grouped by which interface-opacity slider owns them.
// Every member is re-emitted with per-part alpha so surfaces over the wallpaper
// (composer input, elevated buttons, menu panels) can go translucent — not just
// the layered bg/sidebar tokens. The two menu fills are owned by the card slider
// and must always travel together: --dsw-specific-menu is what overlays paint
// (dropdowns, slash-trigger menu, popovers around the dialog) and
// --dsw-menu-surface-fill is what the shared MenuSurface material paints, which
// dsh 0.1.7 aliases the former to. Re-emitting only one of them leaves a menu
// panel on one fill and its sticky group headings on the other — the solid band
// across the model selector's provider rows. The Cordis panel shares
// --dsw-specific-menu but is re-scoped to the input slider via INPUT_BLUR_RULE.
const OPACITY_TOKEN_GROUPS: Array<{ part: keyof PartOpacities; names: string[] }> = [
  { part: 'bg', names: ['--dsw-alias-bg-base'] },
  { part: 'sidebar', names: ['--dsw-specific-sidebar-fill'] },
  { part: 'card', names: ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3', '--dsw-specific-menu', '--dsw-menu-surface-fill'] },
  // The code block: the plate the syntax sits on AND the banner above it. One
  // slider for both, because a card's header is painted from the PLATE token
  // (`--dsl-code-block-background`) rather than from the banner's — two separate
  // alphas would put a solid strip on a see-through box.
  { part: 'code', names: ['--dsw-alias-markdown-code-block', '--dsw-alias-markdown-code-block-banner'] },
  { part: 'input', names: ['--dsw-specific-input-major'] },
]

// Plugin-owned variables the opacity-bearing tokens read from. They live as
// inline custom props on <html>, so a slider drag rewrites only those few values
// instead of re-parsing/re-matching the whole body token rule on every tick —
// the difference is critical when a large wallpaper sits under the interface.
const OPACITY_VARS: Record<string, string> = {
  '--dsw-alias-bg-base': '--dsh-any-op-bg',
  '--dsw-specific-sidebar-fill': '--dsh-any-op-sidebar',
  '--dsw-alias-bg-layer-1': '--dsh-any-op-card-1',
  '--dsw-alias-bg-layer-2': '--dsh-any-op-card-2',
  '--dsw-alias-bg-layer-3': '--dsh-any-op-card-3',
  '--dsw-specific-input-major': '--dsh-any-op-input',
  // The MenuSurface material under a menu panel and the overlay fill its sticky
  // headings paint are the same value on a 0.1.7 host, so they read the same
  // plugin-owned variable — one slider, one alpha, no seam between them.
  '--dsw-specific-menu': '--dsh-any-op-menu',
  '--dsw-menu-surface-fill': '--dsh-any-op-menu',
  // The two code-block surfaces cannot share ONE variable: the writer below sets
  // one plugin-owned variable per token NAME, so a shared name would leave the
  // second one (the banner) painting both — a plate in the banner's tint. Two
  // variables, both fed by the same `code` slider, so the alphas still agree.
  '--dsw-alias-markdown-code-block': '--dsh-any-op-code',
  '--dsw-alias-markdown-code-block-banner': '--dsh-any-op-code-banner',
}

// Fingerprint of the non-alpha token base (palette source + color pick +
// scheme verdict). The static body rule is only rebuilt when it changes; a drag
// never touches it.
let baseTokenKey = ''

// ── Palette source ────────────────────────────────────────────────────────────
// Every surface is painted from ONE palette at a time:
//   * a rule WITH a color    → the plugin's generated token set;
//   * a rule WITHOUT a color → the host's own alias tokens, read back out of the
//     live cascade, so "follow the system theme" keeps the wallpaper showing and
//     the Interface-page sliders working instead of dropping every surface back
//     to the host as an opaque plate.
// Both feed the same writers (the body token rule, the per-part alpha variables,
// the dialog/trajectory scoping), so there is never a state where one surface is
// painted from one palette and another from the other one.
const HOST_SURFACE_TOKENS: string[] = Object.keys(OPACITY_VARS)

/** Plugin-owned variables the scoped dialog/trajectory rules read. */
const SETTINGS_SURFACE_VARS = [
  '--dsh-any-bg-settings-surface',
  '--dsh-any-bg-settings-layer-1',
  '--dsh-any-bg-settings-layer-2',
  '--dsh-any-bg-settings-layer-3',
]
const TRAJECTORY_SURFACE_VARS = [
  '--dsh-any-traj-layer-1',
  '--dsh-any-traj-layer-2',
  '--dsh-any-traj-layer-3',
]
const OWNED_SURFACE_VARS = [...SETTINGS_SURFACE_VARS, ...TRAJECTORY_SURFACE_VARS]

interface Palette {
  /** True while the palette is the plugin's own (the rule carries a color). */
  own: boolean
  tokens: Record<string, string>
}

let hostProbe: HTMLElement | null = null

/** Resolve any color the engine understands (hex, rgb()/hsl(), a var() chain,
 *  color-mix(), …) to its USED value: only a used color can be re-emitted with
 *  an alpha. Returns null when the engine rejects the value. */
function resolveCssColor(raw: string): string | null {
  const value = raw.trim()
  if (value === '') return null
  if (hostProbe === null) {
    hostProbe = document.createElement('span')
    hostProbe.setAttribute('aria-hidden', 'true')
    hostProbe.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none'
  }
  if (!hostProbe.isConnected) document.body.appendChild(hostProbe)
  // Reset first: a rejected value must not be mistaken for the previous one.
  hostProbe.style.color = ''
  hostProbe.style.color = value
  if (hostProbe.style.color === '') return null
  return getComputedStyle(hostProbe).color || null
}

/** Read the host's own surface colors out of the live cascade. */
function readHostPalette(): Palette | null {
  const sheet = tokenStyleEl
  // Our token rule re-emits the very names being asked for, so it has to be
  // muted while reading or the readback would return the palette we are leaving.
  // No paint can happen in between: the flag is set and cleared in one task.
  const muted = sheet !== null && sheet.isConnected && !sheet.disabled
  if (muted) sheet!.disabled = true
  try {
    const computed = getComputedStyle(document.body)
    const tokens: Record<string, string> = {}
    for (const name of HOST_SURFACE_TOKENS) {
      const used = resolveCssColor(computed.getPropertyValue(name))
      if (used !== null) tokens[name] = used
    }
    // Without a base surface there is no palette to paint from: the caller hands
    // every surface back to the host instead.
    return tokens['--dsw-alias-bg-base'] === undefined ? null : { own: false, tokens }
  } finally {
    if (muted) sheet!.disabled = false
  }
}

// The readback costs a style recalculation and applyWp runs on every viewport
// frame, so the last result is reused briefly. The theme-reset watch drops it on
// any scheme change; the TTL covers a host palette rewritten without one.
let hostPaletteCache: { at: number; palette: Palette | null } | null = null
const HOST_PALETTE_TTL_MS = 1000

export function invalidateHostPalette(): void { hostPaletteCache = null }

function hostPalette(): Palette | null {
  const now = Date.now()
  if (hostPaletteCache !== null && now - hostPaletteCache.at < HOST_PALETTE_TTL_MS) return hostPaletteCache.palette
  const read = readHostPalette()
  hostPaletteCache = { at: now, palette: read }
  return read
}

/** The palette every surface is currently painted from. */
function palette(): Palette | null {
  if (!rHasColor()) return hostPalette()
  const [h, s, l] = rColor()
  return { own: true, tokens: genTokens(h, s, l).tokens }
}

/** A resolved color with a new alpha. The plugin's own tokens are `hsl()` and
 *  the host's alias tokens resolve to hex, both of which `toRgba` parses; a host
 *  publishing an already-composited value (`color(…)`, `oklab(…)`, …) cannot be
 *  parsed there, and emitting it unchanged would paint an OPAQUE surface — the
 *  one outcome the transparent-surface design must never fall back to. Those go
 *  through `color-mix` instead. */
function withAlpha(color: string, alpha: number): string {
  const converted = toRgba(color, alpha)
  if (/^(rgb|hsl)a?\(/i.test(converted)) return converted
  const pct = Math.round(Math.max(0, Math.min(1, alpha)) * 100)
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}

/**
 * The color scheme the HOST's own preference resolves to, pushed in by the
 * browser half (the theme service knows it, custom themes included). `null`
 * means "unknown", which is the only case where the plugin falls back to the
 * preference the host's boot script published and to the OS query itself.
 */
let hostSchemeDark: boolean | null = null

export function setHostScheme(dark: boolean | null): void { hostSchemeDark = dark }

function resolveHostDark(): boolean {
  if (typeof hostSchemeDark === 'boolean') return hostSchemeDark
  // The host's boot script publishes the preference it resolved
  // (`html[data-ds-theme-source]`) before any plugin runs.
  const source = document.documentElement.dataset.dsThemeSource
  if (source === 'dark') return true
  if (source === 'light') return false
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches } catch { return false }
}

/**
 * A scheme verdict for the third caller: "whoever is in force". Reads the host
 * preference the browser half published, falling back to the host's own boot
 * flag and then the OS query — the same two rungs `resolveHostDark` uses.
 */
export function hostSchemeIsDark(): boolean {
  return resolveHostDark()
}

/** Whether this plugin is the one holding the scheme flag right now. */
function ownsSchemeFlag(): boolean {
  return document.body.getAttribute(DARK_ATTR) === OWN_SCHEME
}

/**
 * Keep `data-ds-dark-theme` in the HOST's own form (a boolean attribute) while
 * the plugin does not own a palette.
 *
 * The plugin overwrites that flag whenever it owns a palette — including
 * REMOVING it to force a light one — and the host only re-projects the flag on a
 * theme change. So a flag the plugin dropped can stick: the host keeps painting
 * its light palette on a dark system, the readback then hands those light
 * surfaces back to the plugin, and the interface stays light until some
 * unrelated event happens to re-run an apply. Restoring the flag from the
 * resolved scheme closes that hole.
 *
 * It must not PUSH a host scheme either, though, and that is the other half of
 * the same hole: the verdict it works from is the plugin's own last reading,
 * which is already stale by the time the host has dropped the flag without
 * telling anyone. Writing the stale verdict turns a host that just went dark
 * back to light and sticks it there — the flag now "matches", so every later
 * pass skips it. So only the OWNER of the flag is corrected: the plugin's own
 * value is replaced, and a flag nobody has claimed is left to the host.
 *
 * The write is skipped when it already matches, so this never churns the theme
 * observer.
 */
export function adoptHostScheme(): void {
  if (!ownsSchemeFlag()) return
  if (resolveHostDark()) document.body.setAttribute(DARK_ATTR, '')
  else document.body.removeAttribute(DARK_ATTR)
}

/** Re-read the host palette and repaint from it when it moved. Called while a
 *  color-less rule is active (the host can re-project its palette at any time,
 *  with no event of ours to hang a repaint on). */
export function refreshSystemTheme(): void {
  adoptHostScheme()
  invalidateHostPalette()
  applyCustomTokens(rOps())
}

// Coalesce slider-driven token updates to one rAF: a single drag fires several
// input events per frame, and every full re-apply repaints expensive regions
// over a large wallpaper. Batching keeps at most one update per frame.
let pendingOps: PartOpacities | null = null
let tokensRaf: number | null = null
/** When the pending frame was armed, so a frame that never ran can be spotted. */
let tokensArmedAt = 0
/** A frame outstanding for longer than this is treated as lost (see below). */
const STALE_TOKENS_RAF_MS = 1_000

/** The fingerprint of the palette + colour in force; see `applyCustomTokensNow`. */
function paletteKey(src: Palette, color: [number, number, number]): string {
  return src.own
    ? `own:${color[0]}|${color[1]}|${color[2]}`
    : `host:${HOST_SURFACE_TOKENS.map(n => src.tokens[n] ?? '').join('|')}`
}

/**
 * Re-emit the interface palette, coalescing a slider drag into one frame.
 *
 * A PALETTE change is never coalesced, and that distinction is the whole point:
 * this call is the only writer of the palette's INK. Every other surface has a
 * second, synchronous writer (the dialog's layer tokens come from
 * `applySettingsOverrides`, the columns' backgrounds from the view cards, the
 * `--dsh-any-op-*` alphas from the same callback as the ink), so a palette update
 * that is deferred and then lost leaves the surfaces on the NEW colour and the
 * ink on the previous one — a dark palette with dark text, which reads as
 * "the theme colour did nothing" and only a reload clears it.
 *
 * Measured in the field: a window that is not rendering can swallow the frame
 * (the id stays armed, so every later update parks behind it), and a failure
 * inside the write used to be swallowed by an empty `catch`. Both are handled
 * here — a changed palette goes through synchronously, a stale frame is dropped
 * instead of blocking forever, and the failure is logged (see `applyCustomTokensNow`).
 */
export function applyCustomTokens(ops: PartOpacities): boolean {
  pendingOps = ops
  const src = palette()
  // Synchronous whenever the palette itself moved: that is a model switch, a
  // rotation step, a rule edit or an image colour, i.e. exactly the cases where
  // ink and surfaces must land together (`applyWp` already runs synchronously).
  // The return value is that same fact shortened by one question — may this
  // change fade? — for the callers that paint their own surfaces inline and have
  // to decide whether to animate them (`paletteFadeAllowed`).
  if (src !== null && paletteKey(src, rColor()) !== baseTokenKey) { flushTokens(); return lastFadeable }
  if (tokensRaf !== null) {
    if (Date.now() - tokensArmedAt <= STALE_TOKENS_RAF_MS) return false
    // The frame this id belongs to is never going to run: cancelling it lets the
    // update through now instead of parking every later one behind a dead id.
    window.cancelAnimationFrame(tokensRaf)
    tokensRaf = null
  }
  tokensArmedAt = Date.now()
  tokensRaf = requestAnimationFrame(() => {
    tokensRaf = null
    flushTokens()
  })
  return false
}

/** Run the pending token write now (one funnel, so no path can skip it). */
function flushTokens(): void {
  if (pendingOps === null) return
  const o = pendingOps
  pendingOps = null
  applyCustomTokensNow(o)
}

// Only the main-bg slider retints the center/details columns; keys on
// baseTokenKey + ops.bg so a sidebar/card/input drag never rewrites them.
let lastBgKey = ''
/**
 * Whether the palette write in flight may fade — the answer `applyCustomTokens`
 * hands back to the callers that paint their own surfaces inline.
 *
 * It has to travel out of `applyCustomTokensNow` (which is where the decision is
 * made) because those callers run AFTER it in the same task, and re-deciding
 * there would be a second opinion on the same question.
 */
let lastFadeable = false

function applyCustomTokensNow(ops: PartOpacities): void {
  lastFadeable = false
  const src = palette()
  if (src === null) {
    // Nothing to paint from: drop the token rule too, then hand every
    // plugin-owned surface — and the scheme flag — back to the host rather than
    // leaving the previous palette's values in place.
    clearCustomTokens()
    clearOwnedSurfaces()
    adoptHostScheme()
    return
  }
  const { own, tokens } = src
  const [h, s, l] = rColor()
  try {
    const forceDark = own && l < 0.55
    // The fingerprint carries the source, so switching between the two palettes
    // always rewrites the rule, even when the numbers happen to coincide.
    const key = paletteKey(src, [h, s, l])
    const paletteChanged = key !== baseTokenKey
    // Which palette family is in force: the plugin's own verdict when it owns the
    // palette, the host's scheme when the rule follows the system theme.
    const scheme: 'light' | 'dark' = own ? (forceDark ? 'dark' : 'light') : (resolveHostDark() ? 'dark' : 'light')
    // A colour change may fade only while the SCHEME stays put — see
    // `paletteFadeAllowed`. A light↔dark flip is a different palette, not a tint
    // of the same one, and the wallpaper's own animation is unaffected either way.
    const fadeable = paletteChanged && paletteFadeAllowed(paletteScheme, scheme)
    lastFadeable = fadeable
    // BEFORE the tokens are written: whether a colour change may fade at all, and
    // for how long, is decided here for both halves of a switch. A palette change
    // arms the transition; every other pass (a slider moving the alphas) DISARMS
    // it in the same task, so a drag stays glued to the pointer. The transition
    // list is this palette's OWN token set — the exact keys the block below is
    // about to write — so no host-owned surface is ever animated by us.
    applyPaletteFade(fadeable, Object.keys(tokens))
    if (paletteChanged) {
      paletteScheme = scheme
      // Drive the base-palette switch with a plugin-specific value so the
      // gradient rule never matches a host dark-mode flag; color-scheme makes
      // native controls (select popups) follow the forced palette. Both ride the
      // stylesheet (not inline styles) so the host presenter clearing body
      // inline styles on boot can't drop them, and the !important rule survives
      // that clearing too.
      if (own) {
        if (forceDark) document.body.setAttribute(DARK_ATTR, OWN_SCHEME)
        else document.body.removeAttribute(DARK_ATTR)
      } else {
        adoptHostScheme()
      }
      const decls: string[] = own ? [`color-scheme:${forceDark ? 'dark' : 'light'}`] : []
      for (const [name, value] of Object.entries(tokens)) {
        const opVar = OPACITY_VARS[name]
        decls.push(`${name}:${opVar !== undefined ? `var(${opVar})` : value}!important`)
      }
      // `:root` as well as `body`, and not for symmetry: the host declares a few
      // of its OWN variables on `:root` as `var()` references into our tokens, and
      // a custom property is substituted where it is DECLARED. So
      // `:root{--shiki-background:var(--dsw-alias-markdown-code-block)}` is computed
      // ONCE, on <html>, out of whatever the root element had at that moment — and
      // with a body-only rule that was nothing but the registration's
      // `initial-value`, i.e. the host's own colour as read while our sheet was
      // muted. The code plate therefore stayed on the host's DARK value (#1b1b1c)
      // through every light palette while the host's shiki INK flipped with the
      // scheme, which is exactly the "代码块背景有点问题" report: dark ink, dark
      // plate, and a plate that ignored the palette (and could never fade).
      ensureTokenStyle().textContent = `:root,body{${decls.join(';')}}`
      if (own) {
        // Drop inline tokens left by earlier builds so the stylesheet is the single source of truth.
        for (const name of appliedTokenNames) document.body.style.removeProperty(name)
        appliedTokenNames = Object.keys(tokens)
      }
      // Recorded only once the rule is in: a write that threw must be retried by
      // the next apply instead of being skipped by this fingerprint forever.
      baseTokenKey = key
    }
    // Cheap per-drag update: only the surface alpha vars move on <html>.
    const root = document.documentElement
    for (const g of OPACITY_TOKEN_GROUPS) {
      for (const name of g.names) {
        root.style.setProperty(OPACITY_VARS[name], withAlpha(tokens[name] ?? '#000', ops[g.part]))
      }
    }
    // The Cordis panel keeps its own input-slider alpha (see INPUT_STYLE_RULE).
    root.style.setProperty('--dsh-any-op-menu-cordis', withAlpha(tokens['--dsw-specific-menu'] ?? '#000', ops.input))
    const bgKey = `${baseTokenKey}|${ops.bg}`
    if (bgKey !== lastBgKey) { lastBgKey = bgKey; applyPartOpacities(ops, fadeable) }
  } catch (e) {
    // Never silent. This block is the ONLY writer of the palette's ink, and a
    // failure swallowed here leaves the interface on the previous palette's text
    // colour while every surface follows the new one — a dark panel with dark
    // text that no amount of switching models repairs and only a reload clears.
    // It used to be `catch {}`, which is why that state was invisible in the log.
    console.warn('dsh-background-by-model: could not re-emit the palette tokens', e)
  }
}

// ── Settings panel opacity ─────────────────────────────────────────────────────
// The settings modal is the only aria-modal dialog identifying itself with
// aria-labelledby, so this selector scopes translucency to the settings panel.

const SETTINGS_PANEL_SEL = '[role="dialog"][aria-modal="true"][aria-labelledby]'
export const SETTINGS_STYLE_RULE =
  `${SETTINGS_PANEL_SEL}{` +
  `background:var(--dsh-any-bg-settings-surface,var(--dsw-alias-bg-layer-2));` +
  `}` +
  // The dialog's layer tokens follow the settings slider only. Gated on THEMED_ATTR:
  // no host fallback, so they may only be live while the variables they read are
  // written.
  `html[${THEMED_ATTR}] ${SETTINGS_PANEL_SEL}{` +
  `--dsw-alias-bg-layer-1:var(--dsh-any-bg-settings-layer-1);` +
  `--dsw-alias-bg-layer-2:var(--dsh-any-bg-settings-layer-2);` +
  `--dsw-alias-bg-layer-3:var(--dsh-any-bg-settings-layer-3)}`

// Input/control surfaces. The Cordis panel shares --dsw-specific-menu with the
// dialog's option boxes but stays owned by the input slider. The input slider must
// NOT drive the button-fill tokens: the panel's own controls are painted from them.
const CORDIS_PANEL_SEL = '[data-cordis-panel]'
export const INPUT_STYLE_RULE =
  `${CORDIS_PANEL_SEL}{--dsw-specific-menu:var(--dsh-any-op-menu-cordis)!important}`

// Placeholder text: the weak caption token plus italic, so an empty box is never
// mistaken for typed content.
export const PLACEHOLDER_RULE =
  '[data-composer-card] textarea::placeholder,' +
  '[data-composer-card] input::placeholder,' +
  '[data-composer-card] [contenteditable]::placeholder,' +
  '[data-cordis-panel] input::placeholder,' +
  '[data-cordis-panel] textarea::placeholder,' +
  '.dab-input::placeholder,' +
  '.dab-input textarea::placeholder,' +
  '.dab-input input::placeholder' +
  '{color:var(--dsh-any-placeholder,var(--dsw-alias-label-caption,#8a8f98))!important;font-style:italic;opacity:.85}'

export function applySettingsOverrides(op: number): void {
  // Follows whichever palette is in force. A token the palette does not carry has
  // its variable REMOVED — keeping the previous colour is the stale surface bug.
  const tokens = palette()?.tokens ?? {}
  const root = document.documentElement
  const write = (name: string, token: string): void => {
    const value = tokens[token]
    if (value === undefined) root.style.removeProperty(name)
    else root.style.setProperty(name, withAlpha(value, op))
  }
  // Always written, 100% included: removing them would let SETTINGS_STYLE_RULE fall
  // back to the body layer tokens, which carry the card alpha.
  write('--dsh-any-bg-settings-surface', '--dsw-alias-bg-layer-2')
  // Dialog-scoped layers consumed by SETTINGS_STYLE_RULE.
  write('--dsh-any-bg-settings-layer-1', '--dsw-alias-bg-layer-1')
  write('--dsh-any-bg-settings-layer-2', '--dsw-alias-bg-layer-2')
  write('--dsh-any-bg-settings-layer-3', '--dsw-alias-bg-layer-3')
}

// ── Trajectory view opacity ──────────────────────────────────────────────
// The view's own panels fully cover the root, so retinting the root alone is
// invisible: the root's layer tokens are re-scoped to plugin-owned variables.
export const TRAJECTORY_STYLE_RULE =
  // Gated like the settings re-scope: see THEMED_ATTR.
  `html[${THEMED_ATTR}] [data-conversation-composer-overlay]{` +
  // No fallback inside var(): a self-referential fallback would be a cycle.
  '--dsw-alias-bg-layer-1:var(--dsh-any-traj-layer-1);' +
  '--dsw-alias-bg-layer-2:var(--dsh-any-traj-layer-2);' +
  '--dsw-alias-bg-layer-3:var(--dsh-any-traj-layer-3)}'

export function applyTrajectoryOverrides(op: number): void {
  // Written explicitly so the view stays owned at 100%; removed per missing token.
  const tokens = palette()?.tokens ?? {}
  const root = document.documentElement
  const write = (name: string, token: string): void => {
    const value = tokens[token]
    if (value === undefined) root.style.removeProperty(name)
    else root.style.setProperty(name, withAlpha(value, op))
  }
  write('--dsh-any-traj-layer-1', '--dsw-alias-bg-layer-1')
  write('--dsh-any-traj-layer-2', '--dsw-alias-bg-layer-2')
  write('--dsh-any-traj-layer-3', '--dsw-alias-bg-layer-3')
}

// ── Palette fade (a theme-colour change that interpolates) ────────────────
// Writing the token block is what changes every surface, and by default that
// change is instantaneous: the wallpaper cross-fades while the interface jumps.
// The fade is a REGISTRATION problem, not a declaration one — an unregistered
// custom property cannot interpolate — so the palette's own tokens are registered
// as `<color>`s and the elements that (re)declare them carry a transition for the
// same duration the switch uses. See ./palette-fade for what is registered and why
// a token the host does not publish is left alone.
const TRAJECTORY_ROOT_SEL = '[data-conversation-composer-overlay]'

/** Elements whose own token declarations change when the palette does: the body
 *  (which everything else inherits), and the two surfaces that RE-declare the
 *  layer tokens instead of inheriting them.
 *
 *  The three layer tokens are also the ONLY ones those two surfaces may carry a
 *  transition for. Handing them the full palette is not "more of the same": a
 *  transition on an INHERITED token makes the element interpolate towards the
 *  stale value it saw when the fade was armed, and everything under it rides that
 *  lagged copy — the settings dialog's own controls (the holiday switch fill, the
 *  active chips) then hold the previous theme colour for the whole switch and jump
 *  at the end. See ./palette-fade for the measurement. */
const FADE_LAYER_TOKENS: readonly string[] = [
  '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3',
]

/** The token names a palette CAN carry — deliberately the widest branch.
 *
 *  `genTokens(220, 0.55, 0.25)` resolves to the DARK branch (l = 0.25), and that
 *  branch is the superset: the light one emits roughly thirty fewer aliases (no
 *  bubble, selector, tip, tooltip/toast, toolbar and markdown state tokens). This
 *  list is therefore what the REGISTRATIONS are emitted for — a later light→dark
 *  change has to find the dark names already registered — and NOT the transition
 *  list, which is narrowed per apply to the palette in force (`written` in
 *  ./palette-fade). Assuming the two branches carry the same set is exactly the
 *  mistake that let the fade animate host-owned tokens: a name only the dark
 *  branch declares is, under a light palette, the HOST's value.
 *
 *  An unknown name is only registered when the host can answer for it (see
 *  `fadeInitials`). */
function fadeTokenNames(): string[] {
  return Object.keys(genTokens(220, 0.55, 0.25).tokens)
}

/** One `transition` list per element that DECLARES palette tokens, each carrying
 *  only the tokens that element actually declares — and, at emission, only those
 *  the palette in force writes (see `written`).
 *
 *  Two of the entries carry a STANDARD property instead, because those surfaces
 *  are not painted from a registered token: the settings dialog's plate and the
 *  file-preview panel read a colour the plugin owns as a plain variable
 *  (`--dsh-any-bg-settings-surface`, `--dsh-any-bg-rightbar`) and would otherwise
 *  snap in one frame while every surface around them fades. The Cordis panel is
 *  the third case of the same kind — it re-declares `--dsw-specific-menu` from
 *  `--dsh-any-op-menu-cordis`, which is also unregistered, but since the token it
 *  re-declares IS one, naming the token is what reaches it. */
function fadeScopes(): PaletteFadeScope[] {
  return [
    // `:root` as well as the body, because the palette is declared on both (see
    // `applyCustomTokensNow`) and only the element that DECLARES a token animates
    // it. The host computes a couple of its own variables on the root element —
    // `--shiki-background` / `--shiki-foreground`, i.e. the code plate and its
    // default ink — so without this scope a palette change would slide everything
    // around the code block while the block itself jumped to the new tint. The
    // list is the widest branch's, and the emission drops every name this
    // palette does not write: a host-owned token must never be animated here.
    { selector: ':root', tokens: fadeTokenNames() },
    { selector: 'body', tokens: fadeTokenNames() },
    { selector: SETTINGS_PANEL_SEL, tokens: FADE_LAYER_TOKENS, properties: ['background-color'] },
    { selector: TRAJECTORY_ROOT_SEL, tokens: FADE_LAYER_TOKENS },
    { selector: RIGHTBAR_SEL, tokens: [], properties: ['background-color'] },
    { selector: CORDIS_PANEL_SEL, tokens: ['--dsw-specific-menu'] },
  ]
}

let fadeStyleEl: HTMLStyleElement | null = null
let fadeInitials: Record<string, string> | null = null
let fadeCssCache = ''
/** The scheme the last written palette had, so a FLIP can be told from a tint. */
let paletteScheme: 'light' | 'dark' | null = null

function ensureFadeSheet(): HTMLStyleElement {
  if (fadeStyleEl?.isConnected) return fadeStyleEl
  fadeStyleEl = document.createElement('style')
  fadeStyleEl.dataset.plugin = 'dsh-background-by-model-fade'
  markOwnSheet(fadeStyleEl)
  document.head.appendChild(fadeStyleEl)
  return fadeStyleEl
}

/**
 * The host's own value for each token — the `initial-value` a registration needs,
 * and the test for whether a token may be registered at all.
 *
 * Read with the plugin's token sheet muted, for the same reason `readHostPalette`
 * does it: our rule re-emits the very names being asked for. Cached, because the
 * answer only changes with the host's scheme and a stale hint is only ever used
 * for a token the host does not publish anyway.
 */
function fadeInitialsOf(names: readonly string[]): Record<string, string> {
  if (fadeInitials !== null) return fadeInitials
  const sheet = tokenStyleEl
  const muted = sheet !== null && sheet.isConnected && !sheet.disabled
  if (muted) sheet!.disabled = true
  try {
    const computed = getComputedStyle(document.body)
    const out: Record<string, string> = {}
    for (const name of names) {
      // `resolveCssColor` rejects anything the engine will not read as a COLOUR,
      // which is exactly the set a `<color>` registration can carry.
      const used = resolveCssColor(computed.getPropertyValue(name))
      if (used !== null) out[name] = used
    }
    fadeInitials = out
    return out
  } catch {
    fadeInitials = {}
    return fadeInitials
  } finally {
    if (muted) sheet!.disabled = false
  }
}

/** How long a colour change may take, or `0` for "do not animate it".
 *
 * The same decision the wallpaper layer makes (`transitionPlan` over the global
 * effect, the resolved duration and the OS preference), so the two halves of one
 * switch can never disagree about whether they are animating. */
function paletteFadeMs(): number {
  const tr = rTransition()
  const plan = transitionPlan({
    effect: tr.effect,
    easing: tr.easing,
    durationMs: rFadeMs(),
    canAnimate: true,
    reducedMotion: prefersReducedMotion(),
  })
  return plan.animate ? plan.durationMs : 0
}

/** Arm the fade for a palette change, or disarm it for anything else.
 *
 * `animate` is false on every pass that only moves an alpha (a slider drag): the
 * tokens are rewritten there too, and a live transition would make the surface
 * lag behind the pointer.
 *
 * `written` is the token set of the palette IN FORCE — `Object.keys(tokens)` of
 * the very block this pass is about to write — and only those may carry a
 * transition: a name the palette does not write still belongs to the host, and a
 * transition on it animates the host's own scheme change at this plugin's
 * duration (see ./palette-fade for the report that shape produced). The
 * registrations stay on the full set, so a later palette of the other branch
 * still has them in place. */
function applyPaletteFade(animate: boolean, written: readonly string[]): void {
  const initials = fadeInitialsOf(fadeTokenNames())
  const css = paletteFadeCss({
    scopes: fadeScopes(),
    initial: initials,
    written,
    durationMs: animate ? paletteFadeMs() : 0,
    easing: rTransition().easing,
  })
  if (css === fadeCssCache) return
  fadeCssCache = css
  ensureFadeSheet().textContent = css
}

/** Inline `transition` for an element the plugin paints itself; `0` disarms it. */
function fadeInlineFor(animate: boolean): string {
  return paletteFadeInline(animate ? paletteFadeMs() : 0, rTransition().easing)
}

// ── File-preview panel (right sidebar) ────────────────────────────────────
// The panel's visible surface is `var(--dsw-alias-bg-base)` — the very token the
// main-background slider re-emits — so without this it is a second, unnamed copy
// of that slider. This card paints whichever element the host actually paints:
//
//   0.1.7+  the dock's tab hosts (`[data-dockkit-content]` / `[data-dockkit-empty]`),
//           hidden with `visibility`, so the card rides the host's own open/close
//           and slide transitions. Floating panes are excluded, as the host does.
//   older   the panel itself (its container lost the background in 0.1.7 and stays
//           mounted at full width, which is how a permanent frosted plate appeared).
//           `:has()` keeps the two apart so the alpha is never painted twice.
//
// Data attributes (not the hashed classes) plus `!important` outrank the host's
// class rule; the `var()` fallback keeps the host's own value until a colour
// supplies one, so a colour-less rule changes nothing here.
export const RIGHTBAR_SEL =
  'div[data-sidebar-right-panel]:not(:has([data-dockkit-content],[data-dockkit-empty]))[data-sidebar-right-open],' +
  'div[data-sidebar-right-panel] [data-dockkit-content]:not([data-dockkit-float]),' +
  'div[data-sidebar-right-panel] [data-dockkit-empty]'
export const RIGHTBAR_STYLE_RULE =
  `${RIGHTBAR_SEL}{` +
  'background:var(--dsh-any-bg-rightbar,var(--dsw-alias-bg-base))!important}'

/** Paint the file-preview panel's surface from its own slider. */
export function applyRightbarOverrides(op: number): void {
  const root = document.documentElement
  // The panel is painted from the palette in force like every other surface;
  // only when there is no palette at all (a host publishing none of the tokens
  // we re-emit) does it keep the host's own --dsw-alias-bg-base.
  const base = palette()?.tokens['--dsw-alias-bg-base']
  if (base === undefined) { root.style.removeProperty('--dsh-any-bg-rightbar'); return }
  root.style.setProperty('--dsh-any-bg-rightbar', withAlpha(base, op))
}

// ── The composed frame's columns ─────────────────────────────────────────────
// The frame's children are NOT at fixed offsets (`sidebarCol centerCol rightbarCol
// bottomRow overlayLayer handle`), so "the children before the overlay" would paint
// the zero-width right column and the bottom row while the conversation frame
// stopped responding, with no error. Columns are therefore found by what they
// publish about themselves; the positional answer is only the last resort.
let frameEl: HTMLElement | null = null
let centerEl: HTMLElement | null = null
let detailsEl: HTMLElement | null = null

/** Class-name suffixes the harness's CSS modules end the column names with. */
const PART_CLASS = { center: 'centerCol', rightbar: 'rightbarCol' } as const

/**
 * Whether one of the element's class names ENDS with `suffix`.
 *
 * A SUFFIX test, not `classList.contains`: the host emits these classes from a CSS
 * module, so a column carries `pI_x6G_centerCol` and an exact match is false for
 * every column of every build — quietly, with the part falling through to a weaker
 * guess.
 */
function hasClassSuffix(el: HTMLElement, suffix: string): boolean {
  for (const name of Array.from(el.classList)) {
    if (name === suffix || name.endsWith(suffix)) return true
  }
  return false
}

/** The frame's direct child whose class list carries `suffix` (null when absent). */
function childWithClass(frame: HTMLElement, suffix: string): HTMLElement | null {
  for (const el of Array.from(frame.children)) {
    if (el instanceof HTMLElement && hasClassSuffix(el, suffix)) return el
  }
  return null
}

function discoverParts(): void {
  const overlay = document.querySelector<HTMLElement>('[data-shell-overlay]')
  if (overlay === null) return
  const frame = overlay.parentElement
  if (frame === null) return
  frameEl = frame
  // The right column's own marker is preferred, read from direct children only so
  // a descendant reusing it cannot win. It stays right while the panel is closed.
  const rightbar = frame.querySelector<HTMLElement>(':scope > [data-rightbar-col]') ?? childWithClass(frame, PART_CLASS.rightbar)
  const overlayIdx = Array.from(frame.children).indexOf(overlay)
  /** The direct child at `offset` relative to the overlay, when there is one. */
  const at = (offset: number): HTMLElement | null => (frame.children[overlayIdx + offset] as HTMLElement | undefined) ?? null
  centerEl = childWithClass(frame, PART_CLASS.center) ?? at(-2)
  detailsEl = rightbar ?? at(-1)
}

/** Apply the main-background opacity to the center/details columns instead of
 *  the frame. The frame's translucent bg-base sits UNDER the sidebar, so
 *  reducing the main-bg opacity stacked a second alpha onto the sidebar; moving
 *  the alpha onto the columns keeps the sidebar owned by its own slider. */
function applyPartOpacities(ops: PartOpacities, fade = false): void {
  discoverParts()
  if (frameEl === null) return
  const base = palette()?.tokens['--dsw-alias-bg-base']
  if (base === undefined) {
    // No palette to paint from: hand the columns back to the host instead of
    // leaving the last color's inline background on them.
    for (const el of [frameEl, centerEl, detailsEl]) el?.style.removeProperty('background')
    return
  }
  frameEl.style.background = 'transparent'
  // Painted INLINE, so these columns would snap while everything inheriting the
  // tokens fades; `fade` carries the duration, and is false when only an alpha
  // moved (a drag must not lag). `none`, not '', which would leave the host's value.
  const transition = fadeInlineFor(fade)
  if (centerEl !== null) {
    centerEl.style.transition = transition
    centerEl.style.background = withAlpha(base, ops.bg)
  }
  if (detailsEl !== null) {
    detailsEl.style.transition = transition
    detailsEl.style.background = withAlpha(base, ops.bg)
  }
}

/**
 * Re-derive every plugin-owned interface surface that is not a palette token: the
 * conversation view card and the function pages in the main slot.
 *
 * ONE pass, run by the full apply and the frame observer — a page mounts and
 * unmounts with a NAVIGATION, so its discovery happens on the same beat.
 */
export function applyInterfaceParts(fade = false): void {
  applyViewCards(fade)
  applyPageSurfaces()
}

// ── Function pages in the main slot ─────────────────────────────────────────
// 插件, 自动化任务 and every page a plugin registers of its own (上下文洞察) are
// "the page the centre column is showing": each brings its own root element and
// hashed class names, and the shell swaps them through ONE keyed slot — so a page
// can be located, never named. The shell renders
//
//   div.pI_x6G_centerCol
//     div[data-slot="main"]   ← the slot anchor: `display:contents`, no box
//       <the page root>       ← the slot's active panel, one at a time
//
// so the page roots are the ANCHOR's children, and a page added later is covered
// with no change here. Two traps, both silent: the anchor has no box, so a surface
// written on it paints nothing (hence the walk through box-less elements); and the
// chat view is the same slot's other occupant, excluded by its own scrollport
// marker because its tint belongs to the 对话文本框 item.
//
// The tint is a plugin-owned variable read by PAGE_STYLE_RULE, never an inline
// style: the page paints itself from `var(--dsw-alias-bg-base)` and has to come
// back EXACTLY as the host left it at zero — an attribute the plugin removes.
const PAGE_ANCHOR_SEL = '[data-slot="main"]'
export const PAGE_MARK = 'data-dab-page'
/**
 * `!important`, because the page's own background is a host class rule and cascade
 * order at equal specificity is not something to rely on. The fallback is the
 * host's own token, so a stale mark paints what the page would have painted.
 */
export const PAGE_STYLE_RULE = `[${PAGE_MARK}]{background:var(--dsh-any-bg-page,var(--dsw-alias-bg-base))!important}`

/** The elements currently marked — unmarked again at zero or on teardown. */
let pageEls: HTMLElement[] = []

/** Every function page mounted in the centre column (empty while the chat is). */
function discoverPageEls(): HTMLElement[] {
  if (centerEl === null || !document.body.contains(centerEl)) return []
  // The anchor is the column's own child; the descendant query is the net under a
  // build that ever nests it one level deeper.
  const anchor = centerEl.querySelector<HTMLElement>(`:scope > ${PAGE_ANCHOR_SEL}`) ?? centerEl.querySelector<HTMLElement>(PAGE_ANCHOR_SEL)
  if (anchor === null) return []
  const seen = new Set<HTMLElement>()
  const out: HTMLElement[] = []
  /** Step through `display:contents` wrappers to the element that owns a box. */
  const boxed = (start: HTMLElement): HTMLElement | null => {
    let el: HTMLElement = start
    // Bounded: a cycle here would be a host bug, and hanging the frame observer is
    // not a way to report one.
    for (let depth = 0; depth < 10; depth++) {
      if (getComputedStyle(el).display !== 'contents') return el
      const next: Element | null = el.firstElementChild
      if (!(next instanceof HTMLElement) || seen.has(next)) return null
      seen.add(next)
      el = next
    }
    return null
  }
  for (const child of Array.from(anchor.children)) {
    if (!(child instanceof HTMLElement) || seen.has(child)) continue
    seen.add(child)
    const root = boxed(child)
    // The conversation is the slot's other occupant: its scrollport names it.
    if (root === null || root.querySelector('[data-conversation-scroll]') !== null) continue
    out.push(root)
  }
  return out
}

/** Whether a function page is what the centre column is showing. */
function pageIsShowing(): boolean { return discoverPageEls().length > 0 }

/** Point the 插件页面 item at whatever the main slot is showing. */
export function applyPageSurfaces(): void {
  discoverParts()
  const base = palette()?.tokens['--dsw-alias-bg-base']
  const op = rPageOpacity()
  // Painted only while there is something to paint WITH and something to say: at
  // zero — or on a host publishing no surface token — the plugin marks nothing
  // and every page keeps the paint the host gave it.
  const paint = op > 0 && base !== undefined
  if (paint) document.documentElement.style.setProperty('--dsh-any-bg-page', withAlpha(base, op))
  else document.documentElement.style.removeProperty('--dsh-any-bg-page')
  const next = paint ? discoverPageEls() : []
  for (const el of pageEls) if (!next.includes(el)) el.removeAttribute(PAGE_MARK)
  for (const el of next) el.setAttribute(PAGE_MARK, '1')
  pageEls = next
}

/** Hand every marked page back to the host untouched (teardown only). */
function removePageSurfaces(): void {
  for (const el of pageEls) el.removeAttribute(PAGE_MARK)
  pageEls = []
}

// ── Conversation view treatments ────────────────────────────────────
// The chat message column is styled as a real card (layer-1 surface + border +
// 16px radius + 18px padding). The trajectory view gets NO card of its own: its
// panels fully cover the view root, so that item re-scopes the layer tokens
// inside the view instead (see `applyTrajectoryOverrides`).
//
// Host structure (deepseek-harness ui-conversation / ui-trajectory):
//   ConversationRoot
//     header                     — title + tabs, OUTSIDE the scrollport
//     [data-conversation-scroll] — the single scrollport
//       [data-chat-flow]         ← chat column (flow content, NOT scrollable)
//       [data-conversation-composer-overlay] ← trajectory view root
//       [data-composer-seat]     — sticky composer, a sibling
// The card is ALWAYS styled once its host exists — a slider at zero only turns
// surface/border transparent, so the layout never reflows and the view cannot
// jump when the slider leaves zero. Removal happens only at plugin teardown.
interface ViewCardSpec {
  sel: string
  mark: string
  /** Dataset key prefix holding the stashed pre-card inline values. */
  prev: string
  opacity: () => number
  /** Generic heuristic fallback (chat card only, hosts without the marker). */
  fallback?: boolean
}

const VIEW_CARDS: ViewCardSpec[] = [
  { sel: '[data-chat-flow]', mark: 'data-dab-chat-card', prev: 'dabChatPrev', opacity: rChatTextOpacity, fallback: true },
]

const viewTargets: Array<HTMLElement | null> = VIEW_CARDS.map(() => null)

function isScrollableY(el: HTMLElement): boolean {
  const oy = getComputedStyle(el).overflowY
  // 'overlay' covers Chromium's non-standard overflow value.
  return oy === 'auto' || oy === 'scroll' || oy === 'overlay'
}

/** Whether the subtree hosts the chat input (textarea / contenteditable /
 *  textbox role) — used to keep the card off the input row. */
function containsChatEditor(el: HTMLElement): boolean {
  return el.querySelector('textarea,[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"],[role="textbox"]') !== null
}

/** Walk down from a coarse candidate toward the actual message column. */
function refineMessageColumn(start: HTMLElement): HTMLElement {
  let cur = start
  for (let depth = 0; depth < 10; depth++) {
    if (isScrollableY(cur)) break
    const kids = Array.from(cur.children).filter((k): k is HTMLElement => k instanceof HTMLElement)
    if (kids.length === 0) break
    const tallest = kids.reduce((a, b) => (b.clientHeight > a.clientHeight ? b : a))
    if (containsChatEditor(cur)) {
      const candidates = kids.filter(k => !containsChatEditor(k) && k.clientHeight >= cur.clientHeight * 0.4)
      if (candidates.length === 0) break
      cur = candidates.reduce((a, b) => (b.clientHeight > a.clientHeight ? b : a))
      continue
    }
    if (kids.length > 1 && tallest.clientHeight >= cur.clientHeight * 0.85) { cur = tallest; continue }
    break
  }
  return cur
}

function discoverViewTarget(idx: number, spec: ViewCardSpec): HTMLElement | null {
  if (centerEl === null || !document.body.contains(centerEl)) { viewTargets[idx] = null; return null }
  // The host marker always wins over a cached fallback (the view may not be
  // mounted yet when the plugin applies early).
  const marked = centerEl.querySelector<HTMLElement>(spec.sel)
  const cached = viewTargets[idx]
  if (marked !== null) {
    if (cached !== null && cached !== marked) restoreCardHost(cached, spec.mark, spec.prev)
    viewTargets[idx] = marked
    return marked
  }
  if (cached !== null && centerEl.contains(cached)) return cached
  viewTargets[idx] = null
  if (spec.fallback !== true) return null
  // An absent [data-chat-flow] means the chat view is not mounted (hero phase,
  // trajectory tab); settling on the scrollport would wrap the whole page.
  if (centerEl.querySelector('[data-conversation-scroll]') !== null) return null
  // A function page belongs to the 插件页面 item; tinting it here would paint the
  // same area from another slider under a name that does not describe it.
  if (pageIsShowing()) return null
  // Marker-less hosts keep their layout until a slider moves.
  if (spec.opacity() <= 0) return null
  let best: HTMLElement | null = null
  let bestArea = 0
  for (const el of Array.from(centerEl.querySelectorAll<HTMLElement>('*'))) {
    if (!isScrollableY(el)) continue
    if (el.clientHeight < centerEl.clientHeight * 0.35) continue
    const area = el.clientWidth * el.clientHeight
    if (area > bestArea) { bestArea = area; best = el }
  }
  if (best === null) {
    for (const el of Array.from(centerEl.children)) {
      if (!(el instanceof HTMLElement)) continue
      if (el.clientHeight < centerEl.clientHeight * 0.5) continue
      if (el.clientHeight > (best?.clientHeight ?? 0)) best = el
    }
  }
  const refined = best !== null ? refineMessageColumn(best) : null
  viewTargets[idx] = refined
  return refined
}

/** Stash the host's own inline values so teardown restores them exactly. */
function stashCardPrev(el: HTMLElement, prev: string): void {
  const ds = el.dataset as Record<string, string | undefined>
  ds[prev + 'Bg'] = el.style.getPropertyValue('background')
  ds[prev + 'Border'] = el.style.getPropertyValue('border')
  ds[prev + 'Radius'] = el.style.getPropertyValue('border-radius')
  ds[prev + 'Padding'] = el.style.getPropertyValue('padding')
}

/** Undo the inline styling, restoring the host's previous inline values. */
function restoreCardHost(el: HTMLElement, mark: string, prev: string): void {
  if (!el.hasAttribute(mark)) return
  const ds = el.dataset as Record<string, string | undefined>
  const restore = (prop: string, v: string | undefined): void => {
    if (v !== undefined && v !== '') el.style.setProperty(prop, v)
    else el.style.removeProperty(prop)
  }
  restore('background', ds[prev + 'Bg'])
  restore('border', ds[prev + 'Border'])
  restore('border-radius', ds[prev + 'Radius'])
  restore('padding', ds[prev + 'Padding'])
  delete ds[prev + 'Border']; delete ds[prev + 'Radius']; delete ds[prev + 'Padding']
  delete ds[prev + 'Bg']
  el.removeAttribute(mark)
}

/** Teardown only: strip every view treatment and hand the hosts back untouched. */
function removeViewCards(): void {
  VIEW_CARDS.forEach((spec, i) => {
    const el = viewTargets[i]
    if (el !== null) restoreCardHost(el, spec.mark, spec.prev)
    viewTargets[i] = null
  })
}

// ── Wide markdown tables ──────────────────────────────────────────────────────
// DSH intentionally lets `.md-table-wide` bleed outside the text column. That
// bleed only becomes visible once the chat surface gains a visible border, i.e.
// when the chat region opacity is non-zero. Under that same condition, pull the
// table back inside the column and let it scroll horizontally.
const TABLE_FIX_RULE = [
  '.md-table-wide {',
  '  --dsh-table-spare: 0px !important;',
  '  --dsh-table-lead: 0px !important;',
  '  box-sizing: border-box !important;',
  '  width: 100% !important;',
  '  max-width: 100% !important;',
  '  margin-left: 0 !important;',
  '  padding-left: 0 !important;',
  '  padding-bottom: 0 !important;',
  '  overflow-x: auto !important;',
  '}',
].join('\n')
let tableFixStyleEl: HTMLStyleElement | null = null

/** Toggle the wide-table clamp according to the chat region's opacity. */
function syncTableFix(): void {
  const needed = rChatTextOpacity() > 0
  if (!needed) {
    if (tableFixStyleEl !== null) { tableFixStyleEl.remove(); tableFixStyleEl = null }
    return
  }
  if (tableFixStyleEl === null) {
    tableFixStyleEl = document.createElement('style')
    tableFixStyleEl.dataset.plugin = 'dsh-background-by-model-table-fix'
    markOwnSheet(tableFixStyleEl)
    tableFixStyleEl.textContent = TABLE_FIX_RULE
  }
  if (!tableFixStyleEl.isConnected) document.head.appendChild(tableFixStyleEl)
}

/** Re-derive the conversation view card from the current config. */
export function applyViewCards(fade = false): void {
  discoverParts()
  if (centerEl === null) return
  // The chat card is tinted from the palette in force, so a color-less rule gets
  // the host's own surface instead of the seed color's fallback tint.
  const surface = palette()?.tokens['--dsw-alias-bg-layer-1']
  const transition = fadeInlineFor(fade)
  VIEW_CARDS.forEach((spec, i) => {
    const target = discoverViewTarget(i, spec)
    if (target === null) return
    const opacity = spec.opacity()
    if (!target.hasAttribute(spec.mark)) stashCardPrev(target, spec.prev)
    // Mirrors .dab-card (layer-1 background, border, 16px radius, 18px padding),
    // written inline so it wins over host stylesheets; the opacity slider drives
    // surface alpha and fades the border with it. The transition is inline for
    // the same reason the background is: this card does not read the registered
    // tokens, so a palette change would otherwise snap here.
    const borderAlpha = opacity > 0 ? Math.min(1, opacity * 1.5) : 0
    target.style.transition = transition
    target.style.background = surface !== undefined ? withAlpha(surface, opacity) : 'transparent'
    target.style.border = surface !== undefined ? `1px solid ${withAlpha(surface, borderAlpha)}` : '1px solid transparent'
    target.style.borderRadius = '16px'
    target.style.padding = '18px'
    target.setAttribute(spec.mark, '1')
  })
  syncTableFix()
}

let partsObserver: MutationObserver | null = null

/** Watch for the AppFrame mounting so persisted opacities land even when the
 *  shell renders after this plugin's apply. */
export function watchParts(): void {
  if (partsObserver !== null || typeof MutationObserver === 'undefined') return
  partsObserver = new MutationObserver(() => {
    if (frameEl !== null && centerEl !== null && detailsEl !== null && document.body.contains(frameEl)
      // Keep re-applying while any card host is absent or was swapped by the host.
      && viewTargets.every(el => el !== null && document.body.contains(el))) return
    applyInterfaceParts()
    applyPartOpacities(rOps())
  })
  partsObserver.observe(document.body, { childList: true, subtree: true })
}

export function stopWatchingParts(): void {
  partsObserver?.disconnect()
  partsObserver = null
}

// ── Theme-reset watchdog ──────────────────────────────────────────────────
// The host re-asserts its own :root/body scheme rules on mount, on settings
// adoption and after the plugin's startup assertion, toggling the
// `data-ds-dark-theme` attribute off / to a host value — which would paint a
// frame of light surfaces. Watch that flag and, whenever the plugin's own
// value disappears, re-set it and re-emit the token stylesheet within the same
// frame.
let themeObserver: MutationObserver | null = null
let themeRaf = 0

function reassertScheme(): void {
  const [, , l] = rColor()
  if (l < 0.55) document.body.setAttribute(DARK_ATTR, OWN_SCHEME)
  else document.body.removeAttribute(DARK_ATTR)
  applyCustomTokens(rOps())
}

/** Re-assert the plugin's forced scheme whenever the host strips it, so a
 *  refresh / cold-load / set-change never flashes a light frame. Also the point
 *  where a host-side scheme flip is noticed while a color-less rule runs: that
 *  rule paints from the host palette, so the readback is dropped and the
 *  surfaces are re-emitted from the new one. */
export function watchThemeResets(): () => void {
  if (themeObserver !== null || typeof MutationObserver === 'undefined') return () => undefined
  themeObserver = new MutationObserver(() => {
    invalidateHostPalette()
    if (document.body.getAttribute(DARK_ATTR) === OWN_SCHEME) return
    if (!rHasColor()) {
      // Nothing to re-assert, but the host's own surfaces just changed under us.
      applyCustomTokens(rOps())
      return
    }
    if (themeRaf !== 0) return
    themeRaf = requestAnimationFrame(() => {
      themeRaf = 0
      if (document.body.getAttribute(DARK_ATTR) === OWN_SCHEME) return
      reassertScheme()
    })
  })
  themeObserver.observe(document.body, { attributes: true, attributeFilter: [DARK_ATTR] })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: [DARK_ATTR] })
  return () => {
    themeObserver?.disconnect()
    themeObserver = null
  }
}

// ── Wallpaper layer: two stacked layers, cross-faded on a rule switch ───────
// The incoming image fades in ON TOP of the outgoing one: fading the old one out
// at the same time drops the composite below full alpha at the midpoint and the
// interface flashes through.
//
// Layers address their image by OBJECT URL (`displayImageOf`): a `url(data:…)`
// background re-decodes the photo on every switch, which is where a large
// wallpaper's stall comes from.
//
// The duration is the GLOBAL switch effect's (`transition.durationMs`), and 0 is
// a hard cut.
interface WpLayer {
  el: HTMLDivElement
  /** Display URL of the image painted on this layer; null when empty. */
  url: string | null
  /** Placement of the image in pixels, relative to the UNGROWN viewport box, or
   *  null when the placement is `center` (or sized by the box). The blur pad
   *  moves the box's origin by -pad, so a numeric placement has to be written
   *  back +pad to land on the same pixel — see `writeLayerBox`. */
  posX: number | null
  posY: number | null
  /** Brightness and blur of THIS layer's own picture, taken when it was painted.
   *
   *  Per layer rather than read live, because the two layers hold two DIFFERENT
   *  pictures during a switch: composing both from the active image made the
   *  outgoing photo snap to the incoming one's exposure on the very frame the
   *  fade began, so a change between two different settings never actually
   *  animated — the picture was already the new one's before the first frame. */
  brightness: number
  blur: number
}

let layers: [WpLayer, WpLayer] | null = null
/** Index of the layer the user is looking at. */
let front = 0
/** Index of the layer fading in right now, if any. */
let pending: 0 | 1 | null = null
let fadeTimer: number | null = null
/** The wallpaper's steady opacity — the ACTIVE picture's, as last committed.
 *
 *  Mirrored rather than read back off the style string, because a repaint that
 *  runs in the middle of a fade (a theme re-registration, a panel re-render) has
 *  to re-write the value the fade is HEADING for; reading `rWop()` there would
 *  snap the whole layer to the incoming picture's alpha and cut the fade short.
 */
let wpAlpha = 1

function createLayer(): WpLayer {
  const el = document.createElement('div')
  el.dataset.dabWpLayer = ''
  el.style.cssText = 'position:absolute;inset:0;opacity:0;background-repeat:no-repeat;background-position:center;'
  return { el, url: null, posX: null, posY: null, brightness: 100, blur: 0 }
}

function ensureWpContainer(): void {
  if (wpEl !== null && layers !== null && document.body.contains(wpEl)) return
  if (fadeTimer !== null) { window.clearTimeout(fadeTimer); fadeTimer = null }
  const a = createLayer()
  const b = createLayer()
  wpEl = document.createElement('div')
  wpEl.dataset.dabWp = ''
  wpEl.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;'
  wpEl.append(a.el, b.el)
  layers = [a, b]
  front = 0
  pending = null
  wpAlpha = 1
  document.body.prepend(wpEl)
}

/** Drop the whole wallpaper layer (no rule carries an image). */
function dropWpContainer(): void {
  if (fadeTimer !== null) { window.clearTimeout(fadeTimer); fadeTimer = null }
  pending = null
  front = 0
  layers = null
  wpAlpha = 1
  wpEl?.remove()
  wpEl = null
}

/** Release one layer's image — the layer is fully covered when this is called. */
function clearLayer(l: WpLayer): void {
  if (l.url === null) return
  l.url = null
  l.posX = null
  l.posY = null
  l.brightness = 100
  l.blur = 0
  l.el.style.backgroundImage = ''
  l.el.style.backgroundSize = ''
  l.el.style.backgroundPosition = ''
  // The blur pad is part of what a layer IS too: a recycled layer that kept a
  // grown box would paint the next wallpaper from outside the viewport.
  l.el.style.inset = '0px'
  // The transition's own property is part of what a layer IS, not just how it
  // arrived: a layer retired mid-zoom would otherwise keep `scale(1.06)` and
  // paint the next wallpaper 6% too large.
  l.el.style.transform = 'none'
}

/** Write the two properties a switch animates. Both are always written, so a
 *  layer can never keep half of a previous effect. */
function applyLayerStyle(el: HTMLElement, style: LayerStyle): void {
  el.style.opacity = style.opacity
  el.style.transform = style.transform
}

/** Intrinsic-size cache for the center mode (native pixels of the current image). */
let imgNat: { url: string; w: number; h: number } | null = null
function imageNatSize(url: string, cb: (w: number, h: number) => void): void {
  if (imgNat !== null && imgNat.url === url) { cb(imgNat.w, imgNat.h); return }
  const img = new Image()
  img.onload = () => {
    imgNat = { url, w: img.naturalWidth, h: img.naturalHeight }
    cb(img.naturalWidth, img.naturalHeight)
  }
  img.onerror = () => cb(0, 0)
  img.src = url
}

/** How far a layer's box is grown on every side to hide a blurred edge.
 *
 *  `filter: blur(σ)` convolves the layer's own rendering with a Gaussian of
 *  standard deviation σ and treats everything outside the box as transparent, so
 *  the outermost pixels come out half opaque and the image fades inward over
 *  ~2σ — composited over the page behind it, that half-transparent rim is the
 *  black border the blur slider paints, and it grows thicker with the slider.
 *  Growing the box by 2σ puts every visible pixel at least 2σ inside the edge,
 *  where ~2% of the page still shows through the outermost row: gone to the eye.
 *  Two sigma rather than three is the trade for the `cover` modes, which pay for
 *  the growth by framing slightly tighter — a fifth of the image at most, at the
 *  slider's maximum, where the detail a wider frame would reveal is blurred out.
 */
function wpBlurPad(blur: number): number {
  return blur > 0 ? Math.ceil(blur * 2) + 2 : 0
}

/** Grow a layer's box by `pad` on every side while keeping its image on the same
 *  pixels. The background positioning area starts at the border box, so a box
 *  whose origin moved by -pad needs a numeric placement moved by +pad; `center`
 *  (and the box-relative `cover` / `100% 100%` sizes) sit in the middle of a
 *  symmetrically grown box and need no compensation. The container clips the
 *  growth, so nothing about the visible layout changes: it exists only to give
 *  the blur pixels to sample beyond the viewport. */
function writeLayerBox(l: WpLayer, pad: number): void {
  const { posX, posY } = l
  l.el.style.inset = `${-pad}px`
  l.el.style.backgroundPosition = posX === null || posY === null ? 'center' : `${posX + pad}px ${posY + pad}px`
}

/** Paint one layer's image and its placement. The placement always follows the
 *  ACTIVE rule: the incoming layer is painted right after a switch, and a
 *  repaint of the same URL (framing edit, viewport resize) must use the rule's
 *  current framing. */
function paintLayer(l: WpLayer, url: string): void {
  const el = l.el
  l.url = url
  const bg = rBgState()
  const mode = rBgMode()
  const next = `url("${url}")`
  // Skip re-setting the same URL — a redundant assignment can flash the layer
  // blank for a frame while it is re-resolved.
  if (el.style.backgroundImage !== next) {
    el.style.backgroundImage = next
  }
  // The placement is stored in viewport pixels and written by `writeLayerBox`,
  // which is also the one place the blur pad moves the box: keeping the two in
  // separate writers is what would let a blurred layer paint from the wrong
  // origin (or a framed photo jump by the pad) after a slider move.
  l.posX = null
  l.posY = null
  if (mode === 'fit') {
    el.style.backgroundRepeat = 'no-repeat'
    if (bg.iw > 0) {
      // Contain-fit at zoom with the image center pinned to the committed
      // fractional viewport point, so the framed region survives viewport changes.
      const fit = Math.min(window.innerWidth / bg.iw, window.innerHeight / bg.ih)
      const w = bg.iw * fit * bg.zoom
      const h = bg.ih * fit * bg.zoom
      el.style.backgroundSize = `${w}px ${h}px`
      l.posX = bg.x * window.innerWidth - w / 2
      l.posY = bg.y * window.innerHeight - h / 2
    } else {
      // Fresh image: match the editor's initial centered contain view.
      el.style.backgroundSize = 'contain'
    }
  } else if (mode === 'fill') {
    el.style.backgroundRepeat = 'no-repeat'
    el.style.backgroundSize = 'cover'
  } else if (mode === 'stretch') {
    el.style.backgroundRepeat = 'no-repeat'
    el.style.backgroundSize = '100% 100%'
  } else if (mode === 'tile') {
    el.style.backgroundRepeat = 'repeat'
    // background-size:auto resolves the intrinsic size per tile; the 0/0 origin
    // is numeric so the pad keeps the tile phase anchored to the viewport.
    el.style.backgroundSize = 'auto'
    l.posX = 0
    l.posY = 0
  } else {
    // Center: native size, centered. The intrinsic size needs an async decode;
    // 'contain' keeps a sensible frame until it lands.
    el.style.backgroundRepeat = 'no-repeat'
    el.style.backgroundSize = 'contain'
    imageNatSize(url, (w, h) => {
      if (l.url !== url || el.style.backgroundImage !== next || rBgMode() !== 'center') return
      if (w > 0 && h > 0) el.style.backgroundSize = `${w}px ${h}px`
    })
  }
  // The picture's own effects are taken here, in the one place a layer starts
  // painting a picture: everything after this reads the layer, never the store.
  l.brightness = rBrightness()
  l.blur = rBl()
  applyLayerEffects(l)
}

/** Whether there is anything to animate FROM: a wallpaper on screen that is
 *  actually visible. The duration question belongs to `rFadeMs`, and the
 *  `reduced-motion` veto to `transitionPlan` — this answers only the layer half,
 *  so a first paint (no previous image) never fades in from nothing. */
function canAnimateFrom(from: WpLayer): boolean {
  if (from.url === null) return false
  return rWop() > 0.01
}

/** Whether the OS asks for reduced motion right now. */
function prefersReducedMotion(): boolean {
  const mm = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  return mm !== null && mm.matches
}

/** End an in-flight fade: promote the incoming layer, free the one under it. */
function finishFade(idx: 0 | 1): void {
  if (layers === null || pending !== idx) return
  if (fadeTimer !== null) { window.clearTimeout(fadeTimer); fadeTimer = null }
  pending = null
  front = idx
  if (wpEl !== null) {
    // The container's opacity may have been on the same clock: land it and disarm.
    wpEl.style.transition = 'none'
    wpEl.style.opacity = String(wpAlpha)
  }
  const el = layers[idx].el
  // Re-asserted so a fade whose frames never ran (background tab) still ends on
  // the visible image, at the END of the effect (a zoom left at 1.06 crops).
  el.style.opacity = '1'
  el.style.transform = 'none'
  el.style.willChange = ''
  // Covered from here on: drop its bytes so no second full-size image stays decoded.
  clearLayer(layers[idx === 0 ? 1 : 0])
}

/** Land an in-flight fade on its end state at once (another switch arrived). */
function settleFade(): void {
  if (layers === null || pending === null) return
  const idx = pending
  if (fadeTimer !== null) { window.clearTimeout(fadeTimer); fadeTimer = null }
  pending = null
  front = idx
  const el = layers[idx].el
  el.style.transition = 'none'
  el.style.opacity = '1'
  el.style.transform = 'none'
  el.style.willChange = ''
  clearLayer(layers[idx === 0 ? 1 : 0])
}

/** Abandon an in-flight fade: the layer it was leaving holds the wanted image. */
function cancelFade(): void {
  if (layers === null || pending === null) return
  const idx = pending
  if (fadeTimer !== null) { window.clearTimeout(fadeTimer); fadeTimer = null }
  pending = null
  const el = layers[idx].el
  el.style.transition = 'none'
  el.style.opacity = '0'
  el.style.transform = 'none'
  el.style.willChange = ''
  clearLayer(layers[idx])
}

/** Show `url` on the wallpaper layer, cross-fading from what it paints now. */
function applyImageWp(url: string): void {
  ensureWpContainer()
  const ls = layers!
  if (pending !== null) {
    // A → B → A inside one fade: keep whichever layer already paints the wanted
    // image instead of queueing a third one.
    if (ls[pending].url === url) {
      // The fade is going to the picture we already want: keep it, and let the
      // container land on its opacity instead of being left mid-way.
      paintLayer(ls[pending], url)
      wpAlpha = rWop()
      applyWpEffects()
      return
    }
    if (ls[front].url === url) {
      cancelFade(); paintLayer(ls[front], url); wpAlpha = rWop(); applyWpEffects(); return
    }
    settleFade()
  }
  if (ls[front].url === url) {
    // Same picture: this is a repaint (a commit, a framing edit, a resize), not a
    // switch — so the container simply adopts the current alpha.
    paintLayer(ls[front], url)
    wpAlpha = rWop()
    applyWpEffects()
    return
  }
  const from = ls[front]
  const idx: 0 | 1 = front === 0 ? 1 : 0
  const target = ls[idx]
  const el = target.el
  // One decision, from the global effect + the resolved duration + the two vetoes
  // (nothing to animate from, reduced motion) — see ./transition.
  const tr = rTransition()
  const plan = transitionPlan({
    effect: tr.effect,
    easing: tr.easing,
    durationMs: rFadeMs(),
    canAnimate: canAnimateFrom(from),
    reducedMotion: prefersReducedMotion(),
  })
  // Rewind the incoming layer before its bytes land, so a stale image from an
  // earlier switch can never flash through while the new one rasterizes — and so
  // the effect's start state is in place a frame before the transition is armed.
  el.style.transition = 'none'
  el.style.willChange = plan.willChange
  applyLayerStyle(el, plan.from)
  el.style.zIndex = '1'
  from.el.style.zIndex = '0'
  // The wallpaper's OWN opacity is part of what a switch shows, and it used to
  // snap: the container was set to the incoming picture's alpha on the first
  // frame, so two pictures at different opacities changed instantly and only the
  // layer under them faded. It rides the same transition as the layers now —
  // written to the OUTGOING value first, then armed and moved to the incoming one
  // in the frame the layers start moving, so the whole composite fades together.
  const toAlpha = rWop()
  const fadeAlpha = plan.animate && Math.abs(toAlpha - wpAlpha) > 0.001
  if (fadeAlpha) wpEl!.style.transition = 'none'
  paintLayer(target, url)
  if (!fadeAlpha) wpAlpha = toAlpha
  applyWpEffects()
  if (!plan.animate) {
    // No animation: land on the end state at once (`transition` is already
    // 'none' from the rewind above), which is both the hard cut and what a
    // first paint does.
    applyLayerStyle(el, plan.to)
    front = idx
    clearLayer(from)
    return
  }
  // will-change promotes the layer in this frame, so the fade itself is a pure
  // compositor animation that survives the main-thread work a switch triggers
  // (theme re-registration, token rewrite, settings-panel re-render).
  pending = idx
  requestAnimationFrame(() => {
    if (pending !== idx || layers === null) return
    el.style.transition = plan.transition
    applyLayerStyle(el, plan.to)
    if (fadeAlpha) {
      wpEl!.style.transition = plan.transition
      wpEl!.style.opacity = String(toAlpha)
      wpAlpha = toAlpha
    }
  })
  fadeTimer = window.setTimeout(() => finishFade(idx), plan.durationMs + 160)
}

/**
 * The `filter` ONE LAYER carries, from the brightness and blur of the picture
 * painted on IT.
 *
 * Both are per image (see BgImage): one rule's rotation can run a daylight photo
 * and a night shot, and a rule-level answer forced the second one to live at the
 * first one's exposure.
 *
 * ONE declaration, because the two are one CSS property: assigning `filter` twice
 * would leave whichever ran last, so an image that is both brightened and blurred
 * would silently lose one of them. Brightness is written first and blur second for
 * a reason that is visible: blurring a dimmed picture softens the highlights the
 * dimming just brought down, while dimming an already-blurred one simply darkens
 * the result — and the order a user reads the sliders in (brightness above blur,
 * see ModelBgPage) is the order the filter composes in.
 *
 * The neutral brightness is LEFT OUT rather than written as `brightness(100%)`.
 * A layer with neither effect gets `''`, which is what an untouched wallpaper has
 * always carried, and keeps the layer off the compositor's filter path entirely.
 *
 * The numbers are the LAYER's, not live reads: during a switch the two layers
 * hold two different photos, and a live read made the outgoing one jump to the
 * incoming one's exposure at the first frame of every fade.
 */
function wpFilter(brightness: number, blur: number): string {
  const parts: string[] = []
  if (brightness !== 100) parts.push(`brightness(${brightness}%)`)
  if (blur > 0) parts.push(`blur(${blur}px)`)
  return parts.join(' ')
}

function applyWpEffects(): void {
  if (wpEl === null || layers === null) return
  // The CONTAINER carries the picture's own opacity, because it is a property of
  // the wallpaper as a whole: the two layers are one composite, and giving each of
  // them the incoming picture's alpha would make the outgoing one show through it
  // (two pictures summed) for the length of the fade. `wpAlpha` rather than
  // `rWop()` so a repaint mid-fade re-writes the value the fade is heading for.
  wpEl.style.opacity = String(wpAlpha)
  // The filter sits on each LAYER rather than on the container: with it on the
  // parent, every frame of an opacity fade would re-run a full-screen filter pass
  // instead of just re-compositing the treated surface.
  applyLayerEffects(layers[0])
  applyLayerEffects(layers[1])
}

/** Write what a layer takes from ITS picture: the filter, and the box growth that
 *  keeps a blurred edge from drawing a dark rim.
 *
 *  ONE function for both, because the two are one visible decision — the same
 *  blur that makes `filter` non-empty is what makes the pad non-zero — and
 *  because BOTH update paths (a full repaint and a drag frame) write it, so a
 *  blur dragged to its top cannot leave the rim behind until the slider is
 *  released. */
function applyLayerEffects(l: WpLayer): void {
  l.el.style.filter = wpFilter(l.brightness, l.blur)
  writeLayerBox(l, wpBlurPad(l.blur))
}

/** Repaint the wallpaper layer, the token palette and every interface part from
 *  the ACTIVE rule. This is the single entry point a rule switch goes through. */
export function applyWp(): void {
  const url = rWp()
  if (url) {
    applyImageWp(url)
  } else if (wpEl !== null) {
    // No background: tear down the layer but keep the tokens intact.
    dropWpContainer()
  }
  // A rule without a saved color follows the system theme: the plugin owns no
  // color of its own, so the surfaces come from the host's palette (see
  // `palette`) with the user's opacities applied — the wallpaper keeps showing
  // and the Interface sliders keep doing something, which is what "follow the
  // system theme" is expected to mean. THREE things have to be true before the
  // readback, or it answers with the wrong palette:
  //   1. our own body rule is out of the way (it re-emits the tokens being read);
  //   2. the scheme flag is the host's own again (we force/remove it while we own
  //      a palette, and the host only re-projects on a theme change);
  //   3. the cached palette is dropped once, on the way in.
  if (!rHasColor() && !baseTokenKey.startsWith('host:')) {
    clearCustomTokens()
    invalidateHostPalette()
  }
  if (!rHasColor()) adoptHostScheme()
  const src = palette()
  // Marker for the no-fallback re-scope rules: they may only be live while the
  // variables they read are written (see THEMED_ATTR).
  document.documentElement.toggleAttribute(THEMED_ATTR, src !== null)
  if (src === null) {
    // No palette at all (a host publishing none of the surfaces we re-emit):
    // give every surface back to the host untouched instead of leaving ours.
    clearCustomTokens()
    clearOwnedSurfaces()
  }
  // The return value says whether the PALETTE itself just moved — the one case a
  // colour change is allowed to fade (see `applyCustomTokens`) — and it is what
  // the inline-painted cards below need to know, since they do not read the
  // registered tokens.
  const paletteMoved = applyCustomTokens(rOps())
  applySettingsOverrides(rSop())
  applyTrajectoryOverrides(rTrajectoryOpacity())
  applyRightbarOverrides(rRightbarOpacity())
  applyInterfaceParts(paletteMoved)
}

export function teardownWp(): void {
  dropWpContainer()
  clearCustomTokens()
  tokenStyleEl?.remove(); tokenStyleEl = null
  removeViewCards()
  removePageSurfaces()
  document.documentElement.removeAttribute(THEMED_ATTR)
  document.body.style.removeProperty('color-scheme')
  // Every plugin-owned surface, including the AppFrame columns' inline
  // backgrounds and the palette readback that described them; the scheme flag is
  // handed back in the host's own form.
  clearOwnedSurfaces()
  adoptHostScheme()
  invalidateHostPalette()
  document.documentElement.style.removeProperty('--dsh-any-bg-rightbar')
  document.documentElement.style.removeProperty('--dsh-any-bg-page')
  for (const v of Object.values(OPACITY_VARS)) document.documentElement.style.removeProperty(v)
  if (tokensRaf !== null) { cancelAnimationFrame(tokensRaf); tokensRaf = null }
  pendingOps = null
  tableFixStyleEl?.remove(); tableFixStyleEl = null
  stopWatchingParts()
}

/** Live wallpaper-opacity updates during slider drag (no full re-apply).
 *
 *  The container is the one holder of this value (see `applyWpEffects`), so the
 *  mirror and the style are written together — a later repaint then re-asserts
 *  what the drag ended on rather than the value it started from. */
export function setWpOpacity(v: number): void {
  wpAlpha = v
  if (wpEl) wpEl.style.opacity = String(v)
}

/**
 * Live wallpaper-filter updates during a slide, with no full re-apply.
 *
 * Deliberately parameterless: the filter composes TWO settings (brightness and
 * blur), so a function trusting one caller's value would write half of it and
 * drop the other. Both are read back from the store instead (./state), which is
 * the same store the drag has already written to before calling this.
 *
 * Written onto the layer PAINTING that picture rather than onto both: during a
 * switch the other layer is still showing the previous photo, and giving it this
 * one's brightness and blur is exactly the snap this snapshot exists to prevent.
 */
export function setWpFilter(): void {
  if (layers === null) return
  const url = rWp()
  if (url === null) return
  for (const l of layers) {
    if (l.url !== url) continue
    l.brightness = rBrightness()
    l.blur = rBl()
    applyLayerEffects(l)
  }
}
