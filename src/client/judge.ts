/**
 * The host-contract probe behind the settings page's "Host check" tab.
 *
 * Every declaration in ./host-contracts is evaluated against the RUNNING dsh —
 * the live DOM, the host's own stylesheets and the Cordis services — so the
 * answer is about this build, not about what the sources say. The results are
 * the difference between a user reporting "背景不动了" and reporting which hop
 * died:
 *
 *   green   the host still provides it
 *   grey    it cannot be observed from here right now (the settings dialog is the
 *           only thing mounted, no file has been opened, the chat view is not in
 *           the tree) — NOT a failure, and never reported as one
 *   red     the host stopped providing it while the feature that reads it is on
 *           screen: this is the line to paste into an issue
 *
 * The probe is read-only: it queries the DOM and reads computed styles. It never
 * writes a style, never mutates the host tree and never touches the config.
 */
import type {
  CheckStatus, ContractCheck, ContractResult, HostContract, HostReport, ModelFacts,
} from '../host-contracts'
import { HOST_CONTRACTS, labelOf, symptomOf } from '../host-contracts'
import type { Ctx } from './types'
import { OWN_SHEET_ATTR } from './components/ui.css'

// The report shape lives with the contracts (../host-contracts) so the node
// half's on-disk scan can build the same report without importing a client
// module — and so "what a result is" cannot drift between the two halves.
export type { CheckStatus, ContractResult, HostReport, ModelFacts } from '../host-contracts'
export { verdictOf, reportToMarkdown } from '../host-contracts'

/** Everything the probe needs from the running client. */
export interface ProbeInput {
  ctx: Ctx
  lang: 'zh' | 'en'
  pluginVersion: string
  floor: string
  model?: ModelFacts
}

// ── the probe's environment ──────────────────────────────────────────────────
// The probe reads exactly four things from the browser: the document (selector
// and computed-token checks), the stylesheets (token/attribute checks), the
// context (service checks) and the window (nothing — kept out on purpose). They
// are declared as a narrow interface so `node --test` can drive the whole probe
// against a fixture written in the shape of a host DOM, with no browser at all —
// and so a check can never quietly start reading something else.

/** A CSS rule as the probe reads it (its text is what matters). */
export interface StyleRuleLike {
  cssText: string
  cssRules?: ArrayLike<StyleRuleLike> | undefined
}

/** One stylesheet the probe may read. */
export interface StyleSheetLike {
  cssRules: ArrayLike<StyleRuleLike> | null
  /**
   * The `<style>`/`<link>` element that owns it, if any.
   *
   * `getAttribute` is what the probe reads, NOT `dataset`: `dataset` rewrites
   * `data-dab-side` to the camel-cased `dabSide`, so `dataset['data-dab-side']`
   * is always `undefined` in a browser — while it works fine on the plain object
   * a test fixture would use. That difference is invisible in tests and fatal in
   * production, which is exactly the kind of check that has to be written
   * against the browser's rules.
   */
  ownerNode?: {
    getAttribute?(name: string): string | null
    dataset?: Record<string, string | undefined>
  } | null
}

export interface ProbeEnv {
  /** `null` when the selector matches nothing — the shape of querySelector. */
  querySelector(selector: string): { style?: unknown } | null
  /**
   * The element an unscoped token check reads from: where the host publishes its
   * design tokens.
   *
   * `document.documentElement` is NOT that element, which is worth spelling out
   * because it looks like the obvious answer: dsh declares its whole palette as
   * `body{--dsw-…: …}` (dsh-client-ui-theme's `design-platform.css`), and
   * `getComputedStyle(documentElement).getPropertyValue('--dsw-alias-bg-base')`
   * comes back EMPTY on a perfectly healthy host. Reading the root made seven
   * contracts report "the host stopped providing this token" on a host that was
   * providing all of them.
   */
  tokenRoot(): { style?: unknown } | null
  /** Computed value of one custom property, already trimmed by the caller. */
  computedValue(token: string, on: { style?: unknown } | null): string
  /** Every stylesheet the probe may read (cross-origin ones throw on access). */
  styleSheets(): Iterable<StyleSheetLike>
  ctx: Ctx
}

