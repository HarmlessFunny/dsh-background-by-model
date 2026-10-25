export interface ThemeSnapshot {
  preference: string; revision: number
  active: { colorScheme: string; tokens: Record<string, string> }
  themes: Array<{ id: string; colorScheme: string; tokens: Record<string, string> }>
}
export interface ThemeService {
  getTheme(): ThemeSnapshot; setTheme(id: string): void
  register(def: { id: string; colorScheme: string; tokens: Record<string, string> }): () => void
  overrideTokens(source: string, overrides: Record<string, Record<string, string>>): () => void
}
export interface LocaleService {
  register(ns: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): unknown
  bind(ns: string): (key: string) => string
  subscribe(cb: () => void): () => void; getSnapshot(): { active: string }
}
export interface SlotsService {
  inject(slot: string, register: () => unknown): void
  register(meta: Record<string, unknown>, component: () => unknown): unknown
}
export interface ConnectionService {
  rpc: { call(channel: string, endpoint: string, payload: unknown): Promise<unknown> }
}
/** Bare observable face — snapshot read plus change subscription. */
export interface ObservableFaceLike<T = unknown> {
  getSnapshot(): T | undefined
  subscribe(fn: () => void): () => void
}
/** One row of the 0.1.7 session list. */
export interface SessionListRowLike {
  id?: string
  /** Retention counts; the main view's session is the row holding `mainView`. */
  retainedBy?: { mainView?: number }
}
/**
 * Session list face, covering both host generations: ≤0.1.6 published the current
 * session id directly as `current`, while 0.1.7 publishes a row table
 * (`ids` / `byId` / `phase`) and hands the *main view's* session to `uiSession`,
 * identifying it by the row's `retainedBy.mainView` retention.
 */
export interface SessionListSnapshotLike {
  current?: string
  byId?: Record<string, SessionListRowLike | undefined>
}
/** The host's `uiSession` service: `current` is the main view's session binding. */
export interface UiSessionLike {
  current?: ObservableFaceLike<{ key?: string } | undefined>
}
/** Session list face: only `list` is read here (the current Session id). */
export interface SessionsServiceLike {
  readonly list: ObservableFaceLike<SessionListSnapshotLike>
  /** Stable session binding (pure resolution; undefined until materialized). */
  binding?(id: string): SessionBindingLike | undefined
  /** Materialize a session's scope so `binding` can resolve. */
  scope?(id: string): unknown
}
/** The session's projection seat (`session.projections`). */
export interface ProjectionsFaceLike {
  /** Identity-stable face for one projection key (absence = undefined snapshot). */
  faceOf?(key: string): ObservableFaceLike<ModelSelectionProjectionLike> | undefined
}
export interface SessionFaceLike {
  readonly projections?: ProjectionsFaceLike
}
export interface SessionBindingLike {
  readonly session?: SessionFaceLike
}
/** One provider/model selection. */
export interface ModelSelectionLike {
  provider?: string
  model?: string
  reasoningEffort?: string
}
/**
 * Client view of the durable model-selection projection: `next` is what the
 * coming request will use, `lastUsed` what the last one did. This is the value
 * the composer model seat renders, and it is per session.
 */
export interface ModelSelectionProjectionLike {
  lastUsed?: ModelSelectionLike | null
  next?: ModelSelectionLike | null
}
/** Per-session model directory face (see @deepseek-ai/dsh-client-ui-model-selection). */
export interface ModelDirectoryLike {
  store: { getSnapshot(): ModelDirectoryStateLike | undefined; subscribe(fn: () => void): () => void }
  load?(): unknown
}
export interface ModelDirectoryResolverLike {
  directoryFor(sessionId: string): ModelDirectoryLike
}
export interface ModelDirectoryStateLike {
  current?: { provider?: string; model?: string; reasoningEffort?: string } | null
  groups?: ReadonlyArray<{
    id?: string; name?: string
    models?: ReadonlyArray<{ id?: string; name?: string }>
  }>
}
export interface Ctx {
  get(service: string): any
  effect(cb: () => unknown, label?: string): void
  on(event: string, cb: (...a: any[]) => void): () => void
  locale: LocaleService; slots: SlotsService; theme: ThemeService; connection: ConnectionService
}

