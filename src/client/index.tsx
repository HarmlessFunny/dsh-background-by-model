/**
 * dsh-background-by-model — browser half entry.
 *
 * Wires the plugin lifecycle: rule resolution against the current model,
 * wallpaper layer, theme skin, viewport watch, i18n, settings-section injection,
 * boot restore and watchdogs. The heavy lifting lives in the sibling modules
 * (state / modelbg / rpc / wallpaper / components).
 */
import { defineStore } from './runtime'
import type {
  Ctx, RpcResultLike, ThemeSectionProps, PartOpacities, PartBlurs, BgRule, FetchResult,
} from './types'
import { NS, zh, en } from './i18n'
import {
  cfg, adoptConfig, imageOf, displayImageOf, setImage, newRule, nextSlot, nextRuleId, ruleById,
  normalizeRule, setActive, setModelLabel, activeRuleId, activeMatched, modelLabel, rWp,
} from './state'
import {
  RPC_CHANNEL, initRpc, saveConfig, flushSave, persistConfig, loadPersisted,
  readImage, writeImage, deleteImage, fetchImageUrl, readDefaultModel,
} from './rpc'
import {
  applyWp, teardownWp, applySettingsOverrides, SETTINGS_STYLE_RULE, TRAJECTORY_STYLE_RULE,
  INPUT_BLUR_RULE, PLACEHOLDER_RULE, watchParts, watchThemeResets,
} from './wallpaper'
import { genTokens, extractWallpaperColor } from './utils/color'
import { matchRule, watchModel } from './modelbg'
import { ThemeSection } from './components/ThemeSection'
import { SUN_PATHS } from './components/icons'

export const name = 'dsh-background-by-model'
export const inject = ['slots', 'locale', 'theme', 'connection']

const CUSTOM_ID = 'custom-color'

