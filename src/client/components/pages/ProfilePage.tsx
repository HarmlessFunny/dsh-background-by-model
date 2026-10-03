import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { ThemeSectionProps, ThemeStoreState } from '../../types'
import { cfg, rFadeMs } from '../../state'
import { saveConfig } from '../../rpc'
import { normalizeTransition, TRANSITION_DURATION_MODES, TRANSITION_EASINGS, TRANSITION_EFFECTS } from '../../../schema'
import { transitionPlan } from '../../transition'
import type { TransitionDurationMode, TransitionEffect, TransitionEasing } from '../../../schema'
import { LiveSlider } from '../LiveSlider'
import { DownloadIcon, SparkleIcon, UploadIcon } from '../icons'

/** Chip labels, keyed by the value they set — so no chip can be built from a
 *  value the schema does not accept, and `check:ui` still sees every key used. */
const EFFECT_KEYS: Record<TransitionEffect, string> = {
  fade: 'trEffectFade', none: 'trEffectNone', zoom: 'trEffectZoom', slide: 'trEffectSlide',
}
const EASING_KEYS: Record<TransitionEasing, string> = {
  ease: 'trEasingEase', linear: 'trEasingLinear', 'ease-out': 'trEasingOut', 'ease-in-out': 'trEasingInOut',
}
const DURATION_KEYS: Record<TransitionDurationMode, string> = {
  'per-rule': 'trDurPerRule', unified: 'trDurUnified',
}

