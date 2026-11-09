/**
 * The settings-nav glyph.
 *
 * The harness renders each settings section's nav icon from a slot,
 * `settings.section.icon`, whose registration id must EQUAL the section's id
 * (`dsh-client-ui-settings-general`, `renderSlot('settings.section.icon', …,
 * { only: row.id, fallback: navIcon(row.id) })`). The fallback is
 * `IconSettingsOutlineMedium` — a gear — which is why a section with no icon
 * registered shows a gear.
 *
 * THIS USED TO BE A DOM PATCH, and it never worked. It looked for the nav
 * button whose first `<span>` read as the section label, but the host's markup is
 * `<button><span class="navIcon"><svg/></span><span class="navLabel">…</span>`,
 * so `querySelector('span')` returned the ICON span — text content `''` — the
 * label never matched, and the gear stayed. Nothing reported it: the patch simply
 * found no cell and returned. A slot is both the supported route and the honest
 * one, so the observer, the markup scan and the DOM surgery are all gone.
 */
import { createElement } from 'react'
import { MarkIcon } from './components/icons'

/** The id the section is registered under; the icon's id has to match it. */
export const SECTION_ID = 'dsh-background-by-model'

/**
 * Register the section's nav icon.
 *
 * `active` arrives from the host on every render, so the mark can react to the
 * section being selected without re-registering.
 */
export function registerNavIcon(ctx: {
  slots: {
    inject(name: string, apply: () => unknown): unknown
    register(options: Record<string, unknown>, component: unknown): unknown
  }
}): void {
  ctx.slots.inject('settings.section.icon', () => ctx.slots.register(
    {
      name: 'settings.section.icon',
      // Must equal the section's own id: an icon registered under any other id
      // never renders (`only: row.id` filters it out).
      id: SECTION_ID,
      order: 35,
      // Not displayed for icons; the owner supplies its own label.
      label: () => '',
    },
    // The host supplies `{ size, active }`. `size` is the square edge it wants
    // (16 in the nav), so the glyph scales with the row instead of being pinned.
    (props: { size?: number; active?: boolean }) =>
      createElement(MarkIcon, { size: props.size ?? 16, className: props.active ? 'dab-nav-mark is-active' : 'dab-nav-mark' }),
  ))
}
