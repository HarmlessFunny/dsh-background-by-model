/**
 * Boot: which image slots are read before the first frame, and in what order.
 *
 * Deliberately its own module, because the ORDER is the whole feature. A setup
 * with five rules and four pictures each holds twenty full-size data URLs, and
 * pulling all of them before painting would mean the interface opens blank for
 * as long as they take. So exactly three things are read eagerly:
 *
 *   1. the slot that paints FIRST — today's holiday art, else the current model's
 *      first image (see `prioritySlot`);
 *   2. the first image of every other rule, because a rule card draws its first
 *      image as its thumbnail;
 *   3. today's holiday art, when it is not already (1).
 *
 * Everything past that is read ON DEMAND: by the rotation, which warms the image
 * it is about to need as soon as its schedule is armed, and by the settings page
 * when a card is expanded. The slot list the node half reports is not hydrated at
 * all — an orphaned slot nothing points at has no card to appear on.
 */
import { cfg, imageOf, setImage } from './state'
import { matchRule } from './modelbg'
import { readImage } from './rpc'

/** One slot, read once: the cache is authoritative for "already here". */
export async function loadSlot(slot: string): Promise<void> {
  if (imageOf(slot) !== null) return
  const url = await readImage(slot)
  if (url !== null) setImage(slot, url)
}

export interface BootSpec {
  /** The match text the current model resolved from (may be '' at boot). */
  modelText: string
  /** Today's holiday slot, or null when no holiday can paint. */
  holidaySlot: string | null
}

/**
 * The slot that paints before anything else: the holiday in force when there is
 * one, otherwise the FIRST image of the current model's rule. A holiday outranks
 * the rule here for the same reason it outranks it when painting.
 *
 * Always the first image (never the one `advanceOnSwitch` would step to): boot
 * paints without an advance, and hydrating an image the first frame is not going
 * to use would leave the frame blank until the real one arrived.
 */
export function prioritySlot(spec: BootSpec): string | null {
  if (spec.holidaySlot !== null) return spec.holidaySlot
  return matchRule(cfg.rules, spec.modelText).rule?.images[0]?.slot ?? null
}

/** Every slot boot hydrates, the painted one first. */
export function bootSlots(spec: BootSpec): string[] {
  const firsts = cfg.rules
    .map(r => r.images[0]?.slot)
    .filter((slot): slot is string => slot !== undefined)
  const first = prioritySlot(spec)
  return Array.from(new Set([
    ...(first === null ? [] : [first]),
    ...firsts,
    ...(spec.holidaySlot === null ? [] : [spec.holidaySlot]),
  ]))
}

/**
 * Read the boot set, calling `painted` once the first slot is in.
 *
 * Sequential on purpose: the painted one is requested first and the rest stream
 * in after it, so a large multi-rule setup never delays the first frame. The
 * callback fires on EVERY slot's turn, not once — the caller's repaint is cheap
 * when the URL has not moved.
 */
export async function hydrateBoot(spec: BootSpec, painted: () => void): Promise<void> {
  const first = prioritySlot(spec)
  for (const slot of bootSlots(spec)) {
    await loadSlot(slot)
    if (slot === first) painted()
  }
}