export function apply(ctx: Ctx): void {
  // Bind the dedicated `/dsh-background-by-model` RPC caller so the persistence
  // module can reach the node half's file-backed store.
  initRpc((endpoint, payload) =>
    ctx.connection.rpc.call(RPC_CHANNEL, endpoint, payload).then((res: any) => res as RpcResultLike | undefined)
  )

  // ── 1. Custom theme skin, driven by the ACTIVE rule's color ────────────────
  let customDispose: (() => void) | null = null
  // Trailing debounce for the theme-skin switch (see applyActive): a color drag
  // would otherwise dispose + re-register + re-activate the host theme on every
  // pointer move.
  let skinTimer: number | null = null
  const registerCustom = (h: number, s: number, l: number): void => {
    customDispose?.()
    try {
      const { colorScheme, tokens } = genTokens(h, s, l)
      customDispose = ctx.theme.register({ id: CUSTOM_ID, colorScheme, tokens })
    } catch {
      // A live registration from an earlier HMR apply pass cannot be torn down
      // here; keep it and activate it below. Without this the duplicate-id
      // throw would abort apply and skip the wallpaper/opacity restore.
      customDispose = null
    }
    // Only activate the custom theme if it is actually registered.
    if (ctx.theme.getTheme().themes.some(t => t.id === CUSTOM_ID)) {
      ctx.theme.setTheme(CUSTOM_ID)
    }
  }
  /** A rule without a saved color means "follow the system theme". */
  const dropCustom = (): void => {
    customDispose?.()
    customDispose = null
    try {
      if (ctx.theme.getTheme().preference === CUSTOM_ID) ctx.theme.setTheme('system')
    } catch {
      // A host build without a `system` preference keeps its own choice.
    }
  }
  ctx.effect(() => () => {
    if (skinTimer !== null) window.clearTimeout(skinTimer)
    customDispose?.()
  }, 'dsh-background-by-model: skin dispose')

  // ── 2. Gradient CSS (for custom dark themes) + static rules ────────────────
  const styleEl = document.createElement('style')
  styleEl.dataset.plugin = 'dsh-background-by-model'
  // The gradient only applies while applyCustomTokens marks the body with the
  // plugin's own dark-mode value, avoiding matches against the host's attribute.
  styleEl.textContent = `body[data-ds-dark-theme="dsh-background-by-model"]::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(255,255,255,0.03) 0%,transparent 60%)}${SETTINGS_STYLE_RULE}${TRAJECTORY_STYLE_RULE}${INPUT_BLUR_RULE}` + PLACEHOLDER_RULE
  document.head.appendChild(styleEl)
  ctx.effect(() => () => { styleEl?.parentNode?.removeChild(styleEl) }, 'dsh-background-by-model: gradient')

  // ── 3. State store ────────────────────────────────────────────────────────
  let rev = 0
  let rulesRev = 0
  let modelText = ''
  let modelSource: 'session' | 'default' = 'default'
  // Why no per-session model is available yet ('waiting' until the sessions
  // service mounts, then the failing hop, then 'fallback'). Shown by the status
  // readout so a dead hop is never mistaken for a real model.
  let modelNote = 'waiting'
  // Text + source last acted on, so the watch's forced re-emits (and the 1.5 s
  // safety poll) cannot re-run the whole apply while nothing changed.
  let modelKey = '\u0000'
  const store = defineStore({
    init: () => ({
      url: null as string | null,
      rev: -1,
      rulesRev: -1,
      model: '',
      modelSource: 'session' as 'session' | 'default',
      modelNote: 'waiting',
      activeRuleId: null as string | null,
      matched: false,
    }),
    actions: {
      sync: (d: any, url: string | null, r: number, rr: number, model: string, source: 'session' | 'default', note: string, id: string | null, matched: boolean) => {
        if (r > d.rev) { d.url = url; d.rev = r }
        if (rr > d.rulesRev) d.rulesRev = rr
        d.model = model
        d.modelSource = source
        d.modelNote = note
        d.activeRuleId = id
        d.matched = matched
      },
    },
  })
  let bound: { sync: (...a: any[]) => void } | null = null
  const sync = (): void => {
    rev++
    bound?.sync(rWp(), rev, rulesRev, modelLabel !== '' ? modelLabel : modelText, modelSource, modelNote, activeRuleId, activeMatched)
  }

  /** Resolve the active rule for the current model and repaint everything. */
  const applyActive = (): void => {
    const { rule, matched } = matchRule(cfg.rules, modelText)
    setActive(rule === null ? null : rule.id, matched)
    const color = rule === null ? null : rule.color
    // The skin is a host-visible switch (dispose + register + activate) and is
    // batched; the wallpaper and tokens below land immediately either way.
    if (skinTimer !== null) window.clearTimeout(skinTimer)
    skinTimer = window.setTimeout(() => {
      skinTimer = null
      if (color === null) dropCustom()
      else registerCustom(color[0], color[1], color[2])
    }, 60)
    applyWp()
    sync()
  }

  // ── 4. First paint + the AppFrame watch ───────────────────────────────────
  applyWp()
  sync()
  watchParts()

  // ── 5. Model watch ────────────────────────────────────────────────────────
  // The session's own durable model selection is the authority; the host default
  // is only a last resort, and the settings page labels it as such.
  const offModel = watchModel(ctx, (text, label, source, note) => {
    const key = `${text}\u0001${source}\u0001${note}`
    if (key === modelKey) return
    const textChanged = text !== modelText
    modelKey = key
    modelText = text
    modelSource = source
    modelNote = note
    setModelLabel(label !== '' ? label : text)
    // A note-only change (e.g. still waiting for the sessions service) must
    // refresh the readout without repainting the whole interface.
    if (textChanged) applyActive()
    else sync()
  })
  ctx.effect(() => () => offModel(), 'dsh-background-by-model: model watch')
  // A trimmed client (or one whose session is not materialized yet) leaves the
  // per-session sources empty; the host's default model is a coarse but honest
  // stand-in, tagged so the UI never claims it is this session's selection.
  void (async () => {
    if (modelText !== '') return
    const fallback = await readDefaultModel()
    if (fallback !== null && modelText === '') {
      modelKey = `${fallback}\u0001default\u0001fallback`
      modelText = fallback
      modelSource = 'default'
      modelNote = 'fallback'
      setModelLabel(fallback)
      applyActive()
    }
  })()

  // ── 6. Boot restore ───────────────────────────────────────────────────────
  void (async () => {
    const persisted = await loadPersisted()
    if (persisted !== null) {
      adoptConfig(persisted.config)
      const slots = Array.from(new Set([...persisted.slots, ...cfg.rules.map(r => r.slot)]))
      // The active rule's bytes paint first; the remaining slots stream in after
      // so a large multi-rule setup never delays the first frame.
      const priority = matchRule(cfg.rules, modelText).rule
      const first = priority === null ? null : priority.slot
      const order = first === null ? slots : [first, ...slots.filter(s => s !== first)]
      for (const slot of order) {
        if (imageOf(slot) !== null) continue
        const url = await readImage(slot)
        if (url !== null) setImage(slot, url)
        if (slot === first) applyActive()
      }
    }
    applyActive()
  })()

  ctx.effect(() => () => { teardownWp() }, 'dsh-background-by-model: wp cleanup')

  ctx.effect(() => ctx.on('theme/change', () => {
    // The custom theme's preference lives in memory, so a host adoption can
    // silently reset it; re-assert it while the active rule has a color. Guard
    // on registry presence — registerCustom disposes the old skin first, so
    // during that transient the registry lacks CUSTOM_ID.
    if (activeRuleColor() !== null) {
      const snapshot = ctx.theme.getTheme()
      if (snapshot.preference !== CUSTOM_ID && snapshot.themes.some(t => t.id === CUSTOM_ID)) {
        ctx.theme.setTheme(CUSTOM_ID)
      }
    }
    applyWp()
  }), 'dsh-background-by-model: theme change')

  // Wallpaper placement is computed in absolute viewport pixels, so watch the
  // viewport itself: a fixed inset:0 sentinel's box always equals the viewport,
  // so a ResizeObserver on it catches any viewport change (window resize,
  // monitor moves, panel splitters, zoom); a resolution media query catches
  // DPI-only moves. Re-applies are coalesced to one per animation frame.
  let frame = 0
  const applySoon = (): void => {
    if (frame !== 0) return
    frame = requestAnimationFrame(() => { frame = 0; applyWp() })
  }
  const sentinel = document.createElement('div')
  sentinel.style.cssText = 'position:fixed;inset:0;pointer-events:none;visibility:hidden'
  document.body.append(sentinel)
  const viewportObserver = new ResizeObserver(applySoon)
  viewportObserver.observe(sentinel)
  const dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  dprQuery.addEventListener('change', applySoon)
  ctx.effect(() => () => {
    viewportObserver.disconnect()
    dprQuery.removeEventListener('change', applySoon)
    sentinel.remove()
  }, 'dsh-background-by-model: viewport watch')

  // ── 7. Locale ─────────────────────────────────────────────────────────────
  ctx.effect(() => ctx.locale.register(NS, { zh, en }) as any, 'dsh-background-by-model: i18n')

  // ── 8. Section injection ──────────────────────────────────────────────────
  const sectionInject = (actions: { sync: (...a: any[]) => void }): Omit<ThemeSectionProps, 'useStore'> => {
    bound = actions
    sync()
    return {
      t: ctx.locale.bind(NS),
      imageOf: (slot: string) => displayImageOf(slot),
      addRule: (): string => {
        const rule = newRule(nextRuleId(), nextSlot())
        cfg.rules.push(rule)
        rulesRev++
        persistConfig()
        applyActive()
        return rule.id
      },
      removeRule: (id: string): void => {
        const idx = cfg.rules.findIndex(r => r.id === id)
        if (idx < 0) return
        const [rule] = cfg.rules.splice(idx, 1)
        if (rule !== undefined && !cfg.rules.some(r => r.slot === rule.slot)) {
          setImage(rule.slot, null)
          void deleteImage(rule.slot)
        }
        rulesRev++
        persistConfig()
        applyActive()
      },
      moveRule: (id: string, dir: -1 | 1): void => {
        const idx = cfg.rules.findIndex(r => r.id === id)
        const to = idx + dir
        if (idx < 0 || to < 0 || to >= cfg.rules.length) return
        const [rule] = cfg.rules.splice(idx, 1)
        cfg.rules.splice(to, 0, rule!)
        rulesRev++
        persistConfig()
        applyActive()
      },
      setRule: (id: string, patch: Partial<BgRule>): void => {
        const rule = ruleById(id)
        if (rule === null) return
        Object.assign(rule, patch)
        const normalized = normalizeRule(rule)
        if (normalized !== null) Object.assign(rule, normalized)
        rulesRev++
        // Text/color/slider edits arrive per keystroke and per pointer move, so
        // the write is coalesced; structural edits below stay immediate.
        saveConfig()
        if (id === activeRuleId) applyActive()
        else sync()
      },
      setRuleImage: (id: string, dataUrl: string | null): void => {
        const rule = ruleById(id)
        if (rule === null) return
        setImage(rule.slot, dataUrl)
        void (dataUrl === null ? deleteImage(rule.slot) : writeImage(rule.slot, dataUrl))
        if (id === activeRuleId) applyActive()
        else sync()
      },
      setRuleImageFromUrl: async (id: string, url: string): Promise<FetchResult> => {
        const rule = ruleById(id)
        if (rule === null) return { ok: false, error: 'unknown rule' }
        const res = await fetchImageUrl(rule.slot, url)
        if (res.ok) {
          setImage(rule.slot, res.dataUrl ?? null)
          if (id === activeRuleId) applyActive()
          else sync()
        }
        return res
      },
      extractColor: async (id: string): Promise<boolean> => {
        const rule = ruleById(id)
        if (rule === null) return false
        const url = displayImageOf(rule.slot)
        if (url === null) return false
        const hsl = await extractWallpaperColor(url, rule.bgState)
        if (hsl === null) return false
        rule.color = hsl
        rulesRev++
        saveConfig()
        if (id === activeRuleId) applyActive()
        else sync()
        return true
      },
      setOps: (ops: PartOpacities): void => { cfg.opacities = ops; applyWp(); sync(); saveConfig() },
      setBlurs: (blurs: PartBlurs): void => { cfg.blurs = blurs; applyWp(); sync(); saveConfig() },
      setSop: (v: number): void => { cfg.settingsOpacity = v; applySettingsOverrides(v); saveConfig() },
      // Download every rule plus its image as one JSON file.
      exportTheme: (): void => {
        const images: Record<string, string> = {}
        for (const rule of cfg.rules) {
          const url = imageOf(rule.slot)
          if (url !== null) images[rule.slot] = url
        }
        const payload = {
          version: 3,
          exportedAt: new Date().toISOString(),
          config: cfg,
          images,
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'dsh-background-by-model-theme.json'
        a.click()
        URL.revokeObjectURL(url)
      },
      // Import: replaces the whole rule set and every rule image.
      importTheme: async (file: File): Promise<boolean> => {
        try {
          const data: unknown = JSON.parse(await file.text())
          if (!data || typeof data !== 'object') return false
          const d = data as { version?: number; config?: unknown; images?: unknown }
          if (typeof d.config !== 'object' || d.config === null) return false
          adoptConfig(d.config)
          const incoming = (d.images ?? {}) as Record<string, unknown>
          const keep = new Set<string>()
          for (const rule of cfg.rules) {
            keep.add(rule.slot)
            const raw = incoming[rule.slot]
            if (typeof raw === 'string' && /^data:image\//.test(raw)) {
              setImage(rule.slot, raw)
              void writeImage(rule.slot, raw)
            } else {
              setImage(rule.slot, null)
              void deleteImage(rule.slot)
            }
          }
          // Slots the imported config no longer references are released.
          for (const slot of Object.keys(incoming)) {
            if (!keep.has(slot) && /^[A-Za-z0-9_-]{1,32}$/.test(slot)) void deleteImage(slot)
          }
          persistConfig()
          applyActive()
          return true
        } catch {
          return false
        }
      },
    }
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'dsh-background-by-model', order: 35,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS, store, inject: sectionInject,
  }, ThemeSection as any))

  // ── 9. Settings-nav icon ──────────────────────────────────────────────────
  // The harness derives the nav glyph from the section id (unknown ids fall back
  // to the settings gear) with no plugin hook, so patch the mounted nav cell in
  // place — find the cell whose label matches this section's nav text and swap
  // its svg for the sun glyph.
  const navLabel = (): string => ctx.locale.bind(NS)('nav')
  const applyNavIcon = (): void => {
    const panel = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"][aria-labelledby]')
    const nav = panel?.querySelector('nav')
    if (!nav) return
    const target = navLabel()
    for (const cell of Array.from(nav.querySelectorAll('button'))) {
      const label = cell.querySelector('span')
      if (label && label.textContent?.trim() === target) {
        const svg = cell.querySelector('svg')
        if (svg && svg.dataset.dshAnyIcon !== '1') {
          const sun = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          sun.setAttribute('width', '16')
          sun.setAttribute('height', '16')
          sun.setAttribute('viewBox', '0 0 16 16')
          sun.setAttribute('fill', 'none')
          sun.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
          sun.dataset.dshAnyIcon = '1'
          sun.innerHTML = SUN_PATHS
          svg.replaceWith(sun)
        }
        return
      }
    }
  }
  let navIconObserver: MutationObserver | null = null
  const watchNavIcon = (): void => {
    if (navIconObserver !== null || typeof MutationObserver === 'undefined') return
    navIconObserver = new MutationObserver(records => {
      // React only when the settings panel (or its nav) is (re)created, so
      // chat-content mutations don't trigger a scan.
      const relevant = records.some(r => {
        for (const n of r.addedNodes) {
          if (n.nodeType !== 1) continue
          const el = n as Element
          if (el.matches?.('[role="dialog"][aria-modal="true"][aria-labelledby]') || el.querySelector?.('[role="dialog"][aria-modal="true"][aria-labelledby]')) return true
        }
        return false
      })
      if (relevant) applyNavIcon()
    })
    navIconObserver.observe(document.body, { childList: true, subtree: true })
    applyNavIcon()
  }
  watchNavIcon()
  ctx.effect(() => () => { navIconObserver?.disconnect(); navIconObserver = null }, 'dsh-background-by-model: nav icon watch')

  // ── 10. Deferred boot restore ─────────────────────────────────────────────
  // The theme service and the host settings scope settle asynchronously after
  // this apply, so the synchronous restore can be observed mid-flight — a late
  // host adoption resets the preference, or the presenter re-applies over our
  // overrides. Re-running the restore a few ticks later guarantees the saved
  // records land.
  const restoreSaved = (): void => {
    const color = activeRuleColor()
    if (color !== null) {
      const snapshot = ctx.theme.getTheme()
      if (!snapshot.themes.some(t => t.id === CUSTOM_ID)) {
        // Theme missing (host adoption dropped it): re-register + activate.
        registerCustom(color[0], color[1], color[2])
      } else if (snapshot.preference !== CUSTOM_ID) {
        // Theme present but inactive: just re-assert the preference. Calling
        // registerCustom here would dispose + re-create the skin, flashing the
        // interface back to the system theme for a frame on every boot.
        ctx.theme.setTheme(CUSTOM_ID)
      }
    }
    applyWp()
  }
  const restoreTimers = [300, 1500].map(delay => window.setTimeout(restoreSaved, delay))
  ctx.effect(() => () => { restoreTimers.forEach(id => window.clearTimeout(id)) }, 'dsh-background-by-model: boot restore')

  // ── 11. Theme watchdog ────────────────────────────────────────────────────
  // The theme service keeps only built-in preferences in memory, so ANY
  // host-scope adoption can silently drop the custom theme — reverting the label
  // colors and the inner surfaces to the system palette. While the active rule
  // carries a color, re-register and re-assert on a slow interval.
  const watchdogId = window.setInterval(() => {
    const color = activeRuleColor()
    if (color === null) return
    const snapshot = ctx.theme.getTheme()
    let changed = false
    if (!snapshot.themes.some(t => t.id === CUSTOM_ID)) {
      registerCustom(color[0], color[1], color[2])
      changed = true
    } else if (snapshot.preference !== CUSTOM_ID) {
      ctx.theme.setTheme(CUSTOM_ID)
      changed = true
    }
    if (changed) applyWp()
  }, 1000)
  ctx.effect(() => () => { window.clearInterval(watchdogId) }, 'dsh-background-by-model: theme watchdog')

  // ── 12. Theme-reset watchdog ──────────────────────────────────────────────
  const disposeThemeResets = watchThemeResets()
  ctx.effect(() => () => { disposeThemeResets() }, 'dsh-background-by-model: theme resets watch')

  // ── 13. Flush pending writes on page hide ─────────────────────────────────
  const onPageHide = (): void => flushSave()
  window.addEventListener('pagehide', onPageHide)
  ctx.effect(() => () => window.removeEventListener('pagehide', onPageHide), 'dsh-background-by-model: pagehide flush')
}

/** Color of the currently active rule, or null when it uses the system theme. */
function activeRuleColor(): [number, number, number] | null {
  if (activeRuleId === null) return null
  const rule = ruleById(activeRuleId)
  return rule === null ? null : rule.color
}