/** The real browser environment. */
export function browserEnv(ctx: Ctx): ProbeEnv {
  const tokenRoot = (): { style?: unknown } | null => {
    if (typeof document === 'undefined') return null
    // `body` is where the host's palette lives; the document element is the
    // fallback for the instant before `body` exists.
    return (document.body ?? document.documentElement ?? null) as unknown as { style?: unknown } | null
  }
  return {
    querySelector: selector => document.querySelector(selector) as { style?: unknown } | null,
    tokenRoot,
    // `on === null` means "not scoped to an element": the token is read off
    // `tokenRoot()`. The `typeof` guard keeps the module importable outside a
    // browser (the node test imports the probe to drive it against a fixture).
    computedValue: (token, on) => {
      if (typeof document === 'undefined') return ''
      const host = (on ?? tokenRoot()) as unknown as HTMLElement | null
      if (host === null) return ''
      return getComputedStyle(host).getPropertyValue(token).trim()
    },
    styleSheets: () => (typeof document === 'undefined'
      ? []
      : Array.from(document.styleSheets) as unknown as StyleSheetLike[]),
    ctx,
  }
}

// ── presence anchors ─────────────────────────────────────────────────────────
// A check marked `optionalWhen: X` is only a failure while X's mount anchor is in
// the DOM. Every anchor below is a data attribute the host itself uses to build
// the surface we are checking, so they move together: if the anchor is gone, the
// feature is not on screen and there is nothing to fail.

const ANCHORS: Record<string, string> = {
  settingsClosed: 'div[role="dialog"][aria-modal="true"][aria-labelledby]',
  chatNotMounted: '[data-chat-flow],[data-conversation-scroll]',
  trajectoryNotMounted: '[data-conversation-composer-overlay]',
  noRightPanel: 'div[data-sidebar-right-panel],[data-dockkit-strip],[data-dockkit-pane]',
  cordisClosed: '[data-cordis-panel]',
}

function mounted(env: ProbeEnv, anchorId: string): boolean {
  const sel = ANCHORS[anchorId]
  if (sel === undefined) return true
  try {
    return env.querySelector(sel) !== null
  } catch {
    return false
  }
}

// ── check evaluation ─────────────────────────────────────────────────────────

interface CheckOutcome {
  status: CheckStatus
  /** Human name of the check, for the report. */
  name: string
  /** What was observed. */
  detail: string
  /** Why it failed, in user terms. */
  reason?: string
}

/** Walk a dotted path off a root object, tolerating a missing first hop. */
function walkPath(root: unknown, path: string): unknown {
  let cur: unknown = root
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined) return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

function looksObservable(v: unknown): boolean {
  return typeof v === 'object' && v !== null
    && typeof (v as { subscribe?: unknown }).subscribe === 'function'
    && typeof (v as { getSnapshot?: unknown }).getSnapshot === 'function'
}

/** The camel-cased key `data-dab-side` becomes on a real element's `dataset`. */
export const OWN_SHEET_DATASET = 'dabSide'

/**
 * Whether a stylesheet belongs to THIS plugin.
 *
 * `data-plugin` cannot answer this: the host's own CSS modules set it on every
 * `<style>` they inject (`@deepseek-ai/dsh-client-ui-theme` and its peers). Only
 * the marker written by this plugin's `markOwnSheet` can, and getting this wrong
 * in the "skip our own sheets" direction skips the host's whole theme.
 *
 * Read via `getAttribute` (the browser's own spelling) and fall back to the
 * camel-cased `dataset` key, which is what a plain-object test fixture exposes.
 */
function isOwnSheet(sheet: StyleSheetLike): boolean {
  const owner = sheet.ownerNode
  if (owner === null || owner === undefined) return false
  if (typeof owner.getAttribute === 'function') return owner.getAttribute(OWN_SHEET_ATTR) !== null
  const ds = owner.dataset
  return ds !== undefined
    && (ds[OWN_SHEET_ATTR] !== undefined || ds[OWN_SHEET_DATASET] !== undefined)
}

/**
 * A stylesheet mention of a literal, on the requested side.
 *
 * The host's rules are the only place a renamed token still answers honestly:
 * a token can be *declared* by this plugin while the host's rule that gave it a
 * value is gone. Cross-origin sheets (none on a local dsh, but the probe must
 * not throw if one ever appears) are skipped.
 */
