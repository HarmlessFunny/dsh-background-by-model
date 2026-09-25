/**
 * Host-contract scan — run this after a dsh upgrade.
 *
 *   pnpm bundle && node scripts/host-contract-scan.mjs [--host <dir>] [--json]
 *
 * The settings page's "Host check" tab answers the same question against the
 * RUNNING host, from the DOM, the host stylesheets and the Cordis services. This
 * answers it with no browser at all, straight from the installed files — which is
 * what makes it runnable in CI, or right after `npm i -g @deepseek-ai/dsh@latest`
 * and before anyone looks at the interface.
 *
 * It exits non-zero the moment a contract target is gone, so a host rename turns
 * into a red build instead of a support report. `src/host-contracts.ts` is the
 * single source of truth for WHAT is checked — this script only drives it, which
 * is why a newly added contract point cannot be forgotten here.
 *
 * It reads the built `lib/host-scan.js` (a node entry of its own) rather than the
 * TypeScript sources: that is the code that actually ships, and it keeps this
 * script runnable by plain `node` with no flags and no loader.
 */
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginDir = resolve(here, '..')

const exists = async (p) => { try { await readFile(p); return true } catch { return false } }

const scanPath = join(pluginDir, 'lib', 'host-scan.js')
if (!(await exists(scanPath))) {
  console.error(`contract scan: ${scanPath} is missing — run "pnpm bundle" first`)
  process.exit(2)
}
const { HOST_CONTRACTS, DSH_FLOOR, checkHostOnDisk, resolveHostRoots, meetsFloor, versionOf } =
  await import(pathToFileURL(scanPath).href)

const args = process.argv.slice(2)
const json = args.includes('--json')
const hostFlag = args.indexOf('--host')
if (hostFlag >= 0 && args[hostFlag + 1] !== undefined) {
  process.env.DAB_HOST_ROOT = args[hostFlag + 1]
}

/**
 * Every installation of the host this machine can reach.
 *
 * A contract holds when ANY of them still contains the literal, because the dsh
 * that is running may not be the one a dev checkout resolves first. The roots the
 * plugin itself would pick come first, then the two layouts this project ships
 * against (a global npm install, and a dsh profile's own node_modules).
 */
async function hostCandidates() {
  const found = []
  const push = (base, origin) => {
    base = resolve(base)
    if (!found.some(f => f.base === base)) found.push({ base, origin })
  }
  const resolved = await resolveHostRoots(pluginDir)
  if (resolved.roots !== null) push(resolved.roots.packages, 'resolved')
  // Two shipped layouts: a global npm install keeps its own `@deepseek-ai` scope
  // (`dsh` moves to its latest release each time), and the dsh version the profile
  // actually loads lives in that package's nested node_modules.
  const roots = []
  const appData = process.env.APPDATA
  if (typeof appData === 'string' && appData !== '') roots.push(join(appData, 'npm', 'node_modules', '@deepseek-ai'))
  const profileDir = process.env.DSH_PROFILE_DIR
  if (typeof profileDir === 'string' && profileDir !== '') roots.push(join(profileDir, 'node_modules', '@deepseek-ai'))
  const home = process.env.USERPROFILE ?? process.env.HOME
  if (typeof home === 'string' && home !== '') roots.push(join(home, '.dsh', 'profiles'))
  for (const root of roots) {
    push(root, 'npm scope')
    push(join(root, 'dsh', 'node_modules', '@deepseek-ai'), 'dsh nested')
  }
  return found
}

const usable = []
for (const candidate of await hostCandidates()) {
  // A scope counts only when it holds the UI plugin packages the contracts name.
  // The runtime package itself may be a sibling (`<scope>/dsh`) or absent — on a
  // global npm install the version the profile actually loads sits one level down,
  // in `<scope>/dsh/node_modules/@deepseek-ai`, where `dsh` is NOT repeated — so
  // requiring `<scope>/dsh/package.json` would reject the only real host on this
  // machine and report every contract as missing.
  if (!(await exists(join(candidate.base, 'dsh-client-ui-theme', 'lib', 'client.js')))) continue
  const named = join(candidate.base, 'dsh', 'package.json')
  const nested = join(candidate.base, 'dsh-app-boot', 'package.json')
  const manifest = (await exists(named)) ? named : ((await exists(nested)) ? nested : '')
  // The served frontend is NOT necessarily a sibling of the package scope: on a
  // global install the scope lives inside the `dsh` package, so its web frontend
  // is at `<sourceDir>/dsh-web-frontend`. Prefer wherever that package really is.
  let frontend = join(candidate.base, 'dsh-web-frontend', 'dist', 'assets')
  for (const guess of [join(dirname(candidate.base), 'dsh-web-frontend'), join(candidate.base, 'dsh', 'node_modules', '@deepseek-ai', 'dsh-web-frontend')]) {
    if (await exists(join(guess, 'dist', 'assets'))) { frontend = join(guess, 'dist', 'assets'); break }
  }
  usable.push({ ...candidate, manifest, frontend })
}

