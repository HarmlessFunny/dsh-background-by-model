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
 *   - the importer's own authorisation survives the file, and the store's own
 *     revision is carried through rather than reset;
 *   - a picture the file does not carry is released, not left behind.
 */
import type { ThemeFile } from './types'
import { SCHEMA_VERSION } from '../schema'
import {
  cfg, imageOf, ruleSlots, setImage, adoptConfig,
} from './state'
import { persistConfig, writeImage, deleteImageAfterSave } from './rpc'

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
    // `agentAccess` is STRIPPED on the way out, and `rev` with it.
    //
    // Both are authorisations/bookkeeping rather than looks: a file handed to
    // someone else must not be able to grant that person's agent access to their
    // own machine (the importer's sanitizer would read a `true` in the file as a
    // grant), and a revision from another store is meaningless here. The sanitizer
    // puts both back at their safe defaults on import, so this is what keeps an
    // export a description of an APPEARANCE and nothing else.
    config: { ...cfg, agentAccess: false, rev: 0 },
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
 * The recommended profile no longer comes through here. It used to, as a
 * `wipeFirst` variant of this function, and that was the shape of a real bug: the
 * wipe is a separate round trip that empties the config ON DISK, so the write this
 * function then made named a revision the emptied store had never heard of, was
 * refused as stale, and adopted the config it had just replaced — the button had to
 * be pressed twice. Installing the profile is now one node-half operation
 * (`adoptRecommended`), and this path only ever imports a file over a live store.
 */
export async function applyThemeFile(
  host: LibraryHost,
  data: ThemeFile,
): Promise<boolean> {
  // Refused before ANYTHING is touched, on both paths: a file written for a shape
  // this build does not know would otherwise be half-understood by an older
  // sanitizer, and importing it would produce a config neither side wrote.
  if (typeof data.version === 'number' && data.version > SCHEMA_VERSION) return false
  if (typeof data.config !== 'object' || data.config === null) return false
  const ownRev = cfg.rev
  // The importing machine's OWN authorisation decides, never the file's.
  //
  // An export already strips `agentAccess`, but a hand-edited or hand-crafted file
  // can put `true` back in, and that must not be a way to grant an agent access to
  // whatever machine opens it. So the value that survives an import is the one this
  // store already had — the file describes an appearance, and access is not part of
  // one.
  //
  // The revision is NOT reset, and that is not an oversight: the write below names
  // the revision this store is on, so zeroing it here would make the import's own
  // save read as stale — refused, handed back the pre-import config, and rolled
  // back on screen. The import is a NEW revision of this store's history, which is
  // exactly what the write that follows produces.
  const ownAccess = cfg.agentAccess
  adoptConfig({ ...(data.config as object), agentAccess: ownAccess, rev: ownRev })
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
      // DEFERRED, for the reason `deleteImageAfterSave` exists: the entry is gone from
      // this copy, but it is not gone from disk until the write below lands. An import
      // that loses the write is rolled back on screen, and deleting the bytes first
      // would leave the rules it rolled back to pointing at nothing.
      deleteImageAfterSave(slot)
    }
  }
  // Slots the incoming config no longer references are released — also after the
  // write, because those slots are still the ones the config ON DISK names.
  for (const slot of Object.keys(incoming)) {
    if (!keep.has(slot) && SLOT_RE.test(slot)) deleteImageAfterSave(slot)
  }
  persistConfig()
  host.applyActive()
  return true
}
