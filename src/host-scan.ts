/**
 * The node half of the host self-check: what the INSTALLED dsh looks like on disk.
 *
 * The browser probe (../client/judge.ts) answers "does the running host still
 * provide this", which is the question a user needs answered. This module answers
 * the complementary one — "does the copy of dsh on this machine still contain the
 * thing we depend on" — and it can do it with no browser, no DOM and no session,
 * which makes it the half that runs in CI:
 *
 *   node .dsh-debug/contract-scan.mjs
 *
 * For every declaration in ../host-contracts it
 *   1. reports whether the owning host file exists at all (a package that was
 *      renamed or dropped answers here before anything reaches the screen), and
 *   2. reports whether that file still contains the literal the plugin depends
 *      on — the check that turns a silent 0.1.8 rename into a red line.
 *
 * It also reads the host's own version from the app-boot manifest, so the panel
 * can show it and can say plainly when the runtime is older than this plugin's
 * declared floor.
 */
import { access, readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HOST_CONTRACTS, labelOf, symptomOf, DSH_FLOOR } from './host-contracts'
import type { ContractResult, HostReport, Lang } from './host-contracts'

// Re-exported so `lib/host-scan.js` is a single import surface for the offline
// scan (scripts/host-contract-scan.mjs): the table it checks and the floor it
// compares against travel with the checker.
export { HOST_CONTRACTS, DSH_FLOOR }
export type { Lang }

/** The two roots every `ContractSource` path is resolved against. */
export interface HostRoots {
  /** `<dsh>/node_modules/@deepseek-ai`. */
  packages: string
  /** `<dsh>/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets`. */
  frontend: string
  /** The `@deepseek-ai/dsh` package itself (its `package.json` carries the version). */
  dsh: string
}

/** How a host root was located, for the report. */
export interface ResolvedHost {
  roots: HostRoots | null
  /** `''` when a root was found, otherwise why it was not. */
  note: string
  /** Absolute paths that were tried, in order. */
  tried: string[]
}

const exists = async (p: string): Promise<boolean> => {
  try { await access(p); return true } catch { return false }
}

/** Read a package's manifest version. */
export async function versionOf(pkgDir: string): Promise<string> {
  try {
    const raw = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8')) as { version?: unknown }
    return typeof raw.version === 'string' ? raw.version : ''
  } catch {
    return ''
  }
}

/** Trim a `semver` build/prerelease down to the release triple for the floor test. */
function releaseTriple(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v)
  if (m === null) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/**
 * Is `version` at or above `floor`?
 *
 * Deliberately coarse: this is the panel's advisory "your dsh is older than what
 * this plugin asks for" hint. The host's own gate is `peerDependencies` evaluated
 * with `semver.satisfies(..., { includePrerelease: true })` — a prerelease pair
 * like the floor itself compares equal here rather than being judged by semver's
 * prerelease ordering rules, which would call `0.1.7-rc.2 >= 0.1.7-rc.2` true but
 * `0.1.7-rc.10` below `0.1.7-rc.2` (string vs numeric ordering) and produce a
 * baffling red line.
 */
export function meetsFloor(version: string, floor: string): boolean | null {
  const a = releaseTriple(version)
  const b = releaseTriple(floor)
  if (a === null || b === null) return null
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!
  }
  return true
}

/** The candidate module roots, nearest first. */
function candidateBases(): string[] {
  const bases: string[] = []
  if (process.env.DAB_HOST_ROOT !== undefined && process.env.DAB_HOST_ROOT !== '') {
    bases.push(resolve(process.env.DAB_HOST_ROOT))
  }
  // The entry script of a dsh process is deep inside the installation that
  // provides app-boot; a plugin installed alongside it resolves from there.
  const argv1 = process.argv[1]
  if (typeof argv1 === 'string' && argv1 !== '') {
    bases.push(dirname(resolve(argv1)))
    bases.push(resolve(dirname(resolve(argv1)), '..'))
  }
  return bases
}

