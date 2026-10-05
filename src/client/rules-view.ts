/**
 * Rule-tab decisions: which rule the editor shows, and which one it shows after
 * a deletion.
 *
 * Pure and dependency-free for the same reason `./rotation` is: the tab strip is
 * where "the rules are edited one at a time" is enforced, and the two ways it can
 * go wrong are decisions rather than rendering — a selection that quietly resets
 * on every render (the page re-mounts the editor, so it looks like a flicker),
 * and a deletion that drops the user back at rule 1 instead of at the rule that
 * took the deleted one's place. `scripts/rules-view-check.ts` pins both down.
 */

/** The minimum a rule has to expose here: its identity. */
export interface RuleIdLike { id: string }

/**
 * The rule the editor should show.
 *
 * `sel` wins whenever it is still in the list: the selection is the user's, and
 * a model switch, a reorder or an image edit must not move it. The fallbacks run
 * only when there is no selection at all, or when the rule it named is gone
 * (deleted here, or replaced wholesale by an import or by the persisted config
 * landing after the first render — whose ids are not the ones we started with).
 * The active rule is preferred over the first one so that opening the panel
 * lands on the rule the current model is using.
 */
export function resolveTab<T extends RuleIdLike>(rules: readonly T[], sel: string | null, activeId: string | null): T | null {
  if (rules.length === 0) return null
  if (sel !== null) {
    const held = rules.find(r => r.id === sel)
    if (held !== undefined) return held
  }
  if (activeId !== null) {
    const live = rules.find(r => r.id === activeId)
    if (live !== undefined) return live
  }
  return rules[0] ?? null
}

/**
 * The rule to show once `id` has been removed: the next one, or the previous one
 * when the removed rule was last. Deliberately NOT the first rule — the user is
 * working down a list, and jumping to the top loses their place — and `null`
 * when it was the only rule, which the panel renders as "no rules yet".
 */
export function neighbourAfter<T extends RuleIdLike>(rules: readonly T[], id: string): T | null {
  const i = rules.findIndex(r => r.id === id)
  if (i < 0) return null
  return rules[i + 1] ?? rules[i - 1] ?? null
}
