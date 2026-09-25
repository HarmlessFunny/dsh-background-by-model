/**
 * The host self-check's own tests — run with
 *
 *   pnpm test
 *
 * Three things are covered, and they are the three that can rot silently:
 *
 *  1. **The contract table holds together** — unique ids, machine-checkable
 *     sources, a known criticality, and at least one check or an explicit
 *     "documentation only" marker. A contract point added without a source would
 *     otherwise be invisible to the offline scan.
 *  2. **The probe reports what is actually there** — the whole probe is driven
 *     against a fixture written in the shape of a host DOM, so "the host renamed
 *     `--dsw-specific-menu`" produces exactly the failure the panel claims, and a
 *     surface that is merely off screen produces `n/a` rather than a false alarm.
 *  3. **The UI stylesheet, and the one piece of version logic** — every `dab-*`
 *     class a component uses is defined in it, and the floor comparison is exact
 *     on the release triple.
 *
 * The tests run against the BUILT node entries (`lib/testing.js`), not the
 * TypeScript sources: `node --test` cannot resolve extensionless relative imports
 * inside a `.ts` file, and asserting on the shipped bundle is the more honest
 * target anyway. `pnpm test` bundles first.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginDir = resolve(here, '..')
const testingPath = join(pluginDir, 'lib', 'testing.js')

const { HOST_CONTRACTS, DSH_FLOOR, probeContracts, verdictOf, meetsFloor, UI_CSS, OWN_SHEET_ATTR, OWN_SHEET_DATASET } =
  await import(pathToFileURL(testingPath).href)

const { readFile, readdir } = await import('node:fs/promises')

// ── 1. the contract table ────────────────────────────────────────────────────

test('contract ids are unique and non-empty', () => {
  const seen = new Set()
  for (const c of HOST_CONTRACTS) {
    assert.ok(c.id.length > 0, 'a contract has an empty id')
    assert.ok(!seen.has(c.id), `duplicate contract id ${c.id}`)
    seen.add(c.id)
  }
})

test('every contract is machine-checkable', () => {
  for (const c of HOST_CONTRACTS) {
    assert.ok(c.target.length > 0, `${c.id} has no target`)
    assert.ok(c.sources.length > 0, `${c.id} declares no source, so the offline scan cannot see it`)
    assert.ok(c.usedBy.length > 0, `${c.id} does not say which plugin file reads it`)
    assert.ok(['core', 'looks', 'label'].includes(c.criticality), `${c.id} has an unknown criticality`)
    assert.ok(['<=0.1.6', '0.1.7'].includes(c.since), `${c.id} has an unknown "since"`)
    for (const s of c.sources) {
      assert.ok(s.literal.length > 0, `${c.id} has a source without a literal`)
      assert.ok(!s.path.includes('\\'), `${c.id} source path must use forward slashes: ${s.path}`)
      if (s.path === '.') assert.equal(s.root, 'frontend', `${c.id}: "." only makes sense for the frontend root`)
    }
    if (c.checks.length === 0) {
      // Documentation-only entries are allowed (a legacy alias we still accept),
      // but they must be the minority and must not claim to be checkable.
      assert.ok(c.criticality !== 'core', `${c.id} is critical but has no check`)
    }
  }
})

test('critical contracts carry a check that can fail', () => {
  const critical = HOST_CONTRACTS.filter(c => c.criticality === 'core')
  assert.ok(critical.length >= 4, 'the model hop and the menu split should be critical')
  for (const c of critical) {
    assert.ok(c.checks.length > 0, `${c.id} is critical but nothing verifies it at runtime`)
  }
})

// ── 2. the probe, against a fixture in the shape of a host DOM ───────────────

/** A DOM stand-in with just enough selector support for the contract checks. */
function makeDom(host) {
  /** `selector → present`, including attribute and comma-OR forms. */
  const matches = sel => {
    for (const part of sel.split(',').map(p => p.trim())) {
      if (host.has(part)) return true
      const attr = /^\[([a-z-]+)\]$/.exec(part)
      if (attr !== null && host.has(`[${attr[1]}]`)) return true
    }
    return false
  }
  return {
    querySelector: sel => (matches(sel) ? { style: {} } : null),
    // Where the host publishes its palette: `body` in the real client, and the
    // fixture models exactly that. Reading the document element instead is what
    // made seven healthy tokens report as empty.
    tokenRoot: () => ({ style: {} }),
    // `on` is null for an unscoped token check (the probe reads it off the token
    // root) and the resolved element otherwise. The fixture answers from its own
    // table either way — whether a value is readable is the host's own business,
    // and that is exactly what the table stands in for.
    computedValue: (token, _on) => (host.get(`computed:${token}`) ?? ''),
    styleSheets: () => [],
  }
}