/**
 * Locate the installed host packages.
 *
 * Tried in order: an explicit `DAB_HOST_ROOT`, module resolution from the running
 * dsh process's entry script, then a walk up from this plugin's own directory (the
 * plugin sits inside `<profile>/node_modules`, whose parent dsh installation is
 * the one that loaded it). Every attempt is recorded so a miss can be reported
 * instead of guessed at.
 */
export async function resolveHostRoots(pluginDir: string): Promise<ResolvedHost> {
  const tried: string[] = []
  const check = async (base: string): Promise<boolean> => {
    tried.push(base)
    return await exists(join(base, '@deepseek-ai', 'dsh-app-boot', 'package.json'))
  }

  // 1/2 — explicit override, then the running process's own installation.
  for (const base of candidateBases()) {
    for (const candidate of [base, join(base, 'node_modules'), join(base, '..', 'node_modules')]) {
      const normalized = resolve(candidate)
      if (await check(normalized)) return { roots: rootOf(normalized), note: '', tried }
    }
  }

  // 3 — module resolution from the plugin itself (covers a hoisted install where
  // the plugin lives inside the same node_modules tree as dsh).
  for (const from of [join(pluginDir, 'lib', 'index.js'), join(pluginDir, 'src', 'index.ts')]) {
    try {
      const req = createRequire(from)
      const manifest = req.resolve('@deepseek-ai/dsh/package.json')
      const base = dirname(dirname(manifest))
      if (await check(base)) return { roots: rootOf(base), note: '', tried }
    } catch {
      // not resolvable from here — fall through to the walk-up
    }
  }

  // 4 — walk up looking for a scope dir that holds the host packages.
  let dir = resolve(pluginDir)
  for (let depth = 0; depth < 8; depth++) {
    const base = join(dir, 'node_modules')
    if (await check(resolve(base))) return { roots: rootOf(resolve(base)), note: '', tried }
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }

  return {
    roots: null,
    note: 'the installed dsh packages were not found from this plugin; set DAB_HOST_ROOT to the node_modules directory that holds @deepseek-ai/dsh-app-boot',
    tried,
  }
}

/** Derive every root from a validated `<...>/node_modules` base. */
function rootOf(base: string): HostRoots {
  const packages = join(base, '@deepseek-ai')
  return {
    packages,
    // Sources under `root: 'frontend'` name a file inside the SERVED frontend
    // bundle directory, which dsh keeps next to the scope it loads the UI plugins
    // from. `checkSource` re-resolves it through the package's own `exports`, so
    // this fallback only matters on a layout that does not publish one.
    frontend: join(packages, 'dsh-web-frontend', 'dist', 'assets'),
    dsh: join(packages, 'dsh'),
  }
}

/** One source's verdict. */
interface SourceVerdict {
  path: string
  literal: string
  status: 'pass' | 'fail'
  detail: string
}

/**
 * Search a directory (not recursively) for a literal.
 *
 * Used by sources whose `path` is `.`: the frontend's asset filenames carry
 * content hashes, so the check is "is this literal still served", not "is this
 * exact file still there". Text-ish files only — a literal cannot appear in a
 * font or an image, and reading 20 of them would only slow the probe down.
 */
async function directoryMentions(dir: string, literal: string): Promise<{ ok: boolean; detail: string }> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return { ok: false, detail: 'directory missing' }
  }
  const searched: string[] = []
  for (const name of names) {
    if (!/\.(?:js|mjs|cjs|css|html|json)$/i.test(name)) continue
    searched.push(name)
    try {
      if ((await readFile(join(dir, name), 'utf8')).includes(literal)) {
        return { ok: true, detail: `found in ${name}` }
      }
    } catch {
      // unreadable entry — the remaining files still answer
    }
  }
  return { ok: false, detail: searched.length === 0 ? 'no script or stylesheet in the directory' : `not in any of ${searched.length} file(s)` }
}

