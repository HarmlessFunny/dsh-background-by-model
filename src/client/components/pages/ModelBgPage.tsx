import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { BgMode, BgRule, ThemeSectionProps, ThemeStoreState } from '../../types'
import { cfg } from '../../state'
import { neighbourAfter, resolveTab } from '../../rules-view'
import { ROTATE_PRESETS } from '../../rotation'
import { readImg } from '../../utils/image'
import { hslToHsv, hsvToHsl, hslToRgb } from '../../utils/color'
import { ColorWheel } from '../ColorWheel'
import { ColorInputs } from '../ColorInputs'
import { ColorPicker } from '../ColorPicker'
import { BgEditor } from '../BgEditor'
import { LiveSlider } from '../LiveSlider'
import { ChevronDownIcon, DropletIcon, EditIcon, LinkIcon, PipetteIcon, PlusIcon, SparkleIcon, SunIcon, TrashIcon, UploadIcon } from '../icons'

const BG_MODES: Array<{ mode: BgMode; key: string }> = [
  { mode: 'fit', key: 'bgModeFit' },
  { mode: 'fill', key: 'bgModeFill' },
  { mode: 'stretch', key: 'bgModeStretch' },
  { mode: 'tile', key: 'bgModeTile' },
  { mode: 'center', key: 'bgModeCenter' },
]

/** Seed color a rule starts from when the user picks one for the first time. */
const SEED_COLOR: [number, number, number] = [220, 0.55, 0.25]

function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}

export function ModelBgPage({ p, notify }: { p: ThemeSectionProps; notify: (msg: string, ok?: boolean) => void }) {
  const { t, useStore } = p
  const store = useStore((s: ThemeStoreState) => s)
  const rules = cfg.rules

  // ── Which rule is being EDITED ────────────────────────────────────────────
  // Exactly one, because the rules are edited one at a time from the tab strip
  // below. That is what keeps the page height independent of how many rules the
  // user has: with a card per rule, five expanded rules were five editor panels
  // stacked, and the page only stopped growing once they were collapsed by hand.
  //
  // The selection is NOT the active rule: which rule paints is decided by the
  // model, and the two questions are answered at different times. So a model
  // switch never steals the editor out from under the user (the tab only gains
  // its "in use" dot) — but the FIRST selection does land on the rule in use,
  // which is the one the user came here to look at.
  const [selId, setSelId] = useState<string | null>(() => resolveTab(rules, null, store.activeRuleId)?.id ?? null)
  /** True once the user has picked a tab themselves, which stops the follow above. */
  const pickedRef = useRef(false)
  // `rulesRev` is what makes this survive boot: the persisted rule list can land
  // AFTER the first render (and its ids need not be the ids that were there), so
  // "the selection is gone" has to be re-checked every time the list changes, not
  // only when its length does.
  useEffect(() => {
    if (pickedRef.current) return
    const held = resolveTab(rules, selId, store.activeRuleId)
    if (held !== null && held.id !== selId) setSelId(held.id)
  }, [store.rulesRev, store.activeRuleId, selId, rules])
  /** The rule whose editor is mounting — never a stale id. */
  const shown = resolveTab(rules, selId, store.activeRuleId)
  const active = shown?.id ?? null

  // ── Which IMAGE of each rule is being edited ──────────────────────────────
  // Held here rather than inside the card because switching tabs unmounts the
  // card: parked in the card, the selection was forgotten and every return to a
  // rule jumped back to its first picture. Keyed by rule id so a removal cannot
  // hand one rule's selection to another.
  const [selImage, setSelImage] = useState<Record<string, number>>({})
  const selIdxOf = (id: string): number => selImage[id] ?? 0
  const setSelIdxOf = (id: string, i: number): void => setSelImage(m => (m[id] === i ? m : { ...m, [id]: i }))

  /** Select a rule as the edited one; keyboard stepping shares this. */
  const selectRule = (id: string): void => { pickedRef.current = true; setSelId(id) }
  /** Delete a rule and land on its neighbour — never on the first rule. */
  const removeRule = (id: string): void => {
    if (id === active) {
      const next = neighbourAfter(rules, id)
      // Also counts as a deliberate pick: after a deletion the strip must not go
      // chasing the active rule again.
      pickedRef.current = true
      setSelId(next?.id ?? null)
    }
    setSelImage(m => { const n = { ...m }; delete n[id]; return n })
    p.removeRule(id)
  }
  const addRule = (): void => {
    pickedRef.current = true
    setSelId(p.addRule())
  }

  return (
    <>
      <header className="dab-head dab-rise" style={{ '--d': 0 } as CSSProperties}>
        <div className="dab-overline">Rules</div>
        <h2 className="dab-h1">{t('pageModelBg')}</h2>
        <p className="dab-desc">{t('descModelBg')}</p>
      </header>

      {/* No match tester above the rule list any more: it moved to the Profile
          page. On this page it pushed the strip — the thing the panel is now
          built around — a whole card down, and the question it answers ("which
          rule does this model land on?") is read once, not consulted while
          editing a rule. */}
      <section className="dab-rise" style={{ '--d': 1 } as CSSProperties}>
        {/* No "rules" heading and no priority sentence above the list: the panel's
            own title already introduces the rules, and the two lines only pushed
            the first card further down. */}
        {/* Picking an image should just theme the rule; this is the off switch
            for people who want the color to be their own choice every time. */}
        <div className="dab-chip-row" style={{ marginBottom: 12, alignItems: 'center' }}>
          <button type="button" className={`dab-toggle${cfg.autoExtract ? ' is-on' : ''}`}
            role="switch" aria-checked={cfg.autoExtract} title={t('autoExtract')}
            onClick={() => p.setAutoExtract(!cfg.autoExtract)}>
            <span className="dab-toggle-knob" />
          </button>
          <span className="dab-hint">{t('autoExtract')}</span>
        </div>

        {/* One tab strip, one editor. The add button lives at the END of the
            strip, where a new rule appears: the separate button below the list
            used to sit a screen away from the list it appended to. */}
        <RulesTabs
          rules={rules} activeId={active} liveId={store.activeRuleId} p={p}
          onSelect={selectRule} onAdd={addRule} />

        <div className="dab-rule-panel" role="tabpanel" id={active === null ? undefined : `dab-rule-panel-${active}`}
          aria-labelledby={active === null ? undefined : `dab-rule-tab-${active}`}>
          {(() => {
            const idx = rules.findIndex(r => r.id === active)
            const rule = idx < 0 ? undefined : rules[idx]
            if (rule === undefined) {
              return <p className="dab-hint" style={{ padding: '4px 2px' }}>{t('ruleNoneHint')}</p>
            }
            return (
              <RuleCard
                key={rule.id} p={p} rule={rule} index={idx} total={rules.length}
                // Which of THIS rule's images is on screen right now; -1 for a rule
                // that is not the one painting, so a card can never claim to be
                // showing something it is not.
                liveIndex={rule.id === store.activeRuleId ? store.rotIndex : -1}
                active={rule.id === store.activeRuleId} notify={notify}
                // Editing state is owned by the page: the card unmounts when the
                // user switches tabs, and this is what survives it. Removal goes
                // through the page too, because it owns the selection the deleted
                // rule may be holding.
                sel={selIdxOf(rule.id)} onSel={i => setSelIdxOf(rule.id, i)}
                onRemove={() => removeRule(rule.id)} />
            )
          })()}
        </div>
      </section>
    </>
  )
}

