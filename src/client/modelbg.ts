/**
 * Model → rule resolution.
 *
 * Two halves:
 *  1. `matchRule` — a pure function over the ordered rule list.
 *  2. `watchModel` — subscribes to the client's session + model-selection
 *     services and reports the current model whenever it changes.
 *
 * The DSH client exposes both through public extension points:
 *   ctx.get('sessions').list        → SessionListState { current: SessionId }
 *   ctx.get('modelDirectories')     → directoryFor(sessionId).store
 *                                     → ModelDirectoryState { current: {provider, model}, groups }
 * Either one may be absent on a trimmed deployment, so every hop is probed and
 * a failure degrades to "no model detected" (which resolves to rule 1).
 */
import type {
  BgRule, Ctx, ModelDirectoryLike, ModelDirectoryResolverLike, SessionsServiceLike,
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

/**
 * Watch the current session's model selection.
 *
 * @param ctx - client root context.
 * @param onChange - called with the match text (provider + id + display name)
 *   and the best available display label, only when the text actually changes.
 * @returns disposer.
 */
export function watchModel(ctx: Ctx, onChange: (text: string, label: string) => void): () => void {
  const sessions = ctx.get('sessions') as SessionsServiceLike | undefined
  const list = sessions?.list
  if (list === undefined || typeof list.subscribe !== 'function' || typeof list.getSnapshot !== 'function') {
    return () => undefined
  }
  const directories = ctx.get('modelDirectories') as ModelDirectoryResolverLike | undefined

  let sessionId: string | null = null
  let directory: ModelDirectoryLike | null = null
  let offDirectory: (() => void) | null = null
  let lastText = '\u0000'

  const emit = (): void => {
    const state = directory?.store.getSnapshot()
    const current = state?.current ?? null
    const provider = typeof current?.provider === 'string' ? current.provider : ''
    const model = typeof current?.model === 'string' ? current.model : ''
    const name = displayNameOf(state, provider, model)
    const text = [provider, model, name].filter(p => p !== '').join(' ').trim()
    if (text === lastText) return
    lastText = text
    onChange(text, name !== '' ? name : (model !== '' ? model : provider))
  }

  const bind = (): void => {
    const id = list.getSnapshot()?.current ?? null
    if (id === sessionId && directory !== null) { emit(); return }
    if (offDirectory !== null) { offDirectory(); offDirectory = null }
    directory = null
    sessionId = id
    if (id !== null && directories !== undefined && typeof directories.directoryFor === 'function') {
      try {
        directory = directories.directoryFor(id)
        offDirectory = directory.store.subscribe(emit)
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
    emit()
  }

  const offList = list.subscribe(bind)
  bind()
  return () => {
    offList()
    if (offDirectory !== null) offDirectory()
  }
}
