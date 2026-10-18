/**
 * The settings-nav glyph.
 *
 * The harness derives every section's nav icon from its id and exposes no hook for
 * a plugin to supply one, so the mounted nav cell has to be found in the DOM and
 * its `<svg>` swapped for this plugin's sun. That is a patch on the host's markup,
 * and the two failure modes are both silent: patching too early finds no cell, and
 * patching on every mutation burns a scan of the whole document per keystroke in
 * the composer. Hence the narrow trigger below — only a settings DIALOG arriving
 * in the tree starts a scan.
 */
import { SUN_PATHS } from './components/icons'

/** The host's settings dialog, the only place this section's nav exists. */
const DIALOG_SEL = '[role="dialog"][aria-modal="true"][aria-labelledby]'
const MARK = 'dabNavIcon'

/**
 * Replace the nav glyph of the section whose label is `navLabel()`.
 *
 * Reads the label on every scan rather than capturing it: the section is rebuilt
 * when the language changes, and a stale label would simply stop matching.
 */
export function applyNavIcon(navLabel: string): void {
  const panel = document.querySelector<HTMLElement>(DIALOG_SEL)
  const nav = panel?.querySelector('nav')
  if (!nav) return
  for (const cell of Array.from(nav.querySelectorAll('button'))) {
    const label = cell.querySelector('span')
    if (label === null || label.textContent?.trim() !== navLabel) continue
    const svg = cell.querySelector('svg')
    // Already ours (a re-scan of the same cell): nothing to do, and replacing it
    // again would restart the icon's animation on every mutation.
    if (svg !== null && svg.dataset[MARK] === '1') return
    const sun = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    sun.setAttribute('width', '16')
    sun.setAttribute('height', '16')
    sun.setAttribute('viewBox', '0 0 16 16')
    sun.setAttribute('fill', 'none')
    sun.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    sun.dataset[MARK] = '1'
    sun.innerHTML = SUN_PATHS
    svg?.replaceWith(sun)
    if (svg === null) cell.prepend(sun)
    return
  }
}

/** Watch for the settings dialog (re)appearing; returns the disposer. */
export function watchNavIcon(navLabel: () => string): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined
  const observer = new MutationObserver(records => {
    // React only when the DIALOG (or its inner nav) is (re)created, so chat-content
    // mutations do not trigger a scan.
    const relevant = records.some(r => {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue
        const el = n as Element
        if (el.matches?.(DIALOG_SEL) || el.querySelector?.(DIALOG_SEL)) return true
      }
      return false
    })
    if (relevant) applyNavIcon(navLabel())
  })
  observer.observe(document.body, { childList: true, subtree: true })
  applyNavIcon(navLabel())
  return () => observer.disconnect()
}
