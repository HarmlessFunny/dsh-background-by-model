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

const { HOST_CONTRACTS, DSH_FLOOR, probeContracts, verdictOf, meetsFloor, UI_CSS } =
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
    // `on` is null for an unscoped token check (the probe reads it off the
    // document root) and the resolved element otherwise. The fixture answers from
    // its own table either way — whether a value is readable is the host's own
    // business, and that is exactly what the table stands in for.
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
 * A host that also declares every token/class/attribute rule the contracts look
 * for — a complete stylesheet fixture minus whatever a test removes.
 */
const HOST_RULES = [
  '--dsw-menu-surface-fill', '--dsw-specific-menu', '--dsw-specific-sidebar-fill',
  '--dsw-specific-input-major', '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1',
  '.dab-card', '.md-table-wide', '[data-dockkit-content]', '[data-dockkit-empty]',
  '[data-dockkit-float]', '[data-sidebar-right-open]', 'data-ds-dark-theme',
]

function hostStyles(literals = HOST_RULES) {
  return [{
    ownerNode: { dataset: {} },
    cssRules: literals.map(l => ({ cssText: `.x{color:red}/* ${l} */` })),
  }]
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

test('a dropped session service fails the model hop', () => {
  const env = hostEnv({ ctx: healthyCtx({ sessions: undefined }) })
  const results = probeContracts(env, 'en')
  assert.equal(results.find(r => r.id === 'sessions.list').status, 'fail')
  assert.equal(results.find(r => r.id === 'sessions.binding.projections').status, 'skip')
})

test('the plugin\'s own token stylesheet cannot make a host check pass', () => {
  const env = hostEnv({
    ctx: healthyCtx(),
    // The ONLY stylesheet is the plugin's own — exactly the situation that
    // produced the 0.1.7 white band while the check would have been green.
    rules: [],
  })
  env.styleSheets = () => [{
    ownerNode: { dataset: { plugin: 'dsh-background-by-model-tokens' } },
    cssRules: [{ cssText: 'body{--dsw-menu-surface-fill:red!important;--dsw-specific-menu:red!important}' }],
  }]
  const results = probeContracts(env, 'en')
  assert.equal(results.find(r => r.id === 'token.menuSurface').status, 'fail')
  assert.equal(results.find(r => r.id === 'token.menuAlias').status, 'fail')
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
