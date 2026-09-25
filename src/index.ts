/**
 * Node half of dsh-background-by-model: file-backed rule persistence.
 *
 * Owns the `~/.dsh/.dsh-background-by-model-data/` store and exposes a small RPC
 * surface on the dedicated `/dsh-background-by-model` channel (never the shared
 * `/api`, so slash commands stay intact).
 *
 *   theme-config.json   the ordered rule list + the global interface settings
 *   modelbg-<slot>      one background image per rule (raw bytes, no extension;
 *                       the MIME is sniffed from the magic bytes when served)
 *
 * Images travel as data URLs over the RPC channel — there is no separate HTTP
 * image route. A legacy single-wallpaper / video-background store is migrated
 * to rule 1 on first read.
 */
import { access, mkdir, readFile, writeFile, rm, rename, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
// The persisted shape lives in ./schema, shared verbatim with the browser half.
import { SLOT_RE, normalizeConfig } from './schema'
import type { BgState, ThemeConfig } from './schema'
// The installed-host scan behind the settings page's "Host check" tab. It shares
// the contract table with the browser probe, so the two halves can never disagree
// about what this plugin depends on.
import { checkHostOnDisk } from './host-scan'
import type { HostReport } from './host-contracts'

export const name = 'dsh-background-by-model'
export const inject = ['connection', 'webServer']

const DATA_DIR = '.dsh-background-by-model-data'
const CONFIG_FILE = 'theme-config.json'
const IMAGE_PREFIX = 'modelbg-'
// Files owned by earlier versions (the single wallpaper slot, a background
// video and its upload temp); removed by the one-shot legacy migration.
const LEGACY_WALLPAPER = 'wallpaper.jpg'
const LEGACY_FILES = [
  'wallpaper.mp4', 'wallpaper.webm', 'wallpaper.ogv', 'wallpaper.mov',
  'wallpaper.mkv', 'wallpaper.video', 'wallpaper.upload.tmp',
]
// Network-URL wallpaper fetch: cap the download and time it out so a bad link
// can't stall the UI or fill the drive.
const WALLPAPER_FETCH_MAX = 25 * 1024 * 1024
const WALLPAPER_FETCH_TIMEOUT = 20_000

// The config shape, its defaults and its sanitizers are shared with the browser
// half — see ./schema, the module that keeps the two halves from drifting.

const dataDir = (): string => dshHomePath(DATA_DIR)
const configPath = (): string => dshHomePath(DATA_DIR, CONFIG_FILE)
const legacyWallpaperPath = (): string => dshHomePath(DATA_DIR, LEGACY_WALLPAPER)
const imagePath = (slot: string): string => dshHomePath(DATA_DIR, `${IMAGE_PREFIX}${slot}`)

const exists = async (p: string): Promise<boolean> => { try { await access(p); return true } catch { return false } }

/**
 * One-shot migration of the pre-0.3 store.
 *
 * Anything without a `rules` array is an old config: its single wallpaper
 * becomes rule 1 (`m1`, empty match = pure fallback) carrying the old color,
 * layout mode, opacity, blur and framing, and the remaining legacy files
 * (background video, upload temp) are removed. Idempotent: the rewritten config
 * carries `rules`, so the next read short-circuits.
 */
async function migrateLegacy(raw: unknown): Promise<unknown> {
  const r = (raw ?? {}) as Record<string, unknown>
  if (Array.isArray(r.rules)) return r
  const hasWallpaper = await exists(legacyWallpaperPath())
  if (Object.keys(r).length === 0 && !hasWallpaper) return { rules: [] }

  if (hasWallpaper) {
    const target = imagePath('m1')
    try {
      // Windows rename refuses to overwrite (EEXIST): drop the target first.
      await rm(target, { force: true })
      await rename(legacyWallpaperPath(), target)
    } catch (e) {
      console.warn('dsh-background-by-model: could not adopt the legacy wallpaper', e)
    }
  }
  for (const f of LEGACY_FILES) {
    try { await rm(dshHomePath(DATA_DIR, f), { force: true }) } catch { /* best effort */ }
  }

  const next = {
    rules: [{
      id: 'm1',
      slot: 'm1',
      match: '',
      enabled: true,
      color: Array.isArray(r.color) ? r.color : null,
      bgMode: typeof r.bgMode === 'string' ? r.bgMode : 'fit',
      wallpaperOpacity: typeof r.wallpaperOpacity === 'number' ? r.wallpaperOpacity : 1,
      blur: typeof r.blur === 'number' ? r.blur : 0,
      bgState: (r.bgState ?? {}) as Partial<BgState>,
    }],
    opacities: r.opacities,
    blurs: r.blurs,
    settingsOpacity: r.settingsOpacity,
    chatTextOpacity: r.chatTextOpacity,
    trajectoryOpacity: r.trajectoryOpacity,
    rightbarOpacity: r.rightbarOpacity,
  }
  try {
    await writeFile(configPath(), JSON.stringify(next, null, 2), 'utf8')
  } catch (e) {
    console.warn('dsh-background-by-model: could not rewrite the migrated config', e)
  }
  return next
}

async function ensureDir(): Promise<void> {
  try {
    await mkdir(dataDir(), { recursive: true })
  } catch (e) {
    console.warn(`dsh-background-by-model: cannot create data dir "${dataDir()}"`, e)
  }
}

async function readConfig(): Promise<ThemeConfig> {
  await ensureDir()
  let raw: unknown = {}
  try {
    raw = JSON.parse(await readFile(configPath(), 'utf8'))
  } catch {
    // First run (no file yet) or unreadable config — fall back to defaults.
    raw = {}
  }
  return normalizeConfig(await migrateLegacy(raw))
}

// ── Two-half drift guard ───────────────────────────────────────────────────
// The shape lives in ./schema now, so this can only fire when one half adds a
// field the shared shape does not declare yet (a half-built edit, a stale
// bundle, or a hand-edited JSON). Without it the sanitizer drops the field
// silently: the slider stays live in memory, the disk copy loses it, and the
// next load quietly falls back to the default. Warn once per key so the drift
// shows up in the host log instead.
const LEGACY_CONFIG_KEYS = new Set(['color', 'bgMode', 'wallpaperOpacity', 'blur', 'bgState'])
const warnedConfigKeys = new Set<string>()

function warnUnknownConfigKeys(raw: unknown, normalized: ThemeConfig): void {
  if (raw === null || typeof raw !== 'object') return
  const r = raw as Record<string, unknown>
  const warned = (id: string): void => {
    if (warnedConfigKeys.has(id)) return
    warnedConfigKeys.add(id)
    console.warn(`dsh-background-by-model: ignoring unknown config field "${id}" (declared in one half only?)`)
  }
  // The normalized object IS the authoritative key set — it is what the
  // sanitizer in ./schema emits, so no second list can fall behind.
  const known = new Set(Object.keys(normalized))
  for (const key of Object.keys(r)) {
    // Pre-0.3 top-level fields: migrateLegacy turns them into rule 1.
    if (!known.has(key) && !LEGACY_CONFIG_KEYS.has(key)) warned(key)
  }
  const groups: Array<[string, object]> = [['blurs', normalized.blurs], ['opacities', normalized.opacities]]
  for (const [group, have] of groups) {
    const got = r[group]
    if (got === null || typeof got !== 'object') continue
    const keys = new Set(Object.keys(have))
    for (const key of Object.keys(got as Record<string, unknown>)) {
      if (!keys.has(key)) warned(`${group}.${key}`)
    }
  }
  // Rule fields drift the same way; every rule goes through one sanitizer, so
  // comparing the first sent rule with the first normalized one is enough.
  const sent = Array.isArray(r.rules) ? r.rules[0] : undefined
  const have = normalized.rules[0]
  if (sent !== null && typeof sent === 'object' && have !== undefined) {
    const keys = new Set(Object.keys(have))
    for (const key of Object.keys(sent as Record<string, unknown>)) {
      if (!keys.has(key)) warned(`rules[].${key}`)
    }
  }
}

async function writeConfig(config: unknown): Promise<boolean> {
  await ensureDir()
  try {
    const normalized = normalizeConfig(config)
    warnUnknownConfigKeys(config, normalized)
    await writeFile(configPath(), JSON.stringify(normalized, null, 2), 'utf8')
    return true
  } catch (e) {
    console.error(`dsh-background-by-model: failed to write "${CONFIG_FILE}"`, e)
    return false
  }
}

/** Sniff an image's MIME from its leading magic bytes (defaults to JPEG). */
function sniffImageMime(buf: Buffer): string {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp'
  return 'image/jpeg'
}

/** Read one rule image as a data URL, or null when the slot is empty. */
async function readImage(slot: string): Promise<string | null> {
  try {
    const buf = await readFile(imagePath(slot))
    return `data:${sniffImageMime(buf)};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/** Persist one rule image (null removes it); false keeps the previous file. */
async function writeImage(slot: string, dataUrl: string | null): Promise<boolean> {
  await ensureDir()
  try {
    if (dataUrl === null) {
      await rm(imagePath(slot), { force: true })
      return true
    }
    const m = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
    if (!m) return false
    await writeFile(imagePath(slot), Buffer.from(m[1]!, 'base64'))
    return true
  } catch (e) {
    console.error(`dsh-background-by-model: failed to write the image for slot "${slot}"`, e)
    return false
  }
}

/** Every image slot currently stored on disk. */
async function listSlots(): Promise<string[]> {
  try {
    const entries = await readdir(dataDir())
    return entries
      .filter(name => name.startsWith(IMAGE_PREFIX))
      .map(name => name.slice(IMAGE_PREFIX.length))
      .filter(slot => SLOT_RE.test(slot))
  } catch {
    return []
  }
}

/**
 * Download an image from a network URL into one slot (replacing its bytes).
 * Returns { ok, dataUrl?, error? }; never throws.
 */
async function fetchImageUrl(slot: string, url: string | null): Promise<{ ok: boolean; dataUrl?: string | null; error?: string }> {
  if (url === null) {
    const ok = await writeImage(slot, null)
    return { ok, dataUrl: null, error: ok ? undefined : 'remove failed' }
  }
  let parsed: URL
  try { parsed = new URL(url) } catch { return { ok: false, error: 'invalid url' } }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, error: 'unsupported scheme' }
  let res: Response
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), WALLPAPER_FETCH_TIMEOUT)
    try { res = await fetch(url, { redirect: 'follow', signal: ctl.signal }) }
    finally { clearTimeout(timer) }
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'network error' }
  }
  if (!res.ok) return { ok: false, error: `http ${res.status}` }
  const ct = res.headers.get('content-type') ?? ''
  if (ct && !/^image\//.test(ct)) return { ok: false, error: 'not an image' }
  let buf: Buffer
  try {
    const arr = await res.arrayBuffer()
    if (arr.byteLength === 0) return { ok: false, error: 'empty response' }
    if (arr.byteLength > WALLPAPER_FETCH_MAX) return { ok: false, error: 'too large' }
    buf = Buffer.from(arr)
  } catch {
    return { ok: false, error: 'read failed' }
  }
  const dataUrl = `data:${sniffImageMime(buf)};base64,${buf.toString('base64')}`
  const ok = await writeImage(slot, dataUrl)
  return ok ? { ok: true, dataUrl } : { ok: false, error: 'write failed' }
}

/** The host's default model selection — the client's fallback when the
 *  per-session model services are unavailable. */
function defaultModel(ctx: any): { provider: string; model: string } | null {
  try {
    const service = typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : undefined
    const selection = service?.currentSelection?.()
    if (selection && typeof selection.provider === 'string' && typeof selection.model === 'string') {
      return { provider: selection.provider, model: selection.model }
    }
  } catch {
    // Service absent on this host — the client degrades to rule 1.
  }
  return null
}

/**
 * The installed-host half of the self-check.
 *
 * The browser probe behind the "Host check" tab already answers "does this host
 * still provide what I use"; this adds the two facts only the node half can know:
 * the host's own version, and whether the packages on disk still contain the
 * literals the plugin depends on. Reading it costs a handful of file reads, and
 * it is only ever called while that tab is open.
 */
let pluginDir: string | null = null
function thisPluginDir(): string {
  if (pluginDir === null) pluginDir = fileURLToPath(new URL('..', import.meta.url))
  return pluginDir
}

async function hostCheck(payload: unknown): Promise<HostReport> {
  const lang = (payload as { lang?: unknown } | null)?.lang === 'en' ? 'en' : 'zh'
  return await checkHostOnDisk(thisPluginDir(), lang)
}

const NS = 'dshBackgroundByModel'
const RPC_CHANNEL = '/dsh-background-by-model'
const RPC_BODY_MAX = 300 * 1024 * 1024

/** Dispatch one decoded RPC method to the matching persistence routine and
 *  return the wire `result` half of the server-response envelope. */
async function handleRpcMethod(
  ctx: any,
  endpoint: string,
  payload: unknown,
): Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string; details: object } }> {
  const method = endpoint.slice(`${NS}/`.length)
  const rawSlot = (payload as { slot?: unknown } | null)?.slot
  const slot = typeof rawSlot === 'string' && SLOT_RE.test(rawSlot) ? rawSlot : null
  try {
    switch (method) {
      case 'read':
        return { ok: true, value: { config: await readConfig(), slots: await listSlots() } }
      case 'writeConfig':
        return { ok: true, value: await writeConfig((payload as { config?: unknown } | null)?.config ?? {}) }
      case 'readImage':
        if (slot === null) return { ok: true, value: { dataUrl: null } }
        return { ok: true, value: { dataUrl: await readImage(slot) } }
      case 'writeImage':
        if (slot === null) return { ok: true, value: false }
        return { ok: true, value: await writeImage(slot, ((payload as { dataUrl?: unknown } | null)?.dataUrl ?? null) as string | null) }
      case 'deleteImage':
        if (slot === null) return { ok: true, value: false }
        return { ok: true, value: await writeImage(slot, null) }
      case 'fetchImageUrl':
        if (slot === null) return { ok: true, value: { ok: false, error: 'bad slot' } }
        return { ok: true, value: await fetchImageUrl(slot, ((payload as { url?: unknown } | null)?.url ?? null) as string | null) }
      case 'defaultModel':
        return { ok: true, value: defaultModel(ctx) }
      case 'hostCheck':
        return { ok: true, value: await hostCheck(payload) }
      default:
        return { ok: false, error: { code: 'dsh-background-by-model/bad-request', message: `unknown endpoint ${endpoint}`, details: { issues: [] } } }
    }
  } catch (e) {
    return { ok: false, error: { code: 'dsh-background-by-model/internal', message: e instanceof Error ? e.message : String(e), details: {} } }
  }
}

export function apply(ctx: any): void {
  // Register the RPC channel inside a connection+webServer-injected scope,
  // exactly as the connection plugin mounts its own `/api` transport. Doing this
  // synchronously in `apply` fails with "cannot get property webServer without
  // inject" on hosts where webServer is not yet resolvable at apply time.
  ctx.inject(['connection', 'webServer'], (webCtx: any) => {
    webCtx.effect(
      () => webCtx.webServer.register({
        kind: 'prefix',
        path: RPC_CHANNEL,
        handler: async (req: any, res: any) => {
          const rejection = webCtx.connection.requestRejection(req)
          if (rejection !== undefined) {
            res.writeHead(rejection)
            res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
            return
          }
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: { code: 'dsh-background-by-model/bad-request', message: 'expected POST', details: {} } }))
            return
          }
          const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
          const endpoint = pathname.startsWith(`${RPC_CHANNEL}/`) ? pathname.slice(RPC_CHANNEL.length + 1) : undefined
          if (endpoint === undefined || endpoint.length === 0) {
            res.writeHead(404)
            res.end()
            return
          }
          const chunks: Buffer[] = []
          let received = 0
          for await (const chunk of req) {
            const buf = chunk as Buffer
            received += buf.byteLength
            if (received > RPC_BODY_MAX) {
              res.writeHead(413, { connection: 'close' })
              res.end()
              req.destroy()
              return
            }
            chunks.push(buf)
          }
          let env: { type?: unknown; rpcId?: unknown; method?: unknown; payload?: unknown }
          try {
            env = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: { code: 'dsh-background-by-model/bad-request', message: 'body is not JSON', details: {} } }))
            return
          }
          if (env === null || typeof env !== 'object' || env.type !== 'client-request' || typeof env.rpcId !== 'string' || typeof env.method !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: { code: 'dsh-background-by-model/bad-request', message: 'invalid client-request envelope', details: {} } }))
            return
          }
          if (env.method !== endpoint) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ type: 'server-response', rpcId: env.rpcId, result: { ok: false, error: { code: 'dsh-background-by-model/bad-request', message: `method ${env.method} does not match endpoint ${endpoint}`, details: { issues: [] } } } }))
            return
          }
          const result = await handleRpcMethod(ctx, endpoint, env.payload)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ type: 'server-response', rpcId: env.rpcId, result }))
        },
      }),
      'dsh-background-by-model: rpc channel',
    )
  })
}
