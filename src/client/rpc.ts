import type { FetchResult, PresetHead, PresetImage, PruneResult, RpcResultLike, StoreUsage } from './types'
import { cfg } from './state'
// The shape this bundle writes, and the one the host announces on `read`.
import { SCHEMA_VERSION } from '../schema'

export const RPC_CHANNEL = '/dsh-background-by-model'
const RPC_NS = 'dshBackgroundByModel'
const rpcEndpoint = (method: string): string => `${RPC_NS}/${method}`

/**
 * What the host process said about the config shape it writes. Decided ONCE, by
 * `loadPersisted`, from the `schema` number the node half publishes on `read`.
 *
 *   `unknown` — nothing was loaded yet, or the read never answered (offline,
 *               broken channel). Writes are allowed; the ordinary failure paths
 *               deal with a write that does not land.
 *   `current` — the host wrote a schema AT LEAST as new as this bundle's
 *               (`schema >= SCHEMA_VERSION`). Its sanitizer knows every field
 *               this bundle can produce, so writing is safe.
 *   `legacy`  — the host answered with a schema older than this bundle's, or
 *               with none at all (a node half from before the field existed).
 *               Either way its sanitizer REBUILDS the config from the keys it
 *               knows, so writing ours would drop every field it has never heard
 *               of — in the worst case the whole rule list. Every config write is
 *               held until the host is restarted.
 *
 * A NEWER host is deliberately `current`, not a third state: an older browser
 * bundle talking to a newer node half loses nothing, because the newer sanitizer
 * accepts everything the older one writes.
 */
export type HostShape = 'unknown' | 'legacy' | 'current'

let hostShape: HostShape = 'unknown'
let warnedLegacy = false

/** Whether this bundle may write its config to the host it is talking to. */
export function canWriteConfig(): boolean { return hostShape !== 'legacy' }

/** Whether the running host process cannot read this bundle's config shape. */
export function hostIsLegacy(): boolean { return hostShape === 'legacy' }

function holdWrite(): void {
  if (warnedLegacy) return
  warnedLegacy = true
  console.warn(
    'dsh-background-by-model: the running host is an older build that cannot read this bundle\'s ' +
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
  // The one place the answer arrives, so the one place it is recorded. A null
  // schema is a node half from before the field existed: older, so `legacy`. A
  // host NEWER than this bundle is `current` on purpose — see HostShape.
  hostShape = typeof schema === 'number' && schema >= SCHEMA_VERSION ? 'current' : 'legacy'
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

/**
 * The profile's manifest and config, in one answer. Reads nothing, writes nothing.
 *
 * Raw rather than `rpcCall` for the same reason `fetchImageUrl` is: the node half
 * answers this one with a value that CARRIES its own failure, and the `error`
 * inside it is the only thing worth showing the user — the generic "rpc failed"
 * log would throw that distinction away.
 */
export async function fetchPresetConfig(): Promise<PresetHead> {
  const res = await rpcRaw('fetchPresetConfig', {})
  return unwrapPreset<PresetHead>(res)
}

/** One of the profile's wallpapers, addressed by the slot the config names. */
export async function fetchPresetImage(slot: string): Promise<PresetImage> {
  const res = await rpcRaw('fetchPresetImage', { slot })
  return unwrapPreset<PresetImage>(res)
}

/**
 * The envelope both profile calls share: a transport failure and a value-level
 * failure have to come out the same shape, because the page renders one message
 * either way and must not have to know which layer said no.
 */
function unwrapPreset<T>(res: RpcResultLike | undefined): T {
  if (!res) return { ok: false, error: 'no response' } as T
  if (res.ok !== true) {
    const err = (res as { error?: { message?: string } }).error
    return { ok: false, error: err?.message ?? 'request failed' } as T
  }
  const v = res.value as { ok?: unknown; error?: unknown } | undefined
  if (v?.ok !== true) return { ok: false, error: typeof v?.error === 'string' ? v.error : 'failed' } as T
  return v as T
}

/**
 * Empty the store: the config and every rule image.
 *
 * Only the recommended profile uses this, and only after its download has
 * already succeeded — see `applyRecommended`. Nothing else in the plugin deletes
 * the user's configuration wholesale.
 */
export async function resetStore(): Promise<boolean> {
  const res = await rpcCall('resetStore', {})
  return res === true
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
 * What the store occupies and what nothing points at — read-only.
 *
 * `keep` is this bundle's live slot list, which the node half unions with the config
 * on disk (see `storeUsage`): the two are written at different moments, and the
 * report must never call a file an orphan in the gap between an upload's bytes
 * landing and its rule entry arriving. Sending the list can therefore only SPARE a
 * slot, never condemn one.
 */
export async function readStoreUsage(keep: readonly string[]): Promise<StoreUsage | null> {
  const data = await rpcCall('storeUsage', { keep })
  if (data === null || typeof data !== 'object') return null
  const d = data as Partial<StoreUsage>
  return {
    totalBytes: numberOr(d.totalBytes, 0),
    usedBytes: numberOr(d.usedBytes, 0),
    orphanBytes: numberOr(d.orphanBytes, 0),
    files: numberOr(d.files, 0),
    slots: Array.isArray(d.slots) ? d.slots.filter((s): s is string => typeof s === 'string') : [],
    orphans: Array.isArray(d.orphans)
      ? d.orphans
        .filter((o): o is { slot: string; bytes: number } => o !== null && typeof o === 'object' && typeof o.slot === 'string')
        .map(o => ({ slot: o.slot, bytes: numberOr(o.bytes, 0) }))
      : [],
    // Absent means "a node half that predates the flag", which is the same state a
    // config we cannot vouch for puts us in: refuse, do not guess.
    trusted: d.trusted === true,
  }
}

/**
 * Delete every stored image nothing points at. The one destructive half of the
 * pair, and it takes the same `keep` for the same reason.
 */
export async function pruneOrphanImages(keep: readonly string[]): Promise<PruneResult | null> {
  const data = await rpcCall('pruneOrphans', { keep })
  if (data === null || typeof data !== 'object') return null
  const d = data as Partial<PruneResult>
  return {
    removed: Array.isArray(d.removed) ? d.removed.filter((s): s is string => typeof s === 'string') : [],
    failed: Array.isArray(d.failed) ? d.failed.filter((s): s is string => typeof s === 'string') : [],
    freedBytes: numberOr(d.freedBytes, 0),
    refused: d.refused === true,
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && isFinite(value) && value >= 0 ? value : fallback
}