function ruleMentioned(env: ProbeEnv, literal: string, side: 'host' | 'own'): boolean {
  for (const sheet of env.styleSheets()) {
    // `host` reads the host's sheets only, `own` reads ours only. The two must
    // never be mixed: counting our re-emission as the host's rule makes every
    // token check pass by construction — the exact blindness this probe exists
    // to remove.
    if (isOwnSheet(sheet) !== (side === 'own')) continue
    let rules: ArrayLike<StyleRuleLike> | null = null
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    if (rules === null) continue
    for (const rule of Array.from(rules)) {
      const text = rule.cssText
      if (typeof text === 'string' && text.includes(literal)) return true
      // One level of grouping covers the host's @media / @layer / @container
      // blocks, which is where the scheme rules live.
      const inner = rule.cssRules
      if (inner === undefined || inner === null) continue
      for (const child of Array.from(inner)) {
        const childText = child.cssText
        if (typeof childText === 'string' && childText.includes(literal)) return true
      }
    }
  }
  return false
}

/** Which sides of stylesheet the probe can actually read (a blind check must not fail). */
function readability(env: ProbeEnv): { host: boolean; own: boolean } {
  const out = { host: false, own: false }
  for (const sheet of env.styleSheets()) {
    try {
      if (sheet.cssRules !== null) {
        if (isOwnSheet(sheet)) out.own = true
        else out.host = true
      }
    } catch {
      // cross-origin sheet — keep looking
    }
  }
  return out
}

function evaluate(env: ProbeEnv, check: ContractCheck): CheckOutcome {
  switch (check.kind) {
    case 'service': {
      let svc: unknown
      try { svc = env.ctx.get(check.id) } catch { svc = undefined }
      return svc === undefined || svc === null
        ? { status: 'fail', name: `ctx.get('${check.id}')`, detail: 'service not published', reason: `the host does not publish the "${check.id}" service` }
        : { status: 'pass', name: `ctx.get('${check.id}')`, detail: 'service present' }
    }
    case 'path': {
      let svc: unknown
      try { svc = env.ctx.get(check.service) } catch { svc = undefined }
      if (svc === undefined || svc === null) {
        return { status: 'skip', name: `${check.service}.${check.path}`, detail: 'service not published yet' }
      }
      const value = walkPath(svc, check.path)
      const name = `${check.service}.${check.path}`
      if (check.expect === 'function') {
        return typeof value === 'function'
          ? { status: 'pass', name, detail: 'is a function' }
          : { status: 'fail', name, detail: `expected a function, got ${typeof value}`, reason: `"${name}" is not a function on this host` }
      }
      if (check.expect === 'observable') {
        return looksObservable(value)
          ? { status: 'pass', name, detail: 'is an observable face' }
          : { status: 'fail', name, detail: 'not an observable face', reason: `"${name}" no longer exposes subscribe()/getSnapshot()` }
      }
      return value === undefined
        ? { status: 'fail', name, detail: 'undefined', reason: `"${name}" is gone` }
        : { status: 'pass', name, detail: typeof value }
    }
    case 'selector': {
      const present = env.querySelector(check.selector) !== null
      const name = `querySelector(${JSON.stringify(check.selector)})`
      if (present) return { status: 'pass', name, detail: 'element found' }
      if (check.optionalWhen !== undefined && !mounted(env, check.optionalWhen)) {
        return { status: 'skip', name, detail: 'not on screen right now' }
      }
      return {
        status: 'fail', name, detail: 'no element matches',
        reason: `no element matches ${check.selector} while its surface is on screen`,
      }
    }
    case 'attr': {
      const present = env.querySelector(`[${check.attr}]`) !== null
      const name = `querySelector([${check.attr}])`
      if (present) return { status: 'pass', name, detail: 'attribute found' }
      if (check.optionalWhen !== undefined && !mounted(env, check.optionalWhen)) {
        return { status: 'skip', name, detail: 'not on screen right now' }
      }
      return {
        status: 'fail', name, detail: 'no element carries it',
        reason: `nothing in the DOM carries ${check.attr} while its surface is on screen`,
      }
    }
    case 'computed': {
      const host = check.on !== undefined ? env.querySelector(check.on) : null
      const name = `computed(${check.token}${check.on !== undefined ? ` on ${check.on}` : ''})`
      if (check.on !== undefined && host === null) {
        return { status: 'skip', name, detail: `${check.on} not mounted` }
      }
      const value = env.computedValue(check.token, host)
      return value !== ''
        ? { status: 'pass', name, detail: value }
        : { status: 'fail', name, detail: 'resolves to nothing', reason: `${check.token} resolves to an empty value` }
    }
    case 'rule': {
      const side = check.side ?? 'host'
      const name = `${side === 'host' ? 'host' : 'plugin'} stylesheet includes ${JSON.stringify(check.match)}`
      if (!readability(env)[side]) {
        return {
          status: 'skip', name,
          detail: side === 'host' ? 'no host stylesheet is readable' : 'this plugin\'s sheet is not mounted',
        }
      }
      return ruleMentioned(env, check.match, side)
        ? {
          status: 'pass',
          name,
          detail: side === 'host' ? 'declared by a host rule' : 'declared by this plugin\'s own sheet',
        }
        : {
          status: 'fail',
          name,
          detail: 'no rule mentions it',
          reason: side === 'host'
            ? `no host stylesheet declares ${check.match}`
            : `this plugin's own stylesheet does not declare ${check.match} — it was not injected`,
        }
    }
    default: {
      // Exhaustiveness: a new check kind must be handled here, not silently pass.
      const never: never = check
      return { status: 'fail', name: 'unknown check', detail: String(never) }
    }
  }
}

