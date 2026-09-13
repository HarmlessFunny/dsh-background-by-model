import { rWp, rBgState, rBl, rWop, rOps, rSop, rColor, rHasColor, rBlurs, rBgMode, rChatTextOpacity, rTrajectoryOpacity } from './state'
import type { PartOpacities, PartBlurs } from './types'
import { genTokens, toRgba } from './utils/color'

let wpEl: HTMLDivElement | null = null
let appliedTokenNames: string[] = []
let tokenStyleEl: HTMLStyleElement | null = null

function ensureTokenStyle(): HTMLStyleElement {
  if (tokenStyleEl?.isConnected) return tokenStyleEl
  tokenStyleEl = document.createElement('style')
  tokenStyleEl.dataset.plugin = 'dsh-background-by-model-tokens'
  document.head.appendChild(tokenStyleEl)
  return tokenStyleEl
}

function clearCustomTokens(): void {
  if (tokenStyleEl) tokenStyleEl.textContent = ''
  for (const name of appliedTokenNames) document.body.style.removeProperty(name)
  appliedTokenNames = []
}

// Solid surface tokens grouped by which interface-opacity slider owns them.
// Every member is re-emitted with per-part alpha so surfaces over the wallpaper
// (composer input, elevated buttons, menu panels) can go translucent — not just
// the layered bg/sidebar tokens. --dsw-specific-menu (dropdowns, slash-trigger
// menu, model selector, popovers around the dialog) is owned by the card
// slider; the Cordis panel shares that token but is re-scoped to the input
// slider via INPUT_BLUR_RULE.
const OPACITY_TOKEN_GROUPS: Array<{ part: keyof PartOpacities; names: string[] }> = [
  { part: 'bg', names: ['--dsw-alias-bg-base'] },
  { part: 'sidebar', names: ['--dsw-specific-sidebar-fill'] },
  { part: 'card', names: ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3', '--dsw-specific-menu'] },
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
  '--dsw-specific-menu': '--dsh-any-op-menu',
}

// Fingerprint of the non-alpha token base (color pick + scheme verdict).
// The static body rule is only rebuilt when it changes; a drag never touches it.
let baseTokenKey = ''

// Coalesce slider-driven token updates to one rAF: a single drag fires several
// input events per frame, and every full re-apply repaints expensive regions
// over a large wallpaper. Batching keeps at most one update per frame.
let pendingOps: PartOpacities | null = null
let tokensRaf: number | null = null

export function applyCustomTokens(ops: PartOpacities): void {
  pendingOps = ops
  if (tokensRaf !== null) return
  tokensRaf = requestAnimationFrame(() => {
    tokensRaf = null
    if (pendingOps === null) return
    const o = pendingOps
    pendingOps = null
    applyCustomTokensNow(o)
  })
}

// Only the main-bg slider retints the center/details columns; keys on
// baseTokenKey + ops.bg so a sidebar/card/input drag never rewrites them.
let lastBgKey = ''

function applyCustomTokensNow(ops: PartOpacities): void {
  const [h, s, l] = rColor()
  const { tokens } = genTokens(h, s, l)
  try {
    const forceDark = l < 0.55
    if (`${h}|${s}|${l}` !== baseTokenKey) {
      baseTokenKey = `${h}|${s}|${l}`
      // Drive the base-palette switch with a plugin-specific value so the
      // gradient rule never matches a host dark-mode flag; color-scheme makes
      // native controls (select popups) follow the forced palette. Both ride the
      // stylesheet (not inline styles) so the host presenter clearing body
      // inline styles on boot can't drop them, and the !important rule survives
      // that clearing too.
      if (forceDark) document.body.setAttribute('data-ds-dark-theme', 'dsh-background-by-model')
      else document.body.removeAttribute('data-ds-dark-theme')
      const decls: string[] = [`color-scheme:${forceDark ? 'dark' : 'light'}`]
      for (const [name, value] of Object.entries(tokens)) {
        const opVar = OPACITY_VARS[name]
        decls.push(`${name}:${opVar !== undefined ? `var(${opVar})` : value}!important`)
      }
      ensureTokenStyle().textContent = `body{${decls.join(';')}}`
      // Drop inline tokens left by earlier builds so the stylesheet is the single source of truth.
      for (const name of appliedTokenNames) document.body.style.removeProperty(name)
      appliedTokenNames = Object.keys(tokens)
    }
    // Cheap per-drag update: only the surface alpha vars move on <html>.
    const root = document.documentElement
    for (const g of OPACITY_TOKEN_GROUPS) {
      for (const name of g.names) {
        root.style.setProperty(OPACITY_VARS[name], toRgba(tokens[name] ?? '#000', ops[g.part]))
      }
    }
    // The Cordis panel keeps its own input-slider alpha (see INPUT_BLUR_RULE).
    root.style.setProperty('--dsh-any-op-menu-cordis', toRgba(tokens['--dsw-specific-menu'] ?? '#000', ops.input))
    const bgKey = `${baseTokenKey}|${ops.bg}`
    if (bgKey !== lastBgKey) { lastBgKey = bgKey; applyPartOpacities(ops) }
  } catch {
    // ignore
  }
}

// ── Settings panel opacity ─────────────────────────────────────────────────────
// The settings modal is the only aria-modal dialog identifying itself with
// aria-labelledby, so this selector scopes translucency to the settings panel.
// The surface (--dsw-alias-bg-layer-2) is re-emitted with an alpha through a
// plugin-owned variable so the panel keeps its color while fading.

const SETTINGS_PANEL_SEL = '[role="dialog"][aria-modal="true"][aria-labelledby]'
export const SETTINGS_STYLE_RULE =
  `${SETTINGS_PANEL_SEL}{` +
  `background:var(--dsh-any-bg-settings-surface,var(--dsw-alias-bg-layer-2));` +
  `backdrop-filter:var(--dsh-any-blur-settings,none);` +
  // Re-scope the dialog's layer tokens to plugin-owned variables so every
  // surface inside the dialog follows the settings opacity slider only.
  `--dsw-alias-bg-layer-1:var(--dsh-any-bg-settings-layer-1);` +
  `--dsw-alias-bg-layer-2:var(--dsh-any-bg-settings-layer-2);` +
  `--dsw-alias-bg-layer-3:var(--dsh-any-bg-settings-layer-3)}` +
  // Option-panel blur inside the dialog, owned by the card blur slider.
  `${SETTINGS_PANEL_SEL} .dab-card{backdrop-filter:var(--dsh-any-blur-card-panels,none);-webkit-backdrop-filter:var(--dsh-any-blur-card-panels,none)}`

// Input/control surface blur. The composer card and the Cordis panel expose
// stable host data attributes ([data-composer-card], [data-cordis-panel]), so
// the backdrop is attached via a stylesheet rule rather than element discovery.
// The Cordis panel shares the --dsw-specific-menu token with the dialog's
// option boxes, but it stays owned by the input slider — the re-scope below
// keeps it there now that the menu token itself follows the card slider. Note
// the input slider must NOT drive the button-elevated-fill /
// button-floating-hover tokens: the settings panel's own controls (slider
// thumbs, .dab-btn, segmented thumb) are painted from those same tokens, so
// tinting them would bleach the panel's own UI.
export const INPUT_BLUR_RULE =
  '[data-composer-card],[data-cordis-panel]{' +
  '-webkit-backdrop-filter:var(--dsh-any-input-blur,none);' +
  'backdrop-filter:var(--dsh-any-input-blur,none)}' +
  '[data-cordis-panel]{--dsw-specific-menu:var(--dsh-any-op-menu-cordis)!important}'

function applyInputBlur(px: number): void {
  if (px > 0) document.documentElement.style.setProperty('--dsh-any-input-blur', `blur(${px}px)`)
  else document.documentElement.style.removeProperty('--dsh-any-input-blur')
}

// Placeholder/hint text inside the composer and the plugin's own input
// surfaces: rendered with the weak caption token (distinct from real input)
// plus italic, so an empty box is never mistaken for typed content.
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
  // Always written explicitly (including 100%) — removing them would make
  // SETTINGS_STYLE_RULE fall back to the body layer tokens that
  // applyCustomTokens rewrites with the homepage card alpha.
  const [h, s, l] = rColor()
  const tokens = genTokens(h, s, l).tokens
  const layer1 = tokens['--dsw-alias-bg-layer-1']
  const layer2 = tokens['--dsw-alias-bg-layer-2']
  const layer3 = tokens['--dsw-alias-bg-layer-3']
  if (layer2 !== undefined) {
    document.documentElement.style.setProperty('--dsh-any-bg-settings-surface', toRgba(layer2, op))
  }
  // Dialog-scoped layer overrides consumed by SETTINGS_STYLE_RULE; opacity
  // follows the settings slider only (the card slider reaches panels via blur).
  if (layer1 !== undefined) {
    document.documentElement.style.setProperty('--dsh-any-bg-settings-layer-1', toRgba(layer1, op))
  }
  if (layer2 !== undefined) {
    document.documentElement.style.setProperty('--dsh-any-bg-settings-layer-2', toRgba(layer2, op))
  }
  if (layer3 !== undefined) {
    document.documentElement.style.setProperty('--dsh-any-bg-settings-layer-3', toRgba(layer3, op))
  }
}

