/**
 * The eye in the conversation header: hide every interface component and leave
 * only the wallpaper. The mode and the reasons behind it live in ../peek.
 *
 * Rendered into `conversation.session.header.utilities` — a LIST slot — so it sits
 * beside the harness's own header controls rather than replacing one of them. It is
 * ordered 0, i.e. just left of the overflow ("…") menu, which is the same trailing
 * cluster the user already reads as "things about this view".
 *
 * ONE STATE ONLY. The button is how the mode is ENTERED, and it is indoors the
 * interface — so while the interface is hidden it is hidden with everything else.
 * Leaving is a click or any key press (../peek), not this control: a control that
 * outlives the interface has to be dressed for a background the plugin did not
 * choose, and an earlier version's attempt at that is why the entry is one-way.
 *
 * Being one-way, it is also the one control in the plugin that needs NO state: it
 * has no pressed look to keep in step with the document, because it is never
 * visible while the mode is on. A pressed state is therefore absent rather than
 * permanently false — a toggle that can never report pressed is a worse
 * description of this than a plain button.
 */
import { EyeIcon } from './icons'
import { togglePeeking } from '../peek'

/**
 * Props the host injects. This seat supplies the standard Session seats and
 * nothing of its own, and `t` is bound from the namespace the registration names
 * (`locale: NS` in ../index), so only the translate function is used here.
 */
export interface PeekButtonProps {
  t: (key: string) => string
}

/**
 * Render the eye.
 * @param props - the namespace-bound translate function.
 * @returns the button that hides the interface.
 */
export function PeekButton({ t }: PeekButtonProps) {
  const label = t('peekHide')
  return (
    <button
      type="button"
      className="dab-peek-btn"
      aria-label={label}
      title={label}
      data-dab-peek-toggle=""
      onClick={() => { togglePeeking() }}
    >
      <EyeIcon size={15} />
    </button>
  )
}
