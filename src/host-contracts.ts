/**
 * The host contract this plugin depends on — declared exactly ONCE.
 *
 * This plugin does not own any of the surfaces it styles: it re-emits the host's
 * design tokens, hangs backdrop filters on the host's structural elements and
 * reads the host's session/model services. Every one of those touch points is a
 * *contract* with a dsh build, and dsh changes them between releases. Three real
 * bugs came out of exactly that, all of them silent (nothing threw — the
 * interface just stopped following the settings):
 *
 *   --dsw-menu-surface-fill  0.1.7 split the menu fill in two: `--dsw-specific-menu`
 *                            stayed the overlay fill while the new
 *                            `--dsw-menu-surface-fill` became what the shared
 *                            MenuSurface material paints, with the former aliased
 *                            to the latter. Re-emitting only the old name left the
 *                            model picker's sticky provider rows on the host fill
 *                            and its panel on ours — the solid white band.
 *   sessions.list.current    0.1.7 stopped publishing the current session id; the
 *                            main view's session moved to the `uiSession` service
 *                            and the row retained by `mainView`. Reading only
 *                            `current` finds nothing, so the background silently
 *                            stayed on rule 1 and never followed the model.
 *   [data-dockkit-content]   the right panel's surface moved off the panel
 *                            container (which now stays mounted at full width) and
 *                            onto the dock's tab hosts — the same rule then painted
 *                            a permanent frosted plate over the empty right half.
 *
 * The declarations below are that contract, written down so three consumers can
 * share them: the browser probe behind the "Host check" settings page, the node
 * half's support report, and the offline scan in `.dsh-debug/contract-scan.mjs`
 * that fails when a contract target disappears from the installed dsh packages.
 *
 * THIS MODULE MUST STAY ENVIRONMENT-FREE: no DOM, no Node, no Cordis. It is
 * imported by the browser bundle, by the node half and by a plain `node --test`.
 */

/** Which generation of dsh a contract point first required. */
export type ContractSince = '<=0.1.6' | '0.1.7'

/**
 * How much of the plugin dies with the contract.
 *
 *   core   the plugin cannot do its job at all (no model ⇒ no per-model rule)
 *   looks  the wallpaper/theme still work, a surface stops following the sliders
 *   label  only a nicer value is lost (a display name, a legacy alias)
 */
export type ContractCriticality = 'core' | 'looks' | 'label'

/** What kind of host value a contract point names. */
export type ContractKind =
  | 'host-service'
  | 'dom-selector'
  | 'host-token'
  | 'host-attr'
  | 'host-style'
  | 'plugin-var'

/** One check, evaluated in order against the live browser or the installed host. */
export type ContractCheck =
  /** A Cordis service resolves through `ctx.get(id)`. */
  | { kind: 'service'; id: string }
  /** A dotted path off that service resolves. */
  | { kind: 'path'; service: string; path: string; expect: 'function' | 'observable' | 'any' }
  /** `document.querySelector(selector)` finds (or must not find) an element. */
  | { kind: 'selector'; selector: string; optionalWhen?: string }
  /** An element carrying the attribute exists. */
  | { kind: 'attr'; attr: string; optionalWhen?: string }
  /** A custom property resolves to a non-empty computed value. */
  | { kind: 'computed'; token: string; on?: string }
  /** A style rule mentioning the token/attribute exists in a host stylesheet. */
  | {
    kind: 'rule'
    match: string
    /**
     * Which side the rule must live on. `host` (the default) reads only the
     * host's stylesheets; `own` reads only this plugin's.
     *
     * This distinction is load-bearing, not cosmetic: the host's own CSS modules
     * mark their `<style>` elements with `data-plugin` too, and this plugin
     * re-emits the host's tokens. A check that cannot tell the two apart either
     * skips the entire host theme (every token reads as renamed) or accepts this
     * plugin's own re-emission as proof that the host still declares the token —
     * the exact blindness that let the 0.1.7 white band ship.
     */
    side?: 'host' | 'own'
    hint?: string
  }

/** A literal string plus the host file that must still contain it. */
export interface ContractSource {
  /**
   * Relative to `root`: a `dsh-client-ui-…/lib/client.js` path under the packages
   * scope, an asset filename under the served frontend's `dist/assets`, or a
   * `src/…` path of this plugin (the one contract whose other half is our own
   * stylesheet).
   *
   * `.` names the root directory itself: the literal is then searched across the
   * files in it, for targets whose FILE name is not stable (a hash-stamped
   * frontend bundle asset).
   */
  path: string
  /** `frontend` = the served `dsh-web-frontend/dist/assets`; default = the packages scope. */
  root?: 'frontend'
  /** The literal the host file must still contain. */
  literal: string
}

