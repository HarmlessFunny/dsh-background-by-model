import { useRef } from 'react'
import type { CSSProperties } from 'react'
import type { ThemeSectionProps, ThemeStoreState } from '../../types'
import { cfg } from '../../state'
import { DownloadIcon, UploadIcon } from '../icons'

export function ProfilePage({ p, notify }: { p: ThemeSectionProps; notify: (msg: string, ok?: boolean) => void }) {
  const { t, exportTheme, importTheme } = p
  const importRef = useRef<HTMLInputElement>(null)

  // The section shell renders this page as a plain child and does not subscribe
  // to the store, so the subscription has to live HERE — without it the holiday
  // switch would not repaint itself.
  p.useStore((s: ThemeStoreState) => s.rev + s.rulesRev)
  const holidays = cfg.holidays

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

      <div className="dab-profile-grid dab-rise" style={{ '--d': 2 } as CSSProperties}>
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

      <footer className="dab-footer dab-rise" style={{ '--d': 3 } as CSSProperties}>
        <span className="dab-footer-mono">dsh-background-by-model</span>
        <span>{t('footerTag')}</span>
      </footer>
    </>
  )
}
