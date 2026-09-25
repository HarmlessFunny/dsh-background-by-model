import type { FetchResult, RpcResultLike } from './types'
import type { HostReport } from '../host-contracts'
import { cfg } from './state'

export const RPC_CHANNEL = '/dsh-background-by-model'
const RPC_NS = 'dshBackgroundByModel'
const rpcEndpoint = (method: string): string => `${RPC_NS}/${method}`

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
  void rpcCall('writeConfig', { config: cfg })
}

/** Persist the current config immediately (no debounce). */
export function persistConfig(): void {
  void rpcCall('writeConfig', { config: cfg })
}

export interface Persisted { config: unknown; slots: string[] }

/** Load the persisted config plus the list of stored image slots. */
export async function loadPersisted(): Promise<Persisted | null> {
  const data = await rpcCall('read', {})
  if (data === null || typeof data !== 'object') return null
  const d = data as { config?: unknown; slots?: unknown }
  const slots = Array.isArray(d.slots) ? d.slots.filter((s): s is string => typeof s === 'string') : []
  return { config: d.config, slots }
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

/**
 * The installed-host half of the self-check: the host version and whether the
 * packages on disk still contain every literal the plugin depends on.
 *
 * Returns null when the node half does not answer (an older build of this plugin
 * still mounted, a host without the RPC channel); the panel then shows the live
 * probe alone rather than claiming the disk scan passed.
 */
export async function readHostScan(lang: 'zh' | 'en'): Promise<HostReport | null> {
  const data = await rpcCall('hostCheck', { lang })
  if (data === null || typeof data !== 'object') return null
  const d = data as Partial<HostReport>
  if (!Array.isArray(d.results)) return null
  return data as HostReport
}