/**
 * The rule tab strip: every rule is one tab, and the tab at the end appends a
 * new rule — so what the user browses and what they add to live in one row.
 *
 * A tab carries what the card head used to: its number, a thumbnail of the first
 * image, the match string, and two states that are worth knowing WITHOUT opening
 * it — whether the rule is the one in use, and whether it rotates or is off. The
 * strip scrolls sideways rather than wrapping, because a wrapped strip would put
 * the page height back in the hands of the rule count, which is the whole thing
 * this layout exists to prevent.
 */
function RulesTabs({ rules, activeId, liveId, p, onSelect, onAdd }: {
  rules: readonly BgRule[]
  /** Rule whose editor is showing. */
  activeId: string | null
  /** Rule the current model resolved to ('' / null when nothing resolved). */
  liveId: string | null
  p: ThemeSectionProps
  onSelect: (id: string) => void
  onAdd: () => void
}) {
  const { t } = p
  const items = useRef<Array<HTMLButtonElement | null>>([])
  const [pick, setPick] = useState(false)

  /** Select a rule and bring its tab into view — the strip is wider than the page. */
  const go = (i: number): void => {
    const rule = rules[i]
    if (rule === undefined) return
    onSelect(rule.id)
    // `block: 'nearest'` is the important half: the default would also scroll the
    // settings panel vertically to reach a tab that is already on screen.
    items.current[i]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  const onKeys = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const i = rules.findIndex(r => r.id === activeId)
    if (i < 0) return
    if (e.key === 'ArrowRight') { e.preventDefault(); go(Math.min(i + 1, rules.length - 1)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(Math.max(i - 1, 0)) }
    else if (e.key === 'Home') { e.preventDefault(); go(0) }
    else if (e.key === 'End') { e.preventDefault(); go(rules.length - 1) }
  }

  return (
    <div className="dab-tabs-row">
      <div className="dab-tabs" role="tablist" aria-label={t('tabListLabel')} onKeyDown={onKeys}>
        {rules.map((rule, i) => {
          const on = rule.id === activeId
          const live = rule.id === liveId
          const thumb = rule.images[0] === undefined ? null : p.imageOf(rule.images[0].slot)
          const match = rule.match.trim()
          // Everything the tab knows about the rule, in one sentence for the
          // tooltip: the visible label is elided, the title is not.
          const title = [
            match === '' ? t('tabUnnamed') : match,
            `${rule.images.length}`,
            live ? t('tabLive') : null,
            rule.images.length >= 2 && rule.rotate.enabled ? t('tabRotating') : null,
            rule.enabled ? null : t('tabOff'),
          ].filter((x): x is string => x !== null).join(' · ')
          return (
            <button
              key={rule.id} type="button" role="tab" aria-selected={on}
              id={`dab-rule-tab-${rule.id}`} aria-controls={`dab-rule-panel-${rule.id}`}
              tabIndex={on ? 0 : -1}
              ref={el => { items.current[i] = el }}
              className={`dab-tab${on ? ' is-active' : ''}${rule.enabled ? '' : ' is-off'}${live ? ' is-live' : ''}`}
              title={title} onClick={() => go(i)}>
              {thumb === null ? null : <img className="dab-tab-thumb" src={thumb} alt="" draggable={false} />}
              <span className="dab-tab-num">{i + 1}</span>
              <span className="dab-tab-match">{match === '' ? t('tabUnnamed') : match}</span>
              {rule.enabled && live ? <span className="dab-tab-live" title={t('tabLive')} /> : null}
              {rule.enabled && rule.images.length >= 2 && rule.rotate.enabled
                ? <span className="dab-tab-rot" title={t('tabRotating')}>⟳</span>
                : null}
            </button>
          )
        })}
      </div>

      {/* Both actions sit OUTSIDE the scroller, at its right edge: they act on the
          strip as a whole, and inside it they would scroll away from the end of a
          long list — the add tile could only be reached by scrolling to the
          bottom of the rules. Icon-only (with a title and an aria-label) because
          the strip's width belongs to the rules; the tab beside them says which
          rule is being edited. */}
      <button type="button" className="dab-tab dab-tab-icon" onClick={onAdd}
        title={t('ruleAdd')} aria-label={t('ruleAdd')}>
        <PlusIcon size={16} />
      </button>

      {/* Only worth a menu once the strip cannot show everything at a glance;
          below that the tabs are all one click away already. */}
      {rules.length > 3 ? (
        <div className="dab-pick">
          <button type="button" className="dab-tab dab-tab-icon" aria-haspopup="listbox"
            aria-expanded={pick} title={t('tabPick')} aria-label={t('tabPick')}
            onClick={() => setPick(o => !o)}>
            <ChevronDownIcon size={16} />
          </button>
          {pick ? (
            <>
              {/* An overlay rather than a document listener: the menu is drawn
                  under the cursor and closes on the very next click anywhere. */}
              <div className="dab-pick-scrim" onClick={() => setPick(false)} />
              <div className="dab-pick-menu" role="listbox" aria-label={t('tabMore')}>
                {rules.map((rule, i) => (
                  <button key={rule.id} type="button" role="option"
                    aria-selected={rule.id === activeId}
                    className={`dab-pick-item${rule.id === activeId ? ' is-active' : ''}`}
                    onClick={() => { setPick(false); go(i) }}>
                    <span className="dab-tab-num">{i + 1}</span>
                    <span className="dab-pick-match">{rule.match.trim() === '' ? t('tabUnnamed') : rule.match}</span>
                    <span className="dab-pick-n">{rule.images.length}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function RuleCard({ p, rule, index, total, active, liveIndex, notify, sel, onSel, onRemove }: {
  p: ThemeSectionProps
  rule: BgRule
  index: number
  total: number
  active: boolean
  /** Index of the image on screen (only meaningful while `active`); -1 = none. */
  liveIndex: number
  notify: (msg: string, ok?: boolean) => void
  /** Which of this rule's images is being EDITED (owned by the page, see above). */
  sel: number
  onSel: (i: number) => void
  /** Delete this rule (the page moves the editor to a neighbour). */
  onRemove: () => void
}) {
  const { t } = p
  const [dragOver, setDragOver] = useState(false)
  // ── Dragging a TILE to reorder the row ─────────────────────────────────────
  // Pointer events with capture rather than HTML5 drag-and-drop: the strip already
  // spends that channel on dropped FILES, and a drag we run ourselves is also the
  // only one that can put the insertion bar where the tile will actually land.
  // A pointerdown is merely a CANDIDATE — a tile is a button and clicking it
  // selects it — so the drag only begins once the pointer has travelled a little.
  const pendingDrag = useRef<{ x: number; y: number; from: number; slot: string; id: number } | null>(null)
  /** Insertion slot of the drag in flight (index of the tile it goes BEFORE). */
  const dragAt = useRef<{ from: number; at: number } | null>(null)
  const [drop, setDrop] = useState<{ from: number; at: number } | null>(null)
  /** Set while a drag is real, so the click that ends it is not also a selection. */
  const draggedRef = useRef(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlVal, setUrlVal] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)
  const [urlErr, setUrlErr] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [secDraft, setSecDraft] = useState<string | null>(null)
  /** Two-step delete: this card is the only place the rule can be removed from. */
  const [confirmRemove, setConfirmRemove] = useState(false)
  /** Whether the next file picked replaces the selected image or is added. */
  const [replace, setReplace] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Which image this card is EDITING — deliberately independent of which image
  // the rule is PAINTING: picking image 3 in the strip to fix its framing must not
  // change the background under the dialog. The page owns the value (it has to
  // outlive a tab switch); it is clamped here, because removing an image can leave
  // the stored index past the end.
  const selIdx = rule.images.length === 0 ? 0 : Math.min(sel, rule.images.length - 1)
  const image = rule.images[selIdx]
  const url = image === undefined ? null : p.imageOf(image.slot)

  // ── What the theme-color section edits ─────────────────────────────────────
  // The color belongs to an IMAGE, so the wheel, the swatches, the extractor and
  // the eyedropper all address the image selected in the strip. A rule with no
  // image has only its own color left to offer, and that is not a special case
  // bolted on here: it is the one thing such a rule paints (see `ruleCanPaint`),
  // so the same controls edit it without a second code path.
  //
  // The two targets never mix: an image's color is never inherited from the
  // rule's, which is what makes a rotation through a green, a red and a
  // system-themed picture expressible.
  const ownColor = image === undefined ? rule.color : image.color
  const setColor = (color: [number, number, number] | null): void => {
    if (image === undefined) p.setRule(rule.id, { color })
    else p.setImageColor(rule.id, image.slot, color)
  }
  const [h, s, l] = ownColor ?? SEED_COLOR
  const wheel = hslToHsv(h, s, l)

  // This card IS the open one (the page mounts only the selected rule), so its
  // images are pulled in on mount. Boot only reads a rule's FIRST image, and the
  // count is in the deps on purpose: adding an image has to hydrate it too (the
  // bytes are already in memory then, so this is a no-op).
  useEffect(() => {
    void p.loadRuleImages(rule.id)
  }, [rule.id, rule.images.length, p])

  const onColor = (nh: number, ns: number, nl: number): void => {
    const [sh, ss, sl] = hsvToHsl(nh, ns, nl)
    setColor([sh, ss, sl])
  }

  const onFiles = (files: readonly File[]): void => {
    const list = files.filter(f => f.type.startsWith('image/'))
    if (list.length === 0) return
    // "Replace" swaps the SELECTED image's bytes in place, which is what keeps its
    // position in the rotation; "add" appends. One input serves both, and the mode
    // is decided by the button that opened it.
    if (replace) {
      const slot = rule.images[selIdx]?.slot
      if (slot !== undefined) readImg(list[0]!, d => { if (d !== null) p.setRuleImage(rule.id, slot, d) })
      return
    }
    // Read every file, then hand them over in one batch: adding N images one at a
    // time would persist a config that references slots whose bytes are still
    // being decoded, and each add repaints the whole interface.
    const out: string[] = []
    // What the card will EDIT once the batch lands: the first picture of it. Adding
    // pictures without moving the selection is what made an upload look like it had
    // gone nowhere — the preview stayed on whatever was selected before, and for a
    // rule that had just been emptied that was nothing at all.
    const first = rule.images.length
    let pending = list.length
    list.forEach((f, i) => {
      readImg(f, d => {
        if (d !== null) out[i] = d
        pending--
        if (pending === 0) {
          p.addRuleImages(rule.id, out.filter((x): x is string => typeof x === 'string'))
          onSel(first)
        }
      })
    })
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length > 0) onFiles(files)
  }

  const applyUrl = async (): Promise<void> => {
    // One URL per line: pasting a list is how people actually collect wallpapers,
    // and making them repeat the dialog once per picture is the kind of friction
    // that keeps a rotation at two images.
    const urls = urlVal.split(/\s+/).map(u => u.trim()).filter(u => u !== '')
    if (urls.length === 0) { setUrlErr(t('ruleUrlBadHttp')); return }
    if (urls.some(u => !/^https?:\/\//i.test(u))) { setUrlErr(t('ruleUrlBadHttp')); return }
    setUrlBusy(true)
    setUrlErr(null)
    // Sequential: the node half downloads each one, and firing them all at once
    // would interleave N downloads with no useful progress to show.
    const first = rule.images.length
    for (const u of urls) {
      const res = await p.addRuleImageFromUrl(rule.id, u)
      if (!res.ok) {
        setUrlBusy(false)
        setUrlErr(res.error === 'invalid url' || res.error === 'unsupported scheme'
          ? t('ruleUrlBadHttp')
          : (res.error ?? t('ruleUrlFail')))
        return
      }
    }
    setUrlBusy(false)
    setUrlOpen(false)
    setUrlVal('')
    // Same rule as the file picker: show the user what they just added.
    onSel(first)
  }

  const onExtract = async (): Promise<void> => {
    if (url === null || extracting || image === undefined) return
    setExtracting(true)
    try {
      const ok = await p.extractColor(rule.id, image.slot)
      notify(ok ? t('extractDone') : t('extractFail'), ok)
    } catch {
      notify(t('extractFail'), false)
    } finally {
      setExtracting(false)
    }
  }

  /**
   * Leaving "follow the system theme" must not hand the user a color that has
   * nothing to do with the wallpaper they just picked, so this tries the image
   * first and only falls back to the seed. (`extractColor` is the same pass the
   * extract button runs and returns false when nothing vivid was found.)
   */
  const onPickColor = async (): Promise<void> => {
    if (url !== null && image !== undefined) {
      setExtracting(true)
      try {
        if (await p.extractColor(rule.id, image.slot)) return
      } catch {
        // fall through to the seed
      } finally {
        setExtracting(false)
      }
    }
    setColor(SEED_COLOR)
  }

  const cls = `dab-rule${active ? ' is-active' : ''}${rule.enabled ? '' : ' is-off'}`
  const rotatable = rule.images.length >= 2
  const preset = ROTATE_PRESETS.find(x => x.ms === rule.rotate.intervalMs)
  const selSlot = image?.slot ?? null
  // The layout chip row reads and writes the SELECTED image's mode. `fit` is the
  // answer only while there is no image to ask — the row is disabled then, so the
  // value is a placeholder on a control nobody can press, not a claim about a
  // picture. It is deliberately NOT read from the rule: the rule has no mode.
  const bgMode: BgMode = image?.bgMode ?? 'fit'

  // ── Reordering by dragging a tile ──────────────────────────────────────────
  /** How far the pointer must travel before a click turns into a drag. */
  const DRAG_SLOP = 5

  const tileDown = (i: number, slot: string) => (e: ReactPointerEvent<HTMLButtonElement>): void => {
    // Mouse and pen only: on a touch screen this same gesture is how the row is
    // scrolled, and taking it over would leave the strip unscrollable by finger.
    if (e.button !== 0 || e.pointerType === 'touch') return
    e.currentTarget.setPointerCapture(e.pointerId)
    pendingDrag.current = { x: e.clientX, y: e.clientY, from: i, slot, id: e.pointerId }
    draggedRef.current = false
  }

  const tileMove = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const pen = pendingDrag.current
    if (pen === null || pen.id !== e.pointerId) return
    const cur = dragAt.current
    if (cur === null) {
      if (Math.abs(e.clientX - pen.x) + Math.abs(e.clientY - pen.y) < DRAG_SLOP) return
      draggedRef.current = true
    }
    // Where the tile would land, read off the live rectangles: the insertion slot
    // is the first tile whose midpoint is to the RIGHT of the pointer, so the left
    // half of a tile means "before it" and the right half "after it".
    const strip = e.currentTarget.parentElement
    const list = strip === null ? [] : [...strip.querySelectorAll('.dab-strip-item')]
    let at = list.length
    for (let i = 0; i < list.length; i++) {
      const box = list[i]!.getBoundingClientRect()
      if (e.clientX < box.left + box.width / 2) { at = i; break }
    }
    if (cur !== null && cur.at === at) return
    dragAt.current = { from: pen.from, at }
    setDrop({ from: pen.from, at })
  }

  /** End a drag: commit the new order, or just forget it on a cancel. */
  const tileUp = (commit: boolean) => (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const pen = pendingDrag.current
    pendingDrag.current = null
    if (pen !== null && e.currentTarget.hasPointerCapture(pen.id)) e.currentTarget.releasePointerCapture(pen.id)
    const end = dragAt.current
    dragAt.current = null
    setDrop(null)
    if (!commit || pen === null || end === null) return
    // `at` counts tiles whose midpoint is left of the pointer, which is an index in
    // the list AS IT IS. The image is lifted out before it is put back, so a drop
    // to the right of its own slot has to lose one — the difference between a drop
    // that feels right and one that lands a slot short.
    const to = end.at > pen.from ? end.at - 1 : end.at
    if (to === pen.from) return
    p.moveRuleImageTo(rule.id, pen.slot, to)
    // Keep the preview on the picture the user just moved, which is where the drag
    // left their attention — the selection is an index, so it has to follow.
    onSel(to)
  }
  const removeSel = (): void => {
    if (selSlot === null) return
    // Removing the LAST image is allowed: the rule simply becomes empty and paints
    // nothing until a picture arrives, which is what the hint under the preview
    // has always said. (Refusing it left a cleared entry behind — see
    // removeRuleImage in ../../index.)
    const at = selIdx
    p.removeRuleImage(rule.id, selSlot)
    onSel(Math.max(0, Math.min(at, rule.images.length - 2)))
  }
  /** Commit the custom dwell time the moment it is typed (seconds → ms). */
  const commitSeconds = (): void => {
    if (secDraft === null) return
    const secs = Number(secDraft.trim())
    setSecDraft(null)
    if (!Number.isFinite(secs) || secs <= 0) return
    // The shared sanitizer clamps to ROTATE_MIN_MS..ROTATE_MAX_MS, so this cannot
    // store a value the next load would rewrite.
    p.setRuleRotation(rule.id, { intervalMs: Math.round(secs * 1000) })
  }

  return (
    <section className={cls}>
      {/* The head, not a tab: collapse is gone (there is nothing to collapse —
          only the selected rule is mounted), and the controls that act on the
          whole rule live here, next to the name they act on. */}
      <div className="dab-rule-head">
        <span className="dab-rule-num">{index + 1}</span>
        {index === 0 ? <span className="dab-rule-badge">{t('ruleFallbackBadge')}</span> : null}
        <input
          className="dab-rule-match" value={rule.match}
          placeholder={t('ruleMatchPlaceholder')}
          onChange={e => p.setRule(rule.id, { match: e.target.value })} />
        <button type="button" className={`dab-toggle${rule.enabled ? ' is-on' : ''}`}
          role="switch" aria-checked={rule.enabled} title={t('ruleEnabled')}
          onClick={() => p.setRule(rule.id, { enabled: !rule.enabled })}>
          <span className="dab-toggle-knob" />
        </button>
        <button type="button" className="dab-icon-btn" disabled={index === 0}
          title={t('ruleUp')} onClick={() => p.moveRule(rule.id, -1)}>↑</button>
        <button type="button" className="dab-icon-btn" disabled={index === total - 1}
          title={t('ruleDown')} onClick={() => p.moveRule(rule.id, 1)}>↓</button>
        {/* Two steps, because a rule carries its images: one click on a trash
            icon next to a tab strip is one too few for something that cannot be
            undone. The armed state says so in words rather than in colour. */}
        <button type="button"
          className={`dab-icon-btn dab-icon-btn-danger${confirmRemove ? ' is-armed' : ''}`}
          title={confirmRemove ? t('ruleRemoveConfirm') : t('ruleRemove')}
          onBlur={() => setConfirmRemove(false)}
          onClick={() => {
            if (!confirmRemove) { setConfirmRemove(true); return }
            setConfirmRemove(false)
            onRemove()
          }}>
          {confirmRemove ? <span className="dab-confirm-txt">{t('ruleRemoveConfirm')}</span> : <TrashIcon size={13} />}
        </button>
      </div>

      {/* No `open` test: this card is the tab panel, and the page mounts exactly
          one of them. */}
      <div className="dab-rule-body">
          <div className="dab-rule-cols">
            {/* ── image strip + layout ───────────────────────────────────── */}
            <div>
              {/* Big preview of the SELECTED image — the card used to show its
                  only image here, so the panel keeps the same visual weight. It
                  is deliberately inert: dropping onto the strip below ADDS,
                  while "replace" stays an explicit action on the labelled
                  button, and a preview that quietly swallowed a click was the
                  one thing this card's users could not predict. */}
              {/* Big preview of the SELECTED image — and, while the rule holds no
                  picture at all, the rule's upload target.

                  With pictures present it is deliberately inert: dropping onto
                  the strip below ADDS, while "replace" stays an explicit action on
                  the labelled button, and a preview that quietly swallowed a click
                  was the one thing this card's users could not predict.

                  With NO picture there is nothing to replace, so the same box is
                  the opposite: the one obvious thing to click ("点这个上传"), and
                  the drop zone as well — the strip is hidden in that state (it
                  would hold nothing but a second add tile), and taking drag &
                  drop away from the state every rule starts in is not a trade this
                  card should make. `dragOver` is shared with the strip on purpose:
                  exactly one of the two is ever mounted. */}
              {url !== null ? (
                <div className="dab-rule-thumb">
                  <img src={url} alt="" draggable={false} />
                </div>
              ) : rule.images.length === 0 ? (
                <button
                  type="button"
                  className={`dab-rule-thumb dab-rule-thumb-add${dragOver ? ' is-over' : ''}`}
                  title={t('rotAddImage')}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => { setReplace(false); fileRef.current?.click() }}>
                  <span className="dab-rule-thumb-empty">
                    <UploadIcon size={18} />
                    <span>{t('rotAddImage')}</span>
                  </span>
                </button>
              ) : (
                <div className="dab-rule-thumb">
                  <div className="dab-rule-thumb-empty">
                    <UploadIcon size={18} />
                    <span>{t('ruleNoImage')}</span>
                  </div>
                </div>
              )}

              {/* The strip. One item per image, in the order the rotation walks
                  them; the edited one is ringed, the PAINTED one carries the dot
                  while this rule is the live rule — and only the dot, so the
                  strip never shows two rings at once. Dropping files anywhere on
                  it adds them (several at once — a rotation is built in batches),
                  and dragging a TILE along it reorders the rotation.

                  Hidden while the rule has no picture: a strip holding nothing but
                  its own add tile said the same thing as the upload target right
                  above it, and a filmstrip is a list of pictures — it has no job
                  in a state that has none. */}
              {rule.images.length > 0 ? (
                <div
                  className={`dab-strip${dragOver ? ' is-over' : ''}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}>
                  {rule.images.map((img, i) => {
                    const thumb = p.imageOf(img.slot)
                    return (
                      <button
                        key={img.slot} type="button"
                        // No `is-live` modifier: being on screen is the dot
                        // below and nothing more. Ringing this tile as well put
                        // two rings in the strip at once — this one and the
                        // previewed one — and read as "two images selected".
                        className={`dab-strip-item${i === selIdx ? ' is-sel' : ''}${drop !== null && drop.from === i ? ' is-dragging' : ''}`}
                        title={`${i + 1} / ${rule.images.length} · ${t('rotDragHint')} · ${t('rotDblHint')}`}
                        onPointerDown={tileDown(i, img.slot)}
                        onPointerMove={tileMove}
                        onPointerUp={tileUp(true)}
                        onPointerCancel={tileUp(false)}
                        onClick={() => {
                          // A drag ends with a click on the tile it started from,
                          // and that click is not a selection.
                          if (draggedRef.current) { draggedRef.current = false; return }
                          onSel(i)
                        }}
                        // Double-click shows this picture: it is the one gesture that
                        // says "THIS one on screen", which reordering deliberately
                        // does not do. It changes no order and saves nothing — the
                        // image being shown is runtime state, not a setting.
                        onDoubleClick={() => {
                          // Only the rule that is painting has a screen to change, and
                          // the store no-ops for any other — so say why instead of
                          // leaving a double-click that looks broken.
                          if (!active) { notify(t('rotNextInactive')); return }
                          p.showRuleImage(rule.id, img.slot)
                        }}>
                        {thumb !== null
                          ? <img src={thumb} alt="" draggable={false} />
                          : <span className="dab-strip-wait" />}
                        <span className="dab-strip-num">{i + 1}</span>
                        {/* Where the tile in hand will land: a bar at this tile's
                            LEFT edge, or at the last tile's right edge for a drop
                            past the end of the row. */}
                        {drop !== null && drop.at === i ? <span className="dab-strip-bar" /> : null}
                        {drop !== null && drop.at === rule.images.length && i === rule.images.length - 1
                          ? <span className="dab-strip-bar is-end" /> : null}
                        {/* This image's own theme color, when it has one. The whole
                            point of per-image colors is that they differ, and
                            without this the only way to find out which pictures
                            already carry one is to click through the strip and
                            watch the wheel change. Hex on hover, like a swatch. */}
                        {img.color !== null ? (
                          <span
                            className="dab-strip-dot"
                            title={toHex(hslToRgb(img.color[0], img.color[1], img.color[2])).toUpperCase()}
                            style={{ background: `hsl(${img.color[0]} ${Math.round(img.color[1] * 100)}% ${Math.round(img.color[2] * 100)}%)` }} />
                        ) : null}
                        {liveIndex === i ? <span className="dab-strip-live" title={t('rotShowing')} /> : null}
                      </button>
                    )
                  })}
                  <button type="button" className="dab-strip-add" title={t('rotAddImage')}
                    onClick={() => { setReplace(false); fileRef.current?.click() }}>
                    <UploadIcon size={16} />
                    <span>{t('rotAddImage')}</span>
                  </button>
                </div>
              ) : null}

              <div className="dab-chip-row" style={{ marginTop: 10 }}>
                {/* No position readout for an empty rule: "image 0 / 0" would be a
                    number about nothing — the upload target above is the whole
                    story there. */}
                {rule.images.length > 0 ? (
                  <span className="dab-strip-pos">{t('rotPos')} {selIdx + 1} / {rule.images.length}</span>
                ) : null}
                <button type="button" className="dab-btn" onClick={() => { setReplace(false); fileRef.current?.click() }}>
                  <UploadIcon size={13} />{t('rotAddImage')}
                </button>
                <button type="button" className="dab-btn dab-btn-ghost" onClick={() => setUrlOpen(o => !o)}>
                  <LinkIcon size={13} />{t('ruleFromUrl')}
                </button>
                {/* Replacing keeps the image's POSITION in the rotation, which
                    "remove + add" cannot do — and the two actions are labelled
                    apart on purpose: the button above appends, this one swaps the
                    selected image's bytes. */}
                {selSlot !== null ? (
                  <button type="button" className="dab-btn dab-btn-ghost"
                    onClick={() => { setReplace(true); fileRef.current?.click() }}>
                    <UploadIcon size={13} />{t('rotReplaceImage')}
                  </button>
                ) : null}
                {/* No step/first buttons any more: the strip IS the control for
                    order. Dragging a tile is the same operation those two arrows
                    and "make first" were, and a row of five tiles is a list you
                    can see — a pair of arrows that nudges the selected one along
                    it was a second, worse way to say "put this one there". */}
                {/* Always offered, including on the LAST image: the rule is then
                    simply empty, and the empty strip above is the honest picture
                    of that. Hiding this — the first cut of the feature did —
                    left a cleared entry that could never be deleted again. Note
                    that "empty" is not "off": a rule that kept its theme color
                    still paints (see `ruleCanPaint`), which the hint above says. */}
                {selSlot !== null ? (
                  <button type="button" className="dab-btn dab-btn-ghost dab-btn-danger"
                    onClick={removeSel}>
                    <TrashIcon size={13} />{t('ruleImageRemove')}
                  </button>
                ) : null}
              </div>

              {urlOpen ? (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text" className="dab-urlinput" value={urlVal}
                    placeholder={t('ruleUrlPlaceholder')} autoFocus
                    onChange={e => setUrlVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void applyUrl() } }} />
                  <button type="button" className="dab-btn dab-btn-primary" disabled={urlBusy} onClick={() => void applyUrl()}>
                    {urlBusy ? t('ruleUrlApplying') : t('ruleUrlApply')}
                  </button>
                  <button type="button" className="dab-btn"
                    onClick={() => { setUrlOpen(false); setUrlVal(''); setUrlErr(null) }}>
                    {t('ruleUrlCancel')}
                  </button>
                </div>
              ) : null}
              {urlErr !== null ? (
                <p style={{ marginTop: 8, color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 }}>{urlErr}</p>
              ) : null}
              {/* Three states, three sentences — the old single test (`url ===
                  null`) told a rule with no pictures and a rule whose picture
                  simply has no bytes yet the same story, and only one of them
                  was true. A rule with no image but a COLOR of its own is not
                  skipped: it paints the interface from that color (see
                  `ruleCanPaint`), and saying otherwise is what made its color
                  controls look broken. */}
              {rule.images.length === 0 ? (
                <p className="dab-hint" style={{ marginTop: 8 }}>
                  {rule.color === null ? t('ruleEmptyHint') : t('ruleColorOnlyHint')}
                </p>
              ) : null}
              {rule.images.length > 0 && url === null ? (
                <p className="dab-hint" style={{ marginTop: 8 }}>{t('ruleImagePendingHint')}</p>
              ) : null}

              <div style={{ marginTop: 14 }}>
                {/* The layout mode belongs to the SELECTED image, like the framing
                    below it and the theme color beside it: 适应/填充 decides how one
                    picture meets the viewport, and a rotation through a landscape
                    photo and a tall screenshot needs one of them letterboxed and
                    the other filled. The row therefore edits `image`, not `rule`,
                    which no longer has a mode at all — and on a rule with no
                    picture it is disabled rather than hidden, so the card that says
                    "点这个上传" still shows what will become editable.
                    No target sentence above the row (the color section next door has
                    one): the row directly under the strip reads as belonging to the
                    selected tile, and a second "第 N 张" a few centimetres from the
                    first would be the panel saying one thing twice. */}
                <div className="dab-rule-section-title">{t('ruleLayout')}</div>
                <div className="dab-chip-row" style={{ marginTop: 8 }}>
                  {BG_MODES.map(m => (
                    <button key={m.mode} type="button"
                      className={`dab-chip${bgMode === m.mode ? ' is-active' : ''}`}
                      disabled={image === undefined}
                      title={image === undefined ? t('ruleLayoutNoImage') : undefined}
                      onClick={() => { if (image !== undefined) p.setImageMode(rule.id, image.slot, m.mode) }}>
                      {t(m.key)}
                    </button>
                  ))}
                  {/* The framing editor sits at the END of this row, not among the
                      modes: it is not a sixth mode, and dropping it between two
                      chips would read as one (the modes are mutually exclusive,
                      this is an action). It belongs here rather than next to the
                      upload buttons because what it edits is how the picture fills
                      the area — the row it now shares with 适应/填充/…. It stays
                      conditional on `fit`: dragging the framing is what "适应"
                      means, and the other four modes have nothing to drag. */}
                  {url !== null && bgMode === 'fit' ? (
                    <button type="button" className="dab-btn" onClick={() => setEditorOpen(true)}>
                      <EditIcon size={13} />{t('ruleFramingEdit')}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* ── color + wallpaper effects ──────────────────────────────── */}
            <div>
              <div className="dab-rule-section-title">{t('ruleColor')}</div>
              {/* Which of the two things below the controls edit. Since a theme
                  color belongs to an image, the same wheel means different things
                  depending on the strip, and a section that silently retargets is
                  exactly how "I changed the color and nothing happened" is born. */}
              <p className="dab-hint" style={{ marginTop: 6 }}>
                {image === undefined
                  ? t('ruleColorTargetRule')
                  : `${t('ruleColorTargetImage')} ${selIdx + 1} / ${rule.images.length}`}
              </p>
              {ownColor === null ? (
                <>
                  <div className="dab-chip-row">
                    {/* This button LEAVES the system-theme state, so it says so:
                        the "系统主题" label belongs to the clearing button below. */}
                    <button type="button" className="dab-btn" disabled={extracting} onClick={() => void onPickColor()}>
                      <DropletIcon size={14} />{extracting ? t('extracting') : t('ruleColorPick')}
                    </button>
                    <button type="button" className="dab-btn" disabled={url === null || extracting} onClick={() => void onExtract()}>
                      <SparkleIcon size={14} />{extracting ? t('extracting') : t('ruleColorExtract')}
                    </button>
                  </div>
                  <p className="dab-hint" style={{ marginTop: 8 }}>{t('ruleColorNoneHint')}</p>
                  {/* The extraction promise belongs to a target that HAS bytes:
                      next to a disabled "extract" button it read as a broken
                      feature, not as a hint — and for a rule with no image at all
                      the honest sentence is a different one (it has nothing to
                      take a color from, but a color of its own is still enough to
                      paint the interface). */}
                  {url !== null
                    ? <p className="dab-hint" style={{ marginTop: 6 }}>{t('ruleColorPickHint')}</p>
                    : image === undefined
                      ? <p className="dab-hint" style={{ marginTop: 6 }}>{t('ruleColorNoImageHint')}</p>
                      : <p className="dab-hint" style={{ marginTop: 6 }}>{t('ruleColorPendingImageHint')}</p>}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <ColorWheel hue={wheel[0]} sat={wheel[1]} lit={wheel[2]} onChange={onColor} />
                    {/* No hex caption above the toggle any more: the preview
                        field inside ColorInputs prints that same value on the
                        color itself, where it also explains what the field is. */}
                    <div className="dab-inputs">
                      <ColorInputs hue={wheel[0]} sat={wheel[1]} lit={wheel[2]} onChange={onColor} />
                    </div>
                  </div>
                  <div className="dab-chip-row" style={{ marginTop: 12 }}>
                    <button type="button" className="dab-btn" disabled={url === null || extracting} onClick={() => void onExtract()}>
                      <SparkleIcon size={13} />{extracting ? t('extracting') : t('ruleColorExtract')}
                    </button>
                    <button type="button" className="dab-btn" disabled={url === null} onClick={() => setPickerOpen(true)}>
                      <PipetteIcon size={13} />{t('eyedropper')}
                    </button>
                    {/* Clears THIS image's color and hands the interface back to
                        the host palette for as long as that image is on screen —
                        the rule's own color (if it has one) is untouched, because
                        it is not this image's fallback. Carries the sun because
                        that is the host's own appearance glyph, and reads as the
                        action it performs rather than the state it lands in — as a
                        bare "系统主题" it looked like the label of whatever control
                        sat beside it. */}
                    <button type="button" className="dab-btn dab-btn-ghost" onClick={() => setColor(null)}>
                      <SunIcon size={13} />{t('ruleColorNone')}
                    </button>
                  </div>
                </>
              )}

              <div style={{ marginTop: 16 }}>
                <LiveSlider
                  label={t('ruleOpacity')} min={0} max={100} step={1}
                  def={Math.round(rule.wallpaperOpacity * 100)} fmt={v => `${v}%`}
                  onChange={v => p.setRule(rule.id, { wallpaperOpacity: v / 100 })} />
                <LiveSlider
                  label={t('ruleBlur')} min={0} max={60} step={1}
                  def={rule.blur} fmt={v => `${v}px`}
                  onChange={v => p.setRule(rule.id, { blur: v })} />
                <p className="dab-hint" style={{ marginTop: 10 }}>{t('ruleBlurHint')}</p>
              </div>

              {/* ── rotation ──────────────────────────────────────────────── */}
              {/* Below the theme color and the wallpaper sliders — not between
                  the strip and the layout mode, where it used to sit: this is the
                  tallest block of the card and the one touched least often, and in
                  the collapsed single-column panel it pushed the color controls
                  away from the strip that feeds them. */}
              <div style={{ marginTop: 14 }}>
                <div className="dab-rule-section-title">{t('rotTitle')}</div>
                <div className="dab-chip-row" style={{ alignItems: 'center' }}>
                  <button type="button" className={`dab-toggle${rule.rotate.enabled ? ' is-on' : ''}`}
                    role="switch" aria-checked={rule.rotate.enabled} title={t('rotEnable')}
                    disabled={!rotatable}
                    onClick={() => p.setRuleRotation(rule.id, { enabled: !rule.rotate.enabled })}>
                    <span className="dab-toggle-knob" />
                  </button>
                  <span className="dab-hint" style={{ padding: 0 }}>{t('rotEnable')}</span>
                  {!rotatable ? <span className="dab-hint" style={{ padding: 0 }}>{t('rotNeedTwo')}</span> : null}
                  {/* The manual step stands with the switch and OUTSIDE the
                      `enabled` test, because walking the pictures by hand is what
                      a rule with two of them can always do — and the readout
                      beside it is the only place the card says which one is on
                      screen. Inside the panel it vanished with the rotation, so
                      turning the timer off also hid the answer to "which image am
                      I looking at". */}
                  <button type="button" className="dab-btn"
                    disabled={!active || !rotatable} onClick={() => p.rotateNow(rule.id)}>
                    {t('rotNext')}
                  </button>
                  {/* A rule with fewer than two pictures has nowhere to step: the
                      need-two hint above already says that, and "0 / 0" would be a
                      number about nothing. */}
                  {rotatable ? (
                    <span className="dab-hint" style={{ padding: 0 }}>
                      {/* "On screen" rather than "image N": the strip's own readout
                          already reads "image N" for the picture being EDITED, and
                          two numbers under the same wording would be the one place
                          this card could mislead. */}
                      {active ? `${t('rotShowing')} ${Math.min(liveIndex + 1, rule.images.length)} / ${rule.images.length}` : t('rotNextInactive')}
                    </span>
                  ) : null}
                </div>

                {rotatable && rule.rotate.enabled ? (
                  <div className="dab-rot-panel">
                    <div className="dab-rule-section-title">{t('rotEvery')}</div>
                    <div className="dab-chip-row">
                      {ROTATE_PRESETS.map(item => (
                        <button key={item.ms} type="button"
                          className={`dab-chip${item.ms === rule.rotate.intervalMs ? ' is-active' : ''}`}
                          onClick={() => p.setRuleRotation(rule.id, { intervalMs: item.ms })}>
                          {t(item.key)}
                        </button>
                      ))}
                      <input
                        type="number" className="dab-num dab-num-sec" min={5} max={86_400} step={5}
                        // The draft is what is being typed; without it the field
                        // would fight the user on every keystroke (and "5" on the
                        // way to "50" is a legal value nobody meant).
                        value={secDraft ?? (preset === undefined ? Math.round(rule.rotate.intervalMs / 1000) : '')}
                        placeholder={t('rotCustom')}
                        onChange={e => setSecDraft(e.target.value)}
                        onBlur={commitSeconds}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitSeconds() } }} />
                      <span className="dab-hint" style={{ padding: 0 }}>{t('rotSeconds')}</span>
                    </div>

                    <div className="dab-rule-section-title" style={{ marginTop: 12 }}>{t('rotOrder')}</div>
                    <div className="dab-chip-row" style={{ alignItems: 'center' }}>
                      <button type="button" className={`dab-chip${rule.rotate.order === 'order' ? ' is-active' : ''}`}
                        onClick={() => p.setRuleRotation(rule.id, { order: 'order' })}>
                        {t('rotOrderSeq')}
                      </button>
                      <button type="button" className={`dab-chip${rule.rotate.order === 'shuffle' ? ' is-active' : ''}`}
                        onClick={() => p.setRuleRotation(rule.id, { order: 'shuffle' })}>
                        {t('rotOrderShuffle')}
                      </button>
                      {/* The "also step on a model switch" switch shares the order
                          row instead of taking one of its own: both decide WHEN a
                          picture is swapped, and 按顺序/随机 alone left the row
                          looking like the whole story of the rotation. */}
                      <button type="button" className={`dab-toggle${rule.rotate.advanceOnSwitch ? ' is-on' : ''}`}
                        role="switch" aria-checked={rule.rotate.advanceOnSwitch} title={t('rotOnSwitch')}
                        onClick={() => p.setRuleRotation(rule.id, { advanceOnSwitch: !rule.rotate.advanceOnSwitch })}>
                        <span className="dab-toggle-knob" />
                      </button>
                      <span className="dab-hint" style={{ padding: 0 }}>{t('rotOnSwitch')}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

      {/* `multiple` because a rotation is built by picking a handful of pictures
          at once; the strip's drop zone and the URL box take batches too. A
          replacement only ever takes the first file — see onFiles. */}
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => {
        const files = Array.from(e.target.files ?? [])
        if (files.length === 0) return
        onFiles(files)
        e.target.value = ''
        setReplace(false)
      }} />

      {editorOpen && url !== null && image !== undefined ? (
        <BgEditor
          url={url} state={image.bgState} t={t} onClose={() => setEditorOpen(false)}
          onCommit={(z, x, y, iw, ih) => {
            // Framing belongs to the IMAGE, so the commit is addressed by slot:
            // editing image 3's crop must not rewrite image 1's.
            p.setImageFraming(rule.id, image.slot, { zoom: z, x, y, iw, ih })
            setEditorOpen(false)
          }} />
      ) : null}

      {pickerOpen && url !== null ? (
        <ColorPicker url={url} t={t} onClose={() => setPickerOpen(false)}
          onPick={hsv => { onColor(hsv[0], hsv[1], hsv[2]); setPickerOpen(false) }} />
      ) : null}
    </section>
  )
}