// ── Trajectory view opacity ──────────────────────────────────────────────
// The trajectory view's own panels fully cover the root, so retinting only the
// root background is invisible. Re-scope the view root's layer tokens to
// plugin-owned variables so every surface follows the trajectory slider.
export const TRAJECTORY_STYLE_RULE =
  '[data-conversation-composer-overlay]{' +
  // No fallback inside var(): a self-referential fallback would be a cycle.
  '--dsw-alias-bg-layer-1:var(--dsh-any-traj-layer-1);' +
  '--dsw-alias-bg-layer-2:var(--dsh-any-traj-layer-2);' +
  '--dsw-alias-bg-layer-3:var(--dsh-any-traj-layer-3)}'

export function applyTrajectoryOverrides(op: number): void {
  // Always written explicitly so the view stays owned by this slider at 100%.
  const [h, s, l] = rColor()
  const tokens = genTokens(h, s, l).tokens
  const layer1 = tokens['--dsw-alias-bg-layer-1']
  const layer2 = tokens['--dsw-alias-bg-layer-2']
  const layer3 = tokens['--dsw-alias-bg-layer-3']
  if (layer1 !== undefined) {
    document.documentElement.style.setProperty('--dsh-any-traj-layer-1', toRgba(layer1, op))
  }
  if (layer2 !== undefined) {
    document.documentElement.style.setProperty('--dsh-any-traj-layer-2', toRgba(layer2, op))
  }
  if (layer3 !== undefined) {
    document.documentElement.style.setProperty('--dsh-any-traj-layer-3', toRgba(layer3, op))
  }
}