async function checkSource(
  source: { path: string; root?: 'frontend'; literal: string },
  roots: HostRoots,
  pluginDir: string,
): Promise<SourceVerdict> {
  // A `src/…` path names a file of THIS plugin (the one contract whose host side
  // is the plugin's own stylesheet — the settings-card class it shares with the
  // dialog's option panels). Everything else is relative to a host root.
  const root = source.root === 'frontend' ? roots.frontend : roots.packages
  if (source.path === '.') {
    const { ok, detail } = await directoryMentions(root, source.literal)
    return { path: `${root} (*)`, literal: source.literal, status: ok ? 'pass' : 'fail', detail }
  }
  const file = source.path.startsWith('src/') ? join(pluginDir, source.path) : join(root, source.path)
  if (!(await exists(file))) {
    return { path: source.path, literal: source.literal, status: 'fail', detail: 'file missing' }
  }
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (e) {
    return { path: source.path, literal: source.literal, status: 'fail', detail: `unreadable: ${e instanceof Error ? e.message : String(e)}` }
  }
  return text.includes(source.literal)
    ? { path: source.path, literal: source.literal, status: 'pass', detail: 'literal present' }
    : { path: source.path, literal: source.literal, status: 'fail', detail: `literal ${JSON.stringify(source.literal)} no longer present` }
}

/**
 * Scan the installed host against every contract declaration.
 *
 * `lang` only selects the label/symptom language of the returned rows.
 */
export async function checkHostOnDisk(
  pluginDir: string,
  lang: Lang,
): Promise<HostReport> {
  const resolved = await resolveHostRoots(pluginDir)
  const roots = resolved.roots
  const version = roots === null ? '' : await versionOf(roots.dsh)
  const compatible = version === '' ? null : meetsFloor(version, DSH_FLOOR)

  const results: ContractResult[] = []
  for (const c of HOST_CONTRACTS) {
    const base: Omit<ContractResult, 'status' | 'detail'> = {
      id: c.id,
      label: labelOf(c, lang),
      symptom: symptomOf(c, lang),
      target: c.target,
      sources: c.sources,
      usedBy: c.usedBy,
      checks: [],
    }
    if (roots === null) {
      results.push({ ...base, status: 'skip', detail: resolved.note })
      continue
    }
    const verdicts: SourceVerdict[] = []
    for (const source of c.sources) verdicts.push(await checkSource(source, roots, pluginDir))
    const failed = verdicts.find(v => v.status === 'fail')
    base.checks = verdicts.map(v => `${v.status} · ${v.path} — ${v.detail}`)
    if (failed === undefined) {
      results.push({ ...base, status: 'pass', detail: `${verdicts.length} file(s) checked` })
      continue
    }
    results.push({
      ...base,
      status: 'fail',
      detail: `${failed.path} — ${failed.detail}`,
      reason: lang === 'zh'
        ? `宿主文件里已经找不到 ${failed.literal}（${failed.path}）`
        : `the host no longer contains ${failed.literal} (${failed.path})`,
    })
  }

  const pass = results.filter(r => r.status === 'pass').length
  const fail = results.filter(r => r.status === 'fail').length
  const skip = results.filter(r => r.status === 'skip').length
  return {
    phase: 'node',
    at: new Date().toISOString(),
    plugin: { version: '', floor: DSH_FLOOR },
    host: {
      version,
      compatible,
      node: process.version,
      root: roots?.dsh ?? '',
      note: resolved.note,
      model: undefined,
    },
    results,
    summary: { pass, fail, skip, total: results.length },
  }
}

/** Absolute directory of this plugin — the anchor both halves resolve the host from. */
export function thisPluginDir(importMetaUrl: string): string {
  return resolve(dirname(fileURLToPath(importMetaUrl)), '..')
}

/** Every host package directory found under a root (used by the scan's summary). */
export async function listHostPackages(roots: HostRoots): Promise<string[]> {
  try {
    const entries = await readdir(roots.packages, { withFileTypes: true })
    return entries.filter(e => e.isDirectory() && e.name.startsWith('dsh')).map(e => e.name).sort()
  } catch {
    return []
  }
}
