import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { BgMode, BgRule, ThemeSectionProps, ThemeStoreState } from '../../types'
import { cfg, PALETTE } from '../../state'
import { readImg } from '../../utils/image'
import { hslToHsv, hsvToHsl, hslToRgb } from '../../utils/color'
import { ColorWheel } from '../ColorWheel'
import { ColorInputs } from '../ColorInputs'
import { ColorPicker } from '../ColorPicker'
import { BgEditor } from '../BgEditor'
import { LiveSlider } from '../LiveSlider'
import { DropletIcon, EditIcon, LinkIcon, PipetteIcon, SparkleIcon, TrashIcon, UploadIcon } from '../icons'

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
  const activeIndex = store.activeRuleId === null ? -1 : rules.findIndex(r => r.id === store.activeRuleId)

  return (
    <>
      <header className="dab-head dab-rise" style={{ '--d': 0 } as CSSProperties}>
        <div className="dab-overline">Rules</div>
        <h2 className="dab-h1">{t('pageModelBg')}</h2>
        <p className="dab-desc">{t('descModelBg')}</p>
      </header>

      {/* Live resolution readout — the fastest way to see whether a rule set
          behaves the way it was written. */}
      <section className="dab-card dab-rise" style={{ '--d': 1 } as CSSProperties}>
        <div className="dab-status">
          <span>{t('statusModel')}</span>
          {store.model !== ''
            ? <span className="dab-status-model">{store.model}</span>
            : <span className="dab-status-none">{t('statusUnknown')}</span>}
          {store.model !== '' ? <span className="dab-status-arrow">→</span> : null}
          {activeIndex >= 0
            ? (
              <span className={store.matched ? 'dab-status-hit' : ''}>
                {store.matched ? t('statusHit') : t('statusFallback')} · {t('statusRule')} {activeIndex + 1}
              </span>
            )
            : <span className="dab-status-none">{t('statusNone')}</span>}
        </div>
        {store.model === '' ? <p className="dab-hint" style={{ marginTop: 9 }}>{t('statusUnknownHint')}</p> : null}
      </section>

      <section className="dab-rise" style={{ '--d': 2 } as CSSProperties}>
        <div className="dab-swatch-title">{t('rulesTitle')}</div>
        <p className="dab-hint" style={{ marginBottom: 11 }}>{t('rulesHint')}</p>

        <div className="dab-rules">
          {rules.map((rule, i) => (
            <RuleCard
              key={rule.id} p={p} rule={rule} index={i} total={rules.length}
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

function RuleCard({ p, rule, index, total, active, notify }: {
  p: ThemeSectionProps
  rule: BgRule
  index: number
  total: number
  active: boolean
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
  const fileRef = useRef<HTMLInputElement>(null)

  const url = p.imageOf(rule.slot)
  const [h, s, l] = rule.color ?? SEED_COLOR
  const wheel = hslToHsv(h, s, l)

  const onColor = (nh: number, ns: number, nl: number): void => {
    const [sh, ss, sl] = hsvToHsl(nh, ns, nl)
    p.setRule(rule.id, { color: [sh, ss, sl] })
  }

  const onFile = (f: File): void => {
    readImg(f, d => { if (d !== null) p.setRuleImage(rule.id, d) })
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f && f.type.startsWith('image/')) onFile(f)
  }

  const applyUrl = async (): Promise<void> => {
    const u = urlVal.trim()
    if (!/^https?:\/\//i.test(u)) { setUrlErr(t('ruleUrlBadHttp')); return }
    setUrlBusy(true)
    setUrlErr(null)
    const res = await p.setRuleImageFromUrl(rule.id, u)
    setUrlBusy(false)
    if (res.ok) {
      setUrlOpen(false)
      setUrlVal('')
    } else {
      setUrlErr(res.error === 'invalid url' || res.error === 'unsupported scheme'
        ? t('ruleUrlBadHttp')
        : (res.error ?? t('ruleUrlFail')))
    }
  }

  const onExtract = async (): Promise<void> => {
    if (url === null || extracting) return
    setExtracting(true)
    try {
      const ok = await p.extractColor(rule.id)
      notify(ok ? t('extractDone') : t('extractFail'), ok)
    } catch {
      notify(t('extractFail'), false)
    } finally {
      setExtracting(false)
    }
  }

  const cls = `dab-rule${active ? ' is-active' : ''}${rule.enabled ? '' : ' is-off'}`

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
            {/* ── image + layout ─────────────────────────────────────────── */}
            <div>
              <div
                className={`dab-rule-thumb${dragOver ? ' is-over' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}>
                {url !== null
                  ? <img src={url} alt="" draggable={false} />
                  : (
                    <div className="dab-rule-thumb-empty">
                      <UploadIcon size={18} />
                      <span>{t('ruleNoImage')}</span>
                    </div>
                  )}
              </div>

              <div className="dab-chip-row" style={{ marginTop: 10 }}>
                <button type="button" className="dab-btn" onClick={() => fileRef.current?.click()}>
                  <UploadIcon size={13} />{url === null ? t('rulePickImage') : t('ruleChangeImage')}
                </button>
                <button type="button" className="dab-btn dab-btn-ghost" onClick={() => setUrlOpen(o => !o)}>
                  <LinkIcon size={13} />{t('ruleFromUrl')}
                </button>
                {url !== null && rule.bgMode === 'fit' ? (
                  <button type="button" className="dab-btn" onClick={() => setEditorOpen(true)}>
                    <EditIcon size={13} />{t('ruleFramingEdit')}
                  </button>
                ) : null}
                {url !== null ? (
                  <button type="button" className="dab-btn dab-btn-ghost dab-btn-danger"
                    onClick={() => p.setRuleImage(rule.id, null)}>
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
              {url === null ? <p className="dab-hint" style={{ marginTop: 8 }}>{t('ruleEmptyHint')}</p> : null}

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
                </div>
              </div>
            </div>

            {/* ── color + wallpaper effects ──────────────────────────────── */}
            <div>
              <div className="dab-rule-section-title">{t('ruleColor')}</div>
              {rule.color === null ? (
                <>
                  <div className="dab-chip-row">
                    <button type="button" className="dab-btn" onClick={() => p.setRule(rule.id, { color: SEED_COLOR })}>
                      <DropletIcon size={14} />{t('ruleColorNone')}
                    </button>
                    <button type="button" className="dab-btn" disabled={url === null || extracting} onClick={() => void onExtract()}>
                      <SparkleIcon size={14} />{extracting ? t('extracting') : t('ruleColorExtract')}
                    </button>
                  </div>
                  <p className="dab-hint" style={{ marginTop: 8 }}>{t('ruleColorNoneHint')}</p>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <ColorWheel hue={wheel[0]} sat={wheel[1]} lit={wheel[2]} onChange={onColor} />
                    <div className="dab-inputs">
                      <div className="dab-hex-caption">{toHex(hslToRgb(h, s, l)).toUpperCase()}</div>
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
                    <button type="button" className="dab-btn dab-btn-ghost" onClick={() => p.setRule(rule.id, { color: null })}>
                      {t('ruleColorNone')}
                    </button>
                  </div>
                  <div className="dab-swatches" style={{ marginTop: 12 }}>
                    {PALETTE.map(([sh, ss, sl], i) => (
                      <button
                        key={i} type="button" className="dab-swatch"
                        style={{ background: `hsl(${sh} ${Math.round(ss * 100)}% ${Math.round(sl * 100)}%)` }}
                        title={toHex(hslToRgb(sh, ss, sl)).toUpperCase()}
                        onClick={() => p.setRule(rule.id, { color: [sh, ss, sl] })} />
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

      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
        const f = e.target.files?.[0]
        if (!f) return
        onFile(f)
        e.target.value = ''
      }} />

      {editorOpen && url !== null ? (
        <BgEditor
          url={url} state={rule.bgState} t={t} onClose={() => setEditorOpen(false)}
          onCommit={(z, x, y, iw, ih) => {
            p.setRule(rule.id, { bgState: { zoom: z, x, y, iw, ih } })
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