// ── Per-part interface blur ───────────────────────────────────────────────────
// The AppFrame columns use hashed CSS-module classes, so parts are located
// structurally: the shell overlay carries a stable data attribute and the
// sidebar/center/details columns are its three preceding siblings.
//
// backdrop-filter must NEVER go directly on a host part: it turns the element
// into a containing block for fixed-positioned descendants, which would trap
// the host's settings dialog inside the column. Each blurred part carries an
// isolated ::before underlay holding the backdrop-filter instead.
let frameEl: HTMLElement | null = null
let sidebarEl: HTMLElement | null = null
let centerEl: HTMLElement | null = null
let detailsEl: HTMLElement | null = null

const PART_BLUR_CLASS = 'dab-part-blur'
const PART_UNDERLAY_CLASS = 'dab-part-underlay'
const PART_BLUR_RULE =
  `${PART_BLUR_CLASS}{isolation:isolate}` +
  `.${PART_UNDERLAY_CLASS}{position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;` +
  `backdrop-filter:var(--dsh-any-part-blur,none);-webkit-backdrop-filter:var(--dsh-any-part-blur,none)}`

let partBlurStyleEl: HTMLStyleElement | null = null

function ensurePartBlurStyle(): void {
  if (partBlurStyleEl?.isConnected) return
  partBlurStyleEl = document.createElement('style')
  partBlurStyleEl.dataset.plugin = 'dsh-background-by-model-parts'
  partBlurStyleEl.textContent = PART_BLUR_RULE
  document.head.appendChild(partBlurStyleEl)
}

function discoverParts(): void {
  const overlay = document.querySelector<HTMLElement>('[data-shell-overlay]')
  if (overlay === null) return
  const frame = overlay.parentElement
  if (frame === null) return
  frameEl = frame
  const idx = Array.from(frame.children).indexOf(overlay)
  sidebarEl = (frame.children[idx - 3] as HTMLElement | undefined) ?? null
  centerEl = (frame.children[idx - 2] as HTMLElement | undefined) ?? null
  detailsEl = (frame.children[idx - 1] as HTMLElement | undefined) ?? null
}