// ── The persisted shape ────────────────────────────────────────────────────
// BgState / BgImage / BgMode / BgRotation / PartOpacities / BgRule /
// ThemeConfig / TransitionConfig are declared ONCE in ../schema and shared with
// the node half, so a field can never exist on one side only (that drift is what
// silently dropped a setting before). They are re-exported here because every
// client module imports them from this module.
import type {
  BgImage, BgRotation, BgRule, BgState, BgMode, HolidayRule, HolidaysConfig, PartOpacities,
  RotateOrder, ThemeConfig, TransitionConfig, TransitionEffect, TransitionEasing,
} from '../schema'
export type {
  BgImage, BgRotation, BgRule, BgState, BgMode, HolidayRule, HolidaysConfig, PartOpacities,
  RotateOrder, ThemeConfig, TransitionConfig, TransitionEffect, TransitionEasing,
}

// The model-resolution facts the section shows for the active rule. Declared with
// the schema (../model-facts) because the node half names the same shape.
import type { ModelFacts } from '../model-facts'
export type { ModelFacts }

/** Material-You-style palette extracted from a background image. */
export interface ColorPalette {
  /** Dominant / primary hue (HSL). */
  primary: [number, number, number]
  /** Secondary / analogous hue. */
  secondary: [number, number, number]
  /** Tertiary / complementary accent. */
  tertiary: [number, number, number]
  /** Neutral surface used for backgrounds. */
  surface: [number, number, number]
  /** Average lightness of the source image (0..1) for auto light/dark. */
  luminance: number
}

/**
 * State shape of the section's reactive store. The props object is built ONCE by
 * the slot host, so every value that changes at runtime rides this store instead.
 */
export interface ThemeStoreState {
  /** Paintable URL (object URL) of the active rule's image. */
  url: string | null
  rev: number
  /** Bumped whenever the rule list itself changed (add/remove/reorder/edit). */
  rulesRev: number
  /** Model label the current match ran against ('' = nothing detected). */
  model: string
  /**
   * Where that model came from: `session` is this session's own durable
   * selection (the composer's model), `default` is only the host-wide default
   * model — which is NOT necessarily what this session is using.
   */
  modelSource: 'session' | 'default'
  /**
   * Why no per-session model could be read, when none could: '' while the
   * watcher is still waiting for the sessions service, otherwise the failing hop
   * or `fallback` once only the host default answered.
   */
  modelNote: string
  /** Id of the rule the current model resolved to. */
  activeRuleId: string | null
  /** Whether the active rule was picked by a match (false = fallback). */
  matched: boolean
  /** Which of the active rule's images is painted (0-based, clamped). */
  rotIndex: number
  /** How many images the active rule owns (0 = nothing to paint or rotate). */
  rotTotal: number
  /** Whether the active rule is rotating right now (off, hidden or single-image
   *  rules all read false, so the UI can label the state honestly). */
  rotating: boolean
  /**
   * True while the host process runs an older node half that cannot read this
   * bundle's config shape. Writes are held then (`canWriteConfig`) and the section
   * says so: an edit that visibly waits for a restart beats one lost in silence.
   */
  hostStale: boolean
}

/** Result of a wallpaper fetch from a network URL. */
export interface FetchResult { ok: boolean; dataUrl?: string | null; error?: string }

/**
 * The document `exportTheme` writes and both imports consume: a configuration plus
 * the rule wallpapers, keyed by slot, as data URLs.
 *
 * Every field is optional because on arrival this is UNTRUSTED input; the shared
 * sanitizer is what turns whatever survives into a config.
 */
export interface ThemeFile {
  /** Config shape the file was written for; absent in exports predating it. */
  version?: number
  exportedAt?: string
  config?: unknown
  /** slot → `data:image/…;base64,…` */
  images?: Record<string, string>
}

/**
 * The recommended profile is a DIRECTORY: a manifest, a config, and one raw file
 * per slot. It arrives as a head and then one answer per wallpaper, and both carry
 * their failure as a VALUE — an unreachable CDN is an ordinary outcome, not a
 * broken plugin.
 *
 * `error` is a small code the page turns into copy (`'download failed'`,
 * `'not a profile'`, `'newer version'`, `'too many images'`, `'not an image'`),
 * so the node half never writes user-facing text.
 */
export type PresetHead =
  | { ok: true; version: number; config: unknown; slots: string[] }
  | { ok: false; error: string }

export type PresetImage = { ok: true; dataUrl: string } | { ok: false; error: string }

/**
 * The assembled profile, or why there is none. `slot` is set when the failure
 * belongs to ONE wallpaper ("the host is missing `modelbg-m6`") rather than to the
 * profile as a whole ("the CDN is down").
 */
export type PresetResult =
  | { ok: true; preset: ThemeFile }
  | { ok: false; error: string; slot?: string }

