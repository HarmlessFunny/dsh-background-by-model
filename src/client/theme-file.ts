/**
 * The theme library: the document one export produces, and the ONE door every
 * import comes through.
 *
 * Kept out of `apply()` because it is the half of the plugin that touches the
 * user's DATA rather than the screen: the export assembles a file, the import
 * decides what may replace what. A reader wants those two functions side by side,
 * not 400 lines apart inside two `async` listeners.
 *
 * The rules an import has to keep are stated where they are enforced:
 *   - a file written for a NEWER shape is refused before anything is touched;
 *   - `wipeFirst` belongs to the recommended profile alone (a download and a
 *     hand-picked file must not arrive by different routes);
 *   - the wipe happens only after the bytes are in hand, so an unreachable CDN
 *     never costs the user their configuration.
 */
import type { ThemeFile } from './types'
import { SCHEMA_VERSION } from '../schema'
import {
  cfg, imageOf, ruleSlots, setImage, resetConfig, adoptConfig,
} from './state'
import { persistConfig, writeImage, deleteImage, resetStore } from './rpc'

/** What the import path needs from the rest of the plugin. */
export interface LibraryHost {
  /** Resolve and repaint after the config was replaced wholesale. */
  applyActive(): void
}

/** Slot names reach the filesystem, so an incoming file's are whitelisted. */
const SLOT_RE = /^[A-Za-z0-9_-]{1,32}$/

/** The JSON document `exportTheme` writes; `images` carries every rule slot. */
export function buildThemeFile(): ThemeFile {
  const images: Record<string, string> = {}
  // Rule slots only, but ALL of them: a file carrying just each rule's first image
  // would silently drop the rest of a rotation on the way out. A holiday's
  // wallpaper belongs to the package and is served from there, so it is never
  // written into a file — that would ship ~970 KB of base64 every install already
  // has, to a slot nothing could restore it to (it is read-only).
  for (const slot of cfg.rules.flatMap(ruleSlots)) {
    const url = imageOf(slot)
    if (url !== null) images[slot] = url
  }
  return {
    // Every earlier version still imports: the shared sanitizer lifts or defaults
    // whatever a file predates, which is why this number only moves forward.
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    config: cfg,
    images,
  }
}

/**
 * Write the current rules and wallpapers out as one JSON file.
 *
 * The object URL is attached to a hidden anchor and released on the NEXT task:
 * a click is not a synchronous download, and releasing in the same tick cancels
 * it in some browsers — while Firefox only honours the click on an anchor that is
 * in the document.
 */
export function saveThemeFile(file: ThemeFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'dsh-background-by-model-theme.json'
  a.style.display = 'none'
  document.body.append(a)
  a.click()
  window.setTimeout(() => { a.remove(); URL.revokeObjectURL(url) }, 0)
}

/**
 * Write a whole theme file into the store: its rules, its wallpapers, nothing
 * else.
 *
 * `wipeFirst` is the entire difference between the two imports, and it belongs to
 * the recommended profile alone: `nextSlot` hands slots out as `m1`, `m2`, … — a
 * counter, not a random token — so a downloaded profile and the store it lands in
 * collide on those names as a matter of course. Emptying first is what makes
 * "replace everything with this" literally true.
 */
export async function applyThemeFile(
  host: LibraryHost,
  data: ThemeFile,
  wipeFirst: boolean,
): Promise<boolean> {
  // Refused before ANYTHING is touched, on both paths: a file written for a shape
  // this build does not know would otherwise be half-understood by an older
  // sanitizer, and importing it would produce a config neither side wrote.
  if (typeof data.version === 'number' && data.version > SCHEMA_VERSION) return false
  if (typeof data.config !== 'object' || data.config === null) return false
  if (wipeFirst) {
    await resetStore()
    // The in-memory mirror has to go with it, or slots that no longer exist on
    // disk keep painting until the next reload.
    resetConfig()
  }
  adoptConfig(data.config)
  const incoming = (data.images ?? {}) as Record<string, unknown>
  const keep = new Set<string>()
  // Every slot the incoming config references — the same set the export writes.
  // A holiday slot an older file still carries falls outside `keep` and is swept
  // below; the node half refuses to write such a slot either way.
  for (const slot of cfg.rules.flatMap(ruleSlots)) {
    keep.add(slot)
    const raw = incoming[slot]
    if (typeof raw === 'string' && /^data:image\//.test(raw)) {
      setImage(slot, raw)
      void writeImage(slot, raw)
    } else {
      setImage(slot, null)
      void deleteImage(slot)
    }
  }
  // Slots the incoming config no longer references are released.
  for (const slot of Object.keys(incoming)) {
    if (!keep.has(slot) && SLOT_RE.test(slot)) void deleteImage(slot)
  }
  persistConfig()
  host.applyActive()
  return true
}
