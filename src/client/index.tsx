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
  Ctx, RpcResultLike, ThemeSectionProps, PartOpacities, PartBlurs, BgImage, BgRule, BgState, HolidayRule,
  FetchResult, ModelFacts,
} from './types'
import { NS, zh, en } from './i18n'
import {
  cfg, adoptConfig, imageOf, displayImageOf, setImage, newRule, nextSlot, nextRuleId, ruleById,
  holidayById, normalizeRuleInPlace, patchRotation, ruleSlots, setActive, setModelLabel,
  activeRule, activeColor, activeRuleId, activeMatched, modelLabel, imageIndexOf, setRotIndex, takenSlots,
  rWp, rRightbarOpacity, DEFAULT_BG_STATE,
} from './state'
import { activeHoliday, pickHoliday } from '../holiday'
import { nextIndex, isRotating } from './rotation'
import { shouldRepaint } from './repaint'
import {
  RPC_CHANNEL, initRpc, saveConfig, flushSave, persistConfig, loadPersisted,
  readImage, writeImage, deleteImage, fetchImageUrl, readDefaultModel, hostIsLegacy,
} from './rpc'
import {
  applyWp, teardownWp, applySettingsOverrides, applyRightbarOverrides, SETTINGS_STYLE_RULE, TRAJECTORY_STYLE_RULE,
  RIGHTBAR_STYLE_RULE, INPUT_BLUR_RULE, PLACEHOLDER_RULE, OWN_SCHEME, setHostScheme, refreshSystemTheme,
  watchParts, watchThemeResets,
} from './wallpaper'
import { genTokens, extractWallpaperColor } from './utils/color'
import { matchRule, watchModel } from './modelbg'
import { ThemeSection } from './components/ThemeSection'
import { markOwnSheet } from './components/ui.css'
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

  /**
   * Re-emit the interface palette for whatever is painted RIGHT NOW.
   *
   * Called from two places, and the second one is why this is a function: a
   * model switch (`applyActive`) and a ROTATION STEP (`paintImage`). A theme color
   * belongs to an image since 0.7.1, so stepping to the next picture changes the
   * palette as much as switching models does — and a step that only repainted the
   * wallpaper would leave the previous picture's color on the interface until
   * something else happened to re-run an apply (dragging the wheel, switching
   * models), which is precisely the "it only updates when I touch the color wheel"
   * report this plugin already had once.
   *
   * The debounce is for the OTHER caller: a color drag runs a full apply dozens of
   * times per second, and the host-visible skin switch (dispose + register +
   * activate) must not happen on every pointer move. A rotation step pays the same
   * 60 ms, which is invisible next to a dwell time of 5 s or more.
   */
  const applyPalette = (): void => {
    const color = activeColor()
    if (skinTimer !== null) window.clearTimeout(skinTimer)
    if (color === null) {
      // Hand the palette back BEFORE the apply that follows. The theme service's
      // snapshot is what tells the wallpaper layer which scheme the host itself
      // resolves to, and while our custom skin is still active that snapshot
      // reports OUR scheme — the readback would then capture the host's light
      // palette on a dark system and keep painting it (the interface only
      // recovered when some later slider drag happened to re-run an apply).
      // Dropping the skin is idempotent, so it needs none of the debouncing a
      // color drag does.
      skinTimer = null
      dropCustom()
    } else {
      // The skin is a host-visible switch (dispose + register + activate) and is
      // batched; the wallpaper and tokens below land immediately either way.
      skinTimer = window.setTimeout(() => {
        skinTimer = null
        registerCustom(color[0], color[1], color[2])
      }, 60)
    }
    syncHostScheme()
  }
  ctx.effect(() => () => {
    if (skinTimer !== null) window.clearTimeout(skinTimer)
    customDispose?.()
  }, 'dsh-background-by-model: skin dispose')

  // ── 2. Gradient CSS (for custom dark themes) + static rules ────────────────
  const styleEl = document.createElement('style')
  styleEl.dataset.plugin = 'dsh-background-by-model'
  markOwnSheet(styleEl)
  // The gradient only applies while applyCustomTokens marks the body with the
  // plugin's own dark-mode value, avoiding matches against the host's attribute.
  styleEl.textContent = `body[data-ds-dark-theme="${OWN_SCHEME}"]::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(255,255,255,0.03) 0%,transparent 60%)}${SETTINGS_STYLE_RULE}${TRAJECTORY_STYLE_RULE}${RIGHTBAR_STYLE_RULE}${INPUT_BLUR_RULE}` + PLACEHOLDER_RULE
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
      rotIndex: 0,
      rotTotal: 0,
      rotating: false,
      hostStale: false,
    }),
    actions: {
      sync: (d: any, url: string | null, r: number, rr: number, model: string, source: 'session' | 'default', note: string, id: string | null, matched: boolean, rotIndex: number, rotTotal: number, rotating: boolean, hostStale: boolean) => {
        if (r > d.rev) { d.url = url; d.rev = r }
        if (rr > d.rulesRev) d.rulesRev = rr
        d.model = model
        d.modelSource = source
        d.modelNote = note
        d.activeRuleId = id
        d.matched = matched
        d.rotIndex = rotIndex
        d.rotTotal = rotTotal
        d.rotating = rotating
        d.hostStale = hostStale
      },
    },
  })
  let bound: { sync: (...a: any[]) => void } | null = null
  /** Rotation facts of whatever is painted now, for the section's readout. */
  const rotationFacts = (): { index: number; total: number; rotating: boolean } => {
    const rule = activeRule()
    if (rule === null) return { index: 0, total: 0, rotating: false }
    return {
      index: imageIndexOf(rule),
      total: rule.images.length,
      // The badge and the timer read the SAME predicate, so "rotating" can never
      // be shown while nothing is scheduled (the failure this feature would
      // otherwise produce silently).
      rotating: isRotating(rule.images.length, rule.rotate.enabled, rule.rotate.intervalMs) && !document.hidden,
    }
  }
  const sync = (): void => {
    rev++
    const rot = rotationFacts()
    bound?.sync(rWp(), rev, rulesRev, modelLabel !== '' ? modelLabel : modelText, modelSource, modelNote, activeRuleId, activeMatched, rot.index, rot.total, rot.rotating, hostIsLegacy())
  }

  /**
   * Publish the scheme the host's own preference resolves to. The theme service
   * is the only place that knows it (a custom active theme included); the
   * wallpaper layer needs it to hand `data-ds-dark-theme` back in the host's own
   * form while a color-less rule follows that theme, instead of leaving the flag
   * off — which pins the host to its LIGHT palette on a dark system.
   */
  const syncHostScheme = (): void => {
    try {
      setHostScheme(ctx.theme.getTheme().active.colorScheme === 'dark')
    } catch {
      // A host build without a resolvable snapshot: let the wallpaper layer fall
      // back to the preference the boot script published.
      setHostScheme(null)
    }
  }

  /**
   * Which rule wins for the current model RIGHT NOW, and whether it was a
   * substring hit (a holiday override is never a "match" of the model).
   *
   * Read by the repaint AND by the panel's write path, which has to know whether
   * an edit changed the answer: `color`, `enabled` and `match` all feed the
   * resolution (a rule with no image still paints from its own color — see
   * `ruleCanPaint`). Without this, editing a rule that was not the active one —
   * giving an emptied rule its first color, typing a match string that should
   * promote it — changed nothing on screen until some unrelated event happened to
   * re-run the resolution.
   */
  const resolveRule = (): { rule: BgRule | null; matched: boolean } => {
    // The holiday override sits ABOVE the rule list: while one is in force the
    // model is irrelevant, which is the whole point of the switch.
    const holiday = activeHolidayRule()
    return holiday !== null
      ? { rule: holiday as BgRule, matched: false }
      : matchRule(cfg.rules, modelText)
  }

  /** Id of the rule that would paint right now; `null` = the host's own look. */
  const winnerId = (): string | null => resolveRule().rule?.id ?? null

  /**
   * Close a rule edit: repaint when it could have moved what is on screen, and
   * merely refresh the panel's readout when it could not.
   *
   * `winnerBefore` is sampled by the caller BEFORE its mutation (`winnerId()`),
   * and the comparison itself lives in ./repaint, where it is checked on plain
   * node. Every write path below ends here — the old per-path test
   * (`id === activeRuleId`) missed the edit that CREATES the winner, which is the
   * "上传图片 / 提取主题色之后界面不动，动一下调色盘或切模型才出现" report.
   */
  const repaintIfMoved = (id: string, winnerBefore: string | null): void => {
    if (shouldRepaint(id, winnerBefore, winnerId())) applyActive()
    else sync()
  }

  /**
   * Resolve the active rule for the current model and repaint everything.
   *
   * @param advance - true only on a MODEL switch: the rotation of the rule that
   *   took over may then step once (`rotate.advanceOnSwitch`), which is how a
   *   model gets "a different picture every time" without any timer at all.
   */
  const applyActive = (advance = false): void => {
    const { rule, matched } = resolveRule()
    // Set BEFORE the index is read: `setActive` resets the image index whenever
    // the rule itself changes, so a switch onto a fresh rule starts at its first
    // image (and `advanceOnSwitch` then steps off it — see below).
    setActive(rule === null ? null : rule.id, matched)
    if (advance && rule !== null && rule.rotate.advanceOnSwitch) {
      const next = nextIndex(rule.images.length, rule.rotate.order, imageIndexOf(rule))
      if (next !== null) setRotIndex(next)
    }
    scheduleRotation()
    // AFTER the index moved: the palette belongs to the image that is on screen,
    // and `advanceOnSwitch` above may have just changed which one that is.
    applyPalette()
    applyWp()
    sync()
  }

  // ── 3a. Multi-image rotation ──────────────────────────────────────────────
  // ONE interval for the whole plugin, always aimed at the ACTIVE rule. A timer
  // per rule would burn wakeups on rules that are not painting anything, and
  // since only one rule's images can be on screen at a time, one timer is all
  // that is needed.
  //
  // `loadSlot` below (section 6) is only CALLED from here, never during this
  // synchronous apply, so the order of these two declarations does not matter.
  let rotTimer: number | null = null
  /** Identity of the schedule currently armed; a change means "re-arm". */
  let rotSig = ''

  /** Warm one image so a later switch fades toward bytes that are already here. */
  const warmImage = (rule: BgRule, idx: number): void => {
    const slot = rule.images[idx]?.slot
    if (slot !== undefined) void loadSlot(slot)
  }

  /** Show the image at `idx` at once, loading it first when it is not in memory. */
  const paintImage = (rule: BgRule, idx: number): void => {
    const slot = rule.images[idx]?.slot
    if (slot === undefined) return
    // The palette first, and always: this image may carry a theme color of its
    // own, and it becomes the one in force the moment the index moves (see
    // `applyPalette`). `setRotIndex` has already run in every caller.
    applyPalette()
    if (imageOf(slot) !== null) { applyWp(); sync(); return }
    // A cold image cannot be cross-faded toward — the outgoing layer would fade
    // to an empty one and the interface would show through for a frame — so the
    // paint happens after the bytes land. Reading the slot over this channel costs
    // one local round trip, which is the price of not shipping every image of
    // every rule at boot.
    void loadSlot(slot).then(() => { applyWp(); sync() })
  }

  const rotateTick = (): void => {
    const rule = activeRule()
    if (rule === null) return
    const next = nextIndex(rule.images.length, rule.rotate.order, imageIndexOf(rule))
    // Nothing to step to (the list shrank to a single image under us): stop
    // rather than leave a timer firing forever at a rule with one picture.
    if (next === null) { scheduleRotation(true); return }
    setRotIndex(next)
    paintImage(rule, next)
    // Warm the image AFTER the one just shown, so the next tick has decoded bytes
    // to fade toward instead of paying a read at the moment of the switch.
    const after = nextIndex(rule.images.length, rule.rotate.order, next)
    if (after !== null) warmImage(rule, after)
  }

  /**
   * Arm (or re-arm) the rotation for the active rule.
   *
   * Idempotent by SIGNATURE rather than by "already armed": a slider drag on the
   * active rule re-runs the whole apply dozens of times per second, and restarting
   * the interval on each of those would mean the dwell timer never elapses while
   * the user is dragging (and a 10 s rotation would never advance). The signature
   * carries exactly the inputs the schedule depends on, so a real change — another
   * rule, another interval, the tab becoming visible again — re-arms while a
   * repaint does not.
   */
  const scheduleRotation = (force = false): void => {
    const rule = activeRule()
    // `activeRule()` also answers with a holiday entry, whose images are the
    // package's single picture; `isRotating` turns that into "no schedule".
    const sig = rule === null
      ? ''
      : [rule.id, rule.rotate.enabled, rule.rotate.intervalMs, rule.rotate.order, rule.images.length, document.hidden].join('|')
    if (!force && sig === rotSig) return
    rotSig = sig
    if (rotTimer !== null) { window.clearInterval(rotTimer); rotTimer = null }
    if (rule === null || document.hidden) return
    if (!isRotating(rule.images.length, rule.rotate.enabled, rule.rotate.intervalMs)) return
    // Warm the first image this schedule will ask for, so the very first tick is
    // not the one that has to pay for the read.
    const next = nextIndex(rule.images.length, rule.rotate.order, imageIndexOf(rule))
    if (next !== null) warmImage(rule, next)
    rotTimer = window.setInterval(rotateTick, rule.rotate.intervalMs)
  }
  ctx.effect(() => () => {
    if (rotTimer !== null) { window.clearInterval(rotTimer); rotTimer = null }
  }, 'dsh-background-by-model: rotation timer')
  // A hidden tab has nothing to paint, so the rotation stops with the pixels and
  // resumes on a fresh interval: coming back to a background that changed three
  // times while nobody was looking is not what "every 30 seconds" means to anyone
  // watching it. `sync()` is what moves the "rotating" readout with it — the
  // section cannot be seen while the tab is hidden, but the badge must be right the
  // moment it is shown again.
  const onVisibility = (): void => { scheduleRotation(); sync() }
  document.addEventListener('visibilitychange', onVisibility)
  ctx.effect(() => () => document.removeEventListener('visibilitychange', onVisibility), 'dsh-background-by-model: rotation visibility')

  /**
   * The holiday the background must follow right now, or null.
   *
   * The decision itself is `pickHoliday` (pure, and covered by
   * `scripts/holiday-check.ts`); this only supplies the two things it cannot
   * know — today's holiday from the calendar, and whether the slot has bytes.
   */
  const activeHolidayRule = (): HolidayRule | null =>
    pickHoliday(cfg.holidays.enabled, cfg.holidays.items, activeHoliday(), slot => imageOf(slot) !== null)

  // ── 3b. Holiday theme color ───────────────────────────────────────────────
  // There is nothing to compute: a holiday's color is a fixed part of its
  // definition (see `HOLIDAYS`), forced on every read by ./schema. The extractor
  // that used to run here decoded a full-size festival photo to re-derive a hue
  // that was always going to be the same one.

  // ── 4. First paint + the AppFrame watch ───────────────────────────────────
  syncHostScheme()
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
    if (textChanged) applyActive(true)
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

  // ── 5b. Holiday rollover ──────────────────────────────────────────────────
  // The holiday answer only changes at Beijing midnight — a switch flip calls
  // applyActive directly — so this is a slow tick that does nothing at all until
  // the day key actually moves. 30 s is plenty for a boundary that is a whole day
  // wide, and it costs one `Intl` format per tick.
  //
  // `todayHolidaySlot` / `loadSlot` are declared below, in section 6; both are
  // initialized during this same synchronous apply, long before any tick fires.
  let holidayKey = activeHoliday() ?? ''
  const holidayTimer = window.setInterval(() => {
    const next = activeHoliday() ?? ''
    if (next === holidayKey) return
    holidayKey = next
    // Midnight can land ON a holiday, and that holiday's art was deliberately
    // not fetched at boot (it was not that day yet) — fetch it, then repaint.
    const slot = todayHolidaySlot()
    if (slot === null) applyActive()
    else void loadSlot(slot).then(() => applyActive())
  }, 30_000)
  ctx.effect(() => () => { window.clearInterval(holidayTimer) }, 'dsh-background-by-model: holiday rollover')

  // ── 6. Boot restore ───────────────────────────────────────────────────────
  /** Read one slot's bytes into the cache unless they are already there. */
  const loadSlot = async (slot: string): Promise<void> => {
    if (imageOf(slot) !== null) return
    const url = await readImage(slot)
    if (url !== null) setImage(slot, url)
  }
  /**
   * The slot of the holiday that could paint TODAY, or null.
   *
   * Gated on the CALENDAR, not merely on the switch. Now that the override is on
   * by default and invisible, a profile that simply is not on a holiday must not
   * pull ~730 KB of bundled art (≈970 KB of base64 over this channel) at every
   * boot just because the feature is armed.
   */
  const todayHolidaySlot = (): string | null => {
    if (!cfg.holidays.enabled) return null
    const id = activeHoliday()
    if (id === null) return null
    const item = holidayById(id)
    if (item === null || !item.enabled) return null
    return ruleSlots(item)[0] ?? null
  }
  /**
   * The slots boot hydrates, in no particular order: the FIRST image of every
   * rule, today's holiday, and the image the current model paints.
   *
   * That first-image set is exactly what this plugin loaded per rule before
   * multi-image existed — a rule card draws its first image as its thumbnail, so
   * the settings page looks the same as it always did. Everything past the first
   * image of a rule is read ON DEMAND: by the rotation (which warms the image it
   * is about to need as soon as its schedule is armed) and by the settings page
   * when a card is expanded. Hydrating every image of every rule here would mean
   * twenty full-size data URLs over this channel before the first frame on a
   * five-rule setup with four pictures each, which is the one cost this feature
   * must not pay.
   *
   * The slot list the store knows about (`readPersisted().slots`) is deliberately
   * NOT hydrated any more: an orphaned slot that no rule references has no card to
   * appear on, so pulling its bytes over the channel at boot is pure waste. It
   * stays on disk — and is still reported by the node half — until a rule
   * references it again or it is deleted with its rule.
   */
  const bootSlots = (): string[] => {
    const holiday = todayHolidaySlot()
    const firsts = cfg.rules
      .map(r => r.images[0]?.slot)
      .filter((slot): slot is string => slot !== undefined)
    const current = prioritySlot()
    return Array.from(new Set([
      ...firsts,
      ...(holiday === null ? [] : [holiday]),
      ...(current === null ? [] : [current]),
    ]))
  }
  /**
   * The slot that paints before anything else: the holiday in force when there
   * is one, otherwise the FIRST image of the current model's rule. A holiday
   * outranks the rule here for the same reason it outranks it when painting.
   *
   * Always the first image (never the one `advanceOnSwitch` would step to): boot
   * paints without an advance, and hydrating an image the first frame is not going
   * to use would leave the frame blank until the real one arrived.
   */
  const prioritySlot = (): string | null =>
    todayHolidaySlot() ?? matchRule(cfg.rules, modelText).rule?.images[0]?.slot ?? null
  void (async () => {
    const persisted = await loadPersisted()
    if (persisted !== null) {
      adoptConfig(persisted.config)
      const first = prioritySlot()
      // The active rule's bytes paint first; the remaining slots stream in after
      // so a large multi-rule setup never delays the first frame.
      const slots = bootSlots()
      const order = first === null ? slots : [first, ...slots.filter(s => s !== first)]
      for (const slot of order) {
        await loadSlot(slot)
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
    // The resolved scheme is read first: an OS flip while the preference is
    // `system` arrives exactly here, and a color-less rule has to follow it.
    syncHostScheme()
    if (activeColor() !== null) {
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

  /**
   * The automatic half of "extract from image": fill an IMAGE's theme color from
   * its own bytes when it has none of its own, and only then — a color the user
   * picked (or a previous extraction produced) is never overwritten, so this
   * cannot fight a deliberate choice.
   *
   * `slot` names the image that just arrived, because a rule's images each carry
   * their own palette since 0.7.1 and the one the user just added is the one they
   * are looking at. Omitted (or unknown) falls back to the rule's first image.
   *
   * The question is asked of the IMAGE, not of the rule: a rule whose pictures
   * were all cleared and then re-filled must theme each new picture, and a rule
   * with a color of its own still has no say over the colors of its pictures.
   *
   * The decode is asynchronous, so the "still empty?" question is asked AGAIN on
   * arrival: a color chosen while it ran must win over the one being computed.
   */
  const maybeAutoExtract = async (id: string, slot?: string): Promise<void> => {
    if (!cfg.autoExtract) return
    /** The entry this extraction is about, re-resolved on every read. */
    const target = (rule: BgRule | null): BgImage | undefined => {
      if (rule === null) return undefined
      return (slot === undefined ? undefined : rule.images.find(i => i.slot === slot)) ?? rule.images[0]
    }
    const image = target(ruleById(id))
    if (image === undefined || image.color !== null) return
    const url = displayImageOf(image.slot)
    if (url === null) return
    let hsl: [number, number, number] | null = null
    try { hsl = await extractWallpaperColor(url, image.bgState) } catch { hsl = null }
    if (hsl === null) return
    const current = target(ruleById(id))
    if (current === undefined || current.color !== null) return
    // Same as `extractColor`: this color can be the one that makes the rule
    // paintable, and it arrives AFTER the upload's own repaint — so the winner is
    // sampled here, on arrival, and the interface follows at once.
    const winner = winnerId()
    current.color = hsl
    rulesRev++
    saveConfig()
    repaintIfMoved(id, winner)
  }

  /**
   * The batch form, for one upload that carried several pictures.
   *
   * EVERY picture that arrived is themed from its own bytes, the first ones
   * included. The single-slot reading of an upload ("the last image added is the
   * one being looked at") is true of the CARD's selection and false of the
   * palette: since a theme color belongs to an image, a batch that themed only
   * its last file left the rest of a fresh rotation on the system theme, with
   * nothing in the interface to say why.
   *
   * Sequential on purpose: a batch is a handful of full-size photos, and ten
   * parallel decodes buy nothing the user can see, while landing the colors in
   * list order does (the card fills in from its first picture).
   */
  const maybeAutoExtractEach = async (id: string, slots: readonly string[]): Promise<void> => {
    for (const slot of slots) await maybeAutoExtract(id, slot)
  }

  // ── 8. Section injection ──────────────────────────────────────────────────
  // The section's props are built ONCE by the slot host, so anything that changes
  // at runtime rides the store; the two exceptions are the context (needed by the
  // host self-check probe) and the language (read at build time, refreshed when
  // the section is rebuilt).
  const activeLang = (): 'zh' | 'en' => {
    try {
      const snapshot = ctx.locale.getSnapshot()
      return typeof snapshot?.active === 'string' && snapshot.active.toLowerCase().startsWith('zh') ? 'zh' : 'en'
    } catch {
      return 'en'
    }
  }
  /** The model-resolution facts the host self-check reports, read on demand. */
  const readModelFacts = (): ModelFacts => {
    const rule = activeRuleId === null ? null : ruleById(activeRuleId)
    return {
      text: modelText,
      source: modelSource,
      note: modelNote,
      rule: rule === null ? '' : (rule.match !== '' ? rule.match : rule.id),
      matched: activeMatched,
    }
  }
  const sectionInject = (actions: { sync: (...a: any[]) => void }): Omit<ThemeSectionProps, 'useStore'> => {
    bound = actions
    sync()
    return {
      t: ctx.locale.bind(NS),
      ctx,
      lang: activeLang(),
      readModelFacts,
      imageOf: (slot: string) => displayImageOf(slot),
      addRule: (): string => {
        // No slot is allocated here: a new rule holds no image, so the first free
        // slot is taken when the first picture arrives (see newRule).
        const rule = newRule(nextRuleId())
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
        if (rule !== undefined) {
          // A slot is released only when NOTHING else points at it — another rule
          // (its own images included, hence the re-scan after the splice) or a
          // holiday entry. Multi-image made this a per-slot question instead of a
          // whole-rule one, and a wrong answer here deletes a picture another
          // card is still showing.
          const stillUsed = takenSlots()
          for (const slot of ruleSlots(rule)) {
            if (stillUsed.has(slot)) continue
            setImage(slot, null)
            void deleteImage(slot)
          }
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
        // Text/color/match/slider edits all arrive here, and all of them can move
        // the resolution (see `shouldRepaint`), so the winner is sampled first.
        const winner = winnerId()
        Object.assign(rule, patch)
        // The shared sanitizer, so a live edit can never hold a value the next
        // load would clamp differently (see ./schema).
        normalizeRuleInPlace(rule)
        rulesRev++
        // Text/color/slider edits arrive per keystroke and per pointer move, so
        // the write is coalesced; structural edits below stay immediate.
        saveConfig()
        repaintIfMoved(id, winner)
      },
      addRuleImages: (id: string, dataUrls: readonly string[]): void => {
        const rule = ruleById(id)
        if (rule === null || dataUrls.length === 0) return
        // This is the edit that most often CREATES the winner: a rule that just
        // came out of "+ 新增规则" has no picture, so it is not the active rule —
        // and the picture it is being given now is exactly what makes it one.
        const winner = winnerId()
        /** Slots of THIS batch, in list order — the extraction below is per slot. */
        const added: string[] = []
        for (const dataUrl of dataUrls) {
          const slot = nextSlot()
          // `color: null` (not absent): this image has no color of its own YET, and
          // the auto-extraction below is what fills it. An absent key would mean
          // "written before 0.7.1" instead, and would be lifted from the rule's color
          // on the next read — which is the opposite of what a new picture wants.
          const image = { slot, bgState: { ...DEFAULT_BG_STATE }, color: null }
          rule.images.push(image)
          added.push(slot)
          setImage(slot, dataUrl)
          // One write per image, immediately: adding a picture is a structural
          // edit, and losing the batch to a page close would leave the config
          // referencing slots the disk never received.
          void writeImage(slot, dataUrl)
        }
        rulesRev++
        persistConfig()
        repaintIfMoved(id, winner)
        // A rule that has never been themed should simply come out themed; an
        // explicit color (or a cleared one the user set on purpose) is left be.
        // Addressed by SLOT and over the whole batch: a rotation is built by
        // picking several files at once and every one of them carries a palette of
        // its own, so the batch is what gets themed — not just the last file, and
        // not just the one the card happens to select.
        void maybeAutoExtractEach(id, added)
      },
      removeRuleImage: (id: string, slot: string): void => {
        const rule = ruleById(id)
        if (rule === null) return
        const idx = rule.images.findIndex(i => i.slot === slot)
        if (idx < 0) return
        // Removing can also move the winner — it is the mirror image of the
        // upload above: the rule that was painting may have just lost the last
        // thing it had to paint with.
        const winner = winnerId()
        // The LAST image can be removed too, and the rule is then simply empty: a
        // rule with a color of its own still paints (the interface, no wallpaper)
        // and one with neither is skipped by `ruleCanPaint` until something
        // arrives. Refusing this (the first cut of the feature did) left a cleared
        // entry behind, and that entry sat at position 1 — so the next upload
        // became image 2 of a rule that kept painting nothing, with no way back.
        rule.images.splice(idx, 1)
        // The painted image may be the one that just went away, so the index has
        // to move with it — and `applyActive` below resets it when the rule itself
        // is the active one.
        if (id === activeRuleId) setRotIndex(0)
        rulesRev++
        persistConfig()
        if (!takenSlots().has(slot)) {
          setImage(slot, null)
          void deleteImage(slot)
        }
        repaintIfMoved(id, winner)
      },
      moveRuleImage: (id: string, slot: string, dir: -1 | 1): void => {
        const rule = ruleById(id)
        if (rule === null) return
        const idx = rule.images.findIndex(i => i.slot === slot)
        const to = idx + dir
        if (idx < 0 || to < 0 || to >= rule.images.length) return
        const winner = winnerId()
        const [image] = rule.images.splice(idx, 1)
        rule.images.splice(to, 0, image!)
        rulesRev++
        // Rotation walks the list, so reordering it is a change the timer's
        // signature cannot see (the count is the same) — re-arm explicitly.
        if (id === activeRuleId) { setRotIndex(Math.max(0, to)); scheduleRotation(true) }
        persistConfig()
        repaintIfMoved(id, winner)
      },
      setCurrentImage: (id: string, slot: string): void => {
        const rule = ruleById(id)
        if (rule === null) return
        const idx = rule.images.findIndex(i => i.slot === slot)
        if (idx < 0) return
        const winner = winnerId()
        // "First" is what the rule paints when nothing rotates, so promoting an
        // image is a real change of the default look, not just of the order.
        const [image] = rule.images.splice(idx, 1)
        rule.images.unshift(image!)
        rulesRev++
        if (id === activeRuleId) { setRotIndex(0); scheduleRotation(true) }
        persistConfig()
        repaintIfMoved(id, winner)
      },
      setImageFraming: (id: string, slot: string, bgState: BgState): void => {
        const rule = ruleById(id)
        const image = rule?.images.find(i => i.slot === slot)
        if (image === undefined) return
        const winner = winnerId()
        image.bgState = bgState
        normalizeRuleInPlace(rule!)
        rulesRev++
        saveConfig()
        // Framing is per image, so a repaint of the CURRENT image is what makes
        // the editor's commit visible; `applyWp` re-reads the framing of whatever
        // is painted, which is this image only while it is the current one.
        repaintIfMoved(id, winner)
      },
      setRuleRotation: (id: string, patch: Partial<BgRule['rotate']>): void => {
        const rule = ruleById(id)
        if (rule === null) return
        patchRotation(rule, patch)
        rulesRev++
        persistConfig()
        // Turning the rotation on has to be able to paint at once, and turning it
        // off has to be able to stop the timer at once: both go through the
        // signature check in `scheduleRotation`.
        scheduleRotation()
        sync()
      },
      rotateNow: (id: string): void => {
        const rule = ruleById(id)
        // Only the ACTIVE rule can step: the image index describes what is on
        // screen, and a rule that is not painting has nothing on screen to change.
        if (rule === null || id !== activeRuleId) return
        const next = nextIndex(rule.images.length, rule.rotate.order, imageIndexOf(rule))
        if (next === null) return
        setRotIndex(next)
        paintImage(rule, next)
        // A manual step restarts the dwell, so the tick that was already on its
        // way does not follow the user's click a second later.
        scheduleRotation(true)
      },
      loadRuleImages: async (id: string): Promise<void> => {
        const rule = ruleById(id)
        if (rule === null) return
        // Sequential on purpose: an expanded card wants its thumbnails in list
        // order, and firing ten parallel reads over one RPC channel would only
        // race them into the cache in a random order.
        for (const slot of ruleSlots(rule)) await loadSlot(slot)
        sync()
      },
      setRuleImage: (id: string, slot: string, dataUrl: string | null): void => {
        const rule = ruleById(id)
        if (rule === null || !rule.images.some(i => i.slot === slot)) return
        const winner = winnerId()
        setImage(slot, dataUrl)
        void (dataUrl === null ? deleteImage(slot) : writeImage(slot, dataUrl))
        repaintIfMoved(id, winner)
        // A rule that has never been themed should simply come out themed; an
        // explicit color (or a cleared one the user set on purpose) is left be.
        if (dataUrl !== null) void maybeAutoExtract(id, slot)
      },
      addRuleImageFromUrl: async (id: string, url: string): Promise<FetchResult> => {
        const rule = ruleById(id)
        if (rule === null) return { ok: false, error: 'unknown rule' }
        // The slot is allocated before the download so the node half can write
        // straight into it (its `fetchImageUrl` is slot-addressed); a failed
        // download simply leaves the new entry empty, which is removed again
        // right here rather than showing a broken thumbnail.
        const slot = nextSlot()
        const res = await fetchImageUrl(slot, url)
        if (!res.ok) return res
        // Sampled here, not before the download: the list is only touched now.
        const winner = winnerId()
        rule.images.push({ slot, bgState: { ...DEFAULT_BG_STATE }, color: null })
        setImage(slot, res.dataUrl ?? null)
        rulesRev++
        persistConfig()
        repaintIfMoved(id, winner)
        void maybeAutoExtract(id, slot)
        return res
      },
      /**
       * Store ONE image's theme color (null = that image follows the system
       * theme). Addressed by slot exactly like `setImageFraming`, because the
       * color belongs to the image: editing image 3's color must not rewrite
       * image 1's, and it must not touch the RULE's color either — that one is
       * what the rule paints once its last picture is gone, and it is edited only
       * while there is no image to edit (the panel's own branch).
       */
      setImageColor: (id: string, slot: string, color: [number, number, number] | null): void => {
        const rule = ruleById(id)
        const image = rule?.images.find(i => i.slot === slot)
        if (rule === null || rule === undefined || image === undefined) return
        // A color is what a paint is made of, so the winner is sampled first: this
        // can be the edit that makes an unusable rule usable (see repaintIfMoved).
        const winner = winnerId()
        image.color = color
        normalizeRuleInPlace(rule)
        rulesRev++
        // Pointer-move frequency (the wheel, the RGB inputs), so the write is
        // coalesced — the same rule `setRule` follows for its color.
        saveConfig()
        repaintIfMoved(id, winner)
      },
      extractColor: async (id: string, slot?: string): Promise<boolean> => {
        const rule = ruleById(id)
        if (rule === null) return false
        const image = rule.images.find(i => i.slot === slot) ?? rule.images[0]
        if (image === undefined) return false
        const url = displayImageOf(image.slot)
        if (url === null) return false
        const hsl = await extractWallpaperColor(url, image.bgState)
        if (hsl === null) return false
        // Addressed by SLOT, like the framing editor: the extraction belongs to the
        // picture the user pressed the button on, and a rule with several pictures
        // must be able to keep their palettes apart.
        const current = ruleById(id)?.images.find(i => i.slot === image.slot)
        if (current === undefined) return false
        // The color is what makes a picture-less rule paintable at all, so this
        // edit can hand the interface a rule it was not showing (the "从本图提取
        // 之后色没上来" half of the report).
        const winner = winnerId()
        current.color = hsl
        rulesRev++
        saveConfig()
        repaintIfMoved(id, winner)
        return true
      },
      setOps: (ops: PartOpacities): void => { cfg.opacities = ops; applyWp(); sync(); saveConfig() },
      setBlurs: (blurs: PartBlurs): void => { cfg.blurs = blurs; applyWp(); sync(); saveConfig() },
      setSop: (v: number): void => { cfg.settingsOpacity = v; applySettingsOverrides(v); saveConfig() },
      // The file-preview panel owns its surface from the first drag on; a null
      // hands it back to the main-background slider.
      setRightbarOpacity: (v: number | null): void => {
        cfg.rightbarOpacity = v
        applyRightbarOverrides(rRightbarOpacity())
        saveConfig()
      },
      setAutoExtract: (v: boolean): void => { cfg.autoExtract = v; saveConfig(); sync() },

      // ── Holiday overrides ─────────────────────────────────────────────────
      setHolidaysEnabled: (v: boolean): void => {
        cfg.holidays.enabled = v
        persistConfig()
        // Switching it back on has to be able to paint immediately, so today's
        // holiday art is fetched if it is not in memory yet. Only TODAY's: the
        // other one cannot paint, and nothing in the UI shows it.
        const slot = todayHolidaySlot()
        if (v && slot !== null) void loadSlot(slot).then(() => applyActive())
        applyActive()
      },

      // Download every rule plus its images as one JSON file.
      exportTheme: (): void => {
        const images: Record<string, string> = {}
        // Rule slots only, but ALL of them: a theme file that carried just each
        // rule's first image would silently drop the rest of a rotation on the
        // way out, and the import below would restore a smaller rule set than the
        // one that was exported. A holiday's wallpaper belongs to the package and
        // is served from there, so it is still never written into a theme file —
        // that would ship ~970 KB of base64 every install already has, to a slot
        // nothing could restore it to (it is read-only).
        const slots = cfg.rules.flatMap(ruleSlots)
        for (const slot of slots) {
          const url = imageOf(slot)
          if (url !== null) images[slot] = url
        }
        const payload = {
          // 5 = a theme color belongs to an image (`images[].color`). 4 and older
          // still import: their image entries carry no `color` key at all, which is
          // exactly the shape `normalizeImage` lifts the rule's color onto, so a
          // theme file written before that feature restores its look unchanged.
          version: 5,
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
          // Every slot the imported config references — the same set the export
          // writes. A holiday slot that an older theme file still carries falls
          // outside `keep` and is swept below; the node half refuses to write such
          // a slot either way, so it is inert from both directions.
          for (const slot of cfg.rules.flatMap(ruleSlots)) {
            keep.add(slot)
            const raw = incoming[slot]
            if (typeof raw === 'string' && /^data:image\//.test(raw)) {
              setImage(slot, raw)
              void writeImage(slot, raw)
            } else {
              setImage(slot, null)
              void deleteImage(slot)
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
    syncHostScheme()
    const color = activeColor()
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
  //
  // A color-less rule needs the same slow re-check for the opposite reason: it
  // paints from the HOST palette, which the host can re-project (or which the
  // scheme flag can fall behind) with no event of ours to hang a repaint on.
  // Without this, such a rule keeps whatever palette it read first — the light
  // one, if the read happened while the plugin's own light palette was still
  // forcing the flag off — until an unrelated apply happens to run.
  const watchdogId = window.setInterval(() => {
    syncHostScheme()
    const color = activeColor()
    if (color === null) {
      refreshSystemTheme()
      return
    }
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
