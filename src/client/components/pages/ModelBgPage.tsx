import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { BgMode, BgRule, ThemeSectionProps, ThemeStoreState } from '../../types'
import { cfg, PALETTE } from '../../state'
import { matchRule } from '../../modelbg'
import { ROTATE_PRESETS } from '../../rotation'
import { readImg } from '../../utils/image'
import { hslToHsv, hsvToHsl, hslToRgb } from '../../utils/color'
import { ColorWheel } from '../ColorWheel'
import { ColorInputs } from '../ColorInputs'
import { ColorPicker } from '../ColorPicker'
import { BgEditor } from '../BgEditor'
import { LiveSlider } from '../LiveSlider'
import { DropletIcon, EditIcon, LinkIcon, PipetteIcon, SparkleIcon, SunIcon, TrashIcon, UploadIcon } from '../icons'

const BG_MODES: Array<{ mode: BgMode; key: string }> = [
  { mode: 'fit', key: 'bgModeFit' },
  { mode: 'fill', key: 'bgModeFill' },
  { mode: 'stretch', key: 'bgModeStretch' },
  { mode: 'tile', key: 'bgModeTile' },
  { mode: 'center', key: 'bgModeCenter' },
]

/** Seed color a rule starts from when the user picks one for the first time. */
const SEED_COLOR: [number, number, number] = [220, 0.55, 0.25]

/**
 * Failing-hop codes the model watcher can report, mapped to their copy. Only
 * these are rendered: `waiting` and `fallback` already have their own hints.
 */
const MODEL_NOTE_KEYS: Record<string, string | undefined> = {
  'no-service': 'statusNoteNoService',
  'no-session': 'statusNoteNoSession',
  'no-projection': 'statusNoteNoProjection',
  'empty-selection': 'statusNoteEmptySelection',
}

function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}

export function ModelBgPage({ p, notify }: { p: ThemeSectionProps; notify: (msg: string, ok?: boolean) => void }) {
  const { t, useStore } = p
  const store = useStore((s: ThemeStoreState) => s)
  const rules = cfg.rules

  // Match tester: the field follows the detected model until the user types
  // their own text, so the card is useful the moment it is looked at and never
  // fights the watcher once it is not. It replaced the old "active now" readout —
  // the same question ("what does this model resolve to?") one step earlier, and
  // it does not go stale between switches.
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  useEffect(() => { if (!touched) setText(store.model) }, [store.model, touched])
  const probe = text.trim()
  const result = ((): string | null => {
    if (probe === '') return null
    const hit = matchRule(rules, probe)
    const rule = hit.rule
    if (rule === null) return null
    const n = rules.findIndex(r => r.id === rule.id) + 1
    return `${hit.matched ? t('tryoutHit') : t('tryoutFallback')} ${n}`
  })()

  return (
    <>
      <header className="dab-head dab-rise" style={{ '--d': 0 } as CSSProperties}>
        <div className="dab-overline">Rules</div>
        <h2 className="dab-h1">{t('pageModelBg')}</h2>
        <p className="dab-desc">{t('descModelBg')}</p>
      </header>

      <section className="dab-card dab-rise" style={{ '--d': 1 } as CSSProperties}>
        {/* A host process from before multi-image cannot read this bundle's config
            shape, so writes are held (see canWriteConfig in ../../rpc). Saying it
            out loud is the whole point: edits that silently do not persist are
            worse than a line telling the user to restart DSH. */}
        {store.hostStale ? (
          <p className="dab-hint dab-stale" style={{ marginBottom: 10 }}>{t('hostStaleHint')}</p>
        ) : null}
        <div className="dab-swatch-title">{t('tryoutTitle')}</div>
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            type="text" className="dab-urlinput" value={text}
            placeholder={t('tryoutPlaceholder')}
            onChange={e => { setTouched(true); setText(e.target.value) }} />
          {store.model !== '' ? (
            <button type="button" className="dab-btn" onClick={() => { setTouched(true); setText(store.model) }}>
              {t('tryoutUseCurrent')}
            </button>
          ) : null}
        </div>
        <p className="dab-hint" style={{ marginTop: 9 }}>
          {probe === '' ? t('tryoutEmpty') : result === null ? t('tryoutNone') : result}
        </p>
        {/* Why the pre-filled value is what it is: without these, a host default
            passed off as this session's model, or a sessions service that simply
            is not up yet, is indistinguishable from a correct read. */}
        {store.model === '' ? <p className="dab-hint" style={{ marginTop: 6 }}>{t('statusUnknownHint')}</p> : null}
        {store.model !== '' && store.modelSource === 'default'
          ? <p className="dab-hint" style={{ marginTop: 6 }}>{t('statusSourceDefaultHint')}</p>
          : null}
        {MODEL_NOTE_KEYS[store.modelNote] !== undefined
          ? <p className="dab-hint" style={{ marginTop: 6 }}>{t(MODEL_NOTE_KEYS[store.modelNote]!)}</p>
          : null}
      </section>

      <section className="dab-rise" style={{ '--d': 2 } as CSSProperties}>
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

        <div className="dab-rules">
          {rules.map((rule, i) => (
            <RuleCard
              key={rule.id} p={p} rule={rule} index={i} total={rules.length}
              // Which of THIS rule's images is on screen right now; -1 for every
              // rule that is not the one painting, so a card can never claim to be
              // showing something it is not.
              liveIndex={rule.id === store.activeRuleId ? store.rotIndex : -1}
              active={rule.id === store.activeRuleId} notify={notify} />
          ))}
        </div>

        <button type="button" className="dab-btn dab-btn-primary" style={{ marginTop: 12 }} onClick={() => { p.addRule() }}>
          + {t('ruleAdd')}
        </button>
      </section>
    </>
  )
}

