import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ThemeFile, ThemeSectionProps, ThemeStoreState, StoreUsage } from '../../types'
import { cfg, rFadeMs } from '../../state'
import { matchRule } from '../../modelbg'
import { saveConfig } from '../../rpc'
import { normalizeTransition, TRANSITION_EASINGS, TRANSITION_EFFECTS } from '../../../schema'
import { transitionPlan } from '../../transition'
import { fmtBytes, fmtStoreBytes } from '../../../format'
import type { TransitionEffect, TransitionEasing } from '../../../schema'
import { LiveSlider } from '../LiveSlider'
import { Portal } from '../Portal'
import { REPO_URL } from '../../repo'
import { DownloadIcon, RefreshIcon, SparkleIcon, TrashIcon, UploadIcon } from '../icons'

/** Chip labels, keyed by the value they set — so no chip can be built from a
 *  value the schema does not accept, and `check:ui` still sees every key used. */
const EFFECT_KEYS: Record<TransitionEffect, string> = {
  fade: 'trEffectFade', none: 'trEffectNone', zoom: 'trEffectZoom', slide: 'trEffectSlide',
}
const EASING_KEYS: Record<TransitionEasing, string> = {
  ease: 'trEasingEase', linear: 'trEasingLinear', 'ease-out': 'trEasingOut', 'ease-in-out': 'trEasingInOut',
}

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

/**
 * The ways the recommended-profile download can fail, mapped to their copy.
 *
 * They are worth telling apart because they ask different things of the user and
 * of whoever maintains the assets repository: nothing answering is a network to
 * retry, a mirror that answered with something that is not a profile is not
 * going to start working on a retry, a profile written for a newer plugin is a
 * "update this build", and too many images is a profile nobody should install.
 * A failure that names a SLOT is a fifth case and is rendered separately — that
 * one is the author's file naming, and only the slot tells them which.
 */
