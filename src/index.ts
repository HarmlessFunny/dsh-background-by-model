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
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

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
/** Slot names reach the filesystem, so they are strictly whitelisted. */
const SLOT_RE = /^[A-Za-z0-9_-]{1,32}$/
// Network-URL wallpaper fetch: cap the download and time it out so a bad link
// can't stall the UI or fill the drive.
const WALLPAPER_FETCH_MAX = 25 * 1024 * 1024
const WALLPAPER_FETCH_TIMEOUT = 20_000

interface BgState { zoom: number; x: number; y: number; iw: number; ih: number }
type BgMode = 'fit' | 'fill' | 'stretch' | 'tile' | 'center'
interface PartOpacities { bg: number; sidebar: number; card: number; input: number }
interface PartBlurs {
  bg: number; sidebar: number; card: number; settings: number; chat: number; trajectory: number; rightbar: number; input: number
}
interface BgRule {
  id: string
  match: string
  slot: string
  enabled: boolean
  color: [number, number, number] | null
  bgMode: BgMode
  wallpaperOpacity: number
  blur: number
  bgState: BgState
}
interface ThemeConfig {
  rules: BgRule[]
  opacities: PartOpacities
  blurs: PartBlurs
  settingsOpacity: number
  chatTextOpacity: number
  trajectoryOpacity: number
  /** File-preview panel opacity; null = keep following `opacities.bg`. */
  rightbarOpacity: number | null
}

const DEFAULT_CONFIG: ThemeConfig = {
  rules: [],
  opacities: { bg: 0.85, sidebar: 0.93, card: 1, input: 1 },
  blurs: { bg: 0, sidebar: 0, card: 0, settings: 0, chat: 0, trajectory: 0, rightbar: 0, input: 0 },
  settingsOpacity: 1,
  chatTextOpacity: 0,
  trajectoryOpacity: 1,
  rightbarOpacity: null,
}

const dataDir = (): string => dshHomePath(DATA_DIR)
const configPath = (): string => dshHomePath(DATA_DIR, CONFIG_FILE)
const legacyWallpaperPath = (): string => dshHomePath(DATA_DIR, LEGACY_WALLPAPER)
const imagePath = (slot: string): string => dshHomePath(DATA_DIR, `${IMAGE_PREFIX}${slot}`)

const exists = async (p: string): Promise<boolean> => { try { await access(p); return true } catch { return false } }

function clamp(n: unknown, lo: number, hi: number, def: number): number {
  return typeof n === 'number' && isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def
}
const clamp01 = (n: unknown, def: number): number => clamp(n, 0, 1, def)

function normalizeBgState(s: Partial<BgState> | undefined): BgState {
  const v = s ?? {}
  return {
    zoom: clamp(v.zoom, 0.1, 10, 1),
    x: typeof v.x === 'number' && isFinite(v.x) ? v.x : 0,
    y: typeof v.y === 'number' && isFinite(v.y) ? v.y : 0,
    iw: typeof v.iw === 'number' && v.iw > 0 ? v.iw : 0,
    ih: typeof v.ih === 'number' && v.ih > 0 ? v.ih : 0,
  }
}

/** Coerce one persisted rule, or null when it lacks a usable id/slot. */
function normalizeRule(raw: unknown): BgRule | null {
  const r = (raw ?? {}) as Partial<BgRule>
  const id = typeof r.id === 'string' && r.id !== '' ? r.id : null
  const slot = typeof r.slot === 'string' && SLOT_RE.test(r.slot) ? r.slot : null
  if (id === null || slot === null) return null
  const c = r.color
  const color: [number, number, number] | null =
    Array.isArray(c) && c.length === 3 && c.every(n => typeof n === 'number' && isFinite(n))
      ? [clamp(c[0], 0, 360, 220), clamp(c[1], 0, 1, 0.55), clamp(c[2], 0, 1, 0.25)]
      : null
  const mode: BgMode = (['fit', 'fill', 'stretch', 'tile', 'center'] as BgMode[]).includes(r.bgMode as BgMode)
    ? (r.bgMode as BgMode)
    : 'fit'
  return {
    id,
    slot,
    match: typeof r.match === 'string' ? r.match : '',
    enabled: r.enabled !== false,
    color,
    bgMode: mode,
    wallpaperOpacity: clamp01(r.wallpaperOpacity, 1),
    blur: clamp(r.blur, 0, 60, 0),
    bgState: normalizeBgState(r.bgState as Partial<BgState> | undefined),
  }
}

/** Coerce an unknown persisted value into a valid ThemeConfig, falling back per-field. */
function normalizeConfig(raw: unknown): ThemeConfig {
  const r = (raw ?? {}) as Partial<ThemeConfig>
  const rules = Array.isArray(r.rules)
    ? r.rules.map(normalizeRule).filter((x): x is BgRule => x !== null)
    : []
  const ops = (r.opacities ?? {}) as Partial<PartOpacities>
  const bl = (r.blurs ?? {}) as Partial<PartBlurs>
  const blurs = {} as PartBlurs
  for (const k of ['bg', 'sidebar', 'card', 'settings', 'chat', 'trajectory', 'rightbar', 'input'] as const) {
    blurs[k] = clamp(bl[k], 0, 60, DEFAULT_CONFIG.blurs[k])
  }
  return {
    rules,
    opacities: {
      bg: clamp01(ops.bg, DEFAULT_CONFIG.opacities.bg),
      sidebar: clamp01(ops.sidebar, DEFAULT_CONFIG.opacities.sidebar),
      card: clamp01(ops.card, DEFAULT_CONFIG.opacities.card),
      input: clamp01(ops.input, DEFAULT_CONFIG.opacities.input),
    },
    blurs,
    settingsOpacity: clamp01(r.settingsOpacity, DEFAULT_CONFIG.settingsOpacity),
    chatTextOpacity: clamp01(r.chatTextOpacity, DEFAULT_CONFIG.chatTextOpacity),
    trajectoryOpacity: clamp01(r.trajectoryOpacity, DEFAULT_CONFIG.trajectoryOpacity),
    // Anything but a real number means "not owned yet" — including the absent
    // field of a config written before this option existed.
    rightbarOpacity: typeof r.rightbarOpacity === 'number' && isFinite(r.rightbarOpacity)
      ? clamp01(r.rightbarOpacity, 1)
      : null,
  }
}

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

async function writeConfig(config: unknown): Promise<boolean> {
  await ensureDir()
  try {
    await writeFile(configPath(), JSON.stringify(normalizeConfig(config), null, 2), 'utf8')
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
