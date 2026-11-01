/**
 * The recommended profile's transfers: which failures are worth another round, and
 * what an attempt that failed halfway leaves behind for the next one.
 *
 * Both halves ask this module, and neither question needs a socket to answer. The
 * NODE half owns the network — an edge just failed, is that worth asking again? —
 * and the BROWSER half owns the pool and the resume — the sixth file of seven
 * failed, what does the next press still have to fetch? Deciding those here rather
 * than inside a `fetch` call is what lets `scripts/preset-check.ts` pin them: this
 * module touches no DOM, no timer and no runtime of either side, the same rule
 * ./schema follows.
 *
 * Why a retry exists at all: the profile is a SET of transfers (one file per
 * wallpaper) over three CDN edges, and it used to be exactly one attempt per file
 * per edge. One 502, one reset connection or one CDN hiccup on the last of seven
 * files therefore threw away six good downloads — and the user's only recourse,
 * pressing the button again, started from zero. Now a failure that looks like
 * weather gets another round, and an attempt that failed holds its bytes for the
 * next one.
 */

/**
 * Why one attempt at one file produced nothing.
 *
 * Deliberately not "the status code": what the caller needs to know is whether
 * asking again could plausibly change the answer, and `429` and `404` are both
 * status codes while only one of them is worth waiting out.
 */
export type FetchFailure = 'missing' | 'oversized' | 'timeout' | 'network' | 'server' | 'empty'

/** Rounds per file: the first try plus two retries. */
export const PRESET_ATTEMPTS = 3
/** Delay before the round that follows a failed one, doubled per round: 400, 800. */
export const PRESET_RETRY_BASE_MS = 400

/**
 * Whether another round is worth asking for.
 *
 * Three reasons are terminal, and each for its own:
 *
 *   - `missing` — the host says the file is not there. A BFS path is a hash of an
 *     upload (see `PROFILE_HOSTS` in ./profile), so a 404 is not a flake that might
 *     clear: the picture it names either exists or never will. It has to reach the
 *     user as a loud failure NAMING the slot — and it has to reach them FAST:
 *     paying two more rounds for a file that is provably absent only makes the
 *     sentence later, on a button the user is watching.
 *   - `oversized` — the bytes are the problem, and the next round would serve the
 *     same bytes.
 *   - `timeout` — sixty seconds of silence is not weather. Every host was already
 *     asked inside the SAME round, so a retry round would re-ask hosts that each
 *     just spent a minute not answering. This is also what keeps the worst case for
 *     one file at three minutes instead of nine: a round in which every edge was
 *     silent is over immediately (three minutes, exactly what it cost before there
 *     were rounds at all), and only a round that mixed a silent edge with a
 *     transient one can carry a round's worth of latency into the next one.
 *
 * Everything else is a hiccup: a thrown connection, a 5xx, a 429, a 408, or a 200
 * with no body.
 */
export function presetRetryable(reason: FetchFailure): boolean {
  return reason !== 'missing' && reason !== 'oversized' && reason !== 'timeout'
}

/**
 * The delay before the round that follows `failedAttempt` (1-based), in ms.
 *
 * Doubling rather than fixed: the second retry is the one that has to survive a
 * edge having a bad few hundred milliseconds, and it is still short enough that
 * a user staring at "downloading" does not read it as a hang.
 */
export function presetRetryDelayMs(failedAttempt: number): number {
  return PRESET_RETRY_BASE_MS * 2 ** Math.max(0, failedAttempt - 1)
}

/** What one attempt already has in hand, and which revision it belongs to. */
export interface PresetHeld {
  /**
   * Which generation of the profile those bytes belong to — `RECOMMENDED_REVISION`
   * (./profile). The rules are compiled in, so this is a constant rather than a hash
   * of a downloaded config, but the question it answers is unchanged: a hold may only
   * be reused for the generation it was fetched for.
   */
  key: string
  /** Slot → data URL, for the files that did arrive. */
  images: Record<string, string>
}

/**
 * The bytes of a failed attempt that may be reused for the revision `key` names.
 *
 * A fresh object every time, never the held record itself: the caller fills it in
 * as the rest of the profile arrives, and handing out the same mutable record
 * would let a re-fetch of one file edit the state the NEXT attempt resumes from.
 * An empty answer — nothing held, or held for a different revision — is the honest
 * one either way: the pool then asks for every slot the config names.
 */
export function presetResume(held: PresetHeld | null, key: string): Record<string, string> {
  if (held === null || held.key !== key) return {}
  return { ...held.images }
}

/**
 * The slots of `slots` that `images` does not hold yet, in the config's own order.
 *
 * Order matters in the only way it can here: it decides which file a worker takes
 * first, and the files are not the same size. Only names the CONFIG asked for are
 * ever returned, so a held picture nothing points at — a slot the author removed
 * from the profile — can never be fetched again or shipped.
 */
export function presetMissing(slots: readonly string[], images: Record<string, string>): string[] {
  return slots.filter(slot => images[slot] === undefined)
}
