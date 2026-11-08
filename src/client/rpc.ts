import type { FetchResult, PresetImage, PruneResult, RpcResultLike, StoreUsage } from './types'
import { cfg, setRev } from './state'
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

/**
 * What the node half answered a config write with.
 *
 * `conflict` is the important one: another writer (the agent's tools, or a second
 * tab) moved the file between this bundle's read and this write, so NOTHING was
 * written and `config` is what is actually on disk. The caller adopts it rather
 * than dropping the edit on the floor with no explanation.
 */
export interface WriteOutcome {
  ok: boolean
  conflict: boolean
  /** The config now on disk, present on a conflict. */
  config?: unknown
  rev: number
}

/**
 * Called when a write came back as a conflict, so the plugin can adopt the config
 * that won and repaint. Set once by `apply()` in ./index.
 *
 * A callback rather than an import because `./rpc` owns no state: the memory copy,
 * the repaint and the toast all live in the modules that own those, and this file
 * would have to import half the plugin to reach them.
 */
let onConflict: ((config: unknown) => void) | null = null

export function setConflictHandler(handler: (config: unknown) => void): void {
  onConflict = handler
}

/**
 * One config write, with the conflict case handled rather than logged.
 *
 * The generic `rpcCall` answers `undefined` for anything that is not a plain
 * success, which is right for reads but wrong here: a REFUSED write is not "no
 * answer", it is an answer that carries the config which won. So this one goes
 * through `rpcRaw` and unwraps the outcome itself.
 */
async function writeConfigNow(config: unknown): Promise<WriteOutcome> {
  const res = await rpcRaw('writeConfig', { config, expectedRev: cfg.rev })
  if (res === undefined) return { ok: false, conflict: false, rev: cfg.rev }
  if (res.ok !== true) return { ok: false, conflict: false, rev: cfg.rev }
  const value = res.value as Partial<WriteOutcome> | undefined
  if (value?.ok === true) return { ok: true, conflict: false, rev: typeof value.rev === 'number' ? value.rev : cfg.rev }
  if (value?.conflict === true) {
    return {
      ok: false,
      conflict: true,
      config: value.config,
      rev: typeof value.rev === 'number' ? value.rev : cfg.rev,
    }
  }
  return { ok: false, conflict: false, rev: cfg.rev }
}

/**
 * Persist, and adopt the winner when the write was refused as stale.
 *
 * Deliberately NOT retried: the edit that lost was computed from a config that is
 * no longer there, and replaying it on the winner would apply a change the user
 * made against a different state. Adopting is the honest answer — the user sees
 * the new configuration and can repeat the gesture if they still want it.
 *
 * The SUCCESS path is the one that has to be careful: a write that lands advances
 * the revision on disk, so this bundle's own copy must advance with it, or its next
 * save names a revision that is already gone, gets refused, and adopts the config
 * from BEFORE that save — which is the edit visibly undoing itself.
 */
async function persistAndResolve(): Promise<void> {
  const outcome = await writeConfigNow(cfg)
  if (outcome.ok) {
    setRev(outcome.rev)
    return
  }
  if (outcome.conflict && outcome.config !== undefined) {
    onConflict?.(outcome.config)
  }
}

/** Write the current config with the revision this bundle last saw. */
export function saveConfig(): void {
  if (!canWriteConfig()) { holdWrite(); return }
  if (saveTimer !== undefined) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined
    void persistAndResolve()
  }, SAVE_DEBOUNCE_MS)
}

export function flushSave(): void {
  if (saveTimer === undefined) return
  window.clearTimeout(saveTimer)
  saveTimer = undefined
  // Deliberately checked AFTER the timer is dropped: a held write must not stay
  // queued and fire on the next flush either.
  if (!canWriteConfig()) { holdWrite(); return }
  void persistAndResolve()
}

/** Persist the current config immediately (no debounce). */
export function persistConfig(): void {
  if (!canWriteConfig()) { holdWrite(); return }
  void persistAndResolve()
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

/**
 * The revision of the config on disk, or null when the host could not be asked.
 *
 * The whole answer is one number: this runs on a timer, and pulling the config to
 * find out whether it changed would cost a full read every few seconds for a
 * question that is almost always "no".
 */
export async function readRev(): Promise<number | null> {
  const data = await rpcCall('readRev', {})
  if (data === null || typeof data !== 'object') return null
  const rev = (data as { rev?: unknown }).rev
  return typeof rev === 'number' && isFinite(rev) ? rev : null
}

/** Read one rule image as a data URL (null when the slot is empty). */export async function readImage(slot: string): Promise<string | null> {
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
 * One of the profile's wallpapers, addressed by the slot the built-in config names.
 *
 * Raw rather than `rpcCall` for the same reason `fetchImageUrl` is: the node half
 * answers this one with a value that CARRIES its own failure, and the `error` inside
 * it is the only thing worth showing the user — the generic "rpc failed" log would
 * throw that distinction away.
 */
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
 * Nothing in the plugin calls this on its own any more — the recommended profile
 * used to run it followed by its own config write, which is two round trips with
 * the revision falling to 0 in between; see `adoptRecommended`. Kept because it is
 * a complete, independently meaningful operation and the node half still serves it.
 */
export async function resetStore(): Promise<boolean> {
  const res = await rpcCall('resetStore', {})
  return res === true
}

/**
 * Install the built-in recommended profile as ONE operation, and answer the
 * revision it landed on.
 *
 * The node half does the whole thing: download every picture, empty the store, put
 * the profile in. That is deliberately not something this half sequences, because
 * the wipe is exactly what makes the revision ambiguous — doing it here meant the
 * follow-up write named a revision the emptied store had never heard of, was
 * refused as stale, and adopted the config it had just replaced. One round trip,
 * one place that knows.
 */
export async function adoptRecommended(): Promise<{ ok: boolean; rev: number }> {
  const res = await rpcRaw('adoptRecommended', {})
  if (res === undefined || res.ok !== true) return { ok: false, rev: cfg.rev }
  const value = res.value as { ok?: boolean; rev?: unknown } | undefined
  if (value?.ok !== true) return { ok: false, rev: cfg.rev }
  return { ok: true, rev: typeof value.rev === 'number' ? value.rev : cfg.rev }
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
