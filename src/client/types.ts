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
// BgState / BgImage / BgMode / BgRotation / PartOpacities / PartBlurs / BgRule /
// ThemeConfig are declared ONCE in ../schema and shared with the node half, so a
// field can never exist on one side only (that drift is what silently dropped a
// setting before). They are re-exported here because every client module imports
// them from this module.
import type {
  BgImage, BgRotation, BgRule, BgState, BgMode, HolidayRule, HolidaysConfig, PartOpacities, PartBlurs,
  RotateOrder, ThemeConfig,
} from '../schema'
export type {
  BgImage, BgRotation, BgRule, BgState, BgMode, HolidayRule, HolidaysConfig, PartOpacities, PartBlurs,
  RotateOrder, ThemeConfig,
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
 * State shape of the section's reactive store. The section's props object is
 * built ONCE by the slot host, so every value that changes at runtime must be
 * pushed through this store instead of riding the props.
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
   * True while the host PROCESS is running an older node half that cannot read
   * this bundle's config shape. Config writes are held then (see canWriteConfig
   * in ./rpc) and the section says so, because edits that silently do not persist
   * are worse than edits that visibly wait for a restart.
   */
  hostStale: boolean
}

/** Result of a wallpaper fetch from a network URL. */
export interface FetchResult { ok: boolean; dataUrl?: string | null; error?: string }

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
  /**
   * The model-resolution facts of this session, read on demand (the page that
   * shows which rule the current model resolved to asks for them when it renders,
   * so they are never stale).
   */
  readModelFacts: () => ModelFacts
  /** Create a rule at the END of the list; returns its id. */
  addRule: () => string
  removeRule: (id: string) => void
  /** Move a rule one position up (-1) or down (+1). */
  moveRule: (id: string, dir: -1 | 1) => void
  /** Patch one rule; when it is the active rule the live background follows. */
  setRule: (id: string, patch: Partial<BgRule>) => void
  /**
   * Append images to a rule (data URLs, in order). The first image of an empty
   * rule becomes the painted one.
   */
  addRuleImages: (id: string, dataUrls: readonly string[]) => void
  /** Remove one image from a rule; the last one cannot be removed. */
  removeRuleImage: (id: string, slot: string) => void
  /** Move one image one position earlier (-1) or later (+1) in its rule. */
  moveRuleImage: (id: string, slot: string, dir: -1 | 1) => void
  /** Store one image's framing (the background editor's commit). */
  setImageFraming: (id: string, slot: string, bgState: BgState) => void
  /** Make one image the rule's first, i.e. the one painted when nothing rotates. */
  setCurrentImage: (id: string, slot: string) => void
  /** Patch a rule's rotation (interval, order, switch behaviour, fade). */
  setRuleRotation: (id: string, patch: Partial<BgRotation>) => void
  /** Step a rule's rotation once, right now (no effect when it has < 2 images). */
  rotateNow: (id: string) => void
  /**
   * Hydrate every image of one rule into the paintable cache.
   *
   * Boot only reads a rule's FIRST image (see `bootSlots` in index.tsx), so an
   * expanded card asks for the rest here — which is the only thing standing
   * between "ten images per rule" and a settings panel that spends its start-up
   * shipping full-size data URLs over the RPC channel.
   */
  loadRuleImages: (id: string) => Promise<void>
  /** Store (or clear) ONE image's bytes; the slot says which. */
  setRuleImage: (id: string, slot: string, dataUrl: string | null) => void
  /** Download an image from a network URL and append it to a rule's images. */
  addRuleImageFromUrl: (id: string, url: string) => Promise<FetchResult>
  /** Derive a rule's theme color from one of its images (default: the first). */
  extractColor: (id: string, slot?: string) => Promise<boolean>
  setOps: (ops: PartOpacities) => void
  setBlurs: (blurs: PartBlurs) => void
  setSop: (v: number) => void
  /** Own the file-preview panel's opacity; null restores "follow the main background". */
  setRightbarOpacity: (v: number | null) => void
  /** Fill a rule's theme color from its image when the rule has none yet. */
  setAutoExtract: (v: boolean) => void

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
}

export interface RpcResultLike { ok: boolean; value?: any; error?: any }
