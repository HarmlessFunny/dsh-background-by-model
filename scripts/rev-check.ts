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
const THEME_FILE = readFileSync(resolve(HERE, '../src/client/theme-file.ts'), 'utf8')

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
// And it has to be read BEFORE the wipe: `resetConfig()` swaps the object out.
check('that revision is captured before the wipe replaces the config',
  THEME_FILE.indexOf('const ownRev = cfg.rev') < THEME_FILE.indexOf('resetConfig()'),
  'ownRev is read after resetConfig, so it is always 0 on the profile path')

console.log('\n--- both documents still describe the same field ---')
check('the shape declares rev', /rev: number/.test(SCHEMA), 'schema.ts lost the rev field')
check('and it is not optional',
  !/rev\?:/.test(SCHEMA), 'rev became optional, so a writer could omit it')

console.log(failures === 0 ? '\nall revision checks passed' : `\n${failures} check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
