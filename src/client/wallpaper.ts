import { rWp, rBgState, rBl, rWop, rOps, rSop, rColor, rHasColor, rBlurs, rBgMode, rChatTextOpacity, rTrajectoryOpacity, rRightbarOpacity } from './state'
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

// ── File-preview panel (right sidebar) ────────────────────────────────────
// Clicking a file opens the host's right panel, whose whole visible surface is
// `background: var(--dsw-alias-bg-base)` — the exact token the main-background
// slider re-emits with its own alpha. The panel was therefore a second, unnamed
// copy of the main background with no control of its own; this card takes it
// over. The declaration is written from a stylesheet (not element discovery)
// because the panel stays mounted across open/close, and the selector carries a
// `div` prefix so it outranks the host's hashed class rule. `!important` covers
// a later host rule that is at least as specific (such as an
// `[data-sidebar-right-open]` variant). The `var()` fallback keeps the host's own
// value until a rule with a color supplies one, so a color-less rule changes
// nothing here.
//
// backdrop-filter goes directly on the panel: the settings dialog and the
// composer already take theirs that way, and the panel holds no fixed-position
// descendant whose containing block could be trapped (the float layer is
// portaled out to <body>).
export const RIGHTBAR_STYLE_RULE =
  'div[data-sidebar-right-panel]{' +
  'background:var(--dsh-any-bg-rightbar,var(--dsw-alias-bg-base))!important;' +
  '-webkit-backdrop-filter:var(--dsh-any-blur-rightbar,none);' +
  'backdrop-filter:var(--dsh-any-blur-rightbar,none)}'

/** Paint the file-preview panel's surface from its own slider. */
export function applyRightbarOverrides(op: number): void {
  const root = document.documentElement
  // With no rule color the plugin owns no palette at all, so the panel must fall
  // back to the host's own --dsw-alias-bg-base rather than to ours.
  if (!rHasColor()) { root.style.removeProperty('--dsh-any-bg-rightbar'); return }
  const [h, s, l] = rColor()
  const base = genTokens(h, s, l).tokens['--dsw-alias-bg-base']
  if (base !== undefined) root.style.setProperty('--dsh-any-bg-rightbar', toRgba(base, op))
}

/** Extra backdrop frost for the file-preview panel (0 = no frost of its own). */
function applyRightbarBlur(px: number): void {
  if (px > 0) document.documentElement.style.setProperty('--dsh-any-blur-rightbar', `blur(${px}px)`)
  else document.documentElement.style.removeProperty('--dsh-any-blur-rightbar')
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
  applyRightbarBlur(blurs.rightbar)
  applyViewCards()
}

