/**
 * Checks for the image store's DECISION — `pnpm check:store`.
 *
 * The sweep itself lives in the node half (it deletes files, so it is exercised
 * through the real RPC handler in `scripts/node-half-check.mjs`), but WHAT counts
 * as an orphan is pure and lives in `src/store.ts`. Two ways to get that wrong,
 * and neither produces an error anywhere:
 *
 *   1. **Deleting a file that is still in use.** The user's own wallpaper vanishes
 *      from a rule that keeps its entry: the rule still matches, still paints, and
 *      paints nothing — with no message, because nothing failed.
 *   2. **Spare a file it should have deleted** — the failure this whole feature
 *      exists to remove, and the one that is completely silent by nature: the
 *      number in `du` simply never goes down.
 *
 * Plus the two structural facts the sweep rests on: a holiday slot is never
 * "referenced" (its art is downloaded, and a stray `modelbg-h-*` file is the one
 * residue nothing else could clear), and an EMPTY rules list references nothing
 * (a user who deleted every rule still expects the cleanup to work).
 *
 * Runs on plain `node` (≥ 22.6 strips the types itself) with no dependency and no
 * transform, the same shape as `scripts/rotation-check.ts`. `src/store.ts` imports
 * nothing at all — not even `./schema` — which is what lets this be a direct import
 * rather than a read of the source text.
 */
import { orphanSlots, referencedSlots } from '../src/store.ts'

