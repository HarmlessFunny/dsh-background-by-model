import { useState, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { hsvToHsl, hslToRgb, rgbToHsl, hslToHsv } from '../utils/color'

type Mode = 'hsl' | 'rgb'

const SEG_W = 66

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** '#rrggbb' for a 0-255 RGB triple, in the caller's case. */
function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
}

/**
 * A single numeric field that edits one color channel. Keeps its own text
 * while focused so typing never gets clobbered by the parent re-rendering the
 * canonical value; commits every valid keystroke live and re-normalizes on
 * blur. The value prop only pushes back in when the field is not focused
 * (wheel drags, wallpaper extraction, mode switches).
 */
function NumField({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void
}) {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(String(value))
  }, [value])

  return (
    <label className="dab-field">
      <span className="dab-field-label">{label}</span>
      <input
        type="number"
        min={min} max={max} step={step}
        value={text}
        className="dab-num"
        onFocus={() => { focused.current = true }}
        onBlur={() => { focused.current = false; setText(String(value)) }}
        onChange={e => {
          setText(e.target.value)
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(clamp(v, min, max))
        }}
      />
    </label>
  )
}

/**
 * Precise color entry next to the wheel: a HSL/RGB segmented toggle plus three
 * numeric channel fields and a live preview field that prints its own hex. The
 * wheel is HSV end-to-end, so this panel converts at the boundary — HSL fields
 * map straight onto the stored HSL, RGB fields round-trip through rgbToHsl —
 * and both emit HSV via the same onChange the wheel uses, keeping one canonical
 * color.
 */
export function ColorInputs({ hue, sat, lit, onChange }: {
  hue: number; sat: number; lit: number
  onChange: (h: number, s: number, l: number) => void
}) {
  const [mode, setMode] = useState<Mode>('hsl')
  const [h, s, l] = hsvToHsl(hue, sat, lit)
  const [r, g, b] = hslToRgb(h, s, l)
  const hex = toHex([r, g, b]).toUpperCase()
  // Ink for the hex printed ON the preview field. Rec.709 luma is the
  // brightness measure the wallpaper extractor already uses, so the two agree:
  // a light color gets dark ink and a dark one light ink, and the value never
  // disappears into its own fill.
  const ink = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55 ? 'rgba(0,0,0,.78)' : 'rgba(255,255,255,.92)'

  const setHsl = (nh: number, ns: number, nl: number) => onChange(...hslToHsv(nh, ns, nl))
  const setRgb = (nr: number, ng: number, nb: number) => {
    const [nh, ns, nl] = rgbToHsl(nr, ng, nb)
    onChange(...hslToHsv(nh, ns, nl))
  }

  return (
    <div className="dab-inputs">
      <div className="dab-seg" style={{ '--w': `${SEG_W}px` } as CSSProperties}>
        <div className="dab-seg-thumb" style={{ transform: `translateX(${mode === 'hsl' ? 0 : SEG_W}px)` }} />
        <button type="button" className={`dab-seg-item${mode === 'hsl' ? ' is-active' : ''}`} onClick={() => setMode('hsl')}>HSL</button>
        <button type="button" className={`dab-seg-item${mode === 'rgb' ? ' is-active' : ''}`} onClick={() => setMode('rgb')}>RGB</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {mode === 'hsl' ? (
          <>
            <NumField label="H" value={Math.round(h)} min={0} max={360} step={1} onChange={v => setHsl(v, s, l)} />
            <NumField label="S" value={Math.round(s * 100)} min={0} max={100} step={1} onChange={v => setHsl(h, v / 100, l)} />
            <NumField label="L" value={Math.round(l * 100)} min={0} max={100} step={1} onChange={v => setHsl(h, s, v / 100)} />
          </>
        ) : (
          <>
            <NumField label="R" value={r} min={0} max={255} step={1} onChange={v => setRgb(v, g, b)} />
            <NumField label="G" value={g} min={0} max={255} step={1} onChange={v => setRgb(r, v, b)} />
            <NumField label="B" value={b} min={0} max={255} step={1} onChange={v => setRgb(r, g, v)} />
          </>
        )}
      </div>
      {/* Prints its own value. An empty colored rectangle sitting in the same
          column as the H/S/L fields reads as one more text input — and there is
          nothing to type into it, so the value it is showing has to be visible
          on it. Without the hex this was the one control in the panel that
          looked editable and was not. */}
      <div
        className="dab-swatch-lg"
        style={{ background: `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`, color: ink }}>
        {hex}
      </div>
    </div>
  )
}