/**
 * What the image store occupies, and which of it nothing points at any more.
 *
 * `orphanBytes` is a SUBSET of `totalBytes` (so `usedBytes = total − orphan`), which
 * is the only arrangement the panel can print without arithmetic of its own. Bytes
 * are the node half's measurement of the files themselves — the store keeps full
 * fidelity images, so this number is not a rounding of something smaller.
 */
export interface StoreUsage {
  /** Every image file in the store, in bytes. */
  totalBytes: number
  /** The part of `totalBytes` something still points at. */
  usedBytes: number
  /** The part of `totalBytes` nothing points at — what a cleanup would free. */
  orphanBytes: number
  /** How many image files there are. */
  files: number
  /** Every stored slot, in the store's own order. */
  slots: string[]
  /** The slots nothing points at, each with its size. */
  orphans: Array<{ slot: string; bytes: number }>
  /**
   * Whether the numbers may be acted on: false when `theme-config.json` is there
   * but unreadable, in which case NOTHING can be told apart from an orphan and the
   * card must not offer the button at all. The numbers are still shown — "what is
   * on disk" has an answer — but they are not a licence to delete.
   */
  trusted: boolean
}

/**
 * What one cleanup removed.
 *
 * `failed` exists because a per-file failure must not read as success: the sweep
 * continues past one locked file, and the panel has to be able to say that the
 * number did not reach zero, and why. `refused` is the unreadable-config case —
 * nothing was deleted, on purpose.
 */
export interface PruneResult {
  removed: string[]
  failed: string[]
  /** The bytes the removed files occupied. */
  freedBytes: number
  /** The sweep declined to run because the config on disk could not be read. */
  refused: boolean
}

/** Props the slots host injects into the theme section (built once). */
export interface ThemeSectionProps {
  t: (key: string) => string
  useStore: <T>(selector: (s: ThemeStoreState) => T) => T
  /** Live paintable URL (object URL) of a slot, or null when none is stored. */
  imageOf: (slot: string) => string | null
  /**
   * The Cordis context this section was injected from — the section's own RPC
   * calls and locale binding go through it.
   */
  ctx: Ctx
  /** Active UI language of the section, for copy that is not in the dictionary. */
  lang: 'zh' | 'en'
  /** Model-resolution facts, read on demand when the page renders (never stale). */
  readModelFacts: () => ModelFacts
  /** Create a rule at the END of the list; returns its id. */
  addRule: () => string
  removeRule: (id: string) => void
  /** Move a rule one position up (-1) or down (+1). */
  moveRule: (id: string, dir: -1 | 1) => void
  /**
   * Patch one rule; when it is the active rule the live background follows.
   *
   * Its `color` is the RULE's own color — what an image-less rule paints. The
   * color of a picture goes through `setImageColor`.
   */
  setRule: (id: string, patch: Partial<BgRule>) => void
  /**
   * Append images to a rule (data URLs, in order). The first image of an empty
   * rule becomes the painted one.
   */
  addRuleImages: (id: string, dataUrls: readonly string[]) => void
  /** Remove one image from a rule; the rule is then simply empty when it was last. */
  removeRuleImage: (id: string, slot: string) => void
  /**
   * Move one image straight to an index of its rule — the strip's drag-and-drop
   * reorder, and the ONLY way the order changes.
   *
   * `to` addresses the list the move PRODUCES, not the one it starts from. A
   * reorder is not a change of subject: whichever picture is on screen stays on
   * screen, so this never repaints a different one.
   */
  moveRuleImageTo: (id: string, slot: string, to: number) => void
  /** Store one image's framing (the background editor's commit). */
  setImageFraming: (id: string, slot: string, bgState: BgState) => void
  /**
   * Store one image's layout mode — how that picture meets the viewport.
   *
   * Addressed by SLOT exactly like the framing, because both place the picture:
   * editing image 3's mode must not rewrite image 1's, and a rotation through a
   * photo and a tall screenshot is the whole reason the mode lives here rather
   * than on the rule.
   */
  setImageMode: (id: string, slot: string, mode: BgMode) => void
  /**
   * Store one image's three paint effects — opacity, brightness and blur.
   *
   * Addressed by SLOT for the same reason as the mode and the framing: how a
   * picture is exposed is a property of THAT picture, and a rotation through a
   * daylight photo and a night shot cannot share one exposure. A patch rather than
   * three setters because the panel's merged row writes one of them at a time while
   * the gesture's commit may carry all three.
   */
  setImageEffects: (id: string, slot: string, patch: Partial<Pick<BgImage, 'opacity' | 'brightness' | 'blur'>>) => void
  /**
   * Store one image's theme color; null = that image follows the system theme.
   *
   * Separate from `setRule` because the color belongs to the IMAGE: a rule with
   * several pictures keeps their palettes apart, and the rule's own `color` is
   * only what an image-less rule paints. Editing it is the panel's own branch for
   * a rule that has no image to address.
   */
  setImageColor: (id: string, slot: string, color: [number, number, number] | null) => void
  /** Patch a rule's rotation (interval, order, switch behaviour, fade). */
  setRuleRotation: (id: string, patch: Partial<BgRotation>) => void
  /** Step a rule's rotation once, right now (no effect when it has < 2 images). */
  rotateNow: (id: string) => void
  /**
   * Put one of a rule's images on screen right now — the strip's double-click.
   *
   * Deliberately not `moveRuleImageTo`: showing a picture is not a statement about
   * the rotation ORDER, so nothing is reordered and nothing is written to the
   * config. Like `rotateNow` this only means something for the rule that is
   * painting, and is a no-op for any other.
   */
  showRuleImage: (id: string, slot: string) => void
  /**
   * Hydrate every image of one rule into the paintable cache. Boot reads only each
   * rule's FIRST image (`bootSlots` in ./boot); an expanded card asks for the rest.
   */
  loadRuleImages: (id: string) => Promise<void>
  /** Store (or clear) ONE image's bytes; the slot says which. */
  setRuleImage: (id: string, slot: string, dataUrl: string | null) => void
  /** Download an image from a network URL and append it to a rule's images. */
  addRuleImageFromUrl: (id: string, url: string) => Promise<FetchResult>
  /** Derive ONE image's theme color from its own bytes (default: the first image). */
  extractColor: (id: string, slot?: string) => Promise<boolean>
  setOps: (ops: PartOpacities) => void
  setSop: (v: number) => void
  /** Own the file-preview panel's opacity; null restores "follow the main background". */
  setRightbarOpacity: (v: number | null) => void
  /** Fill a rule's theme color from its image when the rule has none yet. */
  setAutoExtract: (v: boolean) => void
  /** Patch the GLOBAL switch transition; it decides what the NEXT switch looks like. */
  setTransition: (patch: Partial<TransitionConfig>) => void

