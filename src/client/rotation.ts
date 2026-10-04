/**
 * Multi-image rotation: which image comes next, and how often.
 *
 * Pure and dependency-free on purpose — the timer that calls this lives in the
 * plugin's apply closure (where nothing can reach it), but the DECISION lives
 * here so `scripts/rotation-check.ts` can pin it down: a picker that walks off
 * the end of the list, or that "shuffles" onto the image it is already showing,
 * looks exactly like a rotation that has stopped, and neither shows up as an
 * error anywhere.
 */
import type { RotateOrder } from './types'

/** Dwell-time presets the settings UI offers, in ms. */
export const ROTATE_PRESETS: ReadonlyArray<{ ms: number; key: string }> = [
  { ms: 10_000, key: 'rotEvery10s' },
  { ms: 30_000, key: 'rotEvery30s' },
  { ms: 60_000, key: 'rotEvery1m' },
  { ms: 5 * 60_000, key: 'rotEvery5m' },
  { ms: 30 * 60_000, key: 'rotEvery30m' },
]

/**
 * The index to paint after the current one, or null when there is nowhere to go
 * (fewer than two images — the caller must not start a timer at all then).
 *
 * `order` walks the list and wraps; `shuffle` picks uniformly among every index
 * EXCEPT the current one, because landing on the same image reads as a missed
 * tick. `current` outside the list is treated as 0 rather than trusted: it comes
 * from the UI as often as from the timer, and a stale index must not be able to
 * index past the end.
 *
 * `rand` is injectable so the shuffle branch is testable without stubbing a
 * global.
 */
export function nextIndex(
  len: number,
  order: RotateOrder,
  current: number,
  rand: () => number = Math.random,
): number | null {
  if (!Number.isFinite(len) || len < 2) return null
  const count = Math.floor(len)
  const cur = Number.isFinite(current) && current >= 0 && current < count ? Math.floor(current) : 0
  if (order === 'shuffle') {
    // Uniform over the count-1 candidates, skipping `cur`. `rand() === 1` (which
    // a caller-supplied generator may return) would otherwise land on `count`.
    const roll = Math.min(Math.floor(Math.max(rand(), 0) * (count - 1)), count - 2)
    return roll >= cur ? roll + 1 : roll
  }
  return (cur + 1) % count
}

/**
 * Whether a rotation is worth running: two images, the switch on, and a positive
 * dwell time. Kept here (rather than at the call site) so the UI's "rotating"
 * badge and the timer agree by construction — a badge that says "rotating" while
 * no timer exists is the one failure this feature can produce silently.
 */
export function isRotating(len: number, enabled: boolean, intervalMs: number): boolean {
  return enabled && len >= 2 && Number.isFinite(intervalMs) && intervalMs > 0
}
