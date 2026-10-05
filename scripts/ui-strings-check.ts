/**
 * Static checks for the browser half — `pnpm check:ui`.
 *
 * The client half cannot be unit-tested without a browser, but two of its most
 * common silent failures are purely textual, and both render as visible garbage
 * rather than as an error:
 *
 *   1. a `t('…')` key that is missing from the dictionary — the interface then
 *      prints the raw key (`holidayActiveNow`) instead of a sentence;
 *   2. a `className="dab-…"` with no rule in UI_CSS — an unstyled box, with no
 *      error anywhere;
 *   3. a `var(--dsw-…)` naming a token the harness does not publish — the
 *      declaration is dropped and the property inherits, which is how a
 *      placeholder came out looking like typed text (section 6).
 *
 * Also pins that the two dictionaries carry the SAME key set, because a key
 * present in only one language is the same bug for half the users.
 *
 * Runs on plain `node` (Node ≥ 22.6 strips the types itself).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zh, en } from '../src/client/i18n.ts'
import { REPO_URL } from '../src/client/repo.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLIENT = resolve(HERE, '../src/client')

let failures = 0
const fail = (label: string, detail: string): void => {
  failures++
  console.log(`FAIL ${label}: ${detail}`)
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

const files = walk(CLIENT).filter(f => !f.endsWith(`i18n.ts`))
const sources = new Map(files.map(f => [f, readFileSync(f, 'utf8')]))

// ── 1. the two dictionaries agree ──────────────────────────────────────────
const zhKeys = new Set(Object.keys(zh))
const enKeys = new Set(Object.keys(en))
for (const k of zhKeys) if (!enKeys.has(k)) fail('dictionary', `"${k}" is in zh but not en`)
for (const k of enKeys) if (!zhKeys.has(k)) fail('dictionary', `"${k}" is in en but not zh`)
console.log(`ok   dictionaries agree (${zhKeys.size} keys)`)

// ── 2. every key the UI asks for exists ────────────────────────────────────
const wanted = new Map<string, string[]>() // key -> where
const want = (key: string, where: string): void => {
  const list = wanted.get(key) ?? []
  list.push(where)
  wanted.set(key, list)
}

for (const [file, src] of sources) {
  const where = relative(CLIENT, file).replace(/\\/g, '/')
  for (const m of src.matchAll(/\bt\(\s*'([^']+)'\s*\)/g)) want(m[1]!, where)
}

/**
 * Keys reached through a TABLE rather than a literal `t('…')`. Listed per file
 * on purpose: a generic "every string that looks like a key" rule would flag
 * host attribute names and CSS values, and a rule this check gets wrong is worse
 * than no rule at all.
 */
const TABLE_KEYS: Array<[string, RegExp, string]> = [
  // The match tester — and with it this table — moved from the rules page to the
  // profile page, so the keys are now reached from there.
  ['components/pages/ProfilePage.tsx', /'(statusNote[A-Za-z]+)'/g, 'MODEL_NOTE_KEYS'],
  // The recommended-profile download's failure codes, matched the same way: the
  // node half reports a code and the page looks the copy up. A prefix rather than
  // a list, because the set of codes grows with the ways a download can fail and
  // every one of them is a key that must not go missing.
  ['components/pages/ProfilePage.tsx', /'(recFail[A-Za-z]+)'/g, 'REC_ERROR_KEYS'],
  ['components/pages/ModelBgPage.tsx', /key:\s*'(bgMode[A-Za-z]+)'/g, 'BG_MODES'],
  ['components/pages/InterfacePage.tsx', /labelKey:\s*'(ui[A-Za-z]+)'/g, 'PARTS'],
  // The dwell-time presets are rendered from ROTATE_PRESETS, so their labels are
  // reached through a table just like the two above.
  ['rotation.ts', /key:\s*'(rot[A-Za-z0-9]+)'/g, 'ROTATE_PRESETS'],
  // The switch-effect card renders its chips from one table per axis, and each
  // table is a `Record<TransitionEffect | TransitionEasing, …>`: the compiler is
  // what keeps "a value with no label" from existing, and these two entries are
  // what keep the labels from going missing on the way out.
  ['components/pages/ProfilePage.tsx', /'(trEffect[A-Za-z]+)'/g, 'EFFECT_KEYS'],
  ['components/pages/ProfilePage.tsx', /'(trEasing[A-Za-z]+)'/g, 'EASING_KEYS'],
]
for (const [rel, re, table] of TABLE_KEYS) {
  const src = sources.get(join(CLIENT, rel))
  if (src === undefined) { fail('table keys', `${rel} not found (for ${table})`); continue }
  for (const m of src.matchAll(re)) want(m[1]!, `${rel} (${table})`)
}