const REC_ERROR_KEYS: Record<string, string | undefined> = {
  'download failed': 'recFailNetwork',
  'not a profile': 'recFailNotProfile',
  'newer version': 'recFailNewer',
  'too many images': 'recFailTooMany',
  'too large': 'recFailTooLarge',
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

  // ── match tester ──────────────────────────────────────────────────────────
  // Which rule a model name resolves to. It sits on the PROFILE page rather than
  // above the rule list because it answers a question about the configuration as
  // a whole — "what does this model get?" — and the answer is read once and kept,
  // not consulted while editing a rule. The rules page is now only the editor.
  //
  // The field follows the detected model until the user types their own text, so
  // the card is useful the moment it is looked at and never fights the watcher
  // once it is not. It replaced the old "active now" readout — the same question
  // one step earlier — and it does not go stale between switches.
  const store = p.useStore((s: ThemeStoreState) => s)
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  useEffect(() => { if (!touched) setText(store.model) }, [store.model, touched])
  const probe = text.trim()
  const result = ((): string | null => {
    if (probe === '') return null
    const hit = matchRule(cfg.rules, probe)
    const rule = hit.rule
    if (rule === null) return null
    const n = cfg.rules.findIndex(r => r.id === rule.id) + 1
    return `${hit.matched ? t('tryoutHit') : t('tryoutFallback')} ${n}`
  })()

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
    // `play` closes over the current `tr`; the two fields below are the ones that
    // change the effect's shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tr.effect, tr.easing])

  const onImport = async (file: File) => {
    try {
      const ok = await importTheme(file)
      notify(ok ? t('importDone') : t('importFail'), ok)
    } catch {
      notify(t('importFail'), false)
    }
  }

  // ── recommended profile ───────────────────────────────────────────────────
  // The profile is downloaded FIRST and held here, and only then is the user
  // asked. The order is the point: this is the one action in the panel that
  // deletes everything, and a question asked before the download could only be
  // "replace all of it with … something that may not arrive". Asking second also
  // lets the question state what is actually in hand.
  //
  // It is several transfers rather than one — a config and then a file per
  // wallpaper — so there is a real count to show while it runs, and a partial
  // failure to name. `slot` is what carries that: the config named a file the
  // host does not have.
  const [pending, setPending] = useState<ThemeFile | null>(null)
  const [recBusy, setRecBusy] = useState(false)
  const [recDone, setRecDone] = useState(0)
  const [recTotal, setRecTotal] = useState(0)

  /** What the confirmation describes: countable facts about the download. */
  const recStats = ((): { rules: number; images: number; bytes: number } | null => {
    if (pending === null) return null
    const rules = (pending.config as { rules?: unknown } | null)?.rules
    const images = pending.images ?? {}
    let bytes = 0
    // The base64 IS the transfer — the rest of the document is a few kilobytes
    // of JSON — so summing the data URLs is the honest number to show.
    for (const url of Object.values(images)) bytes += url.length
    return { rules: Array.isArray(rules) ? rules.length : 0, images: Object.keys(images).length, bytes }
  })()

  const onRecommended = async () => {
    setRecBusy(true)
    setRecDone(0)
    setRecTotal(0)
    const res = await p.fetchRecommended((done, total) => { setRecDone(done); setRecTotal(total) })
    setRecBusy(false)
    if (!res.ok) {
      // A failure that names a slot is about one file in the assets repository,
      // not about the network or this build — so it says which one.
      notify(res.slot === undefined
        ? t(REC_ERROR_KEYS[res.error] ?? 'recFailNetwork')
        : `${t('recFailImage')} ${res.slot}`, false)
      return
    }
    setPending(res.preset)
  }

  const onConfirmRecommended = async () => {
    const preset = pending
    if (preset === null) return
    setRecBusy(true)
    const ok = await p.applyRecommended(preset)
    setRecBusy(false)
    setPending(null)
    notify(ok ? t('recDone') : t('recFailApply'), ok)
  }

  // ── image storage ─────────────────────────────────────────────────────────
  // Images are stored at FULL fidelity (see `readImg` in ../../utils/image), so a
  // picture that was replaced or removed leaves its bytes behind unless the one
  // path that removed it also deleted the file — which is exactly the path an
  // interrupted write, a hand-edited config or a rule deleted mid-upload misses.
  // The residue is invisible by construction: boot reads only the slots the config
  // names, so an orphaned file is never loaded and never reported anywhere.
  //
  // Hence a READ first: the card shows what the store occupies and how much of it
  // nothing points at, and only then offers to delete. `null` (a node half from
  // before these methods existed) renders as "unknown" rather than as "nothing to
  // clean", because those two states must not look the same.
  const [usage, setUsage] = useState<StoreUsage | null>(null)
  /** Distinguishes "not asked yet" from "asked, and the host cannot answer". */
  const [usageRead, setUsageRead] = useState(false)
  const [storeBusy, setStoreBusy] = useState(false)

  const refreshStore = async (): Promise<void> => {
    const next = await p.readStoreUsage()
    setUsage(next)
    setUsageRead(true)
  }

  // Re-read whenever the RULES change: an upload, a removal or an import moves the
  // orphan set, and a card still showing the number from before it would be
  // describing a store that no longer exists. `rulesRev` is the store's own counter
  // for exactly that, so no polling is needed.
  useEffect(() => {
    let live = true
    void (async () => {
      const next = await p.readStoreUsage()
      if (!live) return
      setUsage(next)
      setUsageRead(true)
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.rulesRev])

  const onClean = async (): Promise<void> => {
    setStoreBusy(true)
    const res = await p.pruneOrphanImages()
    // Re-read rather than subtract: a file that failed to delete (see `failed`) is
    // still there, and a number computed by subtraction would claim otherwise.
    await refreshStore()
    setStoreBusy(false)
    if (res === null) { notify(t('storeUnknown'), false); return }
    if (res.refused) { notify(t('storeRefused'), false); return }
    if (res.failed.length > 0) {
      notify(`${t('storePartial')}${res.failed.join(', ')}`, false)
      return
    }
    notify(res.removed.length === 0
      ? t('storeCleanNone')
      : `${t('storeDoneFreed')} ${fmtStoreBytes(res.freedBytes)}`, true)
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
          wallpapers are fetched from the project's own asset host and are not
          swappable at all.

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

        {/* One duration for every switch — the slider IS the setting, with no
            "where does it come from" choice in front of it: the per-rule fade
            this could have deferred to had no control anywhere, so offering the
            choice would have been offering a real setting and a phantom one. */}
        {/* No heading of its own: this slider carries the label ("切换时长"), and a
            title above it printed the same two words a line apart. The margin is
            what that heading used to hold down, so the spacing survives it. */}
        <div style={{ marginTop: 12 }}>
          <LiveSlider label={t('trDuration')} min={0} max={3000} step={50} def={tr.durationMs}
            fmt={v => `${v} ms`}
            onInput={v => {
              cfg.transition = normalizeTransition({ ...cfg.transition, durationMs: v })
              saveConfig()
            }}
            onChange={v => setTransition({ durationMs: v })} />
        </div>

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

      {/* The match tester. Its own card, directly above the export/import pair:
          this page is where the settings as a whole are read and moved around,
          and "which rule does this model land on" belongs to that, not to the
          editor for one rule. */}
      <section className="dab-card dab-rise" style={{ '--d': 2 } as CSSProperties}>
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

      <div className="dab-profile-grid dab-rise" style={{ '--d': 3 } as CSSProperties}>
        {/* The one-click path, so it leads. It is also the only card here that
            DESTROYS something — export and import both move a profile around,
            this one replaces the store outright — which is why it is the only
            one that asks before acting. */}
        <section className="dab-card dab-card-hover">
          <div className="dab-profile-ico"><SparkleIcon size={17} /></div>
          <div className="dab-profile-title">{t('recCardTitle')}</div>
          <div className="dab-profile-desc">{t('recCardDesc')}</div>
          <button type="button" className="dab-btn dab-btn-primary"
            disabled={recBusy || store.hostStale}
            title={store.hostStale ? t('hostStaleHint') : t('recAdopt')}
            onClick={() => void onRecommended()}>
            <SparkleIcon size={14} />
            {!recBusy ? t('recAdopt')
              : recTotal > 0 ? `${t('recBusy')} ${recDone}/${recTotal}` : t('recBusy')}
          </button>
        </section>

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

        {/* Last, because it is maintenance rather than a way to move a profile
            around. It is the only destructive control in the panel that does NOT
            ask first, and that is a decision rather than an omission: what it
            deletes is by definition referenced by no rule, so the "question" could
            only list files the user cannot identify — one click away from a store
            they cannot restore, and a dialog that teaches people to click through.
            The safety lives in the GATE instead (`trusted`: an unreadable config
            refuses rather than guesses), which is a fact about the config rather
            than a habit to be confirmed.

            The numbers are the whole point of the card: without them "clean up" is
            a button with an unknown price. They count what a press would FREE, not
            what the store holds: "2.1 MB in use" answers a question nobody asked
            here, and a total file count reads as "eight files to delete" when the
            honest answer is one. */}
        <section className="dab-card dab-card-hover">
          <div className="dab-profile-ico"><TrashIcon size={17} /></div>
          <div className="dab-profile-title">{t('storeCardTitle')}</div>
          <div className="dab-profile-desc">{t('storeCardDesc')}</div>
          {usage === null ? (
            // Two different nothings: still reading, and the host cannot answer.
            // Printing "0 B" for either would claim a measurement nobody made.
            <p className="dab-hint" style={{ marginBottom: 12 }}>
              {usageRead ? t('storeUnknown') : t('storeReading')}
            </p>
          ) : (
            <>
              <div className="dab-store-stats">
                <div className="dab-store-stat">
                  <span className="dab-store-stat-v">{fmtStoreBytes(usage.orphanBytes)}</span>
                  <span className="dab-store-stat-k">{t('storeOrphans')}</span>
                </div>
                <div className="dab-store-stat">
                  <span className="dab-store-stat-v">{usage.orphans.length}</span>
                  <span className="dab-store-stat-k">{t('storeFiles')}</span>
                </div>
              </div>
              {/* The numbers above are still true, and still shown — but with an
                  unreadable config nothing on disk can be told apart from an
                  orphan, so the button is disabled rather than offered and then
                  refused. Saying why is the whole value of the line. */}
              {usage.trusted ? null : (
                <p className="dab-hint dab-stale" style={{ marginBottom: 12 }}>{t('storeRefused')}</p>
              )}
            </>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="dab-btn"
              disabled={storeBusy || usage === null || usage.orphanBytes === 0 || !usage.trusted}
              title={usage !== null && !usage.trusted ? t('storeRefused')
                : usage !== null && usage.orphanBytes === 0 ? t('storeCleanNone') : t('storeClean')}
              onClick={() => void onClean()}>
              <TrashIcon size={14} />{t('storeClean')}
            </button>
            <button type="button" className="dab-btn dab-btn-ghost" disabled={storeBusy}
              onClick={() => void refreshStore()}>
              <RefreshIcon size={14} />{t('storeRefresh')}
            </button>
          </div>
        </section>
      </div>

      {/* The confirmation. A transient toast could not do this job: a toast is
          gone in 2.6 s whether or not it was read, and this is the one action in
          the panel whose mistake cannot be walked back — the store it deletes is
          the only copy of the user's own wallpapers. The counters are here
          rather than in the card because they describe the DOWNLOAD ("what am I
          about to install"), which is not known until it arrives. */}
      {pending !== null && recStats !== null ? (
        <Portal>
          <div className="dab-overlay" onClick={e => {
            if (e.target === e.currentTarget && !recBusy) setPending(null)
          }}>
            <div className="dab-overlay-title">{t('recConfirmTitle')}</div>
            <div className="dab-modal-card" style={{ maxWidth: 'min(92vw, 460px)', textAlign: 'center' }}>
              <p className="dab-overlay-hint" style={{ lineHeight: 1.7 }}>{t('recConfirmBody')}</p>
              <p className="dab-overlay-hint" style={{ marginTop: 10, fontFamily: 'var(--dab-mono, monospace)' }}>
                {`${recStats.rules} ${t('recStatRules')} · ${recStats.images} ${t('recStatImages')} · ${fmtBytes(recStats.bytes)}`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="dab-btn" disabled={recBusy}
                onClick={() => setPending(null)}>{t('recConfirmCancel')}</button>
              <button type="button" className="dab-btn dab-btn-danger" disabled={recBusy}
                onClick={() => void onConfirmRecommended()}>{t('recConfirmOk')}</button>
            </div>
          </div>
        </Portal>
      ) : null}

      <footer className="dab-footer dab-rise" style={{ '--d': 4 } as CSSProperties}>
        {/* The package name is the link: it is what you would search for, and the
            name is what the plugin market lists. */}
        <a className="dab-footer-mono" href={REPO_URL} target="_blank" rel="noreferrer noopener" title={t('repoLink')}>
          dsh-background-by-model
        </a>
        <span>{t('footerTag')}</span>
      </footer>
    </>
  )
}
