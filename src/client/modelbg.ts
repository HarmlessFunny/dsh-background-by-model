/**
 * Model → rule resolution.
 *
 * Two halves:
 *  1. `matchRule` — a pure function over the ordered rule list.
 *  2. `watchModel` — reports the current model whenever the session's durable
 *     model selection changes.
 *
 * Sources, in the order they are consulted:
 *
 *  a. **The session's own durable model selection** —
 *     `ctx.sessions.binding(id).session.projections.faceOf('modelSelection')`,
 *     the same `{ lastUsed, next }` value the composer model seat and the
 *     /model popup read. This is the authoritative per-session answer.
 *  b. **`ctx.modelDirectories`** — the shared per-session directory
 *     (ui-model-selection). It adds the provider-group catalog, so it is the
 *     only source that can supply a display name, but it lives in that plugin's
 *     own scope on some builds and is then invisible from here, hence optional.
 *  c. **The host default model** — resolved by the CALLER as a last resort
 *     (see index.tsx). It is a global default, NOT this session's selection, so
 *     it is reported as `default` and the settings page says so.
 *
 * TIMING is load-bearing. `sessions` is published by the api-session-controller
 * client plugin, which this deployment loads AFTER this plugin's client bundle,
 * so `ctx.get('sessions')` is normally still undefined when `apply()` runs.
 * Giving up there — returning a no-op disposer — left the model pinned to the
 * host default for the whole session with nothing to retry it. The service is
 * now polled for until it appears, and every hop reports a `note` when it cannot
 * answer, so the settings page can name the failing one instead of silently
 * showing a value that is not this session's model.
 */
import type {
  BgRule, Ctx, ModelDirectoryLike, ModelDirectoryResolverLike, ModelSelectionProjectionLike,
  ObservableFaceLike, SessionsServiceLike,
} from './types'

/** Rules that can actually paint: enabled and carrying an image slot. */
function usable(rules: readonly BgRule[]): BgRule[] {
  return rules.filter(r => r.enabled && r.slot !== '')
}

/**
 * Resolve the rule for one model text.
 *
 * Top→bottom, first case-insensitive substring hit wins; an empty `match` never
 * hits on its own. When nothing hits, the FIRST usable rule is the fallback
 * (rule 1 deliberately doubles as both a matcher and the fallback).
 */
export function matchRule(
  rules: readonly BgRule[],
  modelText: string,
): { rule: BgRule | null; matched: boolean } {
  const list = usable(rules)
  if (list.length === 0) return { rule: null, matched: false }
  const hay = modelText.toLowerCase()
  if (hay.trim() !== '') {
    for (const rule of list) {
      const needle = rule.match.trim().toLowerCase()
      if (needle === '') continue
      if (hay.includes(needle)) return { rule, matched: true }
    }
  }
  return { rule: list[0]!, matched: false }
}

/** Human-readable label of the model text an active rule matched against. */
export function modelLabelOf(text: string): string {
  const parts = text.split(/\s+/).filter(p => p !== '')
  // The display name (last token, when the catalog provided one) reads best.
  return parts.length > 0 ? parts[parts.length - 1]! : ''
}

/** Look the current model's display name up in the shared catalog. */
function displayNameOf(state: {
  groups?: ReadonlyArray<{ id?: string; models?: ReadonlyArray<{ id?: string; name?: string }> }>
} | undefined, provider: string, model: string): string {
  if (model === '' || !Array.isArray(state?.groups)) return ''
  for (const group of state!.groups!) {
    if (group.id !== provider) continue
    for (const entry of group.models ?? []) {
      if (entry.id === model) return typeof entry.name === 'string' ? entry.name : ''
    }
  }
  return ''
}

/** Where the reported model text came from. */
export type ModelSource = 'session' | 'default'

/**
 * Which hop could not answer when no per-session model was found. Surfaced in
 * the settings readout: without it, a broken hop is indistinguishable from
 * "this session really is on the host default".
 */
export type ModelNote = '' | 'no-service' | 'no-session' | 'no-projection' | 'empty-selection'

/** How often to look for the sessions service that mounts after this plugin. */
const ATTACH_RETRY_MS = 400
/** Stop looking after this many tries (~2 minutes). */
const ATTACH_RETRY_LIMIT = 300
/** Safety re-read of every source, so a missed notification cannot pin a stale model. */
const POLL_MS = 1500

/** One selection out of a `modelSelection` projection value. */
function selectionOf(value: ModelSelectionProjectionLike | undefined): { provider: string; model: string } | null {
  const pick = value?.next ?? value?.lastUsed ?? null
  if (pick === null || typeof pick !== 'object') return null
  const provider = typeof pick.provider === 'string' ? pick.provider : ''
  const model = typeof pick.model === 'string' ? pick.model : ''
  if (provider === '' && model === '') return null
  return { provider, model }
}

/**
 * Watch the current session's model selection.
 *
 * @param ctx - client root context.
 * @param onChange - called with the match text (provider + id + display name),
 *   the best available label, which source answered, and — when nothing could be
 *   read — the hop that failed.
 * @returns disposer.
 */
