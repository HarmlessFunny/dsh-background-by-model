/**
 * The model state the render layer and the panel share: the text a rule is
 * matched against, where it came from, and why no per-session answer exists when
 * there is none.
 *
 * Split out of `apply()` so the rotation, the theme watchdogs and the panel's
 * readout can all read the same value without every one of them closing over the
 * same local variables. The SOURCE resolution itself stays in ./modelbg; this is
 * the value it produces plus the "has it actually changed?" test every consumer
 * needs.
 *
 * `key` is the dedupe: the model watch re-emits on forced re-reads and on a 1.5 s
 * poll, and re-running the whole apply on those would repaint the interface for
 * nothing. A note-only change (still waiting for the sessions service) has to
 * refresh the readout WITHOUT repainting, which is why the key covers the note
 * and `textChanged` is asked separately.
 */
import type { ModelFacts } from './types'

export interface ModelState {
  /** Match text: provider, model id and display name joined with spaces. */
  text: string
  /** Best available label for the badge ('' before the first answer). */
  label: string
  source: 'session' | 'default'
  /** The failing hop when no per-session model could be read. */
  note: string
}

/** What one model report changed, for the caller's apply decision. */
export interface ModelChange {
  /** The match text moved (a repaint is owed) — as opposed to the note only. */
  textChanged: boolean
  /** The value was not seen before at all, so it is applied regardless. */
  changed: boolean
}

export interface ModelTracker {
  readonly state: ModelState
  /** Take one report from the model watch; says what it changed, if anything. */
  update(text: string, label: string, source: 'session' | 'default', note: string): ModelChange
  /** Record a model the CALLER resolved (the host-default fallback at boot). */
  adopt(text: string, source: 'session' | 'default', note: string): boolean
  /** The facts the panel's self-check reports. */
  facts(rule: string, matched: boolean): ModelFacts
}

/** A key that no real model text can equal, so the first report always lands. */
const EMPTY = '\u0000'

export function createModelTracker(): ModelTracker {
  let state: ModelState = { text: '', label: '', source: 'default', note: 'waiting' }
  let key = EMPTY

  const take = (next: ModelState): ModelChange => {
    const nextKey = `${next.text}\u0001${next.source}\u0001${next.note}`
    const changed = nextKey !== key
    const textChanged = next.text !== state.text
    key = nextKey
    state = next
    return { textChanged, changed }
  }

  return {
    get state() { return state },
    update(text, label, source, note) {
      return take({ text, label: label !== '' ? label : text, source, note })
    },
    adopt(text, source, note) {
      return take({ text, label: text, source, note }).changed
    },
    facts(rule, matched) {
      return { text: state.text, source: state.source, note: state.note, rule, matched }
    },
  }
}
