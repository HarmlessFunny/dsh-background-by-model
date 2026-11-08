/**
 * Checks that every successful config write advances the panel's own revision —
 * `pnpm check:rev`.
 *
 * THE BUG THIS EXISTS TO PIN DOWN. The panel names the revision each write started
 * from, and the host refuses a write whose revision has fallen behind. That only
 * works if the panel adopts the revision a successful write produced; if it does
 * not, its copy stays at the OLD number, every later save looks stale, the host
 * refuses it and hands back the config it already has — which does not contain the
 * edit — and the panel adopts that. The user sees the edit land and then undo
 * itself, and the same gesture only sticks once a stale revision happens to match
 * again: "点一次 + 卡片闪一下后消失，再点一次才出现".
 *
 * The value is checked two ways, because either alone would miss half of it:
 *
 *   1. the PURE rule — `setRev` on a config, and the arithmetic that has to hold
 *      for the next write to be accepted;
 *   2. the WRITE PATH — that `persistAndResolve` actually calls it on success, and
 *      that `writeConfigNow` sends `expectedRev` at all. A refactor that drops the
 *      call re-introduces the flash with nothing failing anywhere, which is why
 *      this half is a source assertion rather than a behavioural one.
 *
 * Runs on plain `node` (Node ≥ 22.6 strips the types itself), no dependency and no
 * transform — the same shape as `scripts/repaint-check.ts`.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const RPC = readFileSync(resolve(HERE, '../src/client/rpc.ts'), 'utf8')
const STATE = readFileSync(resolve(HERE, '../src/client/state.ts'), 'utf8')
const SCHEMA = readFileSync(resolve(HERE, '../src/schema.ts'), 'utf8')

/**
 * The character bound `SLOT_RE` declares, as a number, or 0 when it cannot be read.
 *
 * Read from the source rather than duplicated here: the two must agree, and a copy
 * of the number in a test is a second place to forget.
 */
const THEME_FILE = readFileSync(resolve(HERE, '../src/client/theme-file.ts'), 'utf8')
const ENTRY = readFileSync(resolve(HERE, '../src/client/index.tsx'), 'utf8')
const PAGE = readFileSync(resolve(HERE, '../src/client/components/pages/ProfilePage.tsx'), 'utf8')
const BOOT = readFileSync(resolve(HERE, '../src/client/boot.ts'), 'utf8')