/** Selectors for the surfaces that are on screen in every fixture. */
const CORE_PRESENT = [
  'div[data-sidebar-right-panel]',
  'div[role="dialog"][aria-modal="true"][aria-labelledby]',
  '[data-shell-overlay]',
  '[data-composer-card]',
  '[data-cordis-panel]',
  '[data-chat-flow]',
  '[data-conversation-scroll]',
  '[data-conversation-composer-overlay]',
  '.dab-root',
  '[data-dockkit-strip]',
]

/** Every design token the contracts read; each one resolves in a healthy host. */
const PRESENT_TOKENS = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-layer-3',
  '--dsw-specific-menu',
  '--dsw-menu-surface-fill',
  '--dsw-specific-sidebar-fill',
  '--dsw-specific-input-major',
  '--dsw-alias-label-caption',
]

/**
 * The literals the HOST's stylesheets declare. The two halves of a token
 * contract ask different questions — `rule` = "does the host still declare this
 * name", `computed` = "does it resolve to a value" — so both are listed.
 */
const HOST_RULES = [
  '--dsw-menu-surface-fill', '--dsw-specific-menu', '--dsw-specific-sidebar-fill',
  '--dsw-specific-input-major', '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1',
  '--dsw-alias-label-caption',
  '.md-table-wide', '[data-dockkit-content]', '[data-dockkit-empty]',
  '[data-dockkit-float]', '[data-sidebar-right-open]', 'data-ds-dark-theme',
]

/** The one literal only THIS plugin's stylesheet declares (`.dab-card`, `side: 'own'`). */
const OWN_RULES = ['.dab-card']

/**
 * A stylesheet the probe may read.
 *
 * `own: true` writes this plugin's marker — the ONLY thing that tells our sheets
 * apart from the host's, since the host's own CSS modules set `data-plugin` on
 * theirs, so a probe keying off that skips the entire host theme.
 *
 * The fixture exposes the attribute the way a REAL element does: `getAttribute`
 * answers the dashed name, and `dataset` only the camel-cased key. Modelling this
 * wrong is how a probe that reads `dataset['data-dab-side']` passes here and
 * silently fails in a browser.
 */
function sheet(literals, own = false) {
  const attrs = {}
  const dataset = {}
  if (own) {
    attrs[OWN_SHEET_ATTR] = 'own'
    dataset[OWN_SHEET_DATASET] = 'own'
  }
  return {
    ownerNode: {
      dataset,
      getAttribute: name => (name in attrs ? attrs[name] : null),
      setAttribute: (name, value) => { attrs[name] = value },
    },
    cssRules: literals.map(l => ({ cssText: `.x{color:red}/* ${l} */` })),
  }
}

/** The host's sheets plus our own, minus whatever a test removes. */
function hostStyles(literals = HOST_RULES, ownLiterals = OWN_RULES) {
  const sheets = [sheet(literals)]
  if (ownLiterals.length > 0) sheets.push(sheet(ownLiterals, true))
  return sheets
}

/**
 * A fixture host: `selectors` are the ones that match, `rules` the literals the
 * host stylesheet declares, and every token in `PRESENT_TOKENS` resolves unless
 * the caller drops it.
 */
function hostEnv({ ctx, selectors = CORE_PRESENT, rules = HOST_RULES, tokens = PRESENT_TOKENS }) {
  // A Map, not a Set: the fixture must answer with the token's VALUE, and only a
  // Map carries one (a Set has no `get`).
  const host = new Map()
  for (const s of selectors) host.set(s, true)
  for (const t of tokens) host.set(`computed:${t}`, '#123456')
  return { ...makeDom(host), styleSheets: () => hostStyles(rules), ctx }
}

/** The healthy fixture: nothing missing, every service published. */
const healthyEnv = () => hostEnv({ ctx: healthyCtx() })

/** A context publishing the four services the model hop needs. */
function healthyCtx(overrides = {}) {
  const face = { subscribe: () => () => {}, getSnapshot: () => ({}) }
  const services = {
    sessions: { list: face, binding: () => ({}) },
    uiSession: { current: face },
    modelDirectories: { directoryFor: () => ({ store: face }) },
    ...overrides,
  }
  return { get: id => services[id] }
}

