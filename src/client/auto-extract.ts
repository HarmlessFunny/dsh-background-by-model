/**
 * "Extract from image", the automatic half.
 *
 * Fill an IMAGE's theme colour from its own bytes when it has none of its own —
 * and only then. A colour the user picked, or a previous extraction produced, is
 * never overwritten, so this cannot fight a deliberate choice.
 *
 * Three details are the whole difficulty:
 *
 *   - **Addressed by SLOT.** A rule's images each carry their own palette (since
 *     0.7.1), and the one the user just added is the one they are looking at. The
 *     single-slot reading — "the last image added is the one being looked at" — is
 *     true of the CARD's selection and false of the palette: a batch that themed
 *     only its last file left the rest of a fresh rotation on the system theme.
 *   - **Asked again on arrival.** The decode is asynchronous, so a colour chosen
 *     while it ran must win over the one being computed: the "still empty?"
 *     question is asked before the decode AND after it.
 *   - **The winner can move.** A colour is what makes a picture-less rule
 *     paintable at all, so this edit can hand the interface a rule it was not
 *     showing — which is why the winner is sampled on arrival and reported to the
 *     repaint gate rather than assumed.
 */
import type { BgImage, BgRule } from './types'
import { cfg, ruleById } from './state'
import { saveConfig } from './rpc'
import { extractWallpaperColor } from './utils/color'

/** What the extraction needs from the plugin. */
export interface AutoExtractHost {
  /** Paintable URL of a slot, or null when its bytes are not here yet. */
  paintable(slot: string): string | null
  /** Close an edit: repaint when it moved what is on screen, else refresh. */
  repaint(ruleId: string, winnerBefore: string | null): void
  /** Id of the rule that would paint right now (sampled before/after the edit). */
  winnerId(): string | null
  /** Bump the rule-list revision the panel watches. */
  bumpRulesRev(): void
}

export interface AutoExtract {
  /** Theme ONE image (default: the rule's first). Resolves when done. */
  one(ruleId: string, slot?: string): Promise<void>
  /** Theme every image of a batch, in list order. */
  each(ruleId: string, slots: readonly string[]): Promise<void>
}

export function createAutoExtract(host: AutoExtractHost): AutoExtract {
  /** The entry this extraction is about, re-resolved on every read. */
  const target = (ruleId: string, slot?: string): BgImage | undefined => {
    const rule: BgRule | null = ruleById(ruleId)
    if (rule === null) return undefined
    return (slot === undefined ? undefined : rule.images.find(i => i.slot === slot)) ?? rule.images[0]
  }

  const one = async (ruleId: string, slot?: string): Promise<void> => {
    if (!cfg.autoExtract) return
    const image = target(ruleId, slot)
    if (image === undefined || image.color !== null) return
    const url = host.paintable(image.slot)
    if (url === null) return
    let hsl: [number, number, number] | null = null
    try { hsl = await extractWallpaperColor(url, image.bgState) } catch { hsl = null }
    if (hsl === null) return
    // Asked AGAIN: a colour picked while the decode ran has to win.
    const current = target(ruleId, slot)
    if (current === undefined || current.color !== null) return
    const winner = host.winnerId()
    current.color = hsl
    host.bumpRulesRev()
    saveConfig()
    // This colour can be the one that makes the rule paintable, and it arrives
    // AFTER the upload's own repaint — so the interface follows from here.
    host.repaint(ruleId, winner)
  }

  return {
    one,
    async each(ruleId, slots) {
      for (const slot of slots) await one(ruleId, slot)
    },
  }
}
