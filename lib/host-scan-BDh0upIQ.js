import { createRequire } from "node:module";
import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
//#region src/host-contracts.ts
const SIDEBAR_RIGHT = "dsh-client-ui-sidebar-right";
/**
* The contract table.
*
* Ordered by group and then by how visible a break is: the model hop first (the
* plugin's whole purpose), then the surfaces it paints, then the tokens it
* re-emits, then the regions it decorates.
*/
const HOST_CONTRACTS = [
	{
		id: "sessions.list",
		group: "model",
		kind: "host-service",
		criticality: "core",
		since: "0.1.7",
		label: {
			en: "Session list service",
			zh: "会话列表服务"
		},
		symptom: {
			en: "no session id can be read, so the background is stuck on rule 1 and never follows the model",
			zh: "读不到会话 id，背景会一直停在规则 1，不再跟着模型切换"
		},
		target: "sessions.list",
		checks: [
			{
				kind: "service",
				id: "sessions"
			},
			{
				kind: "path",
				service: "sessions",
				path: "list",
				expect: "observable"
			},
			{
				kind: "path",
				service: "sessions",
				path: "list.getSnapshot",
				expect: "function"
			}
		],
		sources: [{
			path: "dsh-api-session-controller/lib/client.js",
			literal: "retainedBy"
		}],
		usedBy: "src/client/modelbg.ts"
	},
	{
		id: "sessions.list.current",
		group: "model",
		kind: "host-service",
		criticality: "label",
		since: "<=0.1.6",
		label: {
			en: "Session list: legacy current id",
			zh: "会话列表：旧版 current 字段"
		},
		symptom: {
			en: "harmless on its own — the 0.1.7 hops below take over",
			zh: "本身无害 —— 0.1.7 上由下面的兜底路径接管"
		},
		target: "list.current",
		checks: [],
		sources: [{
			path: "dsh-api-session-controller/lib/client.js",
			literal: "retainedBy"
		}],
		usedBy: "src/client/modelbg.ts"
	},
	{
		id: "sessions.retainedBy.mainView",
		group: "model",
		kind: "host-service",
		criticality: "label",
		since: "0.1.7",
		label: {
			en: "Main-view retention on the session row",
			zh: "会话行的主视图占用标记"
		},
		symptom: {
			en: "while uiSession is not mounted yet, no session id can be derived",
			zh: "uiSession 尚未挂载时推导不出会话 id"
		},
		target: "byId[].retainedBy.mainView",
		checks: [],
		sources: [{
			path: "dsh-api-session-controller/lib/client.js",
			literal: "retainedBy"
		}],
		usedBy: "src/client/modelbg.ts"
	},
	{
		id: "uiSession.current",
		group: "model",
		kind: "host-service",
		criticality: "core",
		since: "0.1.7",
		label: {
			en: "uiSession service (main view session)",
			zh: "uiSession 服务（主视图会话）"
		},
		symptom: {
			en: "the session id can only be guessed from the list retention",
			zh: "会话 id 只能退回用列表占用标记去猜"
		},
		target: "uiSession.current",
		checks: [{
			kind: "path",
			service: "uiSession",
			path: "current",
			expect: "observable"
		}],
		sources: [{
			path: "dsh-client-ui-session/lib/client.js",
			literal: "uiSession"
		}],
		usedBy: "src/client/modelbg.ts"
	},
	{
		id: "sessions.binding.projections",
		group: "model",
		kind: "host-service",
		criticality: "core",
		since: "<=0.1.6",
		label: {
			en: "Session binding + projections",
			zh: "会话 binding 与 projections"
		},
		symptom: {
			en: "this session's own model selection is unreadable — only the host default is left",
			zh: "读不到本会话自己的模型选择，只剩宿主默认模型可用"
		},
		target: "binding(id).session.projections.faceOf(\"modelSelection\")",
		checks: [{
			kind: "path",
			service: "sessions",
			path: "binding",
			expect: "function"
		}],
		sources: [{
			path: "dsh-api-session-controller/lib/client.js",
			literal: "faceOf"
		}],
		usedBy: "src/client/modelbg.ts"
	},
	{
		id: "modelDirectories.directoryFor",
		group: "model",
		kind: "host-service",
		criticality: "label",
		since: "<=0.1.6",
		label: {
			en: "Model directory (display names)",
			zh: "模型目录（显示名）"
		},
		symptom: {
			en: "the model is shown as provider/model id instead of its display name",
			zh: "模型只会显示 provider/模型 id，读不到显示名"
		},
		target: "modelDirectories.directoryFor(id)",
		checks: [{
			kind: "path",
			service: "modelDirectories",
			path: "directoryFor",
			expect: "function"
		}],
		sources: [{
			path: "dsh-client-ui-model-selection/lib/client.js",
			literal: "modelSelection"
		}],
		usedBy: "src/client/modelbg.ts"
	},
	{
		id: "shell.overlay",
		group: "surface",
		kind: "host-attr",
		criticality: "looks",
		since: "<=0.1.6",
		label: {
			en: "AppFrame overlay + its three columns",
			zh: "主框架浮层与三列"
		},
		symptom: {
			en: "per-part blur and the main-background opacity cannot find the columns at all",
			zh: "分区域模糊与主背景透明度完全找不到那几列"
		},
		target: "[data-shell-overlay]",
		checks: [{
			kind: "attr",
			attr: "data-shell-overlay"
		}],
		sources: [{
			path: "dsh-client-ui-layout/lib/client.js",
			literal: "data-shell-overlay"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "settings.dialog",
		group: "surface",
		kind: "dom-selector",
		criticality: "looks",
		since: "<=0.1.6",
		label: {
			en: "Settings dialog (aria-modal)",
			zh: "设置弹窗（aria-modal）"
		},
		symptom: {
			en: "the settings panel opacity and blur sliders stop having any effect",
			zh: "设置界面透明度与模糊失效"
		},
		target: "[role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]",
		checks: [{
			kind: "selector",
			selector: "div[role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]",
			optionalWhen: "settingsClosed"
		}],
		sources: [{
			path: "dsh-client-ui-primitives/lib/index.js",
			literal: "aria-modal"
		}, {
			path: "src/client/components/ui.css.ts",
			literal: ".dab-card"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "settings.card",
		group: "surface",
		kind: "host-style",
		criticality: "looks",
		since: "<=0.1.6",
		label: {
			en: "Option card inside the dialog (.dab-card)",
			zh: "弹窗内的选项卡（.dab-card）"
		},
		symptom: {
			en: "the dialog option-panel blur has nothing to attach to",
			zh: "弹窗内选项卡的模糊没有附着对象"
		},
		target: ".dab-card",
		checks: [{
			kind: "rule",
			match: ".dab-card",
			hint: "settings dialog card class"
		}],
		sources: [{
			path: "src/client/components/ui.css.ts",
			literal: ".dab-card"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "composer.card",
		group: "surface",
		kind: "host-attr",
		criticality: "looks",
		since: "<=0.1.6",
		label: {
			en: "Composer card",
			zh: "输入框卡片"
		},
		symptom: {
			en: "the composer loses its backdrop — the input blur slider does nothing",
			zh: "输入框失去毛玻璃背板，输入区模糊滑块失效"
		},
		target: "[data-composer-card]",
		checks: [{
			kind: "attr",
			attr: "data-composer-card",
			optionalWhen: "chatNotMounted"
		}],
		sources: [{
			path: "dsh-client-ui-conversation/lib/client.js",
			literal: "data-composer-card"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "cordis.panel",
		group: "surface",
		kind: "host-attr",
		criticality: "label",
		since: "<=0.1.6",
		label: {
			en: "Cordis panel",
			zh: "Cordis 面板"
		},
		symptom: {
			en: "the Cordis panel keeps the host surface instead of the input slider's alpha",
			zh: "Cordis 面板拿不到输入区滑块的透明度，仍是宿主表面"
		},
		target: "[data-cordis-panel]",
		checks: [{
			kind: "attr",
			attr: "data-cordis-panel",
			optionalWhen: "cordisClosed"
		}],
		sources: [{
			path: "dsh-client-ui-cordis/lib/client.js",
			literal: "data-cordis-panel"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "rightbar.panel",
		group: "surface",
		kind: "host-attr",
		criticality: "looks",
		since: "0.1.7",
		label: {
			en: "File-preview panel host",
			zh: "文件预览面板宿主"
		},
		symptom: {
			en: "the right panel loses its own opacity/blur card and falls back to the main background",
			zh: "右侧栏失去自己的透明度/模糊控制，退回跟随主背景"
		},
		target: "[data-sidebar-right-panel]",
		checks: [{
			kind: "selector",
			selector: "div[data-sidebar-right-panel]",
			optionalWhen: "noRightPanel"
		}],
		sources: [{
			path: `${SIDEBAR_RIGHT}/lib/client.js`,
			literal: "data-sidebar-right-panel"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "rightbar.openFlag",
		group: "surface",
		kind: "host-attr",
		criticality: "looks",
		since: "0.1.7",
		label: {
			en: "Right panel open/closed flag",
			zh: "右侧栏开合标记"
		},
		symptom: {
			en: "the panel's backdrop cannot tell open from closed — a frosted plate covers the empty half",
			zh: "分不清右侧栏开着还是关着，空白的右半屏会出现磨砂板"
		},
		target: "[data-sidebar-right-open]",
		checks: [{
			kind: "rule",
			match: "[data-sidebar-right-open]",
			hint: "right panel open flag"
		}],
		sources: [{
			path: `${SIDEBAR_RIGHT}/lib/client.js`,
			literal: "data-sidebar-right-open"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "dockkit.content",
		group: "surface",
		kind: "host-attr",
		criticality: "core",
		since: "0.1.7",
		label: {
			en: "Dock tab host (the panel's painted surface)",
			zh: "停靠页宿主（面板真正的表面）"
		},
		symptom: {
			en: "nothing carries the panel surface any more — the right-panel card is painted on a container that is always full width",
			zh: "面板表面不再落在任何元素上，右面板卡片会被画在一个恒定满宽的容器上"
		},
		target: "[data-dockkit-content]",
		checks: [{
			kind: "rule",
			match: "[data-dockkit-content]",
			hint: "dock tab host"
		}],
		sources: [{
			path: ".",
			literal: "dockkit-content",
			root: "frontend"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "dockkit.empty",
		group: "surface",
		kind: "host-attr",
		criticality: "looks",
		since: "0.1.7",
		label: {
			en: "Dock empty seat",
			zh: "停靠空位"
		},
		symptom: {
			en: "an empty preview pane paints the host surface over the wallpaper",
			zh: "空的预览格会用宿主表面盖住壁纸"
		},
		target: "[data-dockkit-empty]",
		checks: [{
			kind: "rule",
			match: "[data-dockkit-empty]",
			hint: "dock empty seat"
		}],
		sources: [{
			path: `${SIDEBAR_RIGHT}/lib/client.js`,
			literal: "data-dockkit-empty"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "dockkit.float",
		group: "surface",
		kind: "host-attr",
		criticality: "label",
		since: "0.1.7",
		label: {
			en: "Floating dock pane flag",
			zh: "浮动停靠面板标记"
		},
		symptom: {
			en: "floating panes would be painted like docked ones, frosting a panel that should stay the host's",
			zh: "浮动面板会被当作停靠面板上色，本该保持宿主样式的面板被磨砂"
		},
		target: "[data-dockkit-float]",
		checks: [{
			kind: "rule",
			match: "[data-dockkit-float]",
			hint: "floating pane flag"
		}],
		sources: [{
			path: `${SIDEBAR_RIGHT}/lib/client.js`,
			literal: "data-dockkit-float"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "chat.flow",
		group: "region",
		kind: "dom-selector",
		criticality: "looks",
		since: "<=0.1.6",
		label: {
			en: "Chat message column",
			zh: "对话消息列"
		},
		symptom: {
			en: "the conversation card (and its opacity/blur) cannot find the message column",
			zh: "对话卡片（及其透明度/模糊）找不到消息列"
		},
		target: "[data-chat-flow]",
		checks: [{
			kind: "selector",
			selector: "[data-chat-flow]",
			optionalWhen: "chatNotMounted"
		}],
		sources: [{
			path: "dsh-client-ui-chat/lib/client.js",
			literal: "data-chat-flow"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "conversation.scroll",
		group: "region",
		kind: "dom-selector",
		criticality: "looks",
		since: "<=0.1.6",
		label: {
			en: "Conversation scrollport",
			zh: "对话滚动区"
		},
		symptom: {
			en: "the marker-less fallback would wrap the whole scrollport in the conversation card",
			zh: "标记缺失时的兜底会把整个滚动区套上对话卡片"
		},
		target: "[data-conversation-scroll]",
		checks: [{
			kind: "selector",
			selector: "[data-conversation-scroll]",
			optionalWhen: "chatNotMounted"
		}],
		sources: [{
			path: "dsh-client-ui-conversation/lib/client.js",
			literal: "data-conversation-scroll"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "trajectory.root",
		group: "region",
		kind: "dom-selector",
		criticality: "looks",
		since: "<=0.1.6",
		label: {
			en: "Trajectory view root",
			zh: "轨迹页根节点"
		},
		symptom: {
			en: "the trajectory opacity/blur sliders stop reaching the trajectory page",
			zh: "轨迹页的透明度与模糊滑块失效"
		},
		target: "[data-conversation-composer-overlay]",
		checks: [{
			kind: "selector",
			selector: "[data-conversation-composer-overlay]",
			optionalWhen: "trajectoryNotMounted"
		}],
		sources: [{
			path: "dsh-client-ui-trajectory/lib/client.js",
			literal: "data-conversation-composer-overlay"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "markdown.wideTable",
		group: "region",
		kind: "host-style",
		criticality: "label",
		since: "<=0.1.6",
		label: {
			en: "Wide markdown table clamp",
			zh: "宽表格收拢样式"
		},
		symptom: {
			en: "a wide table bleeds outside the conversation card instead of scrolling inside it",
			zh: "宽表格会溢出到对话卡片外，而不是在卡片内横向滚动"
		},
		target: ".md-table-wide",
		checks: [{
			kind: "rule",
			match: ".md-table-wide",
			hint: "markdown table class"
		}],
		sources: [{
			path: "dsh-client-ui-chat/lib/client.js",
			literal: "md-table-wide"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "token.bgBase",
		group: "token",
		kind: "host-token",
		criticality: "looks",
		since: "<=0.1.6",
		label: {
			en: "Main background surface",
			zh: "主背景表面"
		},
		symptom: {
			en: "the main-background slider and the right-panel card lose their surface",
			zh: "主背景透明度与右侧栏卡片失去表面色"
		},
		target: "--dsw-alias-bg-base",
		checks: [{
			kind: "computed",
			token: "--dsw-alias-bg-base"
		}],
		sources: [{
			path: "dsh-client-ui-theme/lib/client.js",
			literal: "--dsw-alias-bg-base"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "token.layers",
		group: "token",
		kind: "host-token",
		criticality: "looks",
		since: "<=0.1.6",
		label: {
			en: "Layered surfaces (cards)",
			zh: "层次表面（卡片）"
		},
		symptom: {
			en: "the card slider, the conversation card and the trajectory slider go blank",
			zh: "卡片滑块、对话卡片与轨迹滑块失去颜色"
		},
		target: "--dsw-alias-bg-layer-1/2/3",
		checks: [
			{
				kind: "computed",
				token: "--dsw-alias-bg-layer-1"
			},
			{
				kind: "computed",
				token: "--dsw-alias-bg-layer-2"
			},
			{
				kind: "computed",
				token: "--dsw-alias-bg-layer-3"
			}
		],
		sources: [{
			path: "dsh-client-ui-theme/lib/client.js",
			literal: "--dsw-alias-bg-layer-1"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "token.menuSurface",
		group: "token",
		kind: "host-token",
		criticality: "core",
		since: "0.1.7",
		label: {
			en: "Menu material fill (0.1.7 split)",
			zh: "菜单材质填充（0.1.7 拆分）"
		},
		symptom: {
			en: "the menu panel and its sticky group headings take two different fills — the solid band across the model picker",
			zh: "菜单面板与吸顶分组标题用了两种填充 —— 模型选择器上那道白道"
		},
		target: "--dsw-menu-surface-fill",
		checks: [{
			kind: "rule",
			match: "--dsw-menu-surface-fill",
			hint: "MenuSurface material fill"
		}, {
			kind: "computed",
			token: "--dsw-menu-surface-fill",
			on: ".dab-root"
		}],
		sources: [{
			path: "dsh-client-ui-theme/lib/client.js",
			literal: "--dsw-menu-surface-fill"
		}, {
			path: "dsh-client-ui-primitives/lib/MenuSurface.module.css",
			literal: "var(--dsw-menu-surface-fill)"
		}],
		usedBy: "src/client/utils/color.ts, src/client/wallpaper.ts"
	},
	{
		id: "token.menuAlias",
		group: "token",
		kind: "host-token",
		criticality: "looks",
		since: "<=0.1.6",
		label: {
			en: "Menu overlay fill",
			zh: "菜单浮层填充"
		},
		symptom: {
			en: "dropdowns, the slash menu and popovers keep the host fill while the panel follows the plugin",
			zh: "下拉、斜杠菜单与浮层保持宿主填充，而面板跟随插件，两边不一致"
		},
		target: "--dsw-specific-menu",
		checks: [{
			kind: "rule",
			match: "--dsw-specific-menu",
			hint: "menu overlay fill"
		}, {
			kind: "computed",
			token: "--dsw-specific-menu",
			on: ".dab-root"
		}],
		sources: [{
			path: "dsh-client-ui-theme/lib/client.js",
			literal: "--dsw-specific-menu"
		}, {
			path: "dsh-client-ui-chat/lib/client.js",
			literal: "--dsw-specific-menu"
		}],
		usedBy: "src/client/utils/color.ts, src/client/wallpaper.ts"
	},
	{
		id: "token.sidebarFill",
		group: "token",
		kind: "host-token",
		criticality: "looks",
		since: "<=0.1.6",
		label: {
			en: "Sidebar fill",
			zh: "左侧栏填充"
		},
		symptom: {
			en: "the sidebar opacity slider stops tinting the sidebar",
			zh: "左侧栏透明度滑块失效"
		},
		target: "--dsw-specific-sidebar-fill",
		checks: [{
			kind: "computed",
			token: "--dsw-specific-sidebar-fill"
		}],
		sources: [{
			path: "dsh-client-ui-theme/lib/client.js",
			literal: "--dsw-specific-sidebar-fill"
		}],
		usedBy: "src/client/utils/color.ts, src/client/wallpaper.ts"
	},
	{
		id: "token.inputFill",
		group: "token",
		kind: "host-token",
		criticality: "looks",
		since: "<=0.1.6",
		label: {
			en: "Input/control surface",
			zh: "输入与控件表面"
		},
		symptom: {
			en: "the input slider stops tinting the composer and the controls",
			zh: "输入区透明度滑块失效"
		},
		target: "--dsw-specific-input-major",
		checks: [{
			kind: "computed",
			token: "--dsw-specific-input-major"
		}],
		sources: [{
			path: "dsh-client-ui-theme/lib/client.js",
			literal: "--dsw-specific-input-major"
		}],
		usedBy: "src/client/utils/color.ts, src/client/wallpaper.ts"
	},
	{
		id: "token.schemeFlag",
		group: "token",
		kind: "host-attr",
		criticality: "core",
		since: "<=0.1.6",
		label: {
			en: "Dark-scheme flag on <body>",
			zh: "<body> 上的深色标记"
		},
		symptom: {
			en: "a dark rule can no longer force the dark palette — light surfaces flash through",
			zh: "深色规则无法强制深色调色板，会闪出浅色表面"
		},
		target: "body[data-ds-dark-theme]",
		checks: [{
			kind: "rule",
			match: "data-ds-dark-theme",
			hint: "dark scheme attribute"
		}],
		sources: [{
			path: "dsh-client-ui-theme/lib/client.js",
			literal: "data-ds-dark-theme"
		}, {
			path: ".",
			literal: "data-ds-dark-theme",
			root: "frontend"
		}],
		usedBy: "src/client/wallpaper.ts"
	},
	{
		id: "token.labelCaption",
		group: "token",
		kind: "host-token",
		criticality: "label",
		since: "<=0.1.6",
		label: {
			en: "Caption label token",
			zh: "弱化文字令牌"
		},
		symptom: {
			en: "placeholder text falls back to a hard-coded grey instead of the theme's caption colour",
			zh: "占位文字退回固定灰色，不再跟随主题的弱化色"
		},
		target: "--dsw-alias-label-caption",
		checks: [{
			kind: "computed",
			token: "--dsw-alias-label-caption"
		}],
		sources: [{
			path: "dsh-client-ui-theme/lib/client.js",
			literal: "--dsw-alias-label-caption"
		}],
		usedBy: "src/client/wallpaper.ts"
	}
];
/** The plugin's own copy of the host floor — kept next to the contracts it guards. */
const DSH_FLOOR = "0.1.7-rc.2";
/** Localized label lookup for a contract. */
function labelOf(c, lang) {
	return lang === "zh" ? c.label.zh : c.label.en;
}
/** Localized symptom lookup for a contract. */
function symptomOf(c, lang) {
	return lang === "zh" ? c.symptom.zh : c.symptom.en;
}
/** Groups the panel renders, in order. */
const CONTRACT_GROUPS = [
	{
		id: "model",
		label: {
			en: "Model → rule resolution",
			zh: "模型 → 规则匹配"
		}
	},
	{
		id: "surface",
		label: {
			en: "Surfaces the plugin paints",
			zh: "插件着色的界面区域"
		}
	},
	{
		id: "token",
		label: {
			en: "Design tokens re-emitted",
			zh: "被重新发出的设计令牌"
		}
	},
	{
		id: "region",
		label: {
			en: "Conversation views",
			zh: "对话视图"
		}
	}
];
/** Overall verdict of a report, for the panel's headline. */
function verdictOf(report) {
	if (report.results.length === 0) return "unknown";
	if (report.summary.fail > 0) return report.summary.pass > 0 ? "partial" : "broken";
	return report.summary.pass > 0 ? "ok" : "unknown";
}
/** Markdown rendering of a report — the thing a user pastes into an issue. */
function reportToMarkdown(report, lang) {
	const zh = lang === "zh";
	const lines = [];
	lines.push(zh ? "## dsh-background-by-model 宿主自检" : "## dsh-background-by-model host check");
	lines.push("");
	lines.push(`- ${zh ? "阶段" : "phase"}: ${report.phase}`);
	if (report.plugin.version !== "") lines.push(`- ${zh ? "插件" : "plugin"}: ${report.plugin.version} (dsh >=${report.plugin.floor})`);
	lines.push(`- dsh: ${report.host.version !== "" ? report.host.version : zh ? "未读到" : "unreadable"}${report.host.compatible === false ? zh ? "（低于插件下限）" : " (below the plugin floor)" : ""}`);
	if (report.host.node !== "") lines.push(`- node: ${report.host.node}`);
	if (report.host.root !== "") lines.push(`- host root: ${report.host.root}`);
	if (report.host.note !== "") lines.push(`- note: ${report.host.note}`);
	if (report.host.model !== void 0) {
		const m = report.host.model;
		lines.push(`- ${zh ? "模型" : "model"}: \`${m.text !== "" ? m.text : "(none)"}\` · ${m.source}${m.note !== "" ? ` · ${m.note}` : ""} · ${zh ? "规则" : "rule"} ${m.rule !== "" ? m.rule : "-"}${m.matched ? "" : zh ? "（兜底）" : " (fallback)"}`);
	}
	lines.push("");
	lines.push(`### ${zh ? "结论" : "Summary"}: ${report.summary.pass} pass / ${report.summary.fail} fail / ${report.summary.skip} n/a`);
	lines.push("");
	for (const r of report.results) {
		const mark = r.status === "pass" ? "PASS" : r.status === "fail" ? "**FAIL**" : r.status === "skip" ? "n/a" : "info";
		lines.push(`- ${mark} \`${r.id}\` — ${r.label} · \`${r.target}\``);
		if (r.status === "fail") {
			lines.push(`  - ${zh ? "现象" : "symptom"}: ${r.symptom}`);
			lines.push(`  - ${zh ? "原因" : "reason"}: ${r.reason ?? r.detail}`);
			lines.push(`  - ${zh ? "期望位置" : "expected in"}: ${r.sources.map((s) => s.path).join(", ")}`);
		} else if (r.detail !== "") lines.push(`  - ${r.detail}`);
	}
	return lines.join("\n");
}
//#endregion
//#region src/host-scan.ts
/**
* The node half of the host self-check: what the INSTALLED dsh looks like on disk.
*
* The browser probe (../client/judge.ts) answers "does the running host still
* provide this", which is the question a user needs answered. This module answers
* the complementary one — "does the copy of dsh on this machine still contain the
* thing we depend on" — and it can do it with no browser, no DOM and no session,
* which makes it the half that runs in CI:
*
*   node .dsh-debug/contract-scan.mjs
*
* For every declaration in ../host-contracts it
*   1. reports whether the owning host file exists at all (a package that was
*      renamed or dropped answers here before anything reaches the screen), and
*   2. reports whether that file still contains the literal the plugin depends
*      on — the check that turns a silent 0.1.8 rename into a red line.
*
* It also reads the host's own version from the app-boot manifest, so the panel
* can show it and can say plainly when the runtime is older than this plugin's
* declared floor.
*/
const exists = async (p) => {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
};
/** Read a package's manifest version. */
async function versionOf(pkgDir) {
	try {
		const raw = JSON.parse(await readFile(join(pkgDir, "package.json"), "utf8"));
		return typeof raw.version === "string" ? raw.version : "";
	} catch {
		return "";
	}
}
/** Trim a `semver` build/prerelease down to the release triple for the floor test. */
function releaseTriple(v) {
	const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
	if (m === null) return null;
	return [
		Number(m[1]),
		Number(m[2]),
		Number(m[3])
	];
}
/**
* Is `version` at or above `floor`?
*
* Deliberately coarse: this is the panel's advisory "your dsh is older than what
* this plugin asks for" hint. The host's own gate is `peerDependencies` evaluated
* with `semver.satisfies(..., { includePrerelease: true })` — a prerelease pair
* like the floor itself compares equal here rather than being judged by semver's
* prerelease ordering rules, which would call `0.1.7-rc.2 >= 0.1.7-rc.2` true but
* `0.1.7-rc.10` below `0.1.7-rc.2` (string vs numeric ordering) and produce a
* baffling red line.
*/
function meetsFloor(version, floor) {
	const a = releaseTriple(version);
	const b = releaseTriple(floor);
	if (a === null || b === null) return null;
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
	return true;
}
/** The candidate module roots, nearest first. */
function candidateBases() {
	const bases = [];
	if (process.env.DAB_HOST_ROOT !== void 0 && process.env.DAB_HOST_ROOT !== "") bases.push(resolve(process.env.DAB_HOST_ROOT));
	const argv1 = process.argv[1];
	if (typeof argv1 === "string" && argv1 !== "") {
		bases.push(dirname(resolve(argv1)));
		bases.push(resolve(dirname(resolve(argv1)), ".."));
	}
	return bases;
}
/**
* Locate the installed host packages.
*
* Tried in order: an explicit `DAB_HOST_ROOT`, module resolution from the running
* dsh process's entry script, then a walk up from this plugin's own directory (the
* plugin sits inside `<profile>/node_modules`, whose parent dsh installation is
* the one that loaded it). Every attempt is recorded so a miss can be reported
* instead of guessed at.
*/
async function resolveHostRoots(pluginDir) {
	const tried = [];
	const check = async (base) => {
		tried.push(base);
		return await exists(join(base, "@deepseek-ai", "dsh-app-boot", "package.json"));
	};
	for (const base of candidateBases()) for (const candidate of [
		base,
		join(base, "node_modules"),
		join(base, "..", "node_modules")
	]) {
		const normalized = resolve(candidate);
		if (await check(normalized)) return {
			roots: rootOf(normalized),
			note: "",
			tried
		};
	}
	for (const from of [join(pluginDir, "lib", "index.js"), join(pluginDir, "src", "index.ts")]) try {
		const manifest = createRequire(from).resolve("@deepseek-ai/dsh/package.json");
		const base = dirname(dirname(manifest));
		if (await check(base)) return {
			roots: rootOf(base),
			note: "",
			tried
		};
	} catch {}
	let dir = resolve(pluginDir);
	for (let depth = 0; depth < 8; depth++) {
		const base = join(dir, "node_modules");
		if (await check(resolve(base))) return {
			roots: rootOf(resolve(base)),
			note: "",
			tried
		};
		const parent = resolve(dir, "..");
		if (parent === dir) break;
		dir = parent;
	}
	return {
		roots: null,
		note: "the installed dsh packages were not found from this plugin; set DAB_HOST_ROOT to the node_modules directory that holds @deepseek-ai/dsh-app-boot",
		tried
	};
}
/** Derive every root from a validated `<...>/node_modules` base. */
function rootOf(base) {
	const packages = join(base, "@deepseek-ai");
	return {
		packages,
		frontend: join(packages, "dsh-web-frontend", "dist", "assets"),
		dsh: join(packages, "dsh")
	};
}
/**
* Search a directory (not recursively) for a literal.
*
* Used by sources whose `path` is `.`: the frontend's asset filenames carry
* content hashes, so the check is "is this literal still served", not "is this
* exact file still there". Text-ish files only — a literal cannot appear in a
* font or an image, and reading 20 of them would only slow the probe down.
*/
async function directoryMentions(dir, literal) {
	let names;
	try {
		names = await readdir(dir);
	} catch {
		return {
			ok: false,
			detail: "directory missing"
		};
	}
	const searched = [];
	for (const name of names) {
		if (!/\.(?:js|mjs|cjs|css|html|json)$/i.test(name)) continue;
		searched.push(name);
		try {
			if ((await readFile(join(dir, name), "utf8")).includes(literal)) return {
				ok: true,
				detail: `found in ${name}`
			};
		} catch {}
	}
	return {
		ok: false,
		detail: searched.length === 0 ? "no script or stylesheet in the directory" : `not in any of ${searched.length} file(s)`
	};
}
async function checkSource(source, roots, pluginDir) {
	const root = source.root === "frontend" ? roots.frontend : roots.packages;
	if (source.path === ".") {
		const { ok, detail } = await directoryMentions(root, source.literal);
		return {
			path: `${root} (*)`,
			literal: source.literal,
			status: ok ? "pass" : "fail",
			detail
		};
	}
	const file = source.path.startsWith("src/") ? join(pluginDir, source.path) : join(root, source.path);
	if (!await exists(file)) return {
		path: source.path,
		literal: source.literal,
		status: "fail",
		detail: "file missing"
	};
	let text;
	try {
		text = await readFile(file, "utf8");
	} catch (e) {
		return {
			path: source.path,
			literal: source.literal,
			status: "fail",
			detail: `unreadable: ${e instanceof Error ? e.message : String(e)}`
		};
	}
	return text.includes(source.literal) ? {
		path: source.path,
		literal: source.literal,
		status: "pass",
		detail: "literal present"
	} : {
		path: source.path,
		literal: source.literal,
		status: "fail",
		detail: `literal ${JSON.stringify(source.literal)} no longer present`
	};
}
/**
* Scan the installed host against every contract declaration.
*
* `lang` only selects the label/symptom language of the returned rows.
*/
async function checkHostOnDisk(pluginDir, lang) {
	const resolved = await resolveHostRoots(pluginDir);
	const roots = resolved.roots;
	const version = roots === null ? "" : await versionOf(roots.dsh);
	const compatible = version === "" ? null : meetsFloor(version, DSH_FLOOR);
	const results = [];
	for (const c of HOST_CONTRACTS) {
		const base = {
			id: c.id,
			label: labelOf(c, lang),
			symptom: symptomOf(c, lang),
			target: c.target,
			sources: c.sources,
			usedBy: c.usedBy,
			checks: []
		};
		if (roots === null) {
			results.push({
				...base,
				status: "skip",
				detail: resolved.note
			});
			continue;
		}
		const verdicts = [];
		for (const source of c.sources) verdicts.push(await checkSource(source, roots, pluginDir));
		const failed = verdicts.find((v) => v.status === "fail");
		base.checks = verdicts.map((v) => `${v.status} · ${v.path} — ${v.detail}`);
		if (failed === void 0) {
			results.push({
				...base,
				status: "pass",
				detail: `${verdicts.length} file(s) checked`
			});
			continue;
		}
		results.push({
			...base,
			status: "fail",
			detail: `${failed.path} — ${failed.detail}`,
			reason: lang === "zh" ? `宿主文件里已经找不到 ${failed.literal}（${failed.path}）` : `the host no longer contains ${failed.literal} (${failed.path})`
		});
	}
	const pass = results.filter((r) => r.status === "pass").length;
	const fail = results.filter((r) => r.status === "fail").length;
	const skip = results.filter((r) => r.status === "skip").length;
	return {
		phase: "node",
		at: (/* @__PURE__ */ new Date()).toISOString(),
		plugin: {
			version: "",
			floor: DSH_FLOOR
		},
		host: {
			version,
			compatible,
			node: process.version,
			root: roots?.dsh ?? "",
			note: resolved.note,
			model: void 0
		},
		results,
		summary: {
			pass,
			fail,
			skip,
			total: results.length
		}
	};
}
/** Absolute directory of this plugin — the anchor both halves resolve the host from. */
function thisPluginDir(importMetaUrl) {
	return resolve(dirname(fileURLToPath(importMetaUrl)), "..");
}
/** Every host package directory found under a root (used by the scan's summary). */
async function listHostPackages(roots) {
	try {
		return (await readdir(roots.packages, { withFileTypes: true })).filter((e) => e.isDirectory() && e.name.startsWith("dsh")).map((e) => e.name).sort();
	} catch {
		return [];
	}
}
//#endregion
export { thisPluginDir as a, DSH_FLOOR as c, reportToMarkdown as d, symptomOf as f, resolveHostRoots as i, HOST_CONTRACTS as l, listHostPackages as n, versionOf as o, verdictOf as p, meetsFloor as r, CONTRACT_GROUPS as s, checkHostOnDisk as t, labelOf as u };