if (usable.length === 0) {
  const report = await checkHostOnDisk(pluginDir, 'en')
  console.error('contract scan: no installed dsh was found.')
  if (report.host.note !== '') console.error(`  ${report.host.note}`)
  console.error('  pass --host <dir containing @deepseek-ai/dsh-app-boot> or set DAB_HOST_ROOT')
  process.exit(2)
}

/** How one contract's sources fare in one candidate installation. */
async function checkOne(contract, candidate) {
  const bad = []
  for (const source of contract.sources) {
    const root = source.root === 'frontend' ? candidate.frontend : candidate.base
    // `.` names the root directory: the literal is searched across the script and
    // stylesheet files in it, for targets whose FILE name is not stable.
    if (source.path === '.') {
      let names = []
      try { names = await readdir(root) } catch { /* missing */ }
      let hit = ''
      for (const name of names) {
        if (!/\.(?:js|mjs|cjs|css|html|json)$/i.test(name)) continue
        try {
          if ((await readFile(join(root, name), 'utf8')).includes(source.literal)) { hit = name; break }
        } catch { /* unreadable entry */ }
      }
      if (hit === '') bad.push(`${root} — no ${JSON.stringify(source.literal)} in any asset`)
      continue
    }
    const file = source.path.startsWith('src/') ? join(pluginDir, source.path) : join(root, source.path)
    let text = null
    try { text = await readFile(file, 'utf8') } catch { /* missing */ }
    if (text === null) bad.push(`${source.path} — file missing`)
    else if (!text.includes(source.literal)) bad.push(`${source.path} — no ${JSON.stringify(source.literal)}`)
  }
  return bad
}

const rows = []
for (const contract of HOST_CONTRACTS) {
  let best = null
  for (const candidate of usable) {
    const bad = await checkOne(contract, candidate)
    if (bad.length === 0) { best = { candidate, bad: [] }; break }
    if (best === null || bad.length < best.bad.length) best = { candidate, bad }
  }
  rows.push({
    id: contract.id,
    group: contract.group,
    criticality: contract.criticality,
    target: contract.target,
    ok: best !== null && best.bad.length === 0,
    why: best === null ? ['no host found'] : best.bad,
    where: best === null ? '' : best.candidate.origin,
  })
}

const hosts = []
for (const candidate of usable) {
  const version = candidate.manifest === '' ? '' : await versionOf(dirname(candidate.manifest))
  hosts.push({ origin: candidate.origin, path: candidate.base, version, meetsFloor: meetsFloor(version, DSH_FLOOR) })
}

if (json) {
  console.log(JSON.stringify({ floor: DSH_FLOOR, hosts, contracts: rows }, null, 2))
} else {
  console.log('dsh-background-by-model — host contract scan')
  console.log(`floor: dsh >=${DSH_FLOOR}`)
  for (const h of hosts) {
    const verdict = h.meetsFloor === null ? 'unknown' : h.meetsFloor ? 'ok' : 'BELOW FLOOR'
    console.log(`host : ${h.version !== '' ? h.version : 'unreadable'}  [${verdict}]  ${h.path}`)
  }
  console.log('')
  let failed = 0
  for (const row of rows) {
    if (!row.ok) failed++
    console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.id.padEnd(30)} ${row.target}`)
    for (const why of row.why) console.log(`      > ${why}`)
  }
  console.log('')
  console.log(`${rows.length - failed}/${rows.length} contracts hold`)
}

process.exit(rows.some(r => !r.ok) ? 1 : 0)
