/**
 * Byte counts as a person reads them — the only two sentences this plugin says
 * about size, in one place so their difference cannot be an accident.
 *
 * They are NOT the same question, which is why there are two:
 *
 *   - a download's size describes ONE file that just arrived;
 *   - a storage figure describes a total that is routinely zero.
 *
 * The floor below is right for the first and wrong for the second, and the wrong
 * answer is not a crash: it is a card that offers to clean up 1 KB and a button
 * that refuses to, on a store where there is nothing to clean. Neither number is
 * ever deleted or written — these are display strings — but a maintenance panel
 * whose numbers disagree with its own button is worse than no panel.
 */

/**
 * Size of one download, at the precision a person reads it at.
 *
 * Floors at 1 KB on purpose: it is shown beside a file that just arrived, and
 * "0 KB" beside a picture that downloaded fine reads as a failure.
 */
export const fmtBytes = (n: number): string => (n >= 1024 * 1024
  ? `${(n / 1024 / 1024).toFixed(1)} MB`
  : `${Math.max(1, Math.round(n / 1024))} KB`)

/**
 * A figure on the storage card, where zero is a real and — on a tidy store — the
 * usual answer.
 *
 * `fmtBytes` would print "1 KB" for it, so the card claimed 1 KB of waste while
 * the clean button sat disabled (its condition is `orphanBytes === 0`, which was
 * true all along). Rounding remains conservative in the other direction: a real
 * orphan is never allowed to read as zero, because a number that cannot go down
 * is exactly the complaint this feature exists to answer.
 */
export const fmtStoreBytes = (n: number): string => (n > 0 ? fmtBytes(n) : '0 KB')