function slotReMaxLength(): number {
  // The `N` of `{1,N}` in schema.ts, or 0 when the pattern cannot be read. Read from
  // the source rather than duplicated here: a copy of the number is a second place to
  // forget, and this check exists precisely because the two must agree.
  const m = /SLOT_RE = .*?\{1,(\d+)\}/.exec(SCHEMA)
  return m === null ? 0 : Number(m[1])
}

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`)
}

console.log('--- the revision the panel sends is the one it last saw ---')
// Without `expectedRev` on the wire the host cannot detect a stale writer at all,
// so the whole mechanism silently becomes "last write wins" again.
check('a config write names the revision it started from',
  /expectedRev:\s*cfg\.rev/.test(RPC),
  'rpc.ts no longer sends expectedRev: cfg.rev')

console.log('\n--- a successful write advances the panel\'s copy ---')
// The call itself is what the user-visible bug is made of.
check('the success path records the revision the host answered with',
  /if \(outcome\.ok\) \{[\s\S]{0,200}?setRev\(outcome\.rev\)/.test(RPC),
  'persistAndResolve no longer advances the revision on success')
// `setRev` must MUTATE the live object. `cfg` is read through its binding by every
// render accessor, so replacing the reference would strand them on the old config.
check('setRev mutates the live config rather than replacing it',
  /export function setRev\(rev: number\): void \{[\s\S]{0,400}?cfg\.rev = /.test(STATE),
  'setRev no longer writes cfg.rev in place')
// A negative or non-finite revision must never be recorded: it would make the next
// write unmatched forever, which is the same lock-up by another route.
check('and ignores a revision it cannot use',
  /isFinite\(rev\)/.test(STATE.slice(STATE.indexOf('export function setRev'))),
  'setRev does not guard against a non-finite revision')

console.log('\n--- the arithmetic the next write depends on ---')
// The host stamps `nextRev(current)` and answers with it; the panel stores that
// exact number. So the invariant is simply: what the host answers is what the next
// `expectedRev` must be. Verified against the real implementation of both sides.
const { nextRev, normalizeConfig, DEFAULT_REV } = await import('../src/schema.ts')
check('the host advances by exactly one', nextRev(DEFAULT_REV) === 1, String(nextRev(DEFAULT_REV)))
check('a config round-tripped through the sanitizer keeps its revision',
  normalizeConfig({ rev: 7 }).rev === 7, String(normalizeConfig({ rev: 7 }).rev))
// The number the panel records is used verbatim as the next `expectedRev`, and the
// host compares it to the revision on disk — so a stored `n` is accepted exactly
// when disk is `n`, which is what makes "write then write again" work at all.
check('a stored revision is accepted by a host that is at that revision',
  nextRev(6) === 7 && normalizeConfig({ rev: 6 }).rev === 6,
  'the round trip between the two halves does not line up')

console.log('\n--- an import keeps the store\'s own revision ---')
// The same bug by another route: zeroing the revision while importing makes the
// import's OWN save read as stale, so it is refused, handed back the pre-import
// config, and rolled back — the file appears to import and then un-import itself.
check('an import does not zero the revision',
  !/agentAccess: ownAccess, rev: 0\s*\)/.test(THEME_FILE),
  "theme-file.ts resets rev to 0 on import, so the import's own save is refused")
check('it carries the store\'s revision into the adopted config',
  /agentAccess: ownAccess, rev: ownRev\s*\}/.test(THEME_FILE),
  'theme-file.ts no longer passes the store revision through')
// The revision is captured before anything replaces the config object. That used to
// be `resetConfig()` on the profile path; the profile is a single host operation now
// and that path is gone, so what this still asserts is that the capture exists at
// all AND precedes the adopt that consumes it.
check('that revision is captured before it is used',
  THEME_FILE.indexOf('const ownRev = cfg.rev') > -1
  && THEME_FILE.indexOf('const ownRev = cfg.rev') < THEME_FILE.indexOf('rev: ownRev'),
  'ownRev is not read from cfg before the adopt that consumes it')

console.log('\n--- the recommended profile is ONE round trip ---')
// The same bug again, and the one that survived the first fix: the profile used to
// be `resetStore` followed by the panel's own write. The wipe empties the config ON
// DISK, so the revision falls to 0 while the panel still holds the pre-wipe number —
// the write is refused as stale and adopts the config it just replaced. Pressing the
// button twice only worked once the numbers happened to line up again.
check('the profile is installed through one host operation',
  /adoptRecommended\(\)/.test(ENTRY),
  'applyRecommended no longer calls the single adoptRecommended operation')
check('and the panel no longer sequences a wipe of its own',
  !/resetStore\(\)/.test(ENTRY),
  'applyRecommended still calls resetStore itself, which re-creates the stale write')
check('the import path has no wipe variant left to reach for',
  !/wipeFirst:\s*boolean/.test(THEME_FILE),
  'applyThemeFile still takes wipeFirst, so the two-step path can come back')
// The host side of that one operation must floor the revision across the wipe, or
// it reproduces the same refusal from the other end.
const INDEX = readFileSync(resolve(HERE, '../src/index.ts'), 'utf8')
check('the host reads the replaced revision before it wipes',
  INDEX.indexOf('const replacedRev = (await readConfig()).rev') < INDEX.indexOf('await resetStore()'),
  'replacedRev is read after the wipe, so it is always 0')
check('and floors the profile\'s write on it',
  /writeConfig\(\{ \.\.\.config, agentAccess: ownAccess \}, undefined, replacedRev\)/.test(INDEX),
  'the profile write no longer floors on the replaced revision')

console.log('\n--- a failed adopt tells the truth about what it deleted ---')
// The wipe is irreversible, so the failure message is load-bearing: telling someone
// their config is untouched when it is already gone stops them from retrying a
// store that is empty. The node half reports `wiped`; the page must honour it.
check('the host reports whether the store was already emptied',
  /wiped: false/.test(INDEX) && /wiped: true/.test(INDEX),
  'adoptRecommendedProfile no longer distinguishes a pre-wipe failure from a post-wipe one')
check('a download failure is reported BEFORE the wipe',
  INDEX.indexOf("wiped: false") < INDEX.indexOf("await resetStore()"),
  'the pre-wipe failure is not reported before the wipe')
check('the panel passes the whole outcome through',
  /res\.wiped === true/.test(ENTRY),
  'applyRecommended drops the node half\'s `wiped` report')
check('and the page branches on it rather than on a boolean',
  /res\.wiped \? t\('recFailAfterWipe'\)/.test(PAGE),
  'the page still renders one message for both failure kinds')

console.log('\n--- byte operations on ONE slot are ordered ---')
// Slots are RECYCLED: deleting a rule frees its `mN`, and the next upload takes it
// straight back. Those are independent requests on one connection, so a fast
// delete-then-add can reach the host in the wrong order — the delete lands after the
// write, and the config names a slot whose bytes were just removed. On screen that
// is a card reading "这张图片还没有取到内容" with the rule sitting right there, and
// nothing reports an error because nothing failed.
check('the byte operations share a per-slot queue',
  /slotQueues/.test(RPC) && /enqueueForSlot/.test(RPC),
  'rpc.ts no longer serialises per-slot byte operations')
check('a write goes through it', /enqueueForSlot\(slot, \(\) => rpcCall\('writeImage'/.test(RPC))
check('a delete goes through it', /enqueueForSlot\(slot, \(\) => rpcCall\('deleteImage'/.test(RPC))
check('a read goes through it too, so a null answer is not read as final',
  /enqueueForSlot\(slot, \(\) => rpcCall\('readImage'/.test(RPC))
check('and so does a download, which also writes the slot',
  /enqueueForSlot\(slot, \(\) => rpcRaw\('fetchImageUrl'/.test(RPC))
// One queue PER SLOT, not one for the plugin: seven uploads at once must not
// serialise into seven sequential round trips.
check('the queue is keyed by slot rather than global',
  /Map<string, Promise/.test(RPC),
  'the queue is not per-slot, so unrelated pictures now wait for each other')
// The allocation is what recycles a freed number, so this is where the collision
// comes from — it is correct behaviour, and the ordering above is what makes it safe.
check('slots are handed out by first-free, which is why recycling is real',
  /for \(let i = 1; i < 1000/.test(STATE) && /if \(!taken\.has\(slot\)\) return slot/.test(STATE),
  'nextSlot no longer recycles, so this check is describing something that cannot happen')

console.log('\n--- config writes are serialised, and bytes follow the config ---')
// Two saves fired back to back both name the SAME revision, because a successful
// one is what advances it. The first is accepted, the second is refused as stale and
// handed the config from before the second edit — so the second edit leaves the
// screen. Its side effect (a picture's bytes, already deleted) would not.
check('config writes run one at a time',
  /let writeChain: Promise<void>/.test(RPC) && /writeChain = writeChain\.then/.test(RPC),
  'persistAndResolve no longer serialises, so two rapid saves race on one revision')
// The ordering rule the invariant rests on: the bytes are what the config points AT,
// so they may only go once the config that stopped pointing at them is on disk.
check('a slot\'s bytes are queued, not deleted inline',
  /export function deleteImageAfterSave/.test(RPC),
  'rpc.ts lost the deferred-delete queue')
check('a landed write releases them', /for \(const slot of releasing\) void deleteImage\(slot\)/.test(RPC))
check('a refused write drops them, so the picture survives',
  /deferredDeletes = \[\]\s*\n?\s*onConflict\?\.\(outcome\.config\)/.test(RPC.replace(/\r/g, '')),
  'a refused write still releases the queued deletes, which removes pictures of rules that are still live')
// Both removal paths must use it. A call site left on the immediate delete is the bug
// coming back through the door beside the one that was closed.
check('removing a rule defers the release',
  /deleteImageAfterSave\(slot\)/.test(ENTRY), 'removeRule deletes bytes before its config lands')
check('and so does removing one image',
  (ENTRY.match(/deleteImageAfterSave\(slot\)/g) ?? []).length >= 2,
  'only one of the two removal paths defers')
check('the immediate delete is no longer used for a removed rule',
  !/void deleteImage\(slot\)/.test(ENTRY),
  'a removal path still deletes inline')

console.log('\n--- the third writer: the import path obeys the same rules ---')
// The import was the last path still deleting bytes BEFORE naming them, so a refused
// save rolled the rules back on screen while their pictures were already gone.
check('an import defers its deletes rather than issuing them inline',
  /deleteImageAfterSave\(slot\)/.test(THEME_FILE),
  'theme-file.ts deletes import slots inline again')
check('and never reaches for the immediate delete',
  !/void deleteImage\(slot\)/.test(THEME_FILE),
  'theme-file.ts still deletes a slot immediately during an import')
// The pictures an incoming file CARRIES may be written at once — bytes before the
// name is the safe direction — but the ones it drops must wait for the write.
check('a picture the file carries is still written immediately',
  /void writeImage\(slot, raw\)/.test(THEME_FILE))

console.log('\n--- a tool-added slot cannot collide with the panel\'s ---')
// The panel allocates from its in-memory copy; this side allocates from disk. Both
// used first-free, so a download (seconds long) let the user add a picture and be
// handed the same `mN`. The tool now derives a name nothing else will choose.
check('the tool derives its slot instead of sweeping for a free one',
  /`t\$\{\(Date\.now\(\) \+ attempt\)\.toString\(36\)\}`/.test(INDEX),
  'importUrl went back to first-free allocation, which the panel cannot see')
check('and the derived name fits SLOT_RE',
  /t[^`]*toString\(36\)/.test(INDEX), 'the slot no longer has the expected shape')
