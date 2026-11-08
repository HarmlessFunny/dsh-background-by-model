/**
 * Checks the plugin's own DISPLAY METADATA — `pnpm check:meta`.
 *
 * What the plugin manager and the settings pages show for this package comes from
 * `readPluginMeta` (@deepseek-ai/dsh-app-boot), and its answer is assembled from
 * three places that are easy to get wrong in three different ways, none of which
 * produces an error anywhere:
 *
 *   1. **`locale/<language>.json`** — `meta.title` and `meta.description`. Absent,
 *      the manager falls back to `package.json`'s `name` and `description`, so the
 *      row reads as a technical package name and the npm blurb.
 *   2. **`exports`** — the files are read through the real Node ESM resolver, so a
 *      locale file that is on disk but not exported resolves to NOTHING and is
 *      silently treated as absent. `optionalResourcePath` answers `undefined` for
 *      a missing resource; it does not distinguish "no such file" from "not
 *      exported".
 *   3. **`files`** — the tarball only carries what this lists. Everything above can
 *      be perfect in the repository and still be missing from the published
 *      package, and the failure looks exactly like (1).
 *
 * The icon is the fourth: `package.json`'s `icon` (or an exported `./icon`), kept
 * inside the package directory, SVG/PNG/JPEG/WebP, at most 256 KiB.
 *
 * So this asserts the SOURCE shapes — the files exist, they are exported, they are
 * packed, the icon is inside the size and type limits — and then, when the
 * harness is installed, asks `readPluginMeta` itself what it would display. The
 * second half is the one that cannot lie: it is the same function the UI calls.
 *
 * Runs on plain `node` (≥ 22.6 strips the types itself), no dependency, no
 * transform — the same shape as `scripts/store-check.ts`. The harness import is
 * optional on purpose: this check must pass in a checkout where dsh is not
 * installed next door.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
  name: string
  description?: string
  icon?: string
  exports?: Record<string, unknown>
  files?: string[]
}

let failures = 0
function assert(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

// ── 1. the locale files, and what they must contain ────────────────────────
console.log('--- the display text lives in locale/<language>.json ---')
const localeDir = resolve(ROOT, 'locale')
assert('locale/ exists', existsSync(localeDir))
/** Whichever the check needs: a language id, lowercased. */
const languageIds = ['en', 'zh']
for (const id of languageIds) {
  const file = resolve(localeDir, `${id}.json`)
  if (!existsSync(file)) { assert(`locale/${id}.json exists`, false); continue }
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { meta?: Record<string, unknown> }
  const meta = parsed.meta
  assert(`locale/${id}.json declares meta`, typeof meta === 'object' && meta !== null)
  const title = meta?.title
  const description = meta?.description
  // `textOf` in the reader rejects an empty or whitespace-only string outright,
  // so a blank value is not "no title" — it is a package that fails to describe
  // itself at the one moment it is asked to.
  assert(`and a non-empty title`, typeof title === 'string' && title.trim() !== '', JSON.stringify(title))
  assert(`and a non-empty description`,
    typeof description === 'string' && description.trim() !== '', JSON.stringify(description))
}
// English is what every other language falls back to, so its absence degrades
// every locale, not just `en`.
assert('English is present, because it is the fallback for every other language',
  existsSync(resolve(localeDir, 'en.json')))
// The npm blurb is long on purpose and must stay that way: the locale texts are
// for a 36-pixel card, the manifest description is for the registry page.
assert('the manifest keeps its own (longer) npm description, separate from the card text',
  typeof manifest.description === 'string' && manifest.description.length > 120,
  `${(manifest.description ?? '').length} chars`)

// ── 2. exports: on disk is not the same as resolvable ──────────────────────
console.log('\n--- the locale files are EXPORTED, or the resolver cannot see them ---')
const exportsMap = manifest.exports ?? {}
// The reader asks for `<specifier>/locale/<file>.json`, which needs exactly this
// subpath pattern. A bare directory export does not satisfy it.
assert('exports declares ./locale/*.json',
  Object.prototype.hasOwnProperty.call(exportsMap, './locale/*.json'),
  Object.keys(exportsMap).join(', '))

// ── 3. files: the tarball carries them ─────────────────────────────────────
console.log('\n--- and the tarball carries them ---')
const files = manifest.files ?? []
assert('files lists locale/*.json', files.includes('locale/*.json'), files.join(', '))
assert('files lists the icon', files.includes('icon.svg'), files.join(', '))

