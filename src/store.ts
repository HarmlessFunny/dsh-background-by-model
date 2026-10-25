/**
 * What the image store holds, and which of those files nothing points at any more.
 *
 * Every image is stored at FULL fidelity (see `readImg` in ./client/utils/image —
 * the bytes are written as they were chosen, never re-encoded), so a rule that is
 * edited a few times leaves the store growing by megabytes with nothing on screen
 * to show for it: replacing a picture writes a new slot, and the old file is only
 * removed by the one path that knows it stopped being referenced. An interrupted
 * write, a hand-edited config, or a rule deleted while its bytes were still on
 * their way all leave the same residue — a `modelbg-<slot>` file no config names.
 *
 * That residue is invisible by construction: `bootSlots` reads the slots the config
 * references, so an orphaned file is never loaded, never painted, and never
 * reported. It only ever shows up as a number in `du`.
 *
 * Shared by BOTH halves — the node half deletes with it, the browser half shows its
 * answer — so it imports nothing at all: no DOM, no Node, no Cordis, and no
 * `./schema` either (whose runtime import of `./holiday` is extensionless). The
 * structural type below is the same trick `./client/rules-view` uses, and it is what
 * lets `scripts/store-check.ts` run these decisions on plain node.
 */

/** The only thing this module asks of a rule or a holiday: the slots it names. */
export interface SlotOwnerLike {
  images: ReadonlyArray<{ slot: string }>
}

/** One image file in the store, as the node half measures it. */
export interface StoreFile {
  slot: string
  bytes: number
}

/**
 * Every slot the config still points at, in first-seen order and without repeats.
 *
 * Rules only. A holiday's slot is deliberately NOT included: its art lives in
 * `holiday-cache/`, it is never written to the slot namespace, and a
 * `modelbg-h-*` file therefore cannot belong to anything (see the read-only
 * invariant in MAINTAINING §7.1). Counting the slot as referenced would make such
 * a file permanently unprunable — the one residue this cleanup could never clear.
 */
export function referencedSlots(rules: readonly SlotOwnerLike[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const rule of rules) {
    for (const image of rule.images) {
      if (typeof image.slot !== 'string' || seen.has(image.slot)) continue
      seen.add(image.slot)
      out.push(image.slot)
    }
  }
  return out
}

/**
 * The files whose slot appears in neither `referenced` nor `kept`.
 *
 * `stored` order is preserved because the caller deletes in it and reports what it
 * removed in that order, which is the only order the user has ever seen these files
 * in. `kept` exists for one reason: the browser half's live config can be a few
 * hundred milliseconds ahead of its own write to disk (a slot is written, then the
 * config that names it), and an image whose bytes have landed but whose rule entry
 * has not must not be deleted in that window.
 */
export function orphanSlots(
  stored: readonly string[],
  referenced: readonly string[],
  kept: readonly string[] = [],
): string[] {
  const live = new Set([...referenced, ...kept])
  return stored.filter(slot => !live.has(slot))
}