/** What user-visible behaviour breaks when the contract is gone. */
export interface ContractSymptom {
  /** The consequence, in one sentence. */
  en: string
  zh: string
}

/** One touch point with a dsh build. */
export interface HostContract {
  /** Stable id, used by the UI, the report and the scan. */
  id: string
  /** Grouping in the panel. */
  group: 'model' | 'surface' | 'token' | 'region'
  kind: ContractKind
  criticality: ContractCriticality
  since: ContractSince
  /** What it is, shown in the panel. */
  label: { en: string; zh: string }
  /** What breaks without it — shown when the check fails. */
  symptom: ContractSymptom
  /** The literal contract value (selector, token name, service id, attribute). */
  target: string
  /** Ordered checks; the first failure is the reported reason. */
  checks: ContractCheck[]
  /** Where the host defines it — absence from disk means it moved or was renamed. */
  sources: ContractSource[]
  /** `src/...` of this plugin that reads it, for the report. */
  usedBy: string
}

/**
 * The plugin's own CSS variables (never a host contract) — declared here so the
 * report can show which side of the interface each host token is driven from,
 * and so a token can never be read and written under two spellings.
 */
export const PLUGIN_TOKENS = [
  '--dsh-any-op-bg',
  '--dsh-any-op-sidebar',
  '--dsh-any-op-card-1',
  '--dsh-any-op-card-2',
  '--dsh-any-op-card-3',
  '--dsh-any-op-input',
  '--dsh-any-op-menu',
  '--dsh-any-op-menu-cordis',
] as const

const SIDEBAR_RIGHT = 'dsh-client-ui-sidebar-right'

/**
 * The contract table.
 *
 * Ordered by group and then by how visible a break is: the model hop first (the
 * plugin's whole purpose), then the surfaces it paints, then the tokens it
 * re-emits, then the regions it decorates.
 */