let failures = 0
function check(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

/** A boolean assertion whose detail is the expression under test, not `true`. */
function assert(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

const rule = (...slots: string[]) => ({ images: slots.map(slot => ({ slot })) })

console.log('--- referencedSlots: what the config still points at ---')
check('the slots of one rule, in order', referencedSlots([rule('m1', 'm2')]), ['m1', 'm2'])
check('across rules, in config order', referencedSlots([rule('m3'), rule('m1', 'm2')]), ['m3', 'm1', 'm2'])
check('a rule with no picture contributes nothing', referencedSlots([rule()]), [])
check('no rules at all references nothing', referencedSlots([]), [])
// Two rules may nominally hold the same slot (an imported file can write it even
// though the sanitizer drops it on load): the answer is a SET, and a duplicate
// would make the deletion loop try the same file twice.
check('a slot named twice is reported once', referencedSlots([rule('m1'), rule('m1')]), ['m1'])
// A rule's own `color` is not a slot: only `images` counts, and a rule that paints
// from its color alone owns no file.
check('an image-less, colour-only rule owns no slot',
  referencedSlots([{ images: [], color: [1, 0.5, 0.5] } as never]), [])

console.log('\n--- orphanSlots: what nothing points at ---')
check('the stored minus the referenced', orphanSlots(['m1', 'm2', 'm3'], ['m1', 'm3']), ['m2'])
check('order is the store\'s, because that is the order it was listed in',
  orphanSlots(['m3', 'm1', 'm2'], ['m1']), ['m3', 'm2'])
check('nothing referenced leaves every file an orphan', orphanSlots(['m1', 'm2'], []), ['m1', 'm2'])
check('nothing stored has nothing to orphan', orphanSlots([], ['m1']), [])
check('an orphan list can be empty', orphanSlots(['m1'], ['m1']), [])
// A slot the store does not hold cannot be an orphan, however far behind the
// config is: the sweep deletes FILES, and it only ever sees files that exist.
check('a referenced slot with no file is not reported', orphanSlots(['m1'], ['m1', 'm9']), [])

console.log('\n--- the `keep` list: the gap between writing bytes and naming them ---')
// An upload writes the image first and the config that names it a moment later, so
// a read landing in that window sees a file the store is about to own. `keep` is
// the browser half's live slots and it can only ever SPARE a slot.
check('a slot in keep is spared', orphanSlots(['m1', 'm2'], ['m1'], ['m2']), [])
check('keep spares only, never condemns', orphanSlots(['m1'], ['m1'], ['m2']), [])
check('a slot in neither is still an orphan', orphanSlots(['m1', 'm2', 'm3'], ['m1'], ['m2']), ['m3'])
check('keep defaults to empty', orphanSlots(['m1'], []), ['m1'])

console.log('\n--- the two invariants the sweep rests on ---')
// A holiday's art is downloaded into `holiday-cache/<tag>/<asset>` and its slot is
// read-only (`writeImage` refuses it), so a `modelbg-h-*` file is an artifact of a
// hand-edited store at best. It has to be prunable, which is why `referencedSlots`
// takes RULES and never the holiday entries.
const holidayLike = { images: [{ slot: 'h-midautumn' }] }
check('a holiday entry handed in as a rule WOULD count (the call site is what keeps it out)',
  referencedSlots([holidayLike]), ['h-midautumn'])
check('and a stray holiday-slot file is then an orphan, not a permanently spared one',
  orphanSlots(['h-midautumn', 'm1'], referencedSlots([rule('m1')])), ['h-midautumn'])

// The caller is the one that decides; this pins the CALL SITE, since a future edit
// adding `cfg.holidays.items` to it would make that file unremovable forever.
import { readFileSync } from 'node:fs'
const client = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
const keepExpr = /readStoreUsage:\s*\([^)]*\)[^=]*=>\s*readStoreUsage\(([^\n]+)\)/.exec(client)?.[1] ?? ''
assert('the browser half sends RULE slots only',
  keepExpr.includes('cfg.rules') && !keepExpr.includes('holidays'), keepExpr.trim())
// …and the prune call has to send the same set, or the two would disagree about
// what is spared: the report would call a file an orphan and the sweep would keep it.
const pruneExpr = /pruneOrphanImages:\s*async[^=]*=>\s*\{[^}]*?pruneOrphanImages\(([^\n]+)\)/.exec(client)?.[1] ?? ''
assert('and the sweep sends the same set',
  pruneExpr.includes('cfg.rules') && !pruneExpr.includes('holidays'), pruneExpr.trim())


console.log('\n--- the card can say zero ---')
// The numbers on the card are the feature: without them "clean up" is a button
// with an unknown price. So they have to be TRUE, and "no orphans" is the usual
// answer — which the download formatter, written to floor at 1 KB, gets wrong.
// Reported from a live store: `2.1 MB 正在使用 / 1 KB 可清理` on a store whose
// orphan total was 0 bytes, with the button correctly disabled underneath.
check('a download size floors at 1 KB, so a 12-byte file does not read as a failure', fmtBytes(12), '1 KB')
check('an exact zero is not a size to round', fmtStoreBytes(0), '0 KB')
check('a real orphan never reads as zero', fmtStoreBytes(64), '1 KB')
check('KB and MB keep the same shape on both', [fmtStoreBytes(2048), fmtStoreBytes(2 * 1024 * 1024)], ['2 KB', '2.0 MB'])

// The decision above is worth nothing if the card does not use it: this pins the
// CALL SITE, since a future edit reaching for the shorter name would silently
// restore the "1 KB to clean, button disabled" pair.
import { fmtBytes, fmtStoreBytes } from '../src/format.ts'
const page = readFileSync(new URL('../src/client/components/pages/ProfilePage.tsx', import.meta.url), 'utf8')
assert('the card prints its figure with the zero-honest formatter',
  /fmtStoreBytes\(usage\.orphanBytes\)/.test(page), (page.match(/fmtStoreBytes\([^)]*\)/g) ?? []).join(', '))
assert('and nothing on the card hands a storage figure to the download formatter',
  !/fmtBytes\(usage\./.test(page), (page.match(/fmtBytes\(usage\.[^)]*\)/g) ?? []).join(', '))
// Reported from the live card next: `8 个文件` beside `356 KB 可清理` on a store
// of eight files where ONE was actually deletable — a total dressed up as a
// to-do list. The count has to be the sweep's own list.
assert('the file count is how many a press would delete, not how many exist',
  /usage\.orphans\.length/.test(page) && !/usage\.files/.test(page),
  (page.match(/usage\.(orphans\.length|files)/g) ?? []).join(', '))

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