function setBlur(el: HTMLElement | null, px: number): void {
  if (el === null) return
  const underlay = el.querySelector<HTMLDivElement>(`:scope > .${PART_UNDERLAY_CLASS}`)
  if (px > 0) {
    ensurePartBlurStyle()
    // The underlay is position:absolute and needs a positioned host: static
    // columns get relative (a layout no-op for flex items) that is restored on
    // clear; parts the host already positions keep their own scheme.
    if (!el.classList.contains(PART_BLUR_CLASS) && getComputedStyle(el).position === 'static') {
      el.style.position = 'relative'
      el.setAttribute('data-dab-pos-patched', '1')
    }
    el.classList.add(PART_BLUR_CLASS)
    if (underlay === null) {
      const node = document.createElement('div')
      node.className = PART_UNDERLAY_CLASS
      el.prepend(node)
    }
    el.style.setProperty('--dsh-any-part-blur', `blur(${px}px)`)
  } else {
    el.classList.remove(PART_BLUR_CLASS)
    el.style.removeProperty('--dsh-any-part-blur')
    underlay?.remove()
    if (el.getAttribute('data-dab-pos-patched') === '1') {
      el.style.removeProperty('position')
      el.removeAttribute('data-dab-pos-patched')
    }
  }
}

function applySettingsBlur(px: number): void {
  if (px > 0) document.documentElement.style.setProperty('--dsh-any-blur-settings', `blur(${px}px)`)
  else document.documentElement.style.removeProperty('--dsh-any-blur-settings')
}

/** Apply the main-background opacity to the center/details columns instead of
 *  the frame. The frame's translucent bg-base sits UNDER the sidebar, so
 *  reducing the main-bg opacity stacked a second alpha onto the sidebar; moving
 *  the alpha onto the columns keeps the sidebar owned by its own slider. */
function applyPartOpacities(ops: PartOpacities): void {
  if (!rHasColor()) return
  discoverParts()
  if (frameEl === null) return
  const [h, s, l] = rColor()
  const base = genTokens(h, s, l).tokens['--dsw-alias-bg-base']
  frameEl.style.background = 'transparent'
  if (centerEl !== null) centerEl.style.background = base !== undefined ? toRgba(base, ops.bg) : 'transparent'
  if (detailsEl !== null) detailsEl.style.background = base !== undefined ? toRgba(base, ops.bg) : 'transparent'
}

/** Blur of the option panels inside the settings dialog (.dab-card), owned by
 *  the "dialog option panel" (card) blur slider. Written as a plugin-owned
 *  variable consumed by SETTINGS_STYLE_RULE — deliberately NOT applied to the
 *  homepage center/details columns, which this slider must never touch. */
function applyCardPanelsBlur(px: number): void {
  if (px > 0) document.documentElement.style.setProperty('--dsh-any-blur-card-panels', `blur(${px}px)`)
  else document.documentElement.style.removeProperty('--dsh-any-blur-card-panels')
}

/** Apply per-part interface blur to the AppFrame columns + settings panel. */
export function applyPartBlurs(blurs: PartBlurs): void {
  discoverParts()
  // The bg blur frosts the wallpaper behind the main content columns (center +
  // details); the frame itself stays unblurred so the sidebar is never
  // double-frosted by both the bg and sidebar sliders.
  setBlur(frameEl, 0)
  setBlur(sidebarEl, blurs.sidebar)
  setBlur(centerEl, blurs.bg)
  setBlur(detailsEl, blurs.bg)
  applyCardPanelsBlur(blurs.card)
  applySettingsBlur(blurs.settings)
  applyInputBlur(blurs.input)
  applyViewCards()
}

/** Live per-part blur update during slider drag (no full re-apply). */
export function setPartBlur(part: keyof PartBlurs, v: number): void {
  if (part === 'settings') { applySettingsBlur(v); return }
  if (part === 'card') { applyCardPanelsBlur(v); return }
  if (part === 'input') { applyInputBlur(v); return }
  if (part === 'chat' || part === 'trajectory') { applyViewCards(); return }
  discoverParts()
  if (part === 'bg') { setBlur(centerEl, v); setBlur(detailsEl, v) }
  else setBlur(sidebarEl, v)
}

