/**
 * The model-resolution facts the settings section shows for the active rule.
 *
 * Declared here rather than in `src/schema.ts` because they describe a RUNTIME
 * observation (which rule the current model resolved to, and through which hop),
 * not a stored setting: nothing here is persisted.
 */
export interface ModelFacts {
  /** The match text the active rule was chosen by. */
  text: string
  /** Which source answered: this session's own selection, or the host default. */
  source: 'session' | 'default'
  /** The failing hop when nothing per-session could be read. */
  note: string
  /** Label of the rule the model resolved to ('' when there is none). */
  rule: string
  /** Whether that rule was a real match or the fallback. */
  matched: boolean
}