  // ── Holiday overrides ──────────────────────────────────────────────────────
  // ONE switch and nothing else. The per-holiday panels that used to live here
  // made the feature read as something the user is expected to configure, which
  // is exactly what it is not — the art belongs to the package and cannot be
  // swapped.
  /** Master switch of the holiday override. */
  setHolidaysEnabled: (v: boolean) => void
  /** Download every rule + its image as one JSON file. */
  exportTheme: () => void
  /** Import such a JSON file: replaces the whole rule set and its images. */
  importTheme: (file: File) => Promise<boolean>
  /**
   * Fetch the project's recommended profile: the manifest and config first, then
   * one request per wallpaper the config names. Downloads only — nothing is
   * touched until the user confirms and `applyRecommended` runs.
   *
   * `onProgress` reports `(downloaded, total)` wallpapers, because this is now
   * several transfers rather than one and the button has to be able to say so.
   * The count is known before the first wallpaper is asked for, since the config
   * is what names them.
   */
  fetchRecommended: (onProgress?: (done: number, total: number) => void) => Promise<PresetResult>
  /**
   * Replace EVERYTHING with a downloaded profile: empty the store, then write
   * the profile's rules and wallpapers into it. Irreversible by design, which is
   * why the page asks first.
   */
  applyRecommended: (preset: ThemeFile) => Promise<boolean>

  // ── The image store ────────────────────────────────────────────────────────
  // Two halves of one question, and the split matters: the card must be able to
  // say how much is orphaned WITHOUT deleting anything, because a cleanup whose
  // size is announced after the fact is a cleanup nobody agrees to.
  /**
   * Measure the store. `null` when the host could not be asked (a node half from
   * before this method existed), which the card renders as "unknown" rather than
   * as "nothing to clean".
   */
  readStoreUsage: () => Promise<StoreUsage | null>
  /**
   * Delete every stored image nothing points at any more. Only the files that
   * `readStoreUsage` called orphans; the config and the festival art are outside it.
   */
  pruneOrphanImages: () => Promise<PruneResult | null>
}

export interface RpcResultLike { ok: boolean; value?: any; error?: any }