// ── Conversation view treatments ────────────────────────────────────
// The chat message column is styled as a real card (layer-1 surface + border +
// 16px radius + 18px padding); the trajectory view gets NO card decoration —
// its own panels fully cover the view root, so its opacity slider re-scopes the
// layer tokens inside the view and its blur frosts the backdrop through the
// standard root underlay.
//
// Host structure (deepseek-harness ui-conversation / ui-trajectory):
//   ConversationRoot
//     header                     — title + tabs, OUTSIDE the scrollport
//     [data-conversation-scroll] — the single scrollport
//       [data-chat-flow]         ← chat column (flow content, NOT scrollable)
//       [data-conversation-composer-overlay] ← trajectory view root
//       [data-composer-seat]     — sticky composer, a sibling
// Cards are ALWAYS styled once their host exists — sliders at zero only turn
// surface/border transparent, so the layout never reflows and the view cannot
// jump when a slider leaves zero. Removal happens only at plugin teardown.
interface ViewCardSpec {
  sel: string
  mark: string
  /** Dataset key prefix holding the stashed pre-card inline values. */
  prev: string
  opacity: () => number
  blur: () => number
  /** Generic heuristic fallback (chat card only, hosts without the marker). */
  fallback?: boolean
  /** No card decoration — surfaces follow scoped layer tokens; only the blur
   *  underlay is attached to the host element. */
  plain?: boolean
}

const VIEW_CARDS: ViewCardSpec[] = [
  { sel: '[data-chat-flow]', mark: 'data-dab-chat-card', prev: 'dabChatPrev', opacity: rChatTextOpacity, blur: () => rBlurs().chat, fallback: true },
  { sel: '[data-conversation-composer-overlay]', mark: 'data-dab-traj-card', prev: 'dabTrajPrev', opacity: rTrajectoryOpacity, blur: () => rBlurs().trajectory, plain: true },
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
    if (cached !== null && cached !== marked) { setBlur(cached, 0); restoreCardHost(cached, spec.mark, spec.prev, spec.plain === true) }
    viewTargets[idx] = marked
    return marked
  }
  if (cached !== null && centerEl.contains(cached)) return cached
  viewTargets[idx] = null
  if (spec.fallback !== true) return null
  // On the harness, an absent [data-chat-flow] just means the chat view is not
  // mounted (hero phase, trajectory tab) — settling on the whole scrollport
  // there would wrap the entire page in the card.
  if (centerEl.querySelector('[data-conversation-scroll]') !== null) return null
  // Marker-less hosts keep their layout until a slider moves.
  if (spec.opacity() <= 0 && spec.blur() <= 0) return null
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
function stashCardPrev(el: HTMLElement, prev: string, plain: boolean): void {
  const ds = el.dataset as Record<string, string | undefined>
  ds[prev + 'Bg'] = el.style.getPropertyValue('background')
  if (plain) return
  ds[prev + 'Border'] = el.style.getPropertyValue('border')
  ds[prev + 'Radius'] = el.style.getPropertyValue('border-radius')
  ds[prev + 'Padding'] = el.style.getPropertyValue('padding')
}

/** Undo the inline styling, restoring the host's previous inline values. */
function restoreCardHost(el: HTMLElement, mark: string, prev: string, plain: boolean): void {
  if (!el.hasAttribute(mark)) return
  const ds = el.dataset as Record<string, string | undefined>
  const restore = (prop: string, v: string | undefined): void => {
    if (v !== undefined && v !== '') el.style.setProperty(prop, v)
    else el.style.removeProperty(prop)
  }
  restore('background', ds[prev + 'Bg'])
  if (!plain) {
    restore('border', ds[prev + 'Border'])
    restore('border-radius', ds[prev + 'Radius'])
    restore('padding', ds[prev + 'Padding'])
    delete ds[prev + 'Border']; delete ds[prev + 'Radius']; delete ds[prev + 'Padding']
  }
  delete ds[prev + 'Bg']
  el.removeAttribute(mark)
}

/** Teardown only: strip every view treatment and hand the hosts back untouched. */
function removeViewCards(): void {
  VIEW_CARDS.forEach((spec, i) => {
    const el = viewTargets[i]
    if (el !== null) { setBlur(el, 0); restoreCardHost(el, spec.mark, spec.prev, spec.plain === true) }
    viewTargets[i] = null
  })
}