for (const [key, where] of wanted) {
  if (!zhKeys.has(key)) fail('missing key', `t('${key}') — not in zh — used by ${where.join(', ')}`)
  if (!enKeys.has(key)) fail('missing key', `t('${key}') — not in en — used by ${where.join(', ')}`)
}
console.log(`ok   every referenced key exists (${wanted.size} referenced)`)

// ── 3. every dab- class the UI sets has a rule ─────────────────────────────
const css = readFileSync(join(CLIENT, 'components/ui.css.ts'), 'utf8')
const defined = new Set([...css.matchAll(/\.(dab-[a-z0-9-]+)/g)].map(m => m[1]!))
const used = new Map<string, string[]>()
for (const [file, src] of sources) {
  const where = relative(CLIENT, file).replace(/\\/g, '/')
  // Both spellings the plugin uses: a plain string and a template that appends
  // state modifiers.
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g)) {
    const text = m[1] ?? m[2] ?? m[3] ?? ''
    for (const c of text.matchAll(/(dab-[a-z0-9-]+)/g)) {
      const list = used.get(c[1]!) ?? []
      list.push(where)
      used.set(c[1]!, list)
    }
  }
}
for (const [cls, where] of used) {
  if (!defined.has(cls)) fail('missing css', `.${cls} has no rule in ui.css.ts — used by ${where.join(', ')}`)
}
console.log(`ok   every className exists in the stylesheet (${used.size} classes)`)

// ── 4. no dictionary entry has gone stale ──────────────────────────────────
for (const key of zhKeys) {
  if (!wanted.has(key)) fail('dead key', `"${key}" is defined but never referenced`)
}
console.log(`ok   no unreferenced dictionary entries`)

// ── 5. the links the shell ships point where the package says ───────────────
// The brand in the header and the package name in the profile footer both open
// `REPO_URL`, while npm and the plugin market read `repository` from
// package.json. A repository that moves would leave the interface linking
// somewhere the package no longer claims — and a wrong link looks exactly like a
// working one until someone clicks it.
const pkg = JSON.parse(readFileSync(resolve(HERE, '../package.json'), 'utf8')) as { repository?: { url?: string } }
const declared = (pkg.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '')
if (declared !== REPO_URL) fail('repo link', `REPO_URL is ${REPO_URL}, package.json declares ${declared}`)
else console.log(`ok   REPO_URL matches package.json (${REPO_URL})`)

// ── 6. every host token the UI reads is one the theme defines ───────────────
// A `var(--dsw-…)` naming a token this harness does not publish is not an error
// anywhere: the declaration is dropped (invalid at computed-value time) and the
// property falls back to `inherit` — so a placeholder came out the colour of real
// text inside an empty box, and one label asked for a font family that does not
// exist. That is how `--dsw-alias-label-quaternary` and `--dsw-mono`, neither of
// which has ever been published, sat in this stylesheet without a symptom.
//
// The names live in the harness's own theme bundle and nowhere in this repository,
// so this section is a claim about the INSTALLED host and needs the peer
// dependencies to make it: absent — or a bundle that no longer carries the table —
// it SKIPS with a notice rather than failing, because "the host is not here" must
// not read as "the stylesheet is wrong".
//
// Only `var(--dsw-…)` reads are checked: the plugin's own variables (`--dab-…`)
// are defined in its stylesheet, and the ones it publishes for its injected rules
// (`--dsh-any-…`) are written by `wallpaper.ts` at runtime, so neither is a
// question about the host.
const TOKEN_FLOOR = 100
let hostTokens: Set<string> | null = null
try {
  const bundle = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-client-ui-theme/client'))
  const found = new Set([...readFileSync(bundle, 'utf8').matchAll(/--dsw-[a-z0-9-]+(?=\s*:)/g)].map(m => m[0]!))
  if (found.size >= TOKEN_FLOOR) hostTokens = found
} catch { hostTokens = null }
if (hostTokens === null) {
  console.log('skip host tokens: the harness theme bundle is not installed here')
} else {
  const reads = new Map<string, string[]>()
  for (const [file, src] of sources) {
    const where = relative(CLIENT, file).replace(/\\/g, '/')
    for (const m of src.matchAll(/var\(\s*(--dsw-[a-z0-9-]+)/g)) {
      const list = reads.get(m[1]!) ?? []
      list.push(where)
      reads.set(m[1]!, list)
    }
  }
  for (const [token, where] of reads) {
    if (!hostTokens.has(token)) {
      fail('dead token', `var(${token}) — the theme publishes no such token — used by ${where.join(', ')}`)
    }
  }
  console.log(`ok   every host token the UI reads exists (${reads.size} read, ${hostTokens.size} published)`)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
