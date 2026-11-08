/**
 * The agent-facing half of the configuration: two tools, and the one operation
 * module behind them.
 *
 * WHY IT LIVES ON THE HOST: the store is a directory of files (`theme-config.json`
 * plus one `modelbg-<slot>` per picture), and the node half is what owns it. The
 * tools therefore edit the SAME thing the settings panel edits, through the same
 * sanitizer, and not a second opinion about it.
 *
 * TWO TOOLS, NOT ONE, because a single tool with an `action` union carries every
 * write parameter in its schema on every call — including the ones where the model
 * only wants to look at the current rules. `background_theme` is the read side and
 * stays small; `background_edit` is the write side.
 *
 * WHAT THESE DELIBERATELY DO NOT DO:
 *   - `resetStore` has no tool. Emptying the store and installing the recommended
 *     profile is a user's decision about their own data, not an edit.
 *   - holiday slots are refused by the same `holidayAssetFor` gate every write path
 *     goes through. A festival's art is read-only and no tool may change that.
 *   - image bytes are never returned. A wallpaper is megabytes of base64; the tools
 *     answer with slot names a UI (or `fetchPresetImage`) can address.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import {
  BG_MODES, DEFAULT_WALLPAPER_BRIGHTNESS, ROTATE_MAX_MS, ROTATE_MIN_MS, ROTATE_ORDERS,
  TRANSITION_EASINGS, TRANSITION_EFFECTS, TRANSITION_MAX_MS,
  WALLPAPER_BRIGHTNESS_MAX, blankRule, defaultImage, hexToHsl, normalizeConfig, ruleCanPaint,
} from './schema'
import type { BgImage, BgRule, ThemeConfig } from './schema'

/**
 * What the tools ask of the node half.
 *
 * A narrow surface on purpose: the tools must not know how the config is read,
 * written or locked, only that these operations exist. The implementation is
 * supplied by `apply()` in ./index, which is the one module that owns the files.
 */
export interface ThemeToolsHost {
  /** The config on disk, already sanitized. */
  read(): Promise<ThemeConfig>
  /**
   * Persist an edited config.
   *
   * `baseRev` is the revision the edit was computed from. A `false` answer means
   * another writer moved first and NOTHING was written — the tool result then says
   * so instead of reporting a success that did not happen.
   */
  write(config: ThemeConfig, baseRev: number): Promise<boolean>
  /** Download one URL into a free slot and answer where it landed. */
  importUrl(url: string): Promise<{ ok: true; slot: string } | { ok: false; error: string }>
  /**
   * Replace the whole configuration with the built-in recommended profile.
   *
   * Destructive, and the only operation here that is: the store is emptied and the
   * profile's rules take over. It exists because the panel has always had this
   * button and the agent should be able to do what the panel can.
   */
  adoptRecommended(): Promise<
    { ok: true; rules: number; images: number; rev: number } | { ok: false; error: string; slot?: string }
  >
  /** Whether agent access is on, read fresh on every registration. */
  permitted(): Promise<boolean>
}

/** One image as a tool reports it — never the bytes. */
function imageSummary(image: BgImage): Record<string, JsonValue> {
  return {
    slot: image.slot,
    layout: image.bgMode,
    opacity: image.opacity,
    // Omitted rather than defaulted when untouched: "never set" and "set to 100"
    // are different states in the config, and the tool result keeps them apart.
    ...(image.brightness === undefined ? {} : { brightness: image.brightness }),
    blur: image.blur,
    color: image.color === null ? 'system' : colorText(image.color),
  }
}