export function ProfilePage({ p, notify }: { p: ThemeSectionProps; notify: (msg: string, ok?: boolean) => void }) {
  const { t, exportTheme, importTheme, setTransition } = p
  const importRef = useRef<HTMLInputElement>(null)

  // The section shell renders this page as a plain child and does not subscribe
  // to the store, so the subscription has to live HERE — without it the holiday
  // switch and the switch-effect card would not repaint themselves.
  p.useStore((s: ThemeStoreState) => s.rev + s.rulesRev)
  const holidays = cfg.holidays
  const tr = cfg.transition

  // ── switch effect ─────────────────────────────────────────────────────────
  // The decision itself (which effect runs, for how long, and whether it runs at
  // all) is pure and lives in ../../transition, where `scripts/transition-check.ts`
  // can pin it down without a browser. This card only edits the three settings
  // and replays the effect on its own swatch.

  const previewRef = useRef<HTMLDivElement>(null)
  /** The OS preference, read at render: it vetoes the real switch (see
   *  `transitionPlan`), so the card has to say so rather than show a preview of
   *  something the interface will not do. */
  const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /**
   * Play the effect on the preview swatch, for the duration a real switch would
   * use right now: the wallpaper fading into ITSELF is invisible, which is the
   * one thing a transition setting must not leave the user guessing about.
   */
  const play = (): void => {
    const el = previewRef.current
    if (el === null) return
    const plan = transitionPlan({
      effect: tr.effect,
      easing: tr.easing,
      durationMs: rFadeMs(),
      canAnimate: true,
      reducedMotion: false,
    })
    el.style.transition = 'none'
    el.style.opacity = plan.from.opacity
    el.style.transform = plan.from.transform
    requestAnimationFrame(() => {
      el.style.transition = plan.transition
      el.style.opacity = plan.to.opacity
      el.style.transform = plan.to.transform
    })
  }

  // Picking a different SHAPE replays at once, so the choice is answered where it
  // is made. The duration is left to the button: a slider fires on every frame of
  // a drag, and restarting the animation each time reads as a flicker rather than
  // as the timing being edited.
  useEffect(() => {
    if (!reduced) play()
    // `play` closes over the current `tr`; the three fields below are the ones
    // that change the effect's shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tr.effect, tr.easing, tr.durationMode])

  const onImport = async (file: File) => {
    try {
      const ok = await importTheme(file)
      notify(ok ? t('importDone') : t('importFail'), ok)
    } catch {
      notify(t('importFail'), false)
    }
  }

  return (
    <>
      <header className="dab-head dab-rise" style={{ '--d': 0 } as CSSProperties}>
        <div className="dab-overline">Profile</div>
        <h2 className="dab-h1">{t('pageProfile')}</h2>
        <p className="dab-desc">{t('descProfile')}</p>
      </header>

      {/* The whole holiday override is one switch. There is deliberately no card
          per holiday, no thumbnail and no image picker: the feature is a small
          easter egg, and the panels that used to live here made it look like
          something the user is expected to configure — art included. The
          wallpapers ship in the package and are not swappable at all.

          Nor is there a line under the switch explaining it. The label carries
          the meaning, and the control's tooltip carries the windows; a
          paragraph here only made a one-switch feature read as a settings
          block. Do not add one back. */}
      <section className="dab-card dab-rise" style={{ '--d': 1 } as CSSProperties}>
        <div className="dab-chip-row" style={{ alignItems: 'center' }}>
          <button type="button" className={`dab-toggle${holidays.enabled ? ' is-on' : ''}`}
            role="switch" aria-checked={holidays.enabled} title={t('holidayEnable')}
            onClick={() => p.setHolidaysEnabled(!holidays.enabled)}>
            <span className="dab-toggle-knob" />
          </button>
          <span className="dab-holiday-label">{t('holidayTitle')}</span>
        </div>
      </section>

      {/* The global switch effect. It paints nothing by itself — it decides what
          the NEXT change looks like — so it carries its own swatch instead of
          pointing at a wallpaper that would only move later. The effect and the
          easing are global (a rule has no notion of either); the duration stays
          each rule's own until it is unified here, which is why the two
          destinations are spelled out rather than shown as one switch. */}
      <section className="dab-card dab-rise" style={{ '--d': 1 } as CSSProperties}>
        <div className="dab-part-head">
          <div className="dab-part-ico"><SparkleIcon size={16} /></div>
          <div className="dab-part-name">{t('trTitle')}</div>
        </div>

        <div className="dab-swatch-title">{t('trEffect')}</div>
        <div className="dab-chip-row">
          {TRANSITION_EFFECTS.map(effect => (
            <button key={effect} type="button"
              className={`dab-chip${tr.effect === effect ? ' is-active' : ''}`}
              onClick={() => setTransition({ effect })}>
              {t(EFFECT_KEYS[effect])}
            </button>
          ))}
        </div>

        {/* No easing row while nothing is animated: "instant" has no curve, and a
            disabled row here would only be a control that does nothing. */}
        {tr.effect === 'none' ? null : (
          <>
            <div className="dab-swatch-title" style={{ marginTop: 12 }}>{t('trEasing')}</div>
            <div className="dab-chip-row">
              {TRANSITION_EASINGS.map(easing => (
                <button key={easing} type="button"
                  className={`dab-chip${tr.easing === easing ? ' is-active' : ''}`}
                  onClick={() => setTransition({ easing })}>
                  {t(EASING_KEYS[easing])}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="dab-swatch-title" style={{ marginTop: 12 }}>{t('trDuration')}</div>
        <div className="dab-chip-row">
          {TRANSITION_DURATION_MODES.map(mode => (
            <button key={mode} type="button"
              className={`dab-chip${tr.durationMode === mode ? ' is-active' : ''}`}
              onClick={() => setTransition({ durationMode: mode })}>
              {t(DURATION_KEYS[mode])}
            </button>
          ))}
        </div>
        {/* The slider appears only for the destination that HAS a value here; a
            per-rule duration lives on the rule, and the hint says where. */}
        {tr.durationMode === 'unified' ? (
          <div style={{ marginTop: 10 }}>
            <LiveSlider label={t('trDuration')} min={0} max={3000} step={50} def={tr.durationMs}
              fmt={v => `${v} ms`}
              onInput={v => {
                cfg.transition = normalizeTransition({ ...cfg.transition, durationMs: v })
                saveConfig()
              }}
              onChange={v => setTransition({ durationMs: v })} />
          </div>
        ) : (
          <p className="dab-hint" style={{ marginTop: 9 }}>{t('trDurHint')}</p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 13 }}>
          <div className="dab-tr-preview">
            <div ref={previewRef} className="dab-tr-preview-in" />
          </div>
          <button type="button" className="dab-btn" disabled={reduced} onClick={play}>
            <SparkleIcon size={14} />{t('trPreview')}
          </button>
        </div>

        <p className="dab-hint" style={{ marginTop: 10 }}>{t('trHint')}</p>
        {reduced ? <p className="dab-hint" style={{ marginTop: 6 }}>{t('trReducedHint')}</p> : null}
      </section>

      <div className="dab-profile-grid dab-rise" style={{ '--d': 3 } as CSSProperties}>
        <section className="dab-card dab-card-hover">
          <div className="dab-profile-ico"><DownloadIcon size={17} /></div>
          <div className="dab-profile-title">{t('exportCardTitle')}</div>
          <div className="dab-profile-desc">{t('exportCardDesc')}</div>
          <button type="button" className="dab-btn dab-btn-primary" onClick={() => { exportTheme(); notify(t('toastExportDone')) }}>
            <DownloadIcon size={14} />{t('exportTheme')}
          </button>
        </section>

        <section className="dab-card dab-card-hover">
          <div className="dab-profile-ico"><UploadIcon size={17} /></div>
          <div className="dab-profile-title">{t('importCardTitle')}</div>
          <div className="dab-profile-desc">{t('importCardDesc')}</div>
          <button type="button" className="dab-btn" onClick={() => importRef.current?.click()}>
            <UploadIcon size={14} />{t('importTheme')}
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={e => {
            const f = e.target.files?.[0]; if (!f) return
            void onImport(f); e.target.value = ''
          }} />
        </section>
      </div>

      <footer className="dab-footer dab-rise" style={{ '--d': 4 } as CSSProperties}>
        <span className="dab-footer-mono">dsh-background-by-model</span>
        <span>{t('footerTag')}</span>
      </footer>
    </>
  )
}
