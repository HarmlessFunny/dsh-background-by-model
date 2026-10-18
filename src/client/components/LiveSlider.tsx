import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

/**
 * Zero-lag slider: the thumb and value label update through DOM refs while
 * dragging (onInput) so the caller can mutate the live UI directly without a
 * React re-render; onChange commits the settled value. Double-click resets to
 * the canonical default. The track fill is a gradient driven by the --pct
 * custom property, updated imperatively alongside the thumb.
 */
export function LiveSlider({ min, max, step, def, fmt, label, ariaLabel, onInput, onChange }: {
  min: number; max: number; step: number; def: number
  fmt: (v: number) => string; label?: string
  /** Accessible name for a track whose caller renders the label elsewhere (or not
   * at all) — the merged wallpaper slider names its target in the menu beside it,
   * so a second visible label above the track would be the same word twice. */
  ariaLabel?: string
  onInput?: (v: number) => void; onChange: (v: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const valRef = useRef<HTMLSpanElement>(null)

  const paint = (el: HTMLInputElement, v: number): void => {
    el.style.setProperty('--pct', String(((v - min) / (max - min)) * 100))
  }

  // Controlled sync: keep the knob and label aligned with the canonical prop
  // so external updates (presets, regeneration, imports) never leave it stale.
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = String(def)
      paint(inputRef.current, def)
    }
    if (valRef.current) valRef.current.textContent = fmt(def)
  }, [def, fmt, min, max])

  const apply = (v: number): void => {
    if (inputRef.current) {
      inputRef.current.value = String(v)
      paint(inputRef.current, v)
    }
    if (valRef.current) valRef.current.textContent = fmt(v)
    onInput?.(v)
    onChange(v)
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
          onDoubleClick={() => apply(def)}
          onInput={e => {
            const el = e.target as HTMLInputElement
            const v = Number(el.value)
            paint(el, v)
            onInput?.(v)
            if (valRef.current) valRef.current.textContent = fmt(v)
          }}
          onChange={e => onChange(Number((e.target as HTMLInputElement).value))} />
        <span ref={valRef} className="dab-slider-val">{fmt(def)}</span>
      </div>
    </div>
  )
}