// ── Wide markdown tables ──────────────────────────────────────────────────────
// DSH intentionally lets `.md-table-wide` bleed outside the text column. That
// bleed only becomes visible once the chat surface gains a visible border, i.e.
// when the chat region opacity or blur is non-zero. Under that same condition,
// pull the table back inside the column and let it scroll horizontally.
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

/** Toggle the wide-table clamp according to the chat region's opacity & blur. */
function syncTableFix(): void {
  const needed = rChatTextOpacity() > 0 || rBlurs().chat > 0
  if (!needed) {
    if (tableFixStyleEl !== null) { tableFixStyleEl.remove(); tableFixStyleEl = null }
    return
  }
  if (tableFixStyleEl === null) {
    tableFixStyleEl = document.createElement('style')
    tableFixStyleEl.dataset.plugin = 'dsh-background-by-model-table-fix'
    tableFixStyleEl.textContent = TABLE_FIX_RULE
  }
  if (!tableFixStyleEl.isConnected) document.head.appendChild(tableFixStyleEl)
}

/** Re-derive the conversation view cards from the current config. */
export function applyViewCards(): void {
  discoverParts()
  if (centerEl === null) return
  const [h, s, l] = rColor()
  const surface = genTokens(h, s, l).tokens['--dsw-alias-bg-layer-1']
  VIEW_CARDS.forEach((spec, i) => {
    const target = discoverViewTarget(i, spec)
    if (target === null) return
    const plain = spec.plain === true
    const opacity = spec.opacity()
    const blurPx = spec.blur()
    if (!plain) {
      if (!target.hasAttribute(spec.mark)) stashCardPrev(target, spec.prev, false)
      // Mirrors .dab-card (layer-1 background, border, 16px radius, 18px
      // padding), written inline so it wins over host stylesheets; the opacity
      // slider drives surface alpha and fades the border with it.
      const borderAlpha = opacity > 0 ? Math.min(1, opacity * 1.5) : (blurPx > 0 ? 0.35 : 0)
      target.style.background = surface !== undefined ? toRgba(surface, opacity) : 'transparent'
      target.style.border = surface !== undefined ? `1px solid ${toRgba(surface, borderAlpha)}` : '1px solid transparent'
      target.style.borderRadius = '16px'
      target.style.padding = '18px'
    }
    // Plain views write no inline styles — only the blur underlay is hosted here.
    target.setAttribute(spec.mark, '1')
    setBlur(target, blurPx)
  })
  syncTableFix()
}

let partsObserver: MutationObserver | null = null

/** Watch for the AppFrame mounting so persisted blurs land even when the shell
 *  renders after this plugin's apply. */