export const HOST_CONTRACTS: readonly HostContract[] = [
  // ── model: how this session's model is read ───────────────────────────────
  {
    id: 'sessions.list',
    group: 'model',
    kind: 'host-service',
    criticality: 'core',
    since: '0.1.7',
    label: { en: 'Session list service', zh: '会话列表服务' },
    symptom: {
      en: 'no session id can be read, so the background is stuck on rule 1 and never follows the model',
      zh: '读不到会话 id，背景会一直停在规则 1，不再跟着模型切换',
    },
    target: 'sessions.list',
    checks: [
      { kind: 'service', id: 'sessions' },
      { kind: 'path', service: 'sessions', path: 'list', expect: 'observable' },
      // The rows the resolver walks. `getSnapshot` is the only way to reach them,
      // and its VALUE is a runtime fact, not a contract — what is asserted here is
      // that the list is still readable.
      { kind: 'path', service: 'sessions', path: 'list.getSnapshot', expect: 'function' },
    ],
    sources: [{ path: 'dsh-api-session-controller/lib/client.js', literal: 'retainedBy' }],
    usedBy: 'src/client/modelbg.ts',
  },
  {
    id: 'sessions.list.current',
    group: 'model',
    kind: 'host-service',
    criticality: 'label',
    since: '<=0.1.6',
    label: {
      en: 'Session list: legacy current id',
      zh: '会话列表：旧版 current 字段',
    },
    symptom: {
      en: 'harmless on its own — the 0.1.7 hops below take over',
      zh: '本身无害 —— 0.1.7 上由下面的兜底路径接管',
    },
    target: 'list.current',
    checks: [],
    sources: [{ path: 'dsh-api-session-controller/lib/client.js', literal: 'retainedBy' }],
    usedBy: 'src/client/modelbg.ts',
  },
  {
    id: 'sessions.retainedBy.mainView',
    group: 'model',
    kind: 'host-service',
    criticality: 'label',
    since: '0.1.7',
    label: { en: 'Main-view retention on the session row', zh: '会话行的主视图占用标记' },
    symptom: {
      en: 'while uiSession is not mounted yet, no session id can be derived',
      zh: 'uiSession 尚未挂载时推导不出会话 id',
    },
    target: 'byId[].retainedBy.mainView',
    // No runtime check: whether a row currently carries the retention is a fact
    // about the open sessions, not about the build. What the plugin depends on is
    // that the list face can be read at all (`sessions.list`), and that the rows
    // carry `retainedBy` (checked offline against the session controller).
    checks: [],
    sources: [{ path: 'dsh-api-session-controller/lib/client.js', literal: 'retainedBy' }],
    usedBy: 'src/client/modelbg.ts',
  },
  {
    id: 'uiSession.current',
    group: 'model',
    kind: 'host-service',
    criticality: 'core',
    since: '0.1.7',
    label: { en: 'uiSession service (main view session)', zh: 'uiSession 服务（主视图会话）' },
    symptom: {
      en: 'the session id can only be guessed from the list retention',
      zh: '会话 id 只能退回用列表占用标记去猜',
    },
    target: 'uiSession.current',
    checks: [{ kind: 'path', service: 'uiSession', path: 'current', expect: 'observable' }],
    sources: [{ path: 'dsh-client-ui-session/lib/client.js', literal: 'uiSession' }],
    usedBy: 'src/client/modelbg.ts',
  },
  {
    id: 'sessions.binding.projections',
    group: 'model',
    kind: 'host-service',
    criticality: 'core',
    since: '<=0.1.6',
    label: { en: 'Session binding + projections', zh: '会话 binding 与 projections' },
    symptom: {
      en: 'this session\'s own model selection is unreadable — only the host default is left',
      zh: '读不到本会话自己的模型选择，只剩宿主默认模型可用',
    },
    target: 'binding(id).session.projections.faceOf("modelSelection")',
    checks: [
      { kind: 'path', service: 'sessions', path: 'binding', expect: 'function' },
    ],
    sources: [{ path: 'dsh-api-session-controller/lib/client.js', literal: 'faceOf' }],
    usedBy: 'src/client/modelbg.ts',
  },
  {
    id: 'modelDirectories.directoryFor',
    group: 'model',
    kind: 'host-service',
    criticality: 'label',
    since: '<=0.1.6',
    label: { en: 'Model directory (display names)', zh: '模型目录（显示名）' },
    symptom: {
      en: 'the model is shown as provider/model id instead of its display name',
      zh: '模型只会显示 provider/模型 id，读不到显示名',
    },
    target: 'modelDirectories.directoryFor(id)',
    checks: [{ kind: 'path', service: 'modelDirectories', path: 'directoryFor', expect: 'function' }],
    sources: [{ path: 'dsh-client-ui-model-selection/lib/client.js', literal: 'modelSelection' }],
    usedBy: 'src/client/modelbg.ts',
  },

  // ── surface: the elements the plugin paints ───────────────────────────────
  {
    id: 'shell.overlay',
    group: 'surface',
    kind: 'host-attr',
    criticality: 'looks',
    since: '<=0.1.6',
    label: { en: 'AppFrame overlay + its three columns', zh: '主框架浮层与三列' },
    symptom: {
      en: 'per-part blur and the main-background opacity cannot find the columns at all',
      zh: '分区域模糊与主背景透明度完全找不到那几列',
    },
    target: '[data-shell-overlay]',
    checks: [{ kind: 'attr', attr: 'data-shell-overlay' }],
    sources: [{ path: 'dsh-client-ui-layout/lib/client.js', literal: 'data-shell-overlay' }],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'settings.dialog',
    group: 'surface',
    kind: 'dom-selector',
    criticality: 'looks',
    since: '<=0.1.6',
    label: { en: 'Settings dialog (aria-modal)', zh: '设置弹窗（aria-modal）' },
    symptom: {
      en: 'the settings panel opacity and blur sliders stop having any effect',
      zh: '设置界面透明度与模糊失效',
    },
    target: '[role="dialog"][aria-modal="true"][aria-labelledby]',
    checks: [
      { kind: 'selector', selector: 'div[role="dialog"][aria-modal="true"][aria-labelledby]', optionalWhen: 'settingsClosed' },
    ],    sources: [
      { path: 'dsh-client-ui-primitives/lib/index.js', literal: 'aria-modal' },
      // `.dab-card` is this plugin's own class for the dialog's option panels —
      // the one contract whose "host side" is a stylesheet of ours.
      { path: 'src/client/components/ui.css.ts', literal: '.dab-card' },
    ],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'settings.card',
    group: 'surface',
    kind: 'host-style',
    criticality: 'looks',
    since: '<=0.1.6',
    label: { en: 'Option card inside the dialog (.dab-card)', zh: '弹窗内的选项卡（.dab-card）' },
    symptom: {
      en: 'the dialog option-panel blur has nothing to attach to',
      zh: '弹窗内选项卡的模糊没有附着对象',
    },
    target: '.dab-card',
    // `own`: this class is declared by THIS plugin's stylesheet, not the host's.
    // It is the one entry in the table whose other half is a sheet of ours, and
    // the check exists to notice that sheet going missing (the option-card blur
    // then has nothing to attach to).
    checks: [{ kind: 'rule', match: '.dab-card', side: 'own', hint: 'settings dialog card class' }],
    sources: [{ path: 'src/client/components/ui.css.ts', literal: '.dab-card' }],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'composer.card',
    group: 'surface',
    kind: 'host-attr',
    criticality: 'looks',
    since: '<=0.1.6',
    label: { en: 'Composer card', zh: '输入框卡片' },
    symptom: {
      en: 'the composer loses its backdrop — the input blur slider does nothing',
      zh: '输入框失去毛玻璃背板，输入区模糊滑块失效',
    },
    target: '[data-composer-card]',
    // The composer only exists inside a mounted conversation view, so its absence
    // while the chat view itself is absent is "not observable", not a rename.
    checks: [{ kind: 'attr', attr: 'data-composer-card', optionalWhen: 'chatNotMounted' }],
    sources: [{ path: 'dsh-client-ui-conversation/lib/client.js', literal: 'data-composer-card' }],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'cordis.panel',
    group: 'surface',
    kind: 'host-attr',
    criticality: 'label',
    since: '<=0.1.6',
    label: { en: 'Cordis panel', zh: 'Cordis 面板' },
    symptom: {
      en: 'the Cordis panel keeps the host surface instead of the input slider\'s alpha',
      zh: 'Cordis 面板拿不到输入区滑块的透明度，仍是宿主表面',
    },
    target: '[data-cordis-panel]',
    checks: [{ kind: 'attr', attr: 'data-cordis-panel', optionalWhen: 'cordisClosed' }],
    sources: [{ path: 'dsh-client-ui-cordis/lib/client.js', literal: 'data-cordis-panel' }],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'rightbar.panel',
    group: 'surface',
    kind: 'host-attr',
    criticality: 'looks',
    since: '0.1.7',
    label: { en: 'File-preview panel host', zh: '文件预览面板宿主' },
    symptom: {
      en: 'the right panel loses its own opacity/blur card and falls back to the main background',
      zh: '右侧栏失去自己的透明度/模糊控制，退回跟随主背景',
    },
    target: '[data-sidebar-right-panel]',
    checks: [
      // Absent until a file is opened; `[data-dockkit-strip]` is the dock chrome
      // that exists in the same panel even while the panel is closed, so it
      // tells "the panel is not mounted" apart from "the attribute was renamed".
      { kind: 'selector', selector: 'div[data-sidebar-right-panel]', optionalWhen: 'noRightPanel' },
    ],
    sources: [{ path: `${SIDEBAR_RIGHT}/lib/client.js`, literal: 'data-sidebar-right-panel' }],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'rightbar.openFlag',
    group: 'surface',
    kind: 'host-attr',
    criticality: 'looks',
    since: '0.1.7',
    label: { en: 'Right panel open/closed flag', zh: '右侧栏开合标记' },
    symptom: {
      en: 'the panel\'s backdrop cannot tell open from closed — a frosted plate covers the empty half',
      zh: '分不清右侧栏开着还是关着，空白的右半屏会出现磨砂板',
    },
    target: '[data-sidebar-right-open]',
    checks: [{ kind: 'rule', match: '[data-sidebar-right-open]', hint: 'right panel open flag' }],
    sources: [{ path: `${SIDEBAR_RIGHT}/lib/client.js`, literal: 'data-sidebar-right-open' }],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'dockkit.content',
    group: 'surface',
    kind: 'host-attr',
    criticality: 'core',
    since: '0.1.7',
    label: { en: 'Dock tab host (the panel\'s painted surface)', zh: '停靠页宿主（面板真正的表面）' },
    symptom: {
      en: 'nothing carries the panel surface any more — the right-panel card is painted on a container that is always full width',
      zh: '面板表面不再落在任何元素上，右面板卡片会被画在一个恒定满宽的容器上',
    },
    target: '[data-dockkit-content]',
    checks: [{ kind: 'rule', match: '[data-dockkit-content]', hint: 'dock tab host' }],
    // Directory source: the dockkit component lives in the shell bundle, whose
    // filename is hash-stamped on every dsh release.
    sources: [{ path: '.', literal: 'dockkit-content', root: 'frontend' }],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'dockkit.empty',
    group: 'surface',
    kind: 'host-attr',
    criticality: 'looks',
    since: '0.1.7',
    label: { en: 'Dock empty seat', zh: '停靠空位' },
    symptom: {
      en: 'an empty preview pane paints the host surface over the wallpaper',
      zh: '空的预览格会用宿主表面盖住壁纸',
    },
    target: '[data-dockkit-empty]',
    checks: [{ kind: 'rule', match: '[data-dockkit-empty]', hint: 'dock empty seat' }],
    sources: [{ path: `${SIDEBAR_RIGHT}/lib/client.js`, literal: 'data-dockkit-empty' }],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'dockkit.float',
    group: 'surface',
    kind: 'host-attr',
    criticality: 'label',
    since: '0.1.7',
    label: { en: 'Floating dock pane flag', zh: '浮动停靠面板标记' },
    symptom: {
      en: 'floating panes would be painted like docked ones, frosting a panel that should stay the host\'s',
      zh: '浮动面板会被当作停靠面板上色，本该保持宿主样式的面板被磨砂',
    },
    target: '[data-dockkit-float]',
    checks: [{ kind: 'rule', match: '[data-dockkit-float]', hint: 'floating pane flag' }],
    sources: [{ path: `${SIDEBAR_RIGHT}/lib/client.js`, literal: 'data-dockkit-float' }],
    usedBy: 'src/client/wallpaper.ts',
  },

  // ── region: the conversation views ────────────────────────────────────────
  {
    id: 'chat.flow',
    group: 'region',
    kind: 'dom-selector',
    criticality: 'looks',
    since: '<=0.1.6',
    label: { en: 'Chat message column', zh: '对话消息列' },
    symptom: {
      en: 'the conversation card (and its opacity/blur) cannot find the message column',
      zh: '对话卡片（及其透明度/模糊）找不到消息列',
    },
    target: '[data-chat-flow]',
    checks: [
      { kind: 'selector', selector: '[data-chat-flow]', optionalWhen: 'chatNotMounted' },
    ],
    sources: [{ path: 'dsh-client-ui-chat/lib/client.js', literal: 'data-chat-flow' }],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'conversation.scroll',
    group: 'region',
    kind: 'dom-selector',
    criticality: 'looks',
    since: '<=0.1.6',
    label: { en: 'Conversation scrollport', zh: '对话滚动区' },
    symptom: {
      en: 'the marker-less fallback would wrap the whole scrollport in the conversation card',
      zh: '标记缺失时的兜底会把整个滚动区套上对话卡片',
    },
    target: '[data-conversation-scroll]',
    checks: [
      { kind: 'selector', selector: '[data-conversation-scroll]', optionalWhen: 'chatNotMounted' },
    ],
    sources: [{ path: 'dsh-client-ui-conversation/lib/client.js', literal: 'data-conversation-scroll' }],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'trajectory.root',
    group: 'region',
    kind: 'dom-selector',
    criticality: 'looks',
    since: '<=0.1.6',
    label: { en: 'Trajectory view root', zh: '轨迹页根节点' },
    symptom: {
      en: 'the trajectory opacity/blur sliders stop reaching the trajectory page',
      zh: '轨迹页的透明度与模糊滑块失效',
    },
    target: '[data-conversation-composer-overlay]',
    checks: [
      { kind: 'selector', selector: '[data-conversation-composer-overlay]', optionalWhen: 'trajectoryNotMounted' },
    ],
    sources: [{ path: 'dsh-client-ui-trajectory/lib/client.js', literal: 'data-conversation-composer-overlay' }],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'markdown.wideTable',
    group: 'region',
    kind: 'host-style',
    criticality: 'label',
    since: '<=0.1.6',
    label: { en: 'Wide markdown table clamp', zh: '宽表格收拢样式' },
    symptom: {
      en: 'a wide table bleeds outside the conversation card instead of scrolling inside it',
      zh: '宽表格会溢出到对话卡片外，而不是在卡片内横向滚动',
    },
    target: '.md-table-wide',
    checks: [{ kind: 'rule', match: '.md-table-wide', hint: 'markdown table class' }],
    sources: [{ path: 'dsh-client-ui-chat/lib/client.js', literal: 'md-table-wide' }],
    usedBy: 'src/client/wallpaper.ts',
  },

  // ── token: the design tokens the plugin re-emits ──────────────────────────
  {
    id: 'token.bgBase',
    group: 'token',
    kind: 'host-token',
    criticality: 'looks',
    since: '<=0.1.6',
    label: { en: 'Main background surface', zh: '主背景表面' },
    symptom: {
      en: 'the main-background slider and the right-panel card lose their surface',
      zh: '主背景透明度与右侧栏卡片失去表面色',
    },
    target: '--dsw-alias-bg-base',
    checks: [
      { kind: 'rule', match: '--dsw-alias-bg-base', hint: 'platform palette' },
      { kind: 'computed', token: '--dsw-alias-bg-base' },
    ],
    sources: [{ path: 'dsh-client-ui-theme/lib/client.js', literal: '--dsw-alias-bg-base' }],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'token.layers',
    group: 'token',
    kind: 'host-token',
    criticality: 'looks',
    since: '<=0.1.6',
    label: { en: 'Layered surfaces (cards)', zh: '层次表面（卡片）' },
    symptom: {
      en: 'the card slider, the conversation card and the trajectory slider go blank',
      zh: '卡片滑块、对话卡片与轨迹滑块失去颜色',
    },
    target: '--dsw-alias-bg-layer-1/2/3',
    checks: [
      { kind: 'rule', match: '--dsw-alias-bg-layer-1', hint: 'platform palette' },
      { kind: 'computed', token: '--dsw-alias-bg-layer-1' },
      { kind: 'computed', token: '--dsw-alias-bg-layer-2' },
      { kind: 'computed', token: '--dsw-alias-bg-layer-3' },
    ],
    sources: [{ path: 'dsh-client-ui-theme/lib/client.js', literal: '--dsw-alias-bg-layer-1' }],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'token.menuSurface',
    group: 'token',
    kind: 'host-token',
    criticality: 'core',
    since: '0.1.7',
    label: { en: 'Menu material fill (0.1.7 split)', zh: '菜单材质填充（0.1.7 拆分）' },
    symptom: {
      en: 'the menu panel and its sticky group headings take two different fills — the solid band across the model picker',
      zh: '菜单面板与吸顶分组标题用了两种填充 —— 模型选择器上那道白道',
    },
    target: '--dsw-menu-surface-fill',
    checks: [
      { kind: 'rule', match: '--dsw-menu-surface-fill', hint: 'MenuSurface material fill' },
      { kind: 'computed', token: '--dsw-menu-surface-fill', on: '.dab-root' },
    ],
    sources: [
      { path: 'dsh-client-ui-theme/lib/client.js', literal: '--dsw-menu-surface-fill' },
      { path: 'dsh-client-ui-primitives/lib/MenuSurface.module.css', literal: 'var(--dsw-menu-surface-fill)' },
    ],
    usedBy: 'src/client/utils/color.ts, src/client/wallpaper.ts',
  },
  {
    id: 'token.menuAlias',
    group: 'token',
    kind: 'host-token',
    criticality: 'looks',
    since: '<=0.1.6',
    label: { en: 'Menu overlay fill', zh: '菜单浮层填充' },
    symptom: {
      en: 'dropdowns, the slash menu and popovers keep the host fill while the panel follows the plugin',
      zh: '下拉、斜杠菜单与浮层保持宿主填充，而面板跟随插件，两边不一致',
    },
    target: '--dsw-specific-menu',
    checks: [
      { kind: 'rule', match: '--dsw-specific-menu', hint: 'menu overlay fill' },
      { kind: 'computed', token: '--dsw-specific-menu', on: '.dab-root' },
    ],
    sources: [
      { path: 'dsh-client-ui-theme/lib/client.js', literal: '--dsw-specific-menu' },
      { path: 'dsh-client-ui-chat/lib/client.js', literal: '--dsw-specific-menu' },
    ],
    usedBy: 'src/client/utils/color.ts, src/client/wallpaper.ts',
  },
  {
    id: 'token.sidebarFill',
    group: 'token',
    kind: 'host-token',
    criticality: 'looks',
    since: '<=0.1.6',
    label: { en: 'Sidebar fill', zh: '左侧栏填充' },
    symptom: {
      en: 'the sidebar opacity slider stops tinting the sidebar',
      zh: '左侧栏透明度滑块失效',
    },
    target: '--dsw-specific-sidebar-fill',
    checks: [
      { kind: 'rule', match: '--dsw-specific-sidebar-fill', hint: 'sidebar fill' },
      { kind: 'computed', token: '--dsw-specific-sidebar-fill' },
    ],
    sources: [{ path: 'dsh-client-ui-theme/lib/client.js', literal: '--dsw-specific-sidebar-fill' }],
    usedBy: 'src/client/utils/color.ts, src/client/wallpaper.ts',
  },
  {
    id: 'token.inputFill',
    group: 'token',
    kind: 'host-token',
    criticality: 'looks',
    since: '<=0.1.6',
    label: { en: 'Input/control surface', zh: '输入与控件表面' },
    symptom: {
      en: 'the input slider stops tinting the composer and the controls',
      zh: '输入区透明度滑块失效',
    },
    target: '--dsw-specific-input-major',
    checks: [
      { kind: 'rule', match: '--dsw-specific-input-major', hint: 'input/control fill' },
      { kind: 'computed', token: '--dsw-specific-input-major' },
    ],
    sources: [{ path: 'dsh-client-ui-theme/lib/client.js', literal: '--dsw-specific-input-major' }],
    usedBy: 'src/client/utils/color.ts, src/client/wallpaper.ts',
  },
  {
    id: 'token.schemeFlag',
    group: 'token',
    kind: 'host-attr',
    criticality: 'core',
    since: '<=0.1.6',
    label: { en: 'Dark-scheme flag on <body>', zh: '<body> 上的深色标记' },
    symptom: {
      en: 'a dark rule can no longer force the dark palette — light surfaces flash through',
      zh: '深色规则无法强制深色调色板，会闪出浅色表面',
    },
    target: 'body[data-ds-dark-theme]',
    checks: [{ kind: 'rule', match: 'data-ds-dark-theme', hint: 'dark scheme attribute' }],
    sources: [
      { path: 'dsh-client-ui-theme/lib/client.js', literal: 'data-ds-dark-theme' },
      // Directory source: the served frontend's asset files carry content hashes
      // in their names (`index-<hash>.css`), so naming one would rot on every dsh
      // release for no reason. The whole assets directory is searched instead.
      { path: '.', literal: 'data-ds-dark-theme', root: 'frontend' },
    ],
    usedBy: 'src/client/wallpaper.ts',
  },
  {
    id: 'token.labelCaption',
    group: 'token',
    kind: 'host-token',
    criticality: 'label',
    since: '<=0.1.6',
    label: { en: 'Caption label token', zh: '弱化文字令牌' },
    symptom: {
      en: 'placeholder text falls back to a hard-coded grey instead of the theme\'s caption colour',
      zh: '占位文字退回固定灰色，不再跟随主题的弱化色',
    },
    target: '--dsw-alias-label-caption',
    checks: [
      { kind: 'rule', match: '--dsw-alias-label-caption', hint: 'label palette' },
      { kind: 'computed', token: '--dsw-alias-label-caption' },
    ],
    sources: [{ path: 'dsh-client-ui-theme/lib/client.js', literal: '--dsw-alias-label-caption' }],
    usedBy: 'src/client/wallpaper.ts',
  },
]