/** A contract with no checks is documentation only (a legacy alias we still accept). */
function noChecks(c: HostContract, lang: 'zh' | 'en'): ContractResult {
  return {
    id: c.id,
    label: labelOf(c, lang),
    symptom: symptomOf(c, lang),
    status: 'info',
    detail: lang === 'zh' ? '无需运行时检查 —— 仅记录兼容用法' : 'no runtime check — accepted for compatibility',
    target: c.target,
    sources: c.sources,
    usedBy: c.usedBy,
    checks: [],
  }
}

/**
 * Run every contract against a probe environment.
 *
 * Only the FIRST failing check of a contract is reported: the later ones usually
 * depend on it (no service ⇒ no methods on it), so listing them all would turn
 * one rename into five red lines.
 */
export function probeContracts(env: ProbeEnv, lang: 'zh' | 'en'): ContractResult[] {
  return HOST_CONTRACTS.map(c => {
    const result: ContractResult = {
      id: c.id,
      label: labelOf(c, lang),
      symptom: symptomOf(c, lang),
      status: 'pass',
      detail: '',
      target: c.target,
      sources: c.sources,
      usedBy: c.usedBy,
      checks: [],
    }
    if (c.checks.length === 0) return noChecks(c, lang)
    const outcomes: CheckOutcome[] = []
    let firstFail: CheckOutcome | undefined
    for (const check of c.checks) {
      let outcome: CheckOutcome
      try {
        outcome = evaluate(env, check)
      } catch (e) {
        outcome = { status: 'fail', name: check.kind, detail: String(e), reason: `${check.kind} check threw` }
      }
      outcomes.push(outcome)
      if (outcome.status === 'fail' && firstFail === undefined) firstFail = outcome
    }
    result.checks = outcomes.map(o => `${o.status} · ${o.name} — ${o.detail}`)
    if (firstFail !== undefined) {
      result.status = 'fail'
      result.detail = `${firstFail.name} — ${firstFail.detail}`
      result.reason = firstFail.reason
      return result
    }
    const ran = outcomes.filter(o => o.status !== 'skip')
    if (ran.length === 0) {
      result.status = 'skip'
      result.detail = outcomes.map(o => `${o.name} — ${o.detail}`).join('; ')
      return result
    }
    result.status = ran.some(o => o.status === 'info') && ran.every(o => o.status === 'info') ? 'info' : 'pass'
    const last = ran[ran.length - 1]!
    result.detail = `${last.name} — ${last.detail}`
    return result
  })
}

/** Assemble the panel's report around a set of probe results. */
export function buildClientReport(input: ProbeInput, host: { version: string; compatible: boolean | null; note: string }): HostReport {
  const results = probeContracts(browserEnv(input.ctx), input.lang)
  const pass = results.filter(r => r.status === 'pass').length
  const fail = results.filter(r => r.status === 'fail').length
  const skip = results.filter(r => r.status === 'skip' || r.status === 'info').length
  return {
    phase: 'client',
    at: new Date().toISOString(),
    plugin: { version: input.pluginVersion, floor: input.floor },
    host: {
      version: host.version,
      compatible: host.compatible,
      node: '',
      root: '',
      note: host.note,
      model: input.model,
    },
    results,
    summary: { pass, fail, skip, total: results.length },
  }
}