/** `[h, s, l]` as the `hsl(...)` a person can read back, rounded for display. */
function colorText(color: readonly [number, number, number]): string {
  const [h, s, l] = color
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`
}

/** One rule as a tool reports it. */
function ruleSummary(rule: BgRule, activeId: string | null): Record<string, JsonValue> {
  return {
    id: rule.id,
    match: rule.match,
    enabled: rule.enabled,
    // The rule the CURRENT model resolves to, so the model can tell an edit to a
    // background nobody is looking at from one that will paint immediately.
    active: rule.id === activeId,
    // Whether this rule can paint at all (see `ruleCanPaint`) — a rule with no
    // image and no colour is skipped by matching, which is why it is worth saying.
    usable: ruleCanPaint(rule),
    color: rule.color === null ? 'system' : colorText(rule.color),
    images: rule.images.map(imageSummary),
    rotation: {
      enabled: rule.rotate.enabled,
      intervalSeconds: Math.round(rule.rotate.intervalMs / 1000),
      order: rule.rotate.order,
      advanceOnSwitch: rule.rotate.advanceOnSwitch,
    },
  }
}

/**
 * The rules and interface numbers, without the wallpapers.
 *
 * Bounded by construction: `rules` can grow to whatever the user has, and every
 * other field is a scalar. Nothing here is proportional to image size.
 */
function inspect(config: ThemeConfig, activeId: string | null, ruleId?: string): Record<string, JsonValue> {
  const rev = config.rev
  if (ruleId !== undefined) {
    const rule = config.rules.find(r => r.id === ruleId)
    if (rule === undefined) {
      return { rev, found: false, rules: [], hint: 'no rule with that id' }
    }
    return { rev, found: true, rule: ruleSummary(rule, activeId) }
  }
  return {
    rev,
    rules: config.rules.map(r => ruleSummary(r, activeId)),
    interface: {
      opacities: { ...config.opacities },
      pageOpacity: config.pageOpacity,
      settingsOpacity: config.settingsOpacity,
      chatTextOpacity: config.chatTextOpacity,
      trajectoryOpacity: config.trajectoryOpacity,
      rightbarOpacity: config.rightbarOpacity,
    },
    transition: { ...config.transition },
    holidays: { enabled: config.holidays.enabled },
    agentAccess: config.agentAccess,
  } as Record<string, JsonValue>
}

/** What an edit answers: the revision it produced, or why it produced nothing. */
type EditResult =
  | { ok: true; changed: string; rev: number }
  | { ok: false; error: string }

/**
 * Apply one edit to a copy of the config and write it back.
 *
 * Read-modify-write against the revision on disk, so the edit is always computed
 * from the CURRENT file rather than from a copy that may have moved. A conflict
 * (another writer got there in the meantime) is reported, never retried in a loop:
 * re-running the edit against the winner's config is a decision the caller makes,
 * and silently retrying would apply an edit computed for a state that no longer
 * exists.
 */
async function edit(
  host: ThemeToolsHost,
  mutate: (config: ThemeConfig) => string | { error: string },
): Promise<EditResult> {
  const current = await host.read()
  // A deep copy: the mutator works on plain data and must not leave the shared
  // read-only object half-edited when it bails out with an error.
  const draft = normalizeConfig(JSON.parse(JSON.stringify(current)))
  const outcome = mutate(draft)
  if (typeof outcome !== 'string') return { ok: false, error: outcome.error }
  const written = await host.write(draft, current.rev)
  if (!written) {
    return { ok: false, error: 'the config changed while this edit was being prepared; read it again and retry' }
  }
  return { ok: true, changed: outcome, rev: draft.rev }
}

/** Find one rule, or say which id was wrong. */
function ruleOrFail(config: ThemeConfig, id: string): BgRule | { error: string } {
  const rule = config.rules.find(r => r.id === id)
  return rule ?? { error: `no rule with id "${id}"` }
}

/** One image of a rule, or an error naming what was available. */
function imageOrFail(rule: BgRule, slot: string): BgImage | { error: string } {
  const image = rule.images.find(i => i.slot === slot)
  return image ?? {
    error: `rule "${rule.id}" has no image "${slot}"; it has: ${rule.images.map(i => i.slot).join(', ') || '(none)'}`,
  }
}

/** A clamped percent, keeping `undefined` as "untouched". */
function percent(value: number | undefined, max: number): number | undefined {
  return value === undefined ? undefined : Math.max(0, Math.min(max, value))
}

/**
 * Register both tools.
 *
 * `when` is the switch: while `agentAccess` is off, the tools are excluded from
 * BOTH the schema the model sees and the dispatch table, so a closed switch costs
 * no context and cannot produce a call. Re-read on every step, never cached.
 */
export function registerThemeTools(ctx: any, host: ThemeToolsHost): void {
  ctx.tools.register(defineTool({
    name: 'background_theme',
    description:
      'Read the user\'s wallpaper configuration: an ordered list of model rules, each with a match string, '
      + 'a theme color and one or more images, plus the global interface opacities and the switch transition. '
      + 'Rules match the current model name top-down, first hit wins, and rule 1 is the fallback. '
      + 'Images are reported by slot name, never as bytes.',
    parameters: {
      ruleId: {
        type: 'string',
        description: 'Omit to read the whole configuration. Give a rule id to read just that rule in full.',
      },
      activeRuleId: {
        type: 'string',
        description: 'The rule id the current model resolves to, when the caller already knows it; reported so a reader can tell which rule is painting.',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args) {
      const { ruleId, activeRuleId } = args as { ruleId?: string; activeRuleId?: string }
      const config = await host.read()
      return inspect(config, activeRuleId ?? null, ruleId)
    },
  }), {
    // The switch. Read on every step, so turning it off removes the tool from the
    // very next request instead of one round later.
    when: () => host.permitted(),
  })

  ctx.tools.register(defineTool({
    name: 'background_edit',
    description:
      'Change the user\'s wallpaper configuration. One action per call. Rules are matched against the model '
      + 'name top-down (first hit wins, rule 1 is the fallback) and an edit takes effect on the next repaint. '
      + 'Image bytes are addressed by slot; add_image downloads a URL into a new slot and lands it in fill.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: [
          'set_rule', 'remove_rule', 'set_image', 'remove_image',
          'set_interface', 'set_rotation', 'add_image', 'adopt_recommended',
        ],
        description: 'The operation to perform.',
      },
      confirm: {
        type: 'boolean',
        description: 'adopt_recommended: must be true. This action DELETES every rule and every stored wallpaper before installing the profile, and cannot be undone, so it is refused without an explicit true.',
      },
      ruleId: {
        type: 'string',
        description: 'Target rule. Required for set_rule (or omit to create one), remove_rule, set_image, remove_image, set_rotation and add_image.',
      },
      match: {
        type: 'string',
        description: 'set_rule: case-insensitive substring of the model name. Empty = only a fallback.',
      },
      enabled: {
        type: 'boolean',
        description: 'set_rule: disabled rules are skipped by matching and by the fallback.',
      },
      matchColor: {
        type: 'string',
        description: 'set_rule: the RULE\'s own color as "#rrggbb", or "system" to follow the system theme. Only paints when the rule has no image. Leave it out unless the user asked for a specific color.',
      },
      slot: {
        type: 'string',
        description: 'set_image / remove_image: which image of the rule. See background_theme for the slots.',
      },
      layout: {
        type: 'string',
        enum: BG_MODES as unknown as string[],
        description: 'set_image: how the picture meets the viewport. fit letterboxes, fill crops, stretch distorts, tile repeats, center is unscaled. fill is the one to choose unless the user asks for another.',
      },
      opacity: {
        type: 'number',
        description: 'set_image: 0–1, the wallpaper layer\'s own alpha.',
      },
      brightness: {
        type: 'number',
        description: `set_image: 0–${WALLPAPER_BRIGHTNESS_MAX}, percent; ${DEFAULT_WALLPAPER_BRIGHTNESS} is the file as it is. Omit to leave untouched.`,
      },
      blur: {
        type: 'number',
        description: 'set_image: 0–60, pixels of blur on the wallpaper layer only.',
      },
      imageColor: {
        type: 'string',
        description: 'set_image: overrides this image\'s theme color, as "#rrggbb" or "system". Omit it unless the user named a color: an image is themed from its own bytes when it arrives, and needs nothing supplied.',
      },
      url: {
        type: 'string',
        description: 'add_image: an http(s) URL to download the picture from. Choose by subject, never by brightness: a dark picture and a light one both work, because the light/dark scheme follows the wallpaper rather than the other way round. Prefer a host reachable from mainland China — raw.githubusercontent.com and Google usually are not.',
      },
      intervalSeconds: {
        type: 'number',
        description: `set_rotation: dwell time per image, ${ROTATE_MIN_MS / 1000}–${ROTATE_MAX_MS / 1000} seconds.`,
      },
      order: {
        type: 'string',
        enum: ROTATE_ORDERS as unknown as string[],
        description: 'set_rotation: order walks the list, shuffle never repeats the current picture.',
      },
      rotationEnabled: {
        type: 'boolean',
        description: 'set_rotation: whether this rule cycles its images at all.',
      },
      advanceOnSwitch: {
        type: 'boolean',
        description: 'set_rotation: step once when this rule becomes the active one.',
      },
      interface: {
        type: 'object',
        additionalProperties: true,
        description: 'set_interface: any of opacities.bg/sidebar/card/code/input (0–1), pageOpacity, settingsOpacity, chatTextOpacity, trajectoryOpacity, rightbarOpacity (all 0–1). Unnamed keys are left alone.',
      },
      transition: {
        type: 'object',
        additionalProperties: true,
        description: `set_interface: effect (${TRANSITION_EFFECTS.join('|')}), easing (${TRANSITION_EASINGS.join('|')}), durationMs (0–${TRANSITION_MAX_MS}, 0 = hard cut).`,
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args) {
      const a = args as Record<string, unknown>
      const action = a.action as string

      // `adopt_recommended` runs OUTSIDE `edit()` because it does not modify the
      // config — it replaces it wholesale, along with every stored picture. It is
      // also the only destructive action here, so it is the only one that demands
      // an explicit confirmation: a model that inferred "reset my background" from
      // an ambiguous sentence must not be able to delete a wallpaper collection on
      // that inference alone.
      if (action === 'adopt_recommended') {
        if (a.confirm !== true) {
          return {
            ok: false,
            error: 'adopt_recommended deletes every rule and every stored wallpaper and cannot be undone; '
              + 'call it again with confirm: true only if the user actually asked for the recommended profile',
          }
        }
        return await host.adoptRecommended()
      }

      // `add_image` is the one other action that touches the filesystem BEFORE the
      // config: the bytes have to land somewhere before a rule can name them.
      if (action === 'add_image') {
        const url = a.url
        if (typeof url !== 'string' || url === '') return { ok: false, error: 'add_image needs a url' }
        const got = await host.importUrl(url)
        if (!got.ok) return { ok: false, error: got.error }
        const result = await edit(host, config => {
          const id = a.ruleId
          const rule = typeof id === 'string' ? ruleOrFail(config, id) : undefined
          if (rule !== undefined && 'error' in rule) return rule
          const target = rule ?? config.rules[0]
          if (target === undefined) return { error: 'there is no rule to add an image to; create one with set_rule first' }
          target.images.push(defaultImage(got.slot, null, 'fill'))
          return `added image ${got.slot} to rule ${target.id}`
        })
        return result
      }

      const result = await edit(host, config => {
        switch (action) {
          case 'set_rule': {
            const id = typeof a.ruleId === 'string' ? a.ruleId : undefined
            const existing = id === undefined ? undefined : config.rules.find(r => r.id === id)
            const target = existing ?? blankRule(id ?? nextRuleId(config))
            if (existing === undefined) config.rules.push(target)
            if (a.match !== undefined) target.match = String(a.match)
            if (a.enabled !== undefined) target.enabled = a.enabled !== false
            if (a.matchColor !== undefined) target.color = parseColor(a.matchColor)
            return existing === undefined
              ? `created rule ${target.id}`
              : `updated rule ${target.id}`
          }
          case 'remove_rule': {
            const id = a.ruleId
            if (typeof id !== 'string') return { error: 'remove_rule needs a ruleId' }
            const index = config.rules.findIndex(r => r.id === id)
            if (index < 0) return { error: `no rule with id "${id}"` }
            config.rules.splice(index, 1)
            return `removed rule ${id}`
          }
          case 'set_image': {
            const rule = ruleOrFail(config, String(a.ruleId ?? ''))
            if ('error' in rule) return rule
            const image = imageOrFail(rule, String(a.slot ?? ''))
            if ('error' in image) return image
            if (a.layout !== undefined) image.bgMode = a.layout as BgImage['bgMode']
            if (a.opacity !== undefined) image.opacity = Math.max(0, Math.min(1, Number(a.opacity)))
            if (a.blur !== undefined) image.blur = Math.max(0, Math.min(60, Number(a.blur)))
            // Brightness keeps its key ABSENT when the caller omits it, because
            // "never touched" is a state the config represents (see BgImage).
            const brightness = percent(a.brightness as number | undefined, WALLPAPER_BRIGHTNESS_MAX)
            if (brightness !== undefined) image.brightness = brightness
            if (a.imageColor !== undefined) image.color = parseColor(a.imageColor)
            return `updated image ${image.slot} of rule ${rule.id}`
          }
          case 'remove_image': {
            const rule = ruleOrFail(config, String(a.ruleId ?? ''))
            if ('error' in rule) return rule
            const slot = String(a.slot ?? '')
            const index = rule.images.findIndex(i => i.slot === slot)
            if (index < 0) return { error: `rule "${rule.id}" has no image "${slot}"` }
            rule.images.splice(index, 1)
            // Fewer than two pictures is not a rotation; the shared sanitizer
            // enforces this too, but saying so here keeps the result honest.
            if (rule.images.length < 2) rule.rotate.enabled = false
            return `removed image ${slot} from rule ${rule.id}`
          }
          case 'set_rotation': {
            const rule = ruleOrFail(config, String(a.ruleId ?? ''))
            if ('error' in rule) return rule
            if (a.intervalSeconds !== undefined) {
              rule.rotate.intervalMs = Math.round(Number(a.intervalSeconds) * 1000)
            }
            if (a.order !== undefined) rule.rotate.order = a.order as BgRule['rotate']['order']
            if (a.rotationEnabled !== undefined) rule.rotate.enabled = a.rotationEnabled === true
            if (a.advanceOnSwitch !== undefined) rule.rotate.advanceOnSwitch = a.advanceOnSwitch === true
            return `updated rotation of rule ${rule.id}`
          }
          case 'set_interface': {
            const iface = a.interface as Record<string, unknown> | undefined
            const transition = a.transition as Record<string, unknown> | undefined
            if (iface === undefined && transition === undefined) {
              return { error: 'set_interface needs an interface or a transition object' }
            }
            if (iface !== undefined) {
              const ops = iface.opacities as Record<string, unknown> | undefined
              if (ops !== undefined && typeof ops === 'object') {
                for (const key of Object.keys(config.opacities)) {
                  if (ops[key] !== undefined) {
                    ;(config.opacities as Record<string, number>)[key] = clamp01(ops[key])
                  }
                }
              }
              for (const key of ['pageOpacity', 'settingsOpacity', 'chatTextOpacity', 'trajectoryOpacity'] as const) {
                if (iface[key] !== undefined) config[key] = clamp01(iface[key])
              }
              // The one field with a second state: null means "follow the main
              // background", which is different from any number.
              if (iface.rightbarOpacity !== undefined) {
                config.rightbarOpacity = iface.rightbarOpacity === null ? null : clamp01(iface.rightbarOpacity)
              }
            }
            if (transition !== undefined) {
              if (transition.effect !== undefined && TRANSITION_EFFECTS.includes(transition.effect as never)) {
                config.transition.effect = transition.effect as typeof config.transition.effect
              }
              if (transition.easing !== undefined && TRANSITION_EASINGS.includes(transition.easing as never)) {
                config.transition.easing = transition.easing as typeof config.transition.easing
              }
              if (transition.durationMs !== undefined) {
                config.transition.durationMs = Math.max(0, Math.min(TRANSITION_MAX_MS, Number(transition.durationMs)))
              }
            }
            return 'updated the interface settings'
          }
          default:
            return { error: `unknown action "${String(action)}"` }
        }
      })
      return result
    },
  }), {
    when: () => host.permitted(),
  })
}

function clamp01(value: unknown): number {
  const n = Number(value)
  return isFinite(n) ? Math.max(0, Math.min(1, n)) : 1
}

/** The next free `rN` id, so a tool-created rule does not collide. */
function nextRuleId(config: ThemeConfig): string {
  const taken = new Set(config.rules.map(r => r.id))
  for (let i = 1; i < 10000; i++) {
    if (!taken.has(`r${i}`)) return `r${i}`
  }
  return `r${Date.now()}`
}

/**
 * `#rrggbb` or the word `system` → the stored color.
 *
 * Delegated to `hexToHsl` (./schema) rather than parsed a second time: two HSL
 * pipelines that drift by one rounding step would make a tool-set colour and a
 * panel-set colour store different triples for the same hex.
 */
function parseColor(raw: unknown): [number, number, number] | null {
  const text = String(raw).trim().toLowerCase()
  if (text === 'system' || text === '') return null
  return hexToHsl(text)
}