/** The plugin's own copy of the host floor — kept next to the contracts it guards. */
export const DSH_FLOOR = '0.1.7-rc.2'

/** Localized label lookup for a contract. */
export function labelOf(c: HostContract, lang: Lang): string {
  return lang === 'zh' ? c.label.zh : c.label.en
}

/** Localized symptom lookup for a contract. */
export function symptomOf(c: HostContract, lang: Lang): string {
  return lang === 'zh' ? c.symptom.zh : c.symptom.en
}

/** The two UI languages this plugin ships. */
export type Lang = 'zh' | 'en'

/** Groups the panel renders, in order. */
export const CONTRACT_GROUPS: ReadonlyArray<{ id: HostContract['group']; label: { en: string; zh: string } }> = [
  { id: 'model', label: { en: 'Model → rule resolution', zh: '模型 → 规则匹配' } },
  { id: 'surface', label: { en: 'Surfaces the plugin paints', zh: '插件着色的界面区域' } },
  { id: 'token', label: { en: 'Design tokens re-emitted', zh: '被重新发出的设计令牌' } },
  { id: 'region', label: { en: 'Conversation views', zh: '对话视图' } },
]

// ── The report shape ────────────────────────────────────────────────────────
// Declared here rather than in either half: the browser probe and the on-disk
// scan both produce it, the panel renders both, and the node half must not have
// to import a client module to describe its own answer.