// `Date.now()` in base 36 is ~8 characters; `SLOT_RE` allows 32. This pins the
// relationship rather than the current length.
check('SLOT_RE is wide enough for the derived name',
  slotReMaxLength() > 0 && (`t${Date.now().toString(36)}`).length <= slotReMaxLength(),
  `a derived slot name could exceed SLOT_RE (max ${slotReMaxLength()})`)

console.log('\n--- two adopts cannot overlap ---')
// The one collision the revision check cannot resolve: the loser's config write is
// refused, which is correct, but its WIPE is not undoable.
check('adopting is exclusive', /let adoptInFlight = false/.test(INDEX),
  'adoptRecommendedProfile has no exclusion, so the panel and the tool can wipe together')
check('a second caller is refused rather than queued',
  /if \(adoptInFlight\)/.test(INDEX) && /already being installed/.test(INDEX))
check('and the flag is released even when the attempt throws',
  // The assignment must live inside a `finally`, whatever comments sit between the two
  // — a comment is not a reason to weaken this into "the string appears somewhere".
  /finally \{[\s\S]{0,300}?adoptInFlight = false[\s\S]{0,40}?\}/.test(INDEX),
  'adoptInFlight is not cleared in a finally, so one failure would block adopting for good')

console.log('\n--- an appearance operation cannot revoke a grant ---')
// The complement of the rule the profile already follows: it ships `agentAccess` off
// so that INSTALLING it cannot GRANT access. The same reasoning requires that it
// cannot REVOKE it either — a switch the user turned on by hand is not part of the
// look being installed, and pressing "use the recommended profile" must not quietly
// take the agent's access away.
check('adopting the profile carries the user\'s own grant across',
  /ownAccess = replaced\.agentAccess === true/.test(INDEX),
  'adoptRecommendedProfile no longer reads the replaced authorisation')
check('and writes it back with the profile',
  /agentAccess: ownAccess/.test(INDEX),
  'the profile write does not restore the user\'s authorisation')
check('the grant is read BEFORE the wipe, like the revision',
  INDEX.indexOf('replaced.agentAccess') < INDEX.indexOf('await resetStore()'),
  'the authorisation is read after resetStore, so it is always the shipped default')
// The other half, unchanged: shipping it OFF is what stops an install from granting.
check('and the profile itself still ships it off',
  /agentAccess: DEFAULT_AGENT_ACCESS/.test(readFileSync(resolve(HERE, '../src/profile.ts'), 'utf8')),
  'recommendedConfig no longer ships agentAccess off, so installing it would grant access')

console.log('\n--- both documents still describe the same field ---')
check('the shape declares rev', /rev: number/.test(SCHEMA), 'schema.ts lost the rev field')
check('and it is not optional',
  !/rev\?:/.test(SCHEMA), 'rev became optional, so a writer could omit it')

console.log(failures === 0 ? '\nall revision checks passed' : `\n${failures} check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