function RuleCard({ p, rule, index, total, active, liveIndex, notify }: {
  p: ThemeSectionProps
  rule: BgRule
  index: number
  total: number
  active: boolean
  /** Index of the image on screen (only meaningful while `active`); -1 = none. */
  liveIndex: number
  notify: (msg: string, ok?: boolean) => void
}) {
  const { t } = p
  // The active rule opens by default so the panel shows the live one first.
  const [open, setOpen] = useState(active)
  const [dragOver, setDragOver] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlVal, setUrlVal] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)
  const [urlErr, setUrlErr] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [secDraft, setSecDraft] = useState<string | null>(null)
  /** Whether the next file picked replaces the selected image or is added. */
  const [replace, setReplace] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Which image this card is EDITING — deliberately independent of which image
  // the rule is PAINTING: picking image 3 in the strip to fix its framing must not
  // change the background under the dialog. Clamped on read, because removing an
  // image can leave the selection past the end.
  const [sel, setSel] = useState(0)
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

  // Boot only reads a rule's FIRST image, so an expanded card pulls the rest in.
  useEffect(() => {
    if (open) void p.loadRuleImages(rule.id)
    // The count is in the deps on purpose: adding an image to an open card has to
    // hydrate it too (the bytes are already in memory then, so this is a no-op).
  }, [open, rule.id, rule.images.length, p])

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
          setSel(first)
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
    setSel(first)
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
  const moveSel = (dir: -1 | 1): void => { if (selSlot !== null) p.moveRuleImage(rule.id, selSlot, dir) }
  const removeSel = (): void => {
    if (selSlot === null) return
    // Removing the LAST image is allowed: the rule simply becomes empty and paints
    // nothing until a picture arrives, which is what the hint under the preview
    // has always said. (Refusing it left a cleared entry behind — see
    // removeRuleImage in ../../index.)
    const at = selIdx
    p.removeRuleImage(rule.id, selSlot)
    setSel(Math.max(0, Math.min(at, rule.images.length - 2)))
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
      <div className="dab-rule-head">
        <button type="button" className="dab-icon-btn" onClick={() => setOpen(o => !o)}
          title={open ? 'Collapse' : 'Expand'} aria-expanded={open}>
          {open ? '▾' : '▸'}
        </button>
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
        <button type="button" className="dab-icon-btn dab-icon-btn-danger"
          title={t('ruleRemove')} onClick={() => p.removeRule(rule.id)}>
          <TrashIcon size={13} />
        </button>
      </div>

      {open ? (
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
                  them; the edited one is ringed, the PAINTED one is marked while
                  this rule is the live rule. Dropping files anywhere on it adds
                  them (several at once — a rotation is built in batches).

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
                        className={`dab-strip-item${i === selIdx ? ' is-sel' : ''}${liveIndex === i ? ' is-live' : ''}`}
                        title={`${i + 1} / ${rule.images.length}`}
                        onClick={() => setSel(i)}>
                        {thumb !== null
                          ? <img src={thumb} alt="" draggable={false} />
                          : <span className="dab-strip-wait" />}
                        <span className="dab-strip-num">{i + 1}</span>
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
                {rule.images.length >= 2 ? (
                  <>
                    <button type="button" className="dab-icon-btn" disabled={selIdx === 0}
                      title={t('rotImageEarlier')} onClick={() => moveSel(-1)}>↑</button>
                    <button type="button" className="dab-icon-btn" disabled={selIdx === rule.images.length - 1}
                      title={t('rotImageLater')} onClick={() => moveSel(1)}>↓</button>
                    {selIdx !== 0 ? (
                      <button type="button" className="dab-btn dab-btn-ghost"
                        onClick={() => { if (selSlot !== null) p.setCurrentImage(rule.id, selSlot) }}>
                        {t('rotMakeFirst')}
                      </button>
                    ) : null}
                  </>
                ) : null}
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

              {/* ── rotation ──────────────────────────────────────────────── */}
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
                    <div className="dab-chip-row">
                      <button type="button" className={`dab-chip${rule.rotate.order === 'order' ? ' is-active' : ''}`}
                        onClick={() => p.setRuleRotation(rule.id, { order: 'order' })}>
                        {t('rotOrderSeq')}
                      </button>
                      <button type="button" className={`dab-chip${rule.rotate.order === 'shuffle' ? ' is-active' : ''}`}
                        onClick={() => p.setRuleRotation(rule.id, { order: 'shuffle' })}>
                        {t('rotOrderShuffle')}
                      </button>
                    </div>

                    <div className="dab-chip-row" style={{ marginTop: 12, alignItems: 'center' }}>
                      <button type="button" className={`dab-toggle${rule.rotate.advanceOnSwitch ? ' is-on' : ''}`}
                        role="switch" aria-checked={rule.rotate.advanceOnSwitch} title={t('rotOnSwitch')}
                        onClick={() => p.setRuleRotation(rule.id, { advanceOnSwitch: !rule.rotate.advanceOnSwitch })}>
                        <span className="dab-toggle-knob" />
                      </button>
                      <span className="dab-hint" style={{ padding: 0 }}>{t('rotOnSwitch')}</span>
                    </div>

                    <div className="dab-chip-row" style={{ marginTop: 12, alignItems: 'center' }}>
                      <button type="button" className="dab-btn" disabled={!active} onClick={() => p.rotateNow(rule.id)}>
                        {t('rotNext')}
                      </button>
                      <span className="dab-hint" style={{ padding: 0 }}>
                        {/* "On screen" rather than "image N": the row above
                            already reads "image N" for the image being EDITED,
                            and two numbers under the same wording would be the
                            one place this panel could mislead. */}
                        {active ? `${t('rotShowing')} ${rule.images.length === 0 ? 0 : Math.min(liveIndex + 1, rule.images.length)} / ${rule.images.length}` : t('rotNextInactive')}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="dab-rule-section-title">{t('ruleLayout')}</div>
                <div className="dab-chip-row">
                  {BG_MODES.map(m => (
                    <button key={m.mode} type="button"
                      className={`dab-chip${rule.bgMode === m.mode ? ' is-active' : ''}`}
                      onClick={() => p.setRule(rule.id, { bgMode: m.mode })}>
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
                  {url !== null && rule.bgMode === 'fit' ? (
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
                  <div className="dab-swatches" style={{ marginTop: 12 }}>
                    {PALETTE.map(([sh, ss, sl], i) => (
                      <button
                        key={i} type="button" className="dab-swatch"
                        style={{ background: `hsl(${sh} ${Math.round(ss * 100)}% ${Math.round(sl * 100)}%)` }}
                        title={toHex(hslToRgb(sh, ss, sl)).toUpperCase()}
                        onClick={() => setColor([sh, ss, sl])} />
                    ))}
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
            </div>
          </div>
        </div>
      ) : null}

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