export type CheckStatus = 'pass' | 'fail' | 'skip' | 'info'

/** What one contract point looks like on a given host. */
export interface ContractResult {
  id: string
  /** Localized label of the contract point. */
  label: string
  /** Localized consequence of the contract being gone. */
  symptom: string
  status: CheckStatus
  /** Technical one-liner: what ran, and what came back. */
  detail: string
  /** Human-readable reason when the status is `fail`. */
  reason?: string
  /** The literal contract value, for the report. */
  target: string
  /** Where the host defines it. */
  sources: readonly ContractSource[]
  /** This plugin's file that reads it. */
  usedBy: string
  /** Every check that ran, with its own verdict (for the report). */
  checks: string[]
}

/** The model-resolution facts the panel shows next to the contracts. */
export interface ModelFacts {
  /** The match text the active rule was chosen by. */
  text: string
  /** Which source answered: this session's own selection, or the host default. */
  source: 'session' | 'default'
  /** The failing hop when nothing per-session could be read. */
  note: string
  /** Label of the rule the model resolved to ('' when there is none). */
  rule: string
  /** Whether that rule was a real match or the fallback. */
  matched: boolean
}

/** One self-check run: `client` = live DOM probe, `node` = installed files. */
export interface HostReport {
  phase: 'client' | 'node'
  at: string
  plugin: { version: string; floor: string }
  host: {
    version: string
    /** Whether the host satisfies this plugin's declared floor (null = unknown). */
    compatible: boolean | null
    node: string
    /** Where the host packages were found (node half only). */
    root: string
    /** Why no version could be read, when that happened. */
    note: string
    model?: ModelFacts
  }
  results: ContractResult[]
  summary: { pass: number; fail: number; skip: number; total: number }
}