export function watchModel(
  ctx: Ctx,
  onChange: (text: string, label: string, source: ModelSource, note: ModelNote) => void,
): () => void {
  let service: SessionsServiceLike | null = null
  let list: ObservableFaceLike<{ current?: string }> | null = null
  let offList: (() => void) | null = null
  let sessionId: string | null = null
  let directory: ModelDirectoryLike | null = null
  let offDirectory: (() => void) | null = null
  /** The session's own `modelSelection` projection face. */
  let projected: ObservableFaceLike<ModelSelectionProjectionLike> | null = null
  let offProjected: (() => void) | null = null
  let lastKey = '\u0000'
  let poll: number | null = null
  let retry: number | null = null
  let retries = 0

  const release = (): void => {
    if (offDirectory !== null) { offDirectory(); offDirectory = null }
    if (offProjected !== null) { offProjected(); offProjected = null }
    directory = null
    projected = null
  }

  /** Bind the session's own durable model selection (the authoritative source). */
  const bindProjection = (id: string): void => {
    const svc = service
    if (svc === null) return
    try {
      let binding = typeof svc.binding === 'function' ? svc.binding(id) : undefined
      if (binding === undefined && typeof svc.scope === 'function') {
        // Materialize the scope, then resolve again: a session that is merely
        // listed has no binding yet.
        svc.scope(id)
        binding = typeof svc.binding === 'function' ? svc.binding(id) : undefined
      }
      const face = binding?.session?.projections?.faceOf?.('modelSelection')
      if (face === undefined || typeof face.subscribe !== 'function' || typeof face.getSnapshot !== 'function') return
      projected = face
      offProjected = face.subscribe(() => { emit(false) })
    } catch {
      projected = null
      offProjected = null
    }
  }

  const note = (): ModelNote => {
    if (service === null) return 'no-service'
    if ((list?.getSnapshot()?.current ?? null) === null) return 'no-session'
    if (projected === null && directory === null) return 'no-projection'
    return 'empty-selection'
  }

  const emit = (force: boolean): void => {
    const state = directory?.store.getSnapshot()
    const fromDirectory = state?.current ?? null
    const sel = fromDirectory !== null
      ? { provider: fromDirectory.provider ?? '', model: fromDirectory.model ?? '' }
      : (() => {
        try { return selectionOf(projected?.getSnapshot()) } catch { return null }
      })()
    const provider = sel?.provider ?? ''
    const model = sel?.model ?? ''
    const name = displayNameOf(state, provider, model)
    const text = [provider, model, name].filter(p => p !== '').join(' ').trim()
    const noteValue: ModelNote = text === '' ? note() : ''
    const key = `${text}\u0001${name}\u0001${noteValue}`
    if (!force && key === lastKey) return
    lastKey = key
    onChange(text, name !== '' ? name : (model !== '' ? model : provider), 'session', noteValue)
  }

  const bind = (): void => {
    const id = list?.getSnapshot()?.current ?? null
    // Already bound to this session and holding at least one live source: only
    // refresh the value. A missing source keeps retrying on the poll below.
    if (id === sessionId && (directory !== null || projected !== null)) { emit(false); return }
    release()
    sessionId = id
    if (id !== null) {
      bindProjection(id)
      if (directory === null) {
        const directories = ctx.get('modelDirectories') as ModelDirectoryResolverLike | undefined
        if (directories !== undefined && typeof directories.directoryFor === 'function') {
          try {
            directory = directories.directoryFor(id)
            offDirectory = directory.store.subscribe(() => { emit(false) })
            // The advisory catalog (display names) loads lazily; a failure only
            // costs us the pretty name, never the match.
            const pending = directory.load?.()
            if (pending !== undefined && pending !== null && typeof (pending as Promise<unknown>).catch === 'function') {
              void (pending as Promise<unknown>).catch(() => undefined)
            }
          } catch {
            directory = null
            offDirectory = null
          }
        }
      }
    }
    // Forced: the sources may have appeared without the text changing (the host
    // default was showing and the session now agrees with it), and the settings
    // page must be able to correct its badge and its note.
    emit(true)
  }

  const stopRetry = (): void => {
    if (retry === null) return
    window.clearInterval(retry)
    retry = null
  }

  const tick = (): void => {
    if (list === null) return
    if ((list.getSnapshot()?.current ?? null) !== sessionId || (directory === null && projected === null)) bind()
    else emit(false)
  }

  /**
   * Look the sessions service up. It arrives after this plugin's bundle on this
   * deployment, so the first attempt usually fails — which is exactly why this
   * is a retry loop rather than a one-shot lookup.
   */
  const attach = (): boolean => {
    const svc = ctx.get('sessions') as SessionsServiceLike | undefined
    if (svc === undefined || svc === null) return false
    const face = svc.list
    if (face === undefined || typeof face.subscribe !== 'function' || typeof face.getSnapshot !== 'function') return false
    service = svc
    list = face
    offList = face.subscribe(bind)
    if (poll === null) poll = window.setInterval(tick, POLL_MS)
    bind()
    return true
  }

  if (!attach()) {
    retry = window.setInterval(() => {
      retries++
      if (attach() || retries >= ATTACH_RETRY_LIMIT) stopRetry()
    }, ATTACH_RETRY_MS)
  }

  return () => {
    stopRetry()
    if (poll !== null) { window.clearInterval(poll); poll = null }
    if (offList !== null) { offList(); offList = null }
    service = null
    list = null
    release()
  }
}