export function watchParts(): void {
  if (partsObserver !== null || typeof MutationObserver === 'undefined') return
  partsObserver = new MutationObserver(() => {
    if (frameEl !== null && sidebarEl !== null && centerEl !== null && detailsEl !== null && document.body.contains(frameEl)
      // Keep re-applying while any card host is absent or was swapped by the host.
      && viewTargets.every(el => el !== null && document.body.contains(el))) return
    applyPartBlurs(rBlurs())
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
  if (l < 0.55) document.body.setAttribute('data-ds-dark-theme', 'dsh-background-by-model')
  else document.body.removeAttribute('data-ds-dark-theme')
  applyCustomTokens(rOps())
}

/** Re-assert the plugin's forced scheme whenever the host strips it, so a
 *  refresh / cold-load / set-change never flashes a light frame. */
export function watchThemeResets(): () => void {
  if (themeObserver !== null || typeof MutationObserver === 'undefined') return () => undefined
  themeObserver = new MutationObserver(() => {
    if (document.body.getAttribute('data-ds-dark-theme') === 'dsh-background-by-model') return
    if (!rHasColor()) return
    if (themeRaf !== 0) return
    themeRaf = requestAnimationFrame(() => {
      themeRaf = 0
      if (document.body.getAttribute('data-ds-dark-theme') === 'dsh-background-by-model') return
      reassertScheme()
    })
  })
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  return () => {
    themeObserver?.disconnect()
    themeObserver = null
  }
}

// ── Wallpaper layer ─────────────────────────────────────────────────────────
function ensureWpContainer(): void {
  if (!wpEl || !document.body.contains(wpEl)) {
    wpEl = document.createElement('div')
    wpEl.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;'
    document.body.prepend(wpEl)
  }
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

// ── Drag-time wallpaper downscaling ──────────────────────────────────────────
// Repainting translucent surfaces over a full-resolution wallpaper is expensive
// (proportional to the image's pixel area, worse under backdrop blur). During a
// slider drag we swap the layer's background-image to a bounded-size JPEG copy,
// slashing that per-frame raster cost; the full-res image is restored on release
// and stays browser-cached, so the swap is cheap.
const DRAG_MAX_SIDE = 720

let lowResUrl: string | null = null
let lowResFor = ''
let dragLow = false

function captureLowRes(url: string, cb: (low: string | null) => void): void {
  if (lowResFor === url) { cb(lowResUrl); return }
  const img = new Image()
  img.onload = () => {
    const k = Math.min(1, DRAG_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    if (k >= 1) { lowResFor = url; lowResUrl = null; cb(null); return }
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * k))
    c.height = Math.max(1, Math.round(img.naturalHeight * k))
    const g = c.getContext('2d')
    if (!g) { lowResFor = url; lowResUrl = null; cb(null); return }
    g.drawImage(img, 0, 0, c.width, c.height)
    const low = c.toDataURL('image/jpeg', 0.85)
    lowResFor = url; lowResUrl = low
    cb(low)
  }
  img.onerror = () => cb(null)
  img.src = url
}

function setDragLow(on: boolean): void {
  if (on === dragLow || !wpEl) return
  const full = rWp()
  if (!full) return
  if (on) {
    dragLow = true
    captureLowRes(full, low => {
      if (!dragLow || !wpEl || low === null) return
      if (wpEl.style.backgroundImage !== `url("${low}")`) wpEl.style.backgroundImage = `url("${low}")`
    })
  } else {
    dragLow = false
    if (wpEl.style.backgroundImage !== `url("${full}")`) wpEl.style.backgroundImage = `url("${full}")`
  }
}

/** While any range slider in the app is being dragged, run the wallpaper at
 *  reduced resolution; restore on release. Returns a disposer for teardown. */
export function watchWallpaperDragQuality(): () => void {
  const isRange = (t: EventTarget | null): boolean =>
    t instanceof HTMLInputElement && t.type === 'range'
  const down = (e: PointerEvent): void => { if (isRange(e.target)) setDragLow(true) }
  const up = (): void => { if (dragLow) setDragLow(false) }
  window.addEventListener('pointerdown', down, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)
  return () => {
    window.removeEventListener('pointerdown', down, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', up, true)
    if (dragLow) setDragLow(false)
  }
}

function applyImageWp(url: string): void {
  ensureWpContainer()
  const bg = rBgState()
  const mode = rBgMode()
  const next = `url("${url}")`
  // Skip re-setting the same data URL — re-decoding it flashes the wallpaper
  // blank for a frame on boot re-applies.
  if (wpEl!.style.backgroundImage !== next) {
    wpEl!.style.backgroundImage = next
  }
  if (mode === 'fit') {
    wpEl!.style.backgroundRepeat = 'no-repeat'
    if (bg.iw > 0) {
      // Contain-fit at zoom with the image center pinned to the committed
      // fractional viewport point, so the framed region survives viewport changes.
      const fit = Math.min(window.innerWidth / bg.iw, window.innerHeight / bg.ih)
      const w = bg.iw * fit * bg.zoom
      const h = bg.ih * fit * bg.zoom
      wpEl!.style.backgroundSize = `${w}px ${h}px`
      wpEl!.style.backgroundPosition = `${bg.x * window.innerWidth - w / 2}px ${bg.y * window.innerHeight - h / 2}px`
    } else {
      // Fresh image: match the editor's initial centered contain view.
      wpEl!.style.backgroundSize = 'contain'
      wpEl!.style.backgroundPosition = 'center'
    }
  } else if (mode === 'fill') {
    wpEl!.style.backgroundRepeat = 'no-repeat'
    wpEl!.style.backgroundSize = 'cover'
    wpEl!.style.backgroundPosition = 'center'
  } else if (mode === 'stretch') {
    wpEl!.style.backgroundRepeat = 'no-repeat'
    wpEl!.style.backgroundSize = '100% 100%'
    wpEl!.style.backgroundPosition = 'center'
  } else if (mode === 'tile') {
    wpEl!.style.backgroundRepeat = 'repeat'
    // background-size:auto resolves the intrinsic size per tile.
    wpEl!.style.backgroundSize = 'auto'
    wpEl!.style.backgroundPosition = '0px 0px'
  } else {
    // Center: native size, centered. The intrinsic size needs an async decode;
    // 'contain' keeps a sensible frame until it lands.
    wpEl!.style.backgroundRepeat = 'no-repeat'
    wpEl!.style.backgroundSize = 'contain'
    wpEl!.style.backgroundPosition = 'center'
    imageNatSize(url, (w, h) => {
      if (!wpEl || wpEl.style.backgroundImage !== next || rBgMode() !== 'center') return
      if (w > 0 && h > 0) {
        wpEl.style.backgroundSize = `${w}px ${h}px`
        wpEl.style.backgroundPosition = 'center'
      }
    })
  }
  // Precompute the drag-time downscaled copy now so the first drag swaps without
  // a decode hitch (the original is already loaded, so this hits the cache).
  captureLowRes(url, () => undefined)
  applyWpEffects()
}

function applyWpEffects(): void {
  if (!wpEl) return
  const blur = rBl()
  wpEl.style.filter = blur > 0 ? `blur(${blur}px)` : 'none'
  wpEl.style.opacity = String(rWop())
}

/** Repaint the wallpaper layer, the token palette and every interface part from
 *  the ACTIVE rule. This is the single entry point a rule switch goes through. */
export function applyWp(): void {
  const url = rWp()
  if (url) {
    applyImageWp(url)
  } else {
    // No background: tear down the layer but keep tokens/blur intact.
    wpEl?.remove(); wpEl = null
  }
  if (rHasColor()) {
    applyCustomTokens(rOps())
    applySettingsOverrides(rSop())
    applyTrajectoryOverrides(rTrajectoryOpacity())
  } else {
    // A rule without a saved color means "use the system theme" — drop the
    // plugin's overrides so the host palette shows through.
    clearCustomTokens()
    document.body.removeAttribute('data-ds-dark-theme')
    baseTokenKey = ''
    lastBgKey = ''
  }
  applyPartBlurs(rBlurs())
}

export function teardownWp(): void {
  wpEl?.remove(); wpEl = null
  clearCustomTokens()
  tokenStyleEl?.remove(); tokenStyleEl = null
  removeViewCards()
  document.body.removeAttribute('data-ds-dark-theme')
  document.body.style.removeProperty('color-scheme')
  document.documentElement.style.removeProperty('--dsh-any-bg-settings-surface')
  document.documentElement.style.removeProperty('--dsh-any-bg-settings-layer-1')
  document.documentElement.style.removeProperty('--dsh-any-bg-settings-layer-2')
  document.documentElement.style.removeProperty('--dsh-any-bg-settings-layer-3')
  document.documentElement.style.removeProperty('--dsh-any-traj-layer-1')
  document.documentElement.style.removeProperty('--dsh-any-traj-layer-2')
  document.documentElement.style.removeProperty('--dsh-any-traj-layer-3')
  document.documentElement.style.removeProperty('--dsh-any-blur-settings')
  document.documentElement.style.removeProperty('--dsh-any-blur-card-panels')
  document.documentElement.style.removeProperty('--dsh-any-input-blur')
  for (const v of Object.values(OPACITY_VARS)) document.documentElement.style.removeProperty(v)
  baseTokenKey = ''
  lastBgKey = ''
  if (tokensRaf !== null) { cancelAnimationFrame(tokensRaf); tokensRaf = null }
  pendingOps = null
  tableFixStyleEl?.remove(); tableFixStyleEl = null
  setBlur(frameEl, 0); setBlur(sidebarEl, 0); setBlur(centerEl, 0); setBlur(detailsEl, 0)
  if (frameEl !== null) frameEl.style.removeProperty('background')
  if (centerEl !== null) centerEl.style.removeProperty('background')
  if (detailsEl !== null) detailsEl.style.removeProperty('background')
  stopWatchingParts()
}

/** Live wallpaper-opacity updates during slider drag (no full re-apply). */
export function setWpOpacity(v: number): void {
  if (wpEl) wpEl.style.opacity = String(v)
}

/** Live wallpaper-blur updates during slider drag (no full re-apply). */
export function setWpBlur(v: number): void {
  if (wpEl) wpEl.style.filter = v > 0 ? `blur(${v}px)` : 'none'
}
