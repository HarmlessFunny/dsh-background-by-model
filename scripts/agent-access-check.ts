/**
 * Checks for the agent-access switch and the config revision — `pnpm check:agent`.
 *
 * Two mechanisms, one module, because they are one feature: the switch decides
 * whether there is a second writer at all, and the revision is what makes a second
 * writer safe. Every assertion here is about a failure that produces NO error
 * anywhere — which is exactly why they are worth pinning.
 *
 *   1. **Access must never appear on its own.** Only an explicit `true` grants it.
 *      A boolean that defaulted to true, or a `'yes'` that coerced, would hand the
 *      tools to an agent on an ordinary upgrade.
 *   2. **An export must not carry a grant.** A file handed to someone else who
 *      imports it must not grant THEIR agent access; and a hand-edited file that
 *      says `true` must be overruled by the importing machine's own value.
 *   3. **A revision must only move forward, by exactly one, per write.**
 *   4. **A stale write must be refused** — the whole point of the revision. The
 *      node half's real RPC handler is exercised for that half in
 *      `scripts/node-half-check.mjs`; what is pure and asserted here is the
 *      arithmetic and the sanitizer's defaults.
 *
 * Runs on plain `node` (≥ 22.6 strips the types itself), the same shape as
 * `scripts/store-check.ts`.
 */
import {
  DEFAULT_AGENT_ACCESS,
  DEFAULT_REV,
  SCHEMA_VERSION,
  freshThemeConfig,
  nextRev,
  normalizeConfig,
} from '../src/schema.ts'
import { recommendedConfig } from '../src/profile.ts'

let failures = 0
function check(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

function assert(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

console.log('--- the switch: off unless somebody said yes ---')
check('the shipped default is off', DEFAULT_AGENT_ACCESS, false)
check('a fresh install has it off', freshThemeConfig().agentAccess, false)
// The recommended profile is a configuration somebody CHOSE, and access is not a
// configuration — pressing that button must not hand an agent the ability to
// rewrite what it just installed.
check('the recommended profile does not grant it either', recommendedConfig().agentAccess, false)

console.log('\n--- the switch: only an explicit true grants it ---')
check('an explicit true grants it', normalizeConfig({ ...freshThemeConfig(), agentAccess: true }).agentAccess, true)
check('an explicit false withholds it', normalizeConfig({ ...freshThemeConfig(), agentAccess: false }).agentAccess, false)
// A config written before the field existed has no key at all: that is an upgrade,
// and an upgrade must not be the moment access appears.
check('a config predating the field does not get it', normalizeConfig({ rules: [] }).agentAccess, false)
// Coercions that look harmless and are not: `'yes'` and `1` are truthy, and a
// sanitizer that wrote `Boolean(value)` would grant access to a hand-edited file.
check('a truthy string does not grant it', normalizeConfig({ ...freshThemeConfig(), agentAccess: 'yes' }).agentAccess, false)
check('the number 1 does not grant it', normalizeConfig({ ...freshThemeConfig(), agentAccess: 1 }).agentAccess, false)
check('null does not grant it', normalizeConfig({ ...freshThemeConfig(), agentAccess: null }).agentAccess, false)

console.log('\n--- the revision: a monotonic counter, not a timestamp ---')
check('a fresh install starts at zero', freshThemeConfig().rev, DEFAULT_REV)
check('a config predating the field reads as zero', normalizeConfig({ rules: [] }).rev, DEFAULT_REV)
check('the next revision is exactly one more', nextRev(0), 1)
check('and one more again', nextRev(7), 8)
// A hand-edited file can put anything here. None of it may produce a revision that
// goes backwards or a non-integer the comparison against would never match.
check('a negative revision is floored to zero', nextRev(-4), 1)
check('a fractional revision is floored', nextRev(2.9), 3)
check('a non-number falls back to zero', nextRev('12' as never), 1)
check('NaN falls back to zero', nextRev(NaN), 1)
check('so does infinity', nextRev(Infinity), 1)

console.log('\n--- the sanitizer keeps a real revision, and refuses a fake one ---')
check('a whole number survives', normalizeConfig({ ...freshThemeConfig(), rev: 42 }).rev, 42)
check('a fraction is floored', normalizeConfig({ ...freshThemeConfig(), rev: 4.7 }).rev, 4)
check('a negative becomes zero', normalizeConfig({ ...freshThemeConfig(), rev: -1 }).rev, DEFAULT_REV)
check('a string becomes zero', normalizeConfig({ ...freshThemeConfig(), rev: '9' }).rev, DEFAULT_REV)

console.log('\n--- the two fields are IN the published shape ---')
// The drift guard in the node half compares a written config against the keys the
// sanitizer emits. A field that reaches disk without being declared here is dropped
// in silence — which for these two would mean an access grant that evaporates, or a
// revision every write disagrees about.
const shape = freshThemeConfig() as Record<string, unknown>
assert('the shape declares agentAccess', 'agentAccess' in shape, Object.keys(shape).join(', '))
assert('the shape declares rev', 'rev' in shape)
check('and this build publishes schema 11', SCHEMA_VERSION, 11)

console.log(failures === 0 ? '\nall agent-access checks passed' : `\n${failures} check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