test('a healthy host passes every contract', () => {
  const results = probeContracts(healthyEnv(), 'en')
  const failed = results.filter(r => r.status === 'fail')
  assert.deepEqual(failed.map(r => r.id), [], `unexpected failures: ${failed.map(r => `${r.id}: ${r.reason}`).join('; ')}`)
  assert.equal(verdictOf({ results, summary: { pass: results.length, fail: 0, skip: 0, total: results.length } }), 'ok')
})

test('a renamed menu token fails exactly that contract, and names the symptom', () => {
  // The 0.1.8 rename: the host stops declaring the token the sticky group
  // headings paint from. Everything else still answers.
  const env = hostEnv({ ctx: healthyCtx(), rules: HOST_RULES.filter(l => l !== '--dsw-menu-surface-fill') })
  const results = probeContracts(env, 'en')
  const failed = results.filter(r => r.status === 'fail').map(r => r.id)
  assert.deepEqual(failed, ['token.menuSurface'])
  const row = results.find(r => r.id === 'token.menuSurface')
  assert.match(row.reason, /--dsw-menu-surface-fill/)
  assert.match(row.symptom, /solid band|white band|sticky/i)
})

test('a renamed token the host still aliases is caught by the rule half', () => {
  // The 0.1.7 menu split in reverse: the host keeps the OLD name working (aliased)
  // but stops declaring the new one. `computed` still answers — which is exactly
  // how that bug stayed silent — so the `rule` half is the only thing that can
  // tell "renamed" from "still there".
  const env = hostEnv({
    ctx: healthyCtx(),
    rules: HOST_RULES.filter(l => l !== '--dsw-menu-surface-fill'),
  })
  const results = probeContracts(env, 'en')
  const row = results.find(r => r.id === 'token.menuSurface')
  assert.equal(row.status, 'fail')
  // The computed half would have passed: the token still resolves a value.
  assert.match(row.detail, /host stylesheet includes/)
})

test('a host that stops publishing the palette fails the computed half', () => {
  // The other failure shape: the name is still declared somewhere, but body no
  // longer carries a value — the case that made 7 healthy tokens look empty when
  // the probe read the wrong element.
  const env = hostEnv({
    ctx: healthyCtx(),
    tokens: PRESENT_TOKENS.filter(t => t !== '--dsw-alias-bg-base'),
  })
  const results = probeContracts(env, 'en')
  const row = results.find(r => r.id === 'token.bgBase')
  assert.equal(row.status, 'fail')
  assert.match(row.reason, /--dsw-alias-bg-base/)
})

test('a dropped session service fails the model hop', () => {
  const env = hostEnv({ ctx: healthyCtx({ sessions: undefined }) })
  const results = probeContracts(env, 'en')
  assert.equal(results.find(r => r.id === 'sessions.list').status, 'fail')
  assert.equal(results.find(r => r.id === 'sessions.binding.projections').status, 'skip')
})

test('the plugin\'s own token stylesheet cannot make a host check pass', () => {
  // The situation that produced the 0.1.7 white band: the plugin re-emits the
  // menu fill itself, so its own sheet declares the token. That re-emission must
  // never be accepted as evidence about the HOST — otherwise the check is green
  // by construction on exactly the host where the token was renamed away.
  const env = hostEnv({
    ctx: healthyCtx(),
    // The host sheet is readable but has moved on: it no longer declares the
    // menu fill under this name.
    rules: [],
  })
  env.styleSheets = () => [
    sheet([]), // the host's own, readable, declaring nothing
    sheet(['--dsw-menu-surface-fill', '--dsw-specific-menu', '.dab-card'], true),
  ]
  const results = probeContracts(env, 'en')
  const byId = id => results.find(r => r.id === id)
  assert.equal(byId('token.menuSurface').status, 'fail')
  assert.match(byId('token.menuSurface').reason, /no host stylesheet declares/)
  assert.equal(byId('token.menuAlias').status, 'fail')
  // …while the contract whose other half IS our own sheet still passes: this is
  // what `side: 'own'` is for, and why the two sides must never be merged.
  assert.equal(byId('settings.card').status, 'pass')
})