/** Overall verdict of a report, for the panel's headline. */
export function verdictOf(report: HostReport): 'ok' | 'partial' | 'broken' | 'unknown' {
  if (report.results.length === 0) return 'unknown'
  if (report.summary.fail > 0) return report.summary.pass > 0 ? 'partial' : 'broken'
  return report.summary.pass > 0 ? 'ok' : 'unknown'
}

/** Markdown rendering of a report — the thing a user pastes into an issue. */
export function reportToMarkdown(report: HostReport, lang: Lang): string {
  const zh = lang === 'zh'
  const lines: string[] = []
  lines.push(zh ? '## dsh-background-by-model 宿主自检' : '## dsh-background-by-model host check')
  lines.push('')
  lines.push(`- ${zh ? '阶段' : 'phase'}: ${report.phase}`)
  if (report.plugin.version !== '') lines.push(`- ${zh ? '插件' : 'plugin'}: ${report.plugin.version} (dsh >=${report.plugin.floor})`)
  lines.push(`- dsh: ${report.host.version !== '' ? report.host.version : (zh ? '未读到' : 'unreadable')}${report.host.compatible === false ? (zh ? '（低于插件下限）' : ' (below the plugin floor)') : ''}`)
  if (report.host.node !== '') lines.push(`- node: ${report.host.node}`)
  if (report.host.root !== '') lines.push(`- host root: ${report.host.root}`)
  if (report.host.note !== '') lines.push(`- note: ${report.host.note}`)
  if (report.host.model !== undefined) {
    const m = report.host.model
    lines.push(`- ${zh ? '模型' : 'model'}: \`${m.text !== '' ? m.text : '(none)'}\` · ${m.source}${m.note !== '' ? ` · ${m.note}` : ''} · ${zh ? '规则' : 'rule'} ${m.rule !== '' ? m.rule : '-'}${m.matched ? '' : zh ? '（兜底）' : ' (fallback)'}`)
  }
  lines.push('')
  lines.push(`### ${zh ? '结论' : 'Summary'}: ${report.summary.pass} pass / ${report.summary.fail} fail / ${report.summary.skip} n/a`)
  lines.push('')
  for (const r of report.results) {
    const mark = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? '**FAIL**' : r.status === 'skip' ? 'n/a' : 'info'
    lines.push(`- ${mark} \`${r.id}\` — ${r.label} · \`${r.target}\``)
    if (r.status === 'fail') {
      lines.push(`  - ${zh ? '现象' : 'symptom'}: ${r.symptom}`)
      lines.push(`  - ${zh ? '原因' : 'reason'}: ${r.reason ?? r.detail}`)
      lines.push(`  - ${zh ? '期望位置' : 'expected in'}: ${r.sources.map(s => s.path).join(', ')}`)
    } else if (r.detail !== '') {
      lines.push(`  - ${r.detail}`)
    }
  }
  return lines.join('\n')
}