// ── 4. the icon ────────────────────────────────────────────────────────────
console.log('\n--- the icon is a real, small, in-package picture ---')
const iconSpec = manifest.icon
assert('package.json declares an icon', typeof iconSpec === 'string', JSON.stringify(iconSpec))
if (typeof iconSpec === 'string') {
  // The reader refuses an absolute path or a URL outright: an icon is a file in
  // the package, not an address.
  assert('the icon is a relative path', !iconSpec.startsWith('/') && !/^[A-Za-z][A-Za-z\d+.-]*:/.test(iconSpec), iconSpec)
  const iconPath = resolve(ROOT, iconSpec)
  assert('the icon file exists', existsSync(iconPath), iconPath)
  // Staying inside the package is checked by the reader with realpath, so a
  // symlink out would be refused there; asserting the prefix catches the plain
  // case at the point it is written.
  assert('and it stays inside the package', !iconPath.startsWith(dirname(ROOT) + '/') || iconPath.startsWith(ROOT + '/'))
  const MEDIA = new Map([['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp']])
  const mediaType = MEDIA.get(extname(iconPath).toLowerCase())
  assert('and is SVG, PNG, JPEG or WebP', mediaType !== undefined, basename(iconPath))
  if (existsSync(iconPath)) {
    const stat = statSync(iconPath)
    // 256 KiB is the reader's own ceiling; going over it turns the metadata read
    // into an error state on the very card the icon was added to improve.
    assert('and is a regular file under 256 KiB', stat.isFile() && stat.size <= 256 * 1024, `${stat.size} bytes`)
    if (extname(iconPath).toLowerCase() === '.svg') {
      const svg = readFileSync(iconPath, 'utf8')
      // A viewBox is what makes it scale to the 30 px and 36 px slots instead of
      // being clipped or letterboxed; without one an SVG has no size at all here.
      assert('the SVG carries a 36x36 viewBox like the built-in artwork', /viewBox="0 0 36 36"/.test(svg))
      // Self-contained: the reader only ever hands the UI the file's own bytes as
      // a data URI, so anything it references externally cannot load.
      assert('and references nothing outside itself',
        !/xlink:href|<image\b|url\((?!#)/.test(svg.replace(/xmlns(:xlink)?="http:\/\/www\.w3\.org\/[^"]*"/g, '')))
    }
  }
}

// ── 5. ask the real resolver, when the harness is installed ────────────────
console.log('\n--- what readPluginMeta would show for this package ---')
const verified = await (async (): Promise<boolean> => {
  let boot: { readPluginMeta?: (specifier: string, parentURL: string) => unknown }
  try {
    boot = (await import('@deepseek-ai/dsh-app-boot')) as typeof boot
  } catch {
    console.log('skip  the harness is not importable from here; the source shapes above still stand')
    return false
  }
  if (typeof boot.readPluginMeta !== 'function') {
    console.log('skip  this harness build does not export readPluginMeta')
    return false
  }
  const meta = boot.readPluginMeta(manifest.name, pathToFileURL(resolve(ROOT, 'package.json')).href) as
    { title?: unknown; description?: unknown; icon?: unknown; error?: unknown } | undefined
  assert('the resolver answers for this package', meta !== undefined, JSON.stringify(meta))
  if (meta === undefined) return true
  assert('and reports no diagnostic', meta.error === undefined, String(meta.error))
  // This is the assertion the whole file exists for: a localized STRING MAP, not
  // the package name. The fallback is what the card showed before.
  const title = meta.title as Record<string, string> | undefined
  assert('the title is a localized map, not the bare package name',
    typeof title === 'object' && title !== null && title.zh !== undefined && title.zh !== manifest.name,
    JSON.stringify(title))
  const description = meta.description as Record<string, string> | undefined
  assert('the description follows the interface language',
    typeof description === 'object' && description !== null && description.zh !== undefined,
    JSON.stringify(description))
  assert('and the icon reached the UI as a data URI',
    typeof meta.icon === 'string' && meta.icon.startsWith('data:image/'),
    typeof meta.icon === 'string' ? meta.icon.slice(0, 32) : String(meta.icon))
  return true
})()

if (!verified) {
  // Nothing to add: the shape assertions above are the ones that fail in a
  // contributor's checkout, and the resolver half only adds confirmation.
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
