import type { FetchResult, RpcResultLike } from './types'
import { cfg } from './state'
// The shape this bundle writes, and the one the host announces on `read`.
import { SCHEMA_VERSION } from '../schema'

export const RPC_CHANNEL = '/dsh-background-by-model'
const RPC_NS = 'dshBackgroundByModel'
const rpcEndpoint = (method: string): string => `${RPC_NS}/${method}`

/**
 * What the host process said about the config shape it writes.
 *
 *   `unknown` — the RPC never answered (offline/broken): writes are allowed, and
 *               the ordinary failure paths deal with it.
 *   `legacy`  — it answered WITHOUT a schema, i.e. it is running a node half from
 *               before multi-image. Its sanitizer drops any rule whose image list
 *               it does not understand, so writing our config would erase the
 *               user's rule list; every config write is held instead.
 *   `current` — same shape as this bundle.
 */
export type HostShape = 'unknown' | 'legacy' | 'current'

let hostShape: HostShape = 'unknown'
let warnedLegacy = false

/** Whether this bundle may write its config to the host it is talking to. */
export function canWriteConfig(): boolean { return hostShape !== 'legacy' }

/** Whether the running host process is older than this client bundle. */
export function hostIsLegacy(): boolean { return hostShape === 'legacy' }

function holdWrite(): void {
  if (warnedLegacy) return
  warnedLegacy = true
  console.warn(
    'dsh-background-by-model: the running host is an older build that cannot read the multi-image ' +
    'config shape — holding config writes so its sanitizer cannot drop this profile\'s rules. ' +
    'Restart DSH to load the new node half.',
  )
}

let rpcCallFn: ((endpoint: string, payload: unknown) => Promise<RpcResultLike | undefined>) | null = null

export function initRpc(call: (endpoint: string, payload: unknown) => Promise<RpcResultLike | undefined>): void {
  rpcCallFn = call
}

async function rpcCall(method: string, payload: unknown): Promise<unknown> {
  if (!rpcCallFn) return undefined
  try {
    const res = await rpcCallFn(rpcEndpoint(method), payload)
    if (res && res.ok === true) return res.value
    console.warn(`dsh-background-by-model: rpc "${method}" failed`, res?.error)
    return undefined
  } catch (e) {
    console.warn(`dsh-background-by-model: rpc "${method}" threw`, e)
    return undefined
  }
}

/** Raw call for the few places that need the host's error message. */
async function rpcRaw(method: string, payload: unknown): Promise<RpcResultLike | undefined> {
  if (!rpcCallFn) return undefined
  try {
    return await rpcCallFn(rpcEndpoint(method), payload)
  } catch {
    return undefined
  }
}

// Slider drags fire dozens of events per second; coalesce writes to a trailing
// debounce and flush the last pending write on pagehide so a quick close never
// loses it.
const SAVE_DEBOUNCE_MS = 250
let saveTimer: number | undefined

export function saveConfig(): void {
  if (!canWriteConfig()) { holdWrite(); return }
  if (saveTimer !== undefined) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined
    void rpcCall('writeConfig', { config: cfg })
  }, SAVE_DEBOUNCE_MS)
}

export function flushSave(): void {
  if (saveTimer === undefined) return
  window.clearTimeout(saveTimer)
  saveTimer = undefined
  // Deliberately checked AFTER the timer is dropped: a held write must not stay
  // queued and fire on the next flush either.
  if (!canWriteConfig()) { holdWrite(); return }
  void rpcCall('writeConfig', { config: cfg })
}

/** Persist the current config immediately (no debounce). */
export function persistConfig(): void {
  if (!canWriteConfig()) { holdWrite(); return }
  void rpcCall('writeConfig', { config: cfg })
}

export interface Persisted {
  config: unknown
  /**
   * Every image slot the store holds. Reported for diagnostics and asserted by
   * `scripts/node-half-check.mjs`; the plugin no longer HYDRATES from it — boot
   * reads the slots the config actually references, because a slot nothing points
   * at has no card to appear on and pulling its bytes costs a full-size transfer.
   */
  slots: string[]
  /** The config shape the host writes; null when it predates this field. */
  schema: number | null
}

/** Load the persisted config plus the list of stored image slots. */
export async function loadPersisted(): Promise<Persisted | null> {
  const data = await rpcCall('read', {})
  if (data === null || typeof data !== 'object') return null
  const d = data as { config?: unknown; slots?: unknown; schema?: unknown }
  const slots = Array.isArray(d.slots) ? d.slots.filter((s): s is string => typeof s === 'string') : []
  const schema = typeof d.schema === 'number' && isFinite(d.schema) ? d.schema : null
  // The one place the answer arrives, so the one place it is recorded: a host that
  // answered without a schema is a pre-0.7 node half (see HostShape).
  hostShape = schema === null ? 'legacy' : (schema >= SCHEMA_VERSION ? 'current' : 'legacy')
  if (hostShape === 'legacy') holdWrite()
  return { config: d.config, slots, schema }
}

/** Read one rule image as a data URL (null when the slot is empty). */
export async function readImage(slot: string): Promise<string | null> {
  const data = await rpcCall('readImage', { slot })
  if (data === null || typeof data !== 'object') return null
  const url = (data as { dataUrl?: unknown }).dataUrl
  return typeof url === 'string' ? url : null
}

/** Persist (or clear) one rule image; one-shot, no debounce. */
export async function writeImage(slot: string, dataUrl: string | null): Promise<boolean> {
  const res = await rpcCall('writeImage', { slot, dataUrl })
  return res === true
}

/** Remove one rule image from disk. */
export async function deleteImage(slot: string): Promise<boolean> {
  const res = await rpcCall('deleteImage', { slot })
  return res === true
}

/** Download an image from a network URL into one slot, replacing its bytes. */
export async function fetchImageUrl(slot: string, url: string): Promise<FetchResult> {
  const res = await rpcRaw('fetchImageUrl', { slot, url })
  if (!res) return { ok: false, error: 'no response' }
  if (res.ok !== true) {
    const err = (res as { error?: { message?: string } }).error
    return { ok: false, error: err?.message ?? 'request failed' }
  }
  const v = res.value as FetchResult | undefined
  return v?.ok === true
    ? { ok: true, dataUrl: v.dataUrl ?? null }
    : { ok: false, error: v?.error ?? 'failed' }
}

/** Host default model — used only when the per-session services are absent. */
export async function readDefaultModel(): Promise<string | null> {
  const data = await rpcCall('defaultModel', {})
  if (data === null || typeof data !== 'object') return null
  const d = data as { provider?: unknown; model?: unknown }
  const parts = [d.provider, d.model].filter((s): s is string => typeof s === 'string' && s !== '')
  return parts.length > 0 ? parts.join(' ') : null
}
