import type { CSSProperties, ComponentType } from 'react'
import type { ThemeSectionProps, PartOpacities, PartBlurs } from '../../types'
import { cfg, rOps, rSop, rBlurs, rChatTextOpacity, rTrajectoryOpacity, rRightbarOpacity } from '../../state'
import { saveConfig } from '../../rpc'
import { applyCustomTokens, applySettingsOverrides, setPartBlur, applyViewCards, applyTrajectoryOverrides, applyRightbarOverrides } from '../../wallpaper'
import { LiveSlider } from '../LiveSlider'
import { CanvasIcon, SidebarIcon, ChatIcon, GearIcon, TextIcon, TrajectoryIcon, PreviewIcon, InputIcon, CodeIcon } from '../icons'

interface PartDef {
  labelKey: string
  Icon: ComponentType<{ size?: number }>
  /** Homepage part key; absent for the settings-panel part. */
  opKey?: keyof PartOpacities
  isSettings?: boolean
  /** Conversation text region: tint opacity + blur over the message column. */
  isChat?: boolean
  /** Trajectory view: tint opacity + blur over the whole view surface. */
  isTrajectory?: boolean
  /** File-preview panel: the right sidebar a file click opens. */
  isRightbar?: boolean
  /** Opacity only, deliberately no blur: a code block carries text, and frosting
   *  the wallpaper behind it only softens the plate under the syntax. */
  noBlur?: boolean
}

const PARTS: PartDef[] = [
  { opKey: 'bg', labelKey: 'uiOpacityBg', Icon: CanvasIcon },
  { opKey: 'sidebar', labelKey: 'uiOpacitySide', Icon: SidebarIcon },
  { isRightbar: true, labelKey: 'uiPreview', Icon: PreviewIcon },
  { opKey: 'card', labelKey: 'uiOpacityCard', Icon: ChatIcon },
  { opKey: 'code', labelKey: 'uiOpacityCode', Icon: CodeIcon, noBlur: true },
  { opKey: 'input', labelKey: 'uiOpacityInput', Icon: InputIcon },
  { isSettings: true, labelKey: 'uiSop', Icon: GearIcon },
  { isChat: true, labelKey: 'uiChatRegion', Icon: TextIcon },
  { isTrajectory: true, labelKey: 'uiTrajectory', Icon: TrajectoryIcon },
]

export function InterfacePage({ p }: { p: ThemeSectionProps }) {
  const { t, setOps, setBlurs, setSop, setRightbarOpacity } = p

  return (
    <>
      <header className="dab-head dab-rise" style={{ '--d': 0 } as CSSProperties}>
        <div className="dab-overline">Surfaces</div>
        <h2 className="dab-h1">{t('uiTitle')}</h2>
        <p className="dab-desc">{t('descInterface')}</p>
      </header>

      <div className="dab-grid-parts">
        {PARTS.map((part, i) => {
          const { labelKey, Icon, isSettings, isChat, isTrajectory, isRightbar, noBlur } = part
          const opKey = part.opKey
          // Homepage parts (bg/sidebar/card/input) bind to their own part only;
          // the settings panel (isSettings) binds exclusively to the 'settings'
          // part (--dsh-any-blur-settings / --dsh-any-bg-settings-surface) and
          // must never fall back to a homepage part key — otherwise the dialog
          // panel would track the homepage center/card blur and the home-page
          // opacities. The chat region (isChat) and the trajectory view
          // (isTrajectory) own their own blur keys plus their own tint
          // opacities, and the file-preview panel (isRightbar) owns the right
          // column's backdrop through the same deal. Every homepage opKey is
          // also a PartBlurs key (input included), so the shared blur slider
          // dereferences it directly.
          // `null` means this row has no blur of its own (see `noBlur`), which is
          // why the slider below is conditional rather than merely zero. The cast
          // states what `noBlur` already guarantees at runtime: the only opKey
          // without a PartBlurs twin is the code block's.
          const blurKey: keyof PartBlurs | null = isChat
            ? 'chat'
            : isTrajectory
              ? 'trajectory'
              : isRightbar
                ? 'rightbar'
                : isSettings ? 'settings' : noBlur ? null : (opKey! as keyof PartBlurs)
          const opacity = isChat
            ? rChatTextOpacity()
            : isTrajectory
              ? rTrajectoryOpacity()
              : isRightbar ? rRightbarOpacity() : isSettings ? rSop() : rOps()[opKey!]
          return (
            <section key={blurKey ?? opKey} className="dab-card dab-card-hover dab-rise" style={{ '--d': i + 1 } as CSSProperties}>
              <div className="dab-part-head">
                <div className="dab-part-ico"><Icon size={16} /></div>
                <div className="dab-part-name">{t(labelKey)}</div>
                <span className="dab-part-badge">{Math.round(opacity * 100)}%</span>
              </div>

              <LiveSlider label={t('uiOpacity')} min={0} max={100} step={1} def={Math.round(opacity * 100)}
                fmt={v => `${v}%`}
                onInput={v => {
                  const op = v / 100
                  if (isChat) {
                    cfg.chatTextOpacity = op
                    applyViewCards()
                  } else if (isTrajectory) {
                    cfg.trajectoryOpacity = op
                    applyTrajectoryOverrides(op)
                  } else if (isRightbar) {
                    // First drag is what detaches the panel from the main
                    // background; from then on the card owns it.
                    cfg.rightbarOpacity = op
                    applyRightbarOverrides(op)
                  } else if (isSettings) {
                    cfg.settingsOpacity = op
                    applySettingsOverrides(op)
                  } else {
                    const ops = { ...rOps() }
                    ops[opKey!] = op
                    cfg.opacities = ops
                    applyCustomTokens(ops)
                  }
                  saveConfig()
                }}
                onChange={v => {
                  const op = v / 100
                  if (isChat) {
                    cfg.chatTextOpacity = op
                    applyViewCards()
                    saveConfig()
                  } else if (isTrajectory) {
                    cfg.trajectoryOpacity = op
                    applyTrajectoryOverrides(op)
                    saveConfig()
                  } else if (isRightbar) {
                    setRightbarOpacity(op)
                  } else if (isSettings) {
                    setSop(op)
                  } else {
                    const ops = { ...rOps() }
                    ops[opKey!] = op
                    setOps(ops)
                  }
                }} />

              {blurKey !== null && (
                <LiveSlider label={t('uiBlur')} min={0} max={60} step={1} def={rBlurs()[blurKey]}
                  fmt={v => `${v}px`}
                  onInput={v => {
                    const blurs = { ...rBlurs() }
                    blurs[blurKey] = v
                    cfg.blurs = blurs
                    setPartBlur(blurKey, v)
                    saveConfig()
                  }}
                  onChange={v => {
                    const blurs = { ...rBlurs() }
                    blurs[blurKey] = v
                    setBlurs(blurs)
                  }} />
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
