import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

/**
 * Zero-lag slider: the thumb and value label update through DOM refs while
 * dragging, so the caller can preview the change without a React re-render; the
 * settled value is committed ONCE, when the gesture ends.
 *
 * The split is the whole point and it is not an optimisation detail. A range
 * input fires `input` on every frame of a drag, and React's `change` handler for
 * one is wired to that same event — so a slider that commits from `onChange`
 * commits dozens of times a second, and every commit is a full repaint (skin,
 * palette, wallpaper layer). That is why dragging a wallpaper effect cost a whole
 * `applyActive()` per frame while the cheap live writers beside it were never
 * reached.
 *
 * The gesture's end is therefore read from the events that actually end one: the
 * native `change` event, a pointer released over the track, and a blur. No timer
 * is armed — nothing here may compete with the plugin's one scheduler.
 */
export function LiveSlider({ min, max, step, def, fmt, label, ariaLabel, onInput, onChange }: {
  min: number; max: number; step: number; def: number
  fmt: (v: number) => string; label?: string
  /** Accessible name for a track whose caller renders the label elsewhere (or not
   * at all) — the merged wallpaper slider names its target in the menu beside it,
   * so a second visible label above the track would be the same word twice. */
  ariaLabel?: string
  /** Called on EVERY frame of a gesture: the caller's cheap preview path. */
  onInput?: (v: number) => void
  /** Called ONCE, with the value the gesture settled on: the caller's real write. */
  onChange: (v: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const valRef = useRef<HTMLSpanElement>(null)
  /**
   * The value the current gesture has reached but has not committed yet.
   *
   * Non-null is also the answer to "is a gesture in flight?", which the `def` sync
   * below has to ask: the model watch re-emits on its own beat, and the render that
   * causes would otherwise snap the knob back to the committed value mid-drag.
   */
  const pending = useRef<number | null>(null)
  /** `onChange` is read through a ref so the native listener cannot go stale. */
  const commitRef = useRef(onChange)
  commitRef.current = onChange

  const paint = (el: HTMLInputElement, v: number): void => {
    el.style.setProperty('--pct', String(((v - min) / (max - min)) * 100))
  }

  /** Move the knob and the label without calling anybody back. */
  const show = (v: number): void => {
    if (inputRef.current) {
      inputRef.current.value = String(v)
      paint(inputRef.current, v)
    }
    if (valRef.current) valRef.current.textContent = fmt(v)
  }

  const commit = (): void => {
    const v = pending.current
    if (v === null) return
    pending.current = null
    commitRef.current(v)
  }

  /** One frame of a gesture: the caller's cheap path, then remember the value. */
  const live = (v: number): void => {
    show(v)
    pending.current = v
    onInput?.(v)
  }

  // Controlled sync: keep the knob and label aligned with the canonical prop
  // so external updates (presets, regeneration, imports) never leave it stale —
  // but never while a gesture is in flight, whose value is newer than `def`.
  useEffect(() => {
    if (pending.current !== null) return
    show(def)
    // `fmt` is an inline closure at most call sites, so this effect re-runs on
    // every render; `show` is what it re-reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, fmt, min, max])

  // The end of a gesture. The native `change` event is the one event every input
  // method produces exactly once per commit — mouse release, keyboard step,
  // assistive input — which is why it carries the commit instead of a timer.
  useEffect(() => {
    const el = inputRef.current
    if (el === null) return
    const onEnd = (): void => commit()
    el.addEventListener('change', onEnd)
    // A slider that unmounts mid-drag (switching rules re-keys the row) still owes
    // its value; every page guards an unknown rule id, so a commit into a rule that
    // is gone is a no-op.
    return () => {
      el.removeEventListener('change', onEnd)
      commit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reset = (): void => {
    live(def)
    commit()
  }

  // The visible label and the accessible name are the same words; a caller that
  // renders the name elsewhere passes it as `ariaLabel` and gets no second line.
  const name = label ?? ariaLabel

  return (
    <div className="dab-slider-block">
      {label ? <span className="dab-slider-label">{label}</span> : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          ref={inputRef} type="range" className="dab-slider"
          style={{ '--pct': ((def - min) / (max - min)) * 100 } as CSSProperties}
          min={min} max={max} step={step} defaultValue={def}
          aria-label={name}
          title={name !== undefined ? `${name} · ${fmt(def)}` : fmt(def)}
          onDoubleClick={reset}
          // Every frame: preview only. There is deliberately NO React `onChange` on
          // this element — React would wire it to the same `input` event and turn
          // every frame into a commit, which is the per-frame repaint above.
          onInput={e => live(Number((e.target as HTMLInputElement).value))}
          // The native listener above carries the normal commit; these two are the
          // paths where it does not fire: a pointer released over the track, and
          // focus leaving it.
          onPointerUp={commit}
          onBlur={commit} />
        <span ref={valRef} className="dab-slider-val">{fmt(def)}</span>
      </div>
    </div>
  )
}
