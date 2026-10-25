/**
 * dsh-background-by-model — browser half entry.
 *
 * Wires the plugin lifecycle and nothing else: rule resolution, the repaint gate,
 * the settings section's actions and the teardown effects. The machinery lives in
 * the sibling modules — appearance (skin, palette, restores), appearance-checks and
 * watchdogs (recurring checks on one schedule), rotation-timer, boot, model-state,
 * auto-extract, theme-file, nav-icon, wallpaper, state, modelbg, rpc.
 */
import { defineStore } from './runtime'
import { createAutoExtract } from './auto-extract'
import { createAppearance } from './appearance'
import { holidayRollover, themeWatchdog } from './appearance-checks'
import { hydrateBoot, loadSlot } from './boot'
import { createModelTracker } from './model-state'
import { createRotation } from './rotation-timer'
import { watchNavIcon } from './nav-icon'
import { applyThemeFile, buildThemeFile, saveThemeFile } from './theme-file'
import { createSchedule } from './watchdogs'
import type {
  Ctx, RpcResultLike, ThemeSectionProps, PartOpacities, BgImage, BgMode, BgRule, BgState, HolidayRule,
  FetchResult, ModelFacts, TransitionConfig, ThemeFile, PresetResult, PruneResult, StoreUsage,
} from './types'
import { NS, zh, en } from './i18n'
import {
  cfg, adoptConfig, imageOf, displayImageOf, setImage, nextSlot, nextRuleId, ruleById,
  holidayById, normalizeRuleInPlace, patchRotation, ruleSlots, setActive,
  activeRule, activeColor, activeRuleId, activeMatched, imageIndexOf, setRotIndex, takenSlots,
  rWp, rRightbarOpacity,
} from './state'
import { activeHoliday, pickHoliday } from '../holiday'
import { blankRule, defaultImage, normalizeTransition } from '../schema'
// What a failed profile attempt keeps, and which files the next one still has to
// ask for — the decision half of the download, shared with the node half (./preset
// for why the retry policy and the resume live in one module).
import { presetKey, presetMissing, presetResume } from '../preset'
import type { PresetHeld } from '../preset'
import { nextIndex, isRotating } from './rotation'
import { shouldRepaint } from './repaint'
import {
  RPC_CHANNEL, initRpc, saveConfig, flushSave, persistConfig, loadPersisted,
  writeImage, deleteImage, fetchImageUrl, readDefaultModel, hostIsLegacy,
  canWriteConfig, fetchPresetConfig, fetchPresetImage,
  readStoreUsage, pruneOrphanImages,
} from './rpc'
import {
  applyWp, teardownWp, applySettingsOverrides, applyRightbarOverrides, SETTINGS_STYLE_RULE, TRAJECTORY_STYLE_RULE,
  RIGHTBAR_STYLE_RULE, PAGE_STYLE_RULE, INPUT_STYLE_RULE, PLACEHOLDER_RULE, OWN_SCHEME,
  watchParts, watchThemeResets,
} from './wallpaper'
import { extractWallpaperColor } from './utils/color'
import { matchRule, watchModel } from './modelbg'
import { ThemeSection } from './components/ThemeSection'
import { markOwnSheet } from './components/ui.css'

export const name = 'dsh-background-by-model'
export const inject = ['slots', 'locale', 'theme', 'connection']

/**
 * Ceiling on what one recommended profile may add up to, across every wallpaper.
 *
 * The node half caps each file and the number of files, but it answers one
 * independent call at a time and never sees a running total — the client is the
 * only side that does, so the total is bounded here. The real profile is 2.2 MB
 * of images across seven of them, so this is generous by design: it exists to
 * stop a config that names sixty-four eight-megabyte slots from turning one
 * button press into half a gigabyte, not to second-guess the author.
 */
const PRESET_TOTAL_MAX = 32 * 1024 * 1024

/**
 * How many wallpapers of a profile are in flight at once.
 *
 * Measured rather than guessed. The real seven-file profile, fetched against the
 * live asset host: 8.3 s one at a time, 4.8 s with four in flight (25 s when the
 * CDN edge was still cold). What is being paid is per-request latency, and the
 * host speaks HTTP/2 — the bytes are identical either way and the connection is
 * reused — so overlapping them buys wall-clock time and risks nothing but a
 * little contention.
 *
 * Four rather than all seven: a burst that wide competes for the same bandwidth
 * and makes the per-file timeout harder to reason about, and four already hides
 * most of the latency. Whichever worker finishes first takes the next file, so
 * the pool stays busy to the end rather than idling on the largest one.
 */