test('a host sheet carrying data-plugin is not mistaken for ours', () => {
  // Regression for the probe bug that reported 7 healthy tokens as renamed: the
  // host's CSS modules ALSO set `data-plugin` on their <style> elements, so a
  // probe that skips "sheets with data-plugin" skips the host's whole theme.
  const hostSheet = sheet(['--dsw-alias-bg-base'])
  hostSheet.ownerNode.dataset.plugin = '@deepseek-ai/dsh-client-ui-theme'
  const env = hostEnv({ ctx: healthyCtx(), rules: [] })
  env.styleSheets = () => [hostSheet]
  const results = probeContracts(env, 'en')
  assert.equal(results.find(r => r.id === 'token.bgBase').status, 'pass')
})

test('a surface that is merely off screen is n/a, not a failure', () => {
  // The app frame and every service are up (the settings section is rendered
  // inside the frame, so the frame is always there) — but the conversation view,
  // the right panel and the Cordis panel are not. Nothing is broken; those
  // surfaces simply are not there to observe.
  const env = hostEnv({
    ctx: healthyCtx(),
    selectors: ['.dab-root', 'div[role="dialog"][aria-modal="true"][aria-labelledby]', '[data-shell-overlay]'],
  })
  const results = probeContracts(env, 'en')
  const byId = id => results.find(r => r.id === id)
  assert.equal(byId('chat.flow').status, 'skip')
  assert.equal(byId('conversation.scroll').status, 'skip')
  assert.equal(byId('trajectory.root').status, 'skip')
  assert.equal(byId('rightbar.panel').status, 'skip')
  assert.equal(byId('cordis.panel').status, 'skip')
  assert.equal(byId('composer.card').status, 'skip')
  assert.equal(byId('settings.dialog').status, 'pass')
  assert.deepEqual(results.filter(r => r.status === 'fail').map(r => r.id), [])
})

test('a mounted but marker-less surface is a failure, not n/a', () => {
  // The dialog is open, so the right panel's anchor is off screen — but the
  // dialog's own selector still matches. A surface whose anchor IS on screen and
  // whose selector is not is a rename, and must not read as "not observable".
  const env = hostEnv({
    ctx: healthyCtx(),
    // The dock chrome is mounted (the panel container exists) but the panel
    // attribute the contract names is gone.
    selectors: ['.dab-root', '[data-dockkit-strip]'],
  })
  const results = probeContracts(env, 'en')
  const byId = id => results.find(r => r.id === id)
  assert.equal(byId('rightbar.panel').status, 'fail')
  assert.match(byId('rightbar.panel').reason, /data-sidebar-right-panel/)
  assert.equal(byId('chat.flow').status, 'skip')
})

// ── 3. the settings UI's own stylesheet ──────────────────────────────────────

test('every dab-* class a component uses is defined in the UI stylesheet', async () => {
  const dir = join(pluginDir, 'src', 'client')
  const files = []
  const walk = async d => {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const p = join(d, entry.name)
      if (entry.isDirectory()) await walk(p)
      else if (entry.name.endsWith('.tsx')) files.push(p)
    }
  }
  await walk(dir)
  assert.ok(files.length > 0, 'no component sources found')

  const missing = []
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    for (const m of text.matchAll(/(?<![\w-])dab-[a-z0-9-]+/g)) {
      const cls = m[0]
      // `--dab-mono` and friends are this plugin's own CSS VARIABLES, not classes.
      if (text.slice(Math.max(0, m.index - 2), m.index) === '--') continue
      if (UI_CSS.includes(`.${cls}`)) continue
      if (missing.some(x => x.cls === cls && x.file === file)) continue
      missing.push({ cls, file: file.slice(pluginDir.length + 1) })
    }
  }
  assert.deepEqual(missing, [], `classes used but never styled: ${missing.map(m => `${m.cls} (${m.file})`).join(', ')}`)
})

// ── 4. the floor comparison ──────────────────────────────────────────────────

test('the floor comparison is coarse on purpose and exact on the triple', () => {
  assert.equal(meetsFloor('0.1.7-rc.2', DSH_FLOOR), true, 'the floor itself satisfies the floor')
  assert.equal(meetsFloor('0.1.7', DSH_FLOOR), true)
  assert.equal(meetsFloor('0.2.0', DSH_FLOOR), true)
  assert.equal(meetsFloor('1.0.0', DSH_FLOOR), true)
  assert.equal(meetsFloor('0.1.6', DSH_FLOOR), false)
  assert.equal(meetsFloor('0.1.0', DSH_FLOOR), false)
  assert.equal(meetsFloor('not-a-version', DSH_FLOOR), null)
})
