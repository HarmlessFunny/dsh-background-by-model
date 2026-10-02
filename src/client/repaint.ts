/**
 * The repaint decision, as a pure function.
 *
 * Every edit to a rule ends with the same question: does the interface have to be
 * repainted, or is refreshing the panel's readout enough? Repainting is the
 * expensive half (the theme skin is re-registered, the wallpaper layer is
 * rewritten, the host's theme is switched), so it must not be done for a rule
 * that is not the one on screen — but it MUST be done the moment the edit
 * changes what should be on screen.
 *
 * The naive test — "is the edited rule the active one?" — is wrong in exactly the
 * case that kept being reported as "更新的不太及时，只有我动调色盘或者切模型的时候
 * 才出现": an edit that CREATES the winner. Uploading a rule's first picture, or
 * an auto-extracted color landing on a rule that had none, makes that rule
 * paintable *through that very edit* (see `ruleCanPaint`), so the rule is not the
 * active one at the moment of the check; the wallpaper and the skin then only
 * showed up later, when an unrelated drag or model switch happened to re-run the
 * resolution.
 *
 * Sampling the winner on BOTH sides of the edit is what makes such a change land
 * at once, and `editedId === winnerAfter` additionally covers the edit that does
 * not move the resolution but changes the look of the rule that IS painting (a
 * color, a slider, a framing).
 *
 * `null` is "nothing of ours is painting" (the interface falls back to the host's
 * own look), which is a winner like any other id.
 *
 * Kept free of imports on purpose: `scripts/repaint-check.ts` exercises it on
 * plain node, the same way `rotation.ts` is exercised. A rule's `color`/`match`
 * are the inputs that make the resolution move, which is why they are the fields
 * whose write paths all end here.
 */
export function shouldRepaint(
  editedId: string,
  winnerBefore: string | null,
  winnerAfter: string | null
): boolean {
  return winnerAfter === editedId || winnerAfter !== winnerBefore
}