/** Live per-part blur update during slider drag (no full re-apply). */
export function setPartBlur(part: keyof PartBlurs, v: number): void {
  if (part === 'settings') { applySettingsBlur(v); return }
  if (part === 'card') { applyCardPanelsBlur(v); return }
  if (part === 'input') { applyInputBlur(v); return }
  if (part === 'rightbar') { applyRightbarBlur(v); return }
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

// ── Wallpaper layer: two stacked layers, cross-faded on a rule switch ───────
// The incoming image fades in ON TOP of the outgoing one at full opacity.
// Fading the old one out at the same time would drop the composite below full
// alpha at the midpoint — both images half transparent — and the interface
// behind would flash through.
//
// A layer addresses its image by OBJECT URL (see displayImageOf in state):
// assigning a `url(data:…)` background re-decodes the photo on every switch,
// which is where a large wallpaper's stall comes from, while a blob URL is
// served from the browser's memory cache after the first load.
const FADE_MS = 320

interface WpLayer {
  el: HTMLDivElement
  /** Display URL of the image painted on this layer; null when empty. */
  url: string | null
}

let layers: [WpLayer, WpLayer] | null = null
/** Index of the layer the user is looking at. */
let front = 0
/** Index of the layer fading in right now, if any. */
let pending: 0 | 1 | null = null
let fadeTimer: number | null = null

function createLayer(): WpLayer {
  const el = document.createElement('div')
  el.dataset.dabWpLayer = ''
  el.style.cssText = 'position:absolute;inset:0;opacity:0;background-repeat:no-repeat;background-position:center;'
  return { el, url: null }
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
  document.body.prepend(wpEl)
}

/** Drop the whole wallpaper layer (no rule carries an image). */
function dropWpContainer(): void {
  if (fadeTimer !== null) { window.clearTimeout(fadeTimer); fadeTimer = null }
  pending = null
  front = 0
  layers = null
  wpEl?.remove()
  wpEl = null
}

/** Release one layer's image — the layer is fully covered when this is called. */
function clearLayer(l: WpLayer): void {
  if (l.url === null) return
  l.url = null
  l.el.style.backgroundImage = ''
  l.el.style.backgroundSize = ''
  l.el.style.backgroundPosition = ''
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
  if (mode === 'fit') {
    el.style.backgroundRepeat = 'no-repeat'
    if (bg.iw > 0) {
      // Contain-fit at zoom with the image center pinned to the committed
      // fractional viewport point, so the framed region survives viewport changes.
      const fit = Math.min(window.innerWidth / bg.iw, window.innerHeight / bg.ih)
      const w = bg.iw * fit * bg.zoom
      const h = bg.ih * fit * bg.zoom
      el.style.backgroundSize = `${w}px ${h}px`
      el.style.backgroundPosition = `${bg.x * window.innerWidth - w / 2}px ${bg.y * window.innerHeight - h / 2}px`
    } else {
      // Fresh image: match the editor's initial centered contain view.
      el.style.backgroundSize = 'contain'
      el.style.backgroundPosition = 'center'
    }
  } else if (mode === 'fill') {
    el.style.backgroundRepeat = 'no-repeat'
    el.style.backgroundSize = 'cover'
    el.style.backgroundPosition = 'center'
  } else if (mode === 'stretch') {
    el.style.backgroundRepeat = 'no-repeat'
    el.style.backgroundSize = '100% 100%'
    el.style.backgroundPosition = 'center'
  } else if (mode === 'tile') {
    el.style.backgroundRepeat = 'repeat'
    // background-size:auto resolves the intrinsic size per tile.
    el.style.backgroundSize = 'auto'
    el.style.backgroundPosition = '0px 0px'
  } else {
    // Center: native size, centered. The intrinsic size needs an async decode;
    // 'contain' keeps a sensible frame until it lands.
    el.style.backgroundRepeat = 'no-repeat'
    el.style.backgroundSize = 'contain'
    el.style.backgroundPosition = 'center'
    imageNatSize(url, (w, h) => {
      if (l.url !== url || el.style.backgroundImage !== next || rBgMode() !== 'center') return
      if (w > 0 && h > 0) {
        el.style.backgroundSize = `${w}px ${h}px`
        el.style.backgroundPosition = 'center'
      }
    })
  }
}

/** Whether a switch should animate: nothing to fade from, an invisible
 *  wallpaper and a reduced-motion preference all switch instantly. */
function canFade(from: WpLayer): boolean {
  if (from.url === null) return false
  if (rWop() <= 0.01) return false
  const mm = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  return mm === null || !mm.matches
}

/** End an in-flight fade: promote the incoming layer, free the one under it. */
function finishFade(idx: 0 | 1): void {
  if (layers === null || pending !== idx) return
  if (fadeTimer !== null) { window.clearTimeout(fadeTimer); fadeTimer = null }
  pending = null
  front = idx
  const el = layers[idx].el
  // Re-asserted so a fade whose frames never ran (background tab) still ends on
  // the visible image.
  el.style.opacity = '1'
  el.style.willChange = ''
  // Covered from here on: drop its bytes so a second full-resolution image is
  // never left decoded behind the visible one.
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
    if (ls[pending].url === url) { paintLayer(ls[pending], url); applyWpEffects(); return }
    if (ls[front].url === url) { cancelFade(); paintLayer(ls[front], url); applyWpEffects(); return }
    settleFade()
  }
  if (ls[front].url === url) { paintLayer(ls[front], url); applyWpEffects(); return }
  const from = ls[front]
  const idx: 0 | 1 = front === 0 ? 1 : 0
  const target = ls[idx]
  const el = target.el
  // Rewind the incoming layer before its bytes land, so a stale image from an
  // earlier switch can never flash through while the new one rasterizes.
  el.style.transition = 'none'
  el.style.opacity = '0'
  el.style.zIndex = '1'
  from.el.style.zIndex = '0'
  paintLayer(target, url)
  applyWpEffects()
  if (!canFade(from)) {
    el.style.opacity = '1'
    front = idx
    clearLayer(from)
    return
  }
  // will-change promotes the layer in this frame, so the fade itself is a pure
  // compositor animation that survives the main-thread work a switch triggers
  // (theme re-registration, token rewrite, settings-panel re-render).
  el.style.willChange = 'opacity'
  pending = idx
  requestAnimationFrame(() => {
    if (pending !== idx || layers === null) return
    el.style.transition = `opacity ${FADE_MS}ms ease`
    el.style.opacity = '1'
  })
  fadeTimer = window.setTimeout(() => finishFade(idx), FADE_MS + 160)
}

function applyWpEffects(): void {
  if (wpEl === null || layers === null) return
  wpEl.style.opacity = String(rWop())
  // The blur sits on each LAYER rather than on the container: with the filter on
  // the parent, every frame of an opacity fade would re-run a full-screen blur
  // instead of just re-compositing the blurred surface.
  const blur = rBl()
  const filter = blur > 0 ? `blur(${blur}px)` : ''
  layers[0].el.style.filter = filter
  layers[1].el.style.filter = filter
}

/** Repaint the wallpaper layer, the token palette and every interface part from
 *  the ACTIVE rule. This is the single entry point a rule switch goes through. */
export function applyWp(): void {
  const url = rWp()
  if (url) {
    applyImageWp(url)
  } else if (wpEl !== null) {
    // No background: tear down the layer but keep tokens/blur intact.
    dropWpContainer()
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
  // Self-guarding: writes the panel's own surface only while a color rule is
  // active, and hands the panel back to the host token otherwise.
  applyRightbarOverrides(rRightbarOpacity())
  applyPartBlurs(rBlurs())
}

export function teardownWp(): void {
  dropWpContainer()
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
  document.documentElement.style.removeProperty('--dsh-any-bg-rightbar')
  document.documentElement.style.removeProperty('--dsh-any-blur-rightbar')
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
  if (layers === null) return
  const filter = v > 0 ? `blur(${v}px)` : ''
  layers[0].el.style.filter = filter
  layers[1].el.style.filter = filter
}