const PRESET_CONCURRENCY = 4

export function apply(ctx: Ctx): void {
  // Bind the dedicated `/dsh-background-by-model` RPC caller so the persistence
  // module can reach the node half's file-backed store.
  initRpc((endpoint, payload) =>
    ctx.connection.rpc.call(RPC_CHANNEL, endpoint, payload).then((res: any) => res as RpcResultLike | undefined)
  )

  // ── 1. Appearance: the skin, the host palette, the delayed restores ────────
  const appearance = createAppearance({ ctx, refresh: () => applyWp() })
  ctx.effect(() => () => appearance.dispose(), 'dsh-background-by-model: skin dispose')
  const applyPalette = (): void => appearance.applyPalette()
  const syncHostScheme = (): void => appearance.syncHostScheme()

  // ── 2. Gradient CSS (for custom dark themes) + static rules ────────────────
  const styleEl = document.createElement('style')
  styleEl.dataset.plugin = 'dsh-background-by-model'
  markOwnSheet(styleEl)
  // The gradient only applies while applyCustomTokens marks the body with the
  // plugin's own dark-mode value, avoiding matches against the host's attribute.
  styleEl.textContent = `body[data-ds-dark-theme="${OWN_SCHEME}"]::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(255,255,255,0.03) 0%,transparent 60%)}${SETTINGS_STYLE_RULE}${TRAJECTORY_STYLE_RULE}${RIGHTBAR_STYLE_RULE}${PAGE_STYLE_RULE}${INPUT_STYLE_RULE}` + PLACEHOLDER_RULE
  document.head.appendChild(styleEl)
  ctx.effect(() => () => { styleEl?.parentNode?.removeChild(styleEl) }, 'dsh-background-by-model: gradient')

  // ── 3. State store ────────────────────────────────────────────────────────
  let rev = 0
  let rulesRev = 0
  /** The model the rules are matched against, and whether it actually moved. */
  const model = createModelTracker()
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
    const m = model.state
    bound?.sync(rWp(), rev, rulesRev, m.label !== '' ? m.label : m.text, m.source, m.note, activeRuleId, activeMatched, rot.index, rot.total, rot.rotating, hostIsLegacy())
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
      : matchRule(cfg.rules, model.state.text)
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
  // ONE interval for the whole plugin, always aimed at the ACTIVE rule (see
  // ./rotation-timer for the schedule and its signature).

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

  const rotation = createRotation({ paintImage, warmImage, sync })
  const scheduleRotation = (force = false): void => rotation.schedule(force)
  // A hidden tab has nothing to paint, so the rotation stops with the pixels and
  // resumes on a fresh interval (see ./rotation-timer).
  const onVisibility = (): void => rotation.onVisibility()
  document.addEventListener('visibilitychange', onVisibility)
  ctx.effect(() => () => {
    document.removeEventListener('visibilitychange', onVisibility)
    rotation.dispose()
  }, 'dsh-background-by-model: rotation')

  /**
   * The holiday the background must follow right now, or null.
   *
   * The decision itself is `pickHoliday` (pure, and covered by
   * `scripts/holiday-check.ts`); this only supplies the two things it cannot
   * know — today's holiday from the calendar, and whether the slot has bytes.
   */
  const activeHolidayRule = (): HolidayRule | null =>
    pickHoliday(cfg.holidays.enabled, cfg.holidays.items, activeHoliday(), slot => imageOf(slot) !== null)

  // A holiday's theme colour needs no extraction: it is a fixed part of its
  // definition (`HOLIDAYS`), forced on every read by ./schema.

  // ── 4. First paint + the AppFrame watch ───────────────────────────────────
  syncHostScheme()
  applyWp()
  sync()
  watchParts()

  // ── 5. Model watch ────────────────────────────────────────────────────────
  // The session's own durable model selection is the authority; the host default
  // is only a last resort, and the settings page labels it as such.
  const offModel = watchModel(ctx, (text, label, source, note) => {
    const change = model.update(text, label, source, note)
    if (!change.changed) return
    // A note-only change (e.g. still waiting for the sessions service) must
    // refresh the readout without repainting the whole interface.
    if (change.textChanged) applyActive(true)
    else sync()
  })
  ctx.effect(() => () => offModel(), 'dsh-background-by-model: model watch')
  // A trimmed client (or one whose session is not materialized yet) leaves the
  // per-session sources empty; the host's default model is a coarse but honest
  // stand-in, tagged so the UI never claims it is this session's selection.
  void (async () => {
    if (model.state.text !== '') return
    const fallback = await readDefaultModel()
    if (fallback !== null && model.state.text === '') {
      model.adopt(fallback, 'default', 'fallback')
      applyActive()
    }
  })()

  // ── 6. Boot restore + the recurring checks ────────────────────────────────
  /**
   * The slot of the holiday that could paint TODAY, or null.
   *
   * Gated on the CALENDAR, not merely on the switch: the art does not ship in the
   * package any more, so the first read on the day sends the node half to the
   * network. On every other day this returns null and nothing is fetched, cached
   * or paid for.
   */
  const todayHolidaySlot = (): string | null => {
    if (!cfg.holidays.enabled) return null
    const id = activeHoliday()
    if (id === null) return null
    const item = holidayById(id)
    if (item === null || !item.enabled) return null
    return ruleSlots(item)[0] ?? null
  }
  const activeHolidayId = (): string | null => activeHoliday()
  /** Load one slot and repaint once its bytes are here (the art download). */
  const loadAndRepaint = async (slot: string): Promise<void> => {
    await loadSlot(slot)
    applyActive()
  }

  const schedule = createSchedule()
  ctx.effect(() => () => schedule.dispose(), 'dsh-background-by-model: schedule')
  ctx.effect(appearance.armRestores(), 'dsh-background-by-model: boot restore')
  const checkHost = {
    // The check's pass IS the appearance layer's (scheme, skin, repaint): keeping
    // a hand-copied second version here is how the copy went stale.
    restore: appearance.watch,
    activeColor,
    refreshHostPalette: (): void => { syncHostScheme(); applyWp() },
    refresh: (): void => applyWp(),
    applyActive,
    activeHolidayId,
    todayHolidaySlot,
    loadAndRepaint,
  }
  schedule.add(themeWatchdog(checkHost))
  schedule.add(holidayRollover(checkHost))

  void (async () => {
    const persisted = await loadPersisted()
    if (persisted !== null) {
      adoptConfig(persisted.config)
      // The active rule's bytes paint first; the remaining slots stream in after
      // so a large multi-rule setup never delays the first frame.
      await hydrateBoot({ modelText: model.state.text, holidaySlot: todayHolidaySlot() }, applyActive)
    }
    applyActive()
  })()

  ctx.effect(() => () => { teardownWp() }, 'dsh-background-by-model: wp cleanup')

  ctx.effect(() => ctx.on('theme/change', () => {
    // The scheme is read FIRST: an OS flip while the preference is `system`
    // arrives exactly here, and a colour-less rule has to follow it. Then the
    // skin is re-asserted — the preference lives in memory, so a host adoption
    // can silently reset it. (`reassert` guards on registry presence itself:
    // registering disposes the old skin first, so during that transient the
    // registry lacks our id.)
    syncHostScheme()
    appearance.reassert()
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
   * The decode is asynchronous, so the "still empty?" question is asked AGAIN on
   * arrival: a color chosen while it ran must win over the one being computed.
   * Sequential over a batch on purpose: a batch is a handful of full-size photos,
   * and ten parallel decodes buy nothing while landing the colors in list order
   * does (the card fills in from its first picture).
   */
  const extract = createAutoExtract({
    paintable: slot => displayImageOf(slot),
    repaint: (id, winner) => repaintIfMoved(id, winner),
    winnerId,
    bumpRulesRev: () => { rulesRev++ },
  })
  const maybeAutoExtract = (id: string, slot?: string): Promise<void> => extract.one(id, slot)
  const maybeAutoExtractEach = (id: string, slots: readonly string[]): Promise<void> => extract.each(id, slots)

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
    return model.facts(rule === null ? '' : (rule.match !== '' ? rule.match : rule.id), activeMatched)
  }
  // What a failed profile attempt already had in hand, held across section
  // re-injections (the retry is usually the next click, but the panel can be
  // closed and reopened between them). See `presetResume` in ../preset.
  let presetHeld: PresetHeld | null = null

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
        // slot is taken when the first picture arrives (see `blankRule`).
        const rule = blankRule(nextRuleId())
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
          // A slot is released only when NOTHING else points at it (another rule,
          // re-scanned after the splice, or a holiday entry) — a wrong answer here
          // deletes a picture another card is still showing.
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
        // Every one of these fields can move the resolution (`shouldRepaint`),
        // so the winner is sampled first.
        const winner = winnerId()
        Object.assign(rule, patch)
        // The shared sanitizer: a live edit can never hold what a reload would clamp.
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
        // The edit that most often CREATES the winner: a rule just added has no
        // picture, and the picture it is being given now is what makes it one.
        const winner = winnerId()
        /** Slots of THIS batch, in list order — the extraction below is per slot. */
        const added: string[] = []
        for (const dataUrl of dataUrls) {
          const slot = nextSlot()
          // Every per-image field is written EXPLICITLY (`defaultImage`): the lifts
          // key off a missing key, so an entry created without one would come back
          // as "written before this field existed" and inherit whatever the rule —
          // or, for a rule that has none, the sanitizer's default — happened to say.
          rule.images.push(defaultImage(slot))
          added.push(slot)
          setImage(slot, dataUrl)
          // One immediate write per image: a structural edit must not be lost to a
          // page close, which would leave the config naming slots disk never got.
          void writeImage(slot, dataUrl)
        }
        rulesRev++
        persistConfig()
        repaintIfMoved(id, winner)
        // Themed per SLOT, over the whole batch: every file carries a palette of
        // its own, and the card's selection is not the palette's subject.
        void maybeAutoExtractEach(id, added)
      },
      removeRuleImage: (id: string, slot: string): void => {
        const rule = ruleById(id)
        if (rule === null) return
        const idx = rule.images.findIndex(i => i.slot === slot)
        if (idx < 0) return
        // The mirror of the upload: the rule that was painting may have just lost
        // the last thing it had to paint with.
        const winner = winnerId()
        // The LAST image can go too; the rule is then simply empty, and
        // `ruleCanPaint` decides what it paints. A placeholder entry instead would
        // sit at position 1 and push every later upload to position 2.
        rule.images.splice(idx, 1)
        // One picture is not a rotation: the page disables the switch below two, so
        // leaving `enabled` set would show an "on" switch nobody can turn off.
        if (rule.images.length < 2 && rule.rotate.enabled) patchRotation(rule, { enabled: false })
        // The painted image may be the one that just went away.
        if (id === activeRuleId) setRotIndex(0)
        rulesRev++
        persistConfig()
        if (!takenSlots().has(slot)) {
          setImage(slot, null)
          void deleteImage(slot)
        }
        repaintIfMoved(id, winner)
      },
      moveRuleImageTo: (id: string, slot: string, to: number): void => {
        const rule = ruleById(id)
        if (rule === null) return
        const idx = rule.images.findIndex(i => i.slot === slot)
        if (idx < 0) return
        // `to` addresses the list this move PRODUCES, which is what a drop target
        // is expressed in.
        const at = Math.max(0, Math.min(rule.images.length - 1, Math.trunc(to)))
        if (at === idx) return
        const winner = winnerId()
        // What is on screen is a PICTURE, not a position: a reorder tidies the
        // rotation and must never swap the picture out from under the user.
        const painted = id === activeRuleId ? rule.images[imageIndexOf(rule)]?.slot ?? null : null
        const [image] = rule.images.splice(idx, 1)
        rule.images.splice(at, 0, image!)
        rulesRev++
        // The count is unchanged, so the timer's signature cannot see a reorder:
        // re-arm explicitly.
        if (id === activeRuleId) {
          // Reordering never removes a picture, so the painted one is always still
          // in the list; the fallback is only there to keep the index in range.
          const keep = painted === null ? -1 : rule.images.findIndex(i => i.slot === painted)
          setRotIndex(keep < 0 ? Math.min(at, rule.images.length - 1) : keep)
          scheduleRotation(true)
        }
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
        // `applyWp` re-reads the framing of whatever is painted — this image only
        // while it is the current one.
        repaintIfMoved(id, winner)
      },
      /**
       * Store ONE image's layout mode. Addressed by slot like `setImageFraming`:
       * how a picture meets the viewport is a property of the picture.
       *
       * A mode is a placement, not a paint — nothing changes about WHICH image is
       * on screen — so it ends in the same gate the framing commit uses.
       */
      setImageMode: (id: string, slot: string, mode: BgMode): void => {
        const rule = ruleById(id)
        const image = rule?.images.find(i => i.slot === slot)
        if (rule === null || image === undefined) return
        const winner = winnerId()
        image.bgMode = mode
        normalizeRuleInPlace(rule)
        rulesRev++
        saveConfig()
        repaintIfMoved(id, winner)
      },
      /**
       * Store ONE image's three paint effects. Addressed by slot like the mode and
       * the framing: how a picture is exposed belongs to that picture, and a rule's
       * rotation can run a daylight photo next to a night shot.
       *
       * `normalizeRuleInPlace` is the clamp, so a drag can never write a value the
       * next load would trim; the layer's own preview path (`setWpOpacity` /
       * `setWpFilter`) has already painted the value for the frames of the gesture.
       */
      setImageEffects: (id: string, slot: string, patch: Partial<Pick<BgImage, 'opacity' | 'brightness' | 'blur'>>): void => {
        const rule = ruleById(id)
        const image = rule?.images.find(i => i.slot === slot)
        if (rule === null || image === undefined) return
        const winner = winnerId()
        if (patch.opacity !== undefined) image.opacity = patch.opacity
        if (patch.brightness !== undefined) image.brightness = patch.brightness
        if (patch.blur !== undefined) image.blur = patch.blur
        normalizeRuleInPlace(rule)
        rulesRev++
        // Pointer-move frequency (the merged slider): coalesced.
        saveConfig()
        repaintIfMoved(id, winner)
      },
      setRuleRotation: (id: string, patch: Partial<BgRule['rotate']>): void => {
        const rule = ruleById(id)
        if (rule === null) return
        patchRotation(rule, patch)
        rulesRev++
        persistConfig()
        // On paints at once, off stops the timer at once: both via the signature
        // check in `scheduleRotation`.
        scheduleRotation()
        sync()
      },
      rotateNow: (id: string): void => {
        const rule = ruleById(id)
        // Only the ACTIVE rule can step: the image index describes what is on screen.
        if (rule === null || id !== activeRuleId) return
        const next = nextIndex(rule.images.length, rule.rotate.order, imageIndexOf(rule))
        if (next === null) return
        setRotIndex(next)
        paintImage(rule, next)
        // A manual step restarts the dwell, so the tick that was already on its
        // way does not follow the user's click a second later.
        scheduleRotation(true)
      },
      showRuleImage: (id: string, slot: string): void => {
        const rule = ruleById(id)
        // Same rule as `rotateNow`: the index describes what is on screen, and it
        // is reset the moment another rule takes over.
        if (rule === null || id !== activeRuleId) return
        const idx = rule.images.findIndex(i => i.slot === slot)
        if (idx < 0) return
        setRotIndex(idx)
        // Not `applyActive`: this paints the one image asked for, and `paintImage`
        // waits for cold bytes first.
        paintImage(rule, idx)
        // A jump restarts the dwell, like `rotateNow`.
        scheduleRotation(true)
        // NOTE: no `persistConfig`. Which image is shown is runtime state, not a
        // setting — it is not saved and not restored on the next boot.
      },
      loadRuleImages: async (id: string): Promise<void> => {
        const rule = ruleById(id)
        if (rule === null) return
        // Sequential on purpose: an expanded card wants its thumbnails in list order.
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
        rule.images.push(defaultImage(slot))
        setImage(slot, res.dataUrl ?? null)
        rulesRev++
        persistConfig()
        repaintIfMoved(id, winner)
        void maybeAutoExtract(id, slot)
        return res
      },
      /**
       * Store ONE image's theme colour (null = that image follows the system theme).
       * Addressed by slot like `setImageFraming`: editing one picture's colour must
       * touch neither another picture's nor the RULE's own.
       */
      setImageColor: (id: string, slot: string, color: [number, number, number] | null): void => {
        const rule = ruleById(id)
        const image = rule?.images.find(i => i.slot === slot)
        if (rule === null || rule === undefined || image === undefined) return
        // A colour is what a paint is made of: this can make an unusable rule usable.
        const winner = winnerId()
        image.color = color
        normalizeRuleInPlace(rule)
        rulesRev++
        // Pointer-move frequency (the wheel, the RGB inputs): coalesced.
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
        // Addressed by SLOT: the extraction belongs to the picture the button was
        // pressed on.
        const current = ruleById(id)?.images.find(i => i.slot === image.slot)
        if (current === undefined) return false
        // This can hand the interface a rule it was not showing.
        const winner = winnerId()
        current.color = hsl
        rulesRev++
        saveConfig()
        repaintIfMoved(id, winner)
        return true
      },
      setOps: (ops: PartOpacities): void => { cfg.opacities = ops; applyWp(); sync(); saveConfig() },
      setSop: (v: number): void => { cfg.settingsOpacity = v; applySettingsOverrides(v); saveConfig() },
      // The file-preview panel owns its surface from the first drag on; a null
      // hands it back to the main-background slider.
      setRightbarOpacity: (v: number | null): void => {
        cfg.rightbarOpacity = v
        applyRightbarOverrides(rRightbarOpacity())
        saveConfig()
      },
      setAutoExtract: (v: boolean): void => { cfg.autoExtract = v; saveConfig(); sync() },
      /**
       * Patch the GLOBAL wallpaper-switch transition.
       *
       * Deliberately no `applyWp()`: this decides what the NEXT switch looks like
       * and paints nothing now. The page's own preview plays the effect.
       */
      setTransition: (patch: Partial<TransitionConfig>): void => {
        // Through the shared sanitizer, exactly like `patchRotation`: a live edit
        // can never hold a value the next load would clamp differently.
        cfg.transition = normalizeTransition({ ...cfg.transition, ...patch })
        sync()
        saveConfig()
      },

      // ── Holiday overrides ─────────────────────────────────────────────────
      setHolidaysEnabled: (v: boolean): void => {
        cfg.holidays.enabled = v
        persistConfig()
        // Paint at once: today's art is fetched if it is not in memory yet (only
        // today's — the other one cannot paint).
        const slot = todayHolidaySlot()
        if (v && slot !== null) void loadSlot(slot).then(() => applyActive())
        applyActive()
      },

      // Download every rule plus its images as one JSON file.
      exportTheme: (): void => { saveThemeFile(buildThemeFile()) },
      // Import: replaces the whole rule set and every rule image.
      importTheme: async (file: File): Promise<boolean> => {
        try {
          const data: unknown = JSON.parse(await file.text())
          if (!data || typeof data !== 'object') return false
          return await applyThemeFile({ applyActive }, data as ThemeFile, false)
        } catch {
          return false
        }
      },
      /**
       * Fetch the project's recommended profile. Downloads only — applying it is
       * separate, because the page has to ask before anything is destroyed and the
       * question should describe what is actually in hand.
       *
       * The profile is a DIRECTORY, so this is a pool rather than one call: the
       * config names the slots and each wallpaper is one request, up to
       * `PRESET_CONCURRENCY` at a time. Each file keeps its own mirror fallback,
       * retry rounds (the node half's business, ./preset), validation and slot name
       * in a failure.
       *
       * STRICT: the first wallpaper that cannot be had stops the queue. What had
       * already arrived is kept for the next press (`presetHeld` below) — the
       * difference between retrying one file and retrying the lot. Nothing is
       * touched here, so "the author renamed a file" arrives as an error naming the
       * file rather than as a profile quietly missing a picture.
       */
      fetchRecommended: async (
        onProgress?: (done: number, total: number) => void,
      ): Promise<PresetResult> => {
        const head = await fetchPresetConfig()
        if (!head.ok) return { ok: false, error: head.error }
        const slots = head.slots
        // Held bytes are reused only for the SAME revision: the tag behind the
        // version can be re-pointed, and an unpurged edge can still answer with the
        // old bytes, so the config is compared rather than assumed (`presetKey`).
        const key = presetKey(head.version, head.config)
        const images: Record<string, string> = presetResume(presetHeld, key)
        let bytes = 0
        for (const url of Object.values(images)) bytes += url.length
        const missing = presetMissing(slots, images)
        /** Files already in hand from the attempt this one is resuming. */
        const held = slots.length - missing.length
        let next = 0
        let done = 0
        /** Latched by the first worker to fail, so the rest stop asking. */
        let stopped = false
        // The counter describes the PROFILE, not this attempt: a retry with six of
        // seven files opens on 6/7. `done` counts only what this attempt asked for.
        onProgress?.(held, slots.length)
        // A shared cursor, not a fixed slice: whoever finishes first takes the next
        // file, so the pool never idles on the largest one.
        const worker = async (): Promise<{ error: string; slot?: string } | null> => {
          for (;;) {
            // Checked before taking a number: a failure must not start one more
            // download on its way out.
            if (stopped || next >= missing.length) return null
            const slot = missing[next++] as string
            const got = await fetchPresetImage(slot)
            if (!got.ok) {
              stopped = true
              return { error: got.error, slot }
            }
            // The node half bounds one file and the count; the running total can
            // only be bounded here. Checked BEFORE the file is kept, so what a
            // failed attempt holds is never over the cap and can be resumed.
            if (bytes + got.dataUrl.length > PRESET_TOTAL_MAX) {
              stopped = true
              return { error: 'too large' }
            }
            images[slot] = got.dataUrl
            bytes += got.dataUrl.length
            onProgress?.(held + (++done), slots.length)
          }
        }
        const failure = (await Promise.all(
          Array.from({ length: Math.min(PRESET_CONCURRENCY, missing.length) }, worker),
        )).find(r => r !== null) ?? null
        if (failure !== null) {
          // Hold what arrived so the next press only asks for the rest. Nothing
          // has been touched — the store is emptied by `applyRecommended` only.
          presetHeld = { key, images }
          return { ok: false, error: failure.error, slot: failure.slot }
        }
        // Complete: there is nothing left to resume.
        presetHeld = null
        // Assembled into the shape `exportTheme` writes: everything downstream (the
        // version gate, the sanitizer, the wipe) is the hand-picked file's path.
        return {
          ok: true,
          preset: { version: head.version, exportedAt: new Date().toISOString(), config: head.config, images },
        }
      },
      /** Replace EVERYTHING with a downloaded profile: empty the store, then write it. */
      applyRecommended: async (preset: ThemeFile): Promise<boolean> => {
        // Never delete a store this build cannot write back into: the reset would
        // go through while every config write is held (`canWriteConfig`).
        if (!canWriteConfig()) return false
        return await applyThemeFile({ applyActive }, preset, true)
      },

      // ── The image store ──────────────────────────────────────────────────
      // `keep` is THIS bundle's live rule slots and nothing else. Rule slots only,
      // deliberately: a holiday's slot belongs to the package's art (downloaded
      // into `holiday-cache/`), so echoing it back would make a stray
      // `modelbg-h-*` file permanently unprunable — the one residue nothing else
      // could ever clear. The node half unions the list with the config on disk, so
      // a slot whose bytes have landed but whose rule entry has not yet reaches it
      // is spared either way.
      readStoreUsage: (): Promise<StoreUsage | null> => readStoreUsage(cfg.rules.flatMap(ruleSlots)),
      pruneOrphanImages: async (): Promise<PruneResult | null> => {
        const res = await pruneOrphanImages(cfg.rules.flatMap(ruleSlots))
        // The in-memory cache is keyed by slot, and a removed file's bytes have no
        // card left to appear on — dropping them is what keeps a replaced picture
        // from keeping a multi-megabyte data URL alive for the rest of the session.
        for (const slot of res?.removed ?? []) setImage(slot, null)
        return res
      },
    }
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'dsh-background-by-model', order: 35,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS, store, inject: sectionInject,
  }, ThemeSection as any))

  // ── 9. Settings-nav icon ──────────────────────────────────────────────────
  // The harness derives the nav glyph from the section id and offers no plugin
  // hook, so the mounted cell is patched in place (see ./nav-icon).
  ctx.effect(() => watchNavIcon(() => ctx.locale.bind(NS)('nav')), 'dsh-background-by-model: nav icon watch')

  // ── 10. Theme-reset watch: re-assert the forced scheme the host strips ────
  const disposeThemeResets = watchThemeResets()
  ctx.effect(() => () => { disposeThemeResets() }, 'dsh-background-by-model: theme resets watch')

  // ── 11. Flush pending writes on page hide ─────────────────────────────────
  const onPageHide = (): void => flushSave()
  window.addEventListener('pagehide', onPageHide)
  ctx.effect(() => () => window.removeEventListener('pagehide', onPageHide), 'dsh-background-by-model: pagehide flush')
}
