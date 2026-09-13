window.__ModuleLoader__.load({
	id: "dsh-background-by-model",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom = require("react-dom");
		//#region src/client/runtime.ts
		function resolveStore() {
			try {
				return require("@deepseek-ai/dsh-client-store");
			} catch {}
			return require("@deepseek-ai/dsh-client-runtime/client");
		}
		const defineStore = resolveStore().defineStore;
		//#endregion
		//#region src/client/i18n.ts
		const NS = "settings.anyBg";
		const zh = {
			nav: "模型背景",
			brandTag: "按模型换背景",
			close: "关闭",
			pageInterface: "界面",
			pageModelBg: "模型背景",
			pageProfile: "配置",
			descInterface: "为主界面的各个区域单独调节透明度与模糊，营造空间层次感。这里的设置对所有模型生效",
			descModelBg: "每条规则 = 一个匹配串 + 一套背景外观。切换模型时，从上往下找第一条匹配串出现在模型名里的规则；都没中就使用第 1 条",
			descProfile: "把当前全部规则连同图片导出备份，或从文件一键恢复",
			uiTitle: "主界面",
			uiOpacity: "透明度",
			uiBlur: "模糊度",
			uiOpacityBg: "主背景",
			uiOpacitySide: "侧边栏",
			uiOpacityCard: "对话框中选项面板",
			uiOpacityInput: "输入框与控件",
			uiSop: "设置界面透明度",
			uiChatRegion: "对话文本框",
			uiTrajectory: "轨迹页",
			uiScopeHint: "界面页的设置是全局的，所有模型共用",
			statusTitle: "当前生效",
			statusModel: "当前模型",
			statusUnknown: "未检测到当前模型",
			statusUnknownHint: "检测不到时一律使用第 1 条可用规则；切换一次模型或稍等片刻会自动重试",
			statusSourceDefault: "宿主默认",
			statusSourceDefaultHint: "只读到宿主默认模型，它不是本会话当前选择的模型；本会话的模型选择可用后会自动纠正",
			statusNoteNoService: "仍未拿到会话服务（会话控制器晚于本插件加载），正在自动重试",
			statusNoteNoSession: "会话服务已就绪，但还没有当前会话 id",
			statusNoteNoProjection: "拿不到本会话的模型选择投影（binding / projections 不可用）",
			statusNoteEmptySelection: "本会话的模型选择投影还没有值（切一次模型即可写入）",
			statusNone: "还没有可用规则（规则需要启用并选择图片）",
			statusHit: "命中",
			statusFallback: "未命中 · 使用兜底",
			statusRule: "规则",
			rulesTitle: "规则列表",
			rulesHint: "从上到下即为优先级。规则 1 同时兼任兜底：所有匹配串都没命中时使用它",
			ruleAdd: "新增规则",
			ruleFallbackBadge: "兜底",
			ruleMatchLabel: "匹配串",
			ruleMatchPlaceholder: "如 flash / glm（忽略大小写，留空则不参与匹配）",
			ruleEnabled: "启用",
			ruleUp: "上移",
			ruleDown: "下移",
			ruleRemove: "删除规则",
			ruleNoImage: "尚未选择图片",
			rulePickImage: "选择图片",
			ruleChangeImage: "更换图片",
			ruleFromUrl: "从网址",
			ruleUrlPlaceholder: "粘贴图片网址 https://…",
			ruleUrlApply: "应用",
			ruleUrlCancel: "取消",
			ruleUrlApplying: "加载中…",
			ruleUrlBadHttp: "仅支持 http/https 图片网址",
			ruleUrlFail: "获取图片失败",
			ruleImageRemove: "移除图片",
			ruleEmptyHint: "这条规则还没有图片，不会被匹配到，也不会作为兜底",
			ruleColor: "主题色",
			ruleColorNone: "系统主题",
			ruleColorNoneHint: "未设颜色时跟随系统主题",
			ruleColorExtract: "从本图提取",
			ruleLayout: "布局模式",
			ruleFraming: "取景",
			ruleFramingEdit: "编辑位置",
			ruleFramingLocked: "仅「适应」模式可编辑位置",
			ruleOpacity: "背景透明度",
			ruleBlur: "背景模糊",
			ruleBlurHint: "背景模糊作用于壁纸层；界面页里的模糊作用于界面各区域，两者互不影响",
			colorHint: "在色轮外圈选择色相，在内部方形中调整饱和度和明度；双击滑块可恢复默认值",
			swatchTitle: "灵感色板",
			hexCaption: "当前颜色",
			bgModeFit: "适应",
			bgModeFill: "填充",
			bgModeStretch: "拉伸",
			bgModeTile: "平铺",
			bgModeCenter: "居中",
			editorTitle: "背景编辑器",
			editorHint: "拖动移动画面，滚轮缩放大小",
			editorCommit: "确认",
			editorCancel: "取消",
			editorReset: "重置",
			extractColor: "从图片提取主题色",
			extracting: "取色中…",
			extractNoWp: "请先为该规则选择图片",
			extractDone: "已应用图片主色调",
			extractFail: "未在这张图里找到鲜明的颜色，请换一张",
			eyedropper: "从图片取色",
			pickerTitle: "从图片取色",
			pickerHint: "移动鼠标预览颜色，点击图片选取为主题色",
			pickerClose: "关闭",
			crashTitle: "界面渲染出错",
			crashDesc: "设置面板遇到问题，点击下方按钮重置后重试",
			crashReset: "重置面板",
			exportTheme: "导出配置",
			importTheme: "导入配置",
			exportCardTitle: "导出配置",
			exportCardDesc: "把全部规则、每条规则的颜色/布局/透明度/模糊与图片打包为 dsh-background-by-model-theme.json",
			importCardTitle: "导入配置",
			importCardDesc: "从之前导出的 JSON 文件一键恢复全部规则（会覆盖当前规则与图片）",
			toastExportDone: "配置文件已开始下载",
			importDone: "已导入配置",
			importFail: "导入失败，文件格式不正确",
			footerTag: "按模型换背景插件"
		};
		const en = {
			nav: "Model background",
			brandTag: "Per-model wallpaper",
			close: "Close",
			pageInterface: "Interface",
			pageModelBg: "Model background",
			pageProfile: "Profile",
			descInterface: "Tune opacity and blur per surface to build depth. These settings are global and apply to every model",
			descModelBg: "Each rule is a match string plus one look. On a model switch the list is scanned top-down for the first match string contained in the model name; if nothing hits, rule 1 is used",
			descProfile: "Back up every rule together with its image, or restore one from a file",
			uiTitle: "Interface",
			uiOpacity: "Opacity",
			uiBlur: "Blur",
			uiOpacityBg: "Main background",
			uiOpacitySide: "Sidebar",
			uiOpacityCard: "Cards & panels",
			uiOpacityInput: "Input & controls",
			uiSop: "Settings interface opacity",
			uiChatRegion: "Conversation text frame",
			uiTrajectory: "Trajectory view",
			uiScopeHint: "Interface settings are global — every model shares them",
			statusTitle: "Active now",
			statusModel: "Current model",
			statusUnknown: "No model detected",
			statusUnknownHint: "Without a detected model rule 1 is always used; switching the model once or waiting a moment retries automatically",
			statusSourceDefault: "host default",
			statusSourceDefaultHint: "Only the host-wide default model could be read — that is not necessarily this session's selection. It self-corrects once this session's model selection is available.",
			statusNoteNoService: "The sessions service is not available yet (the session controller loads after this plugin); retrying automatically",
			statusNoteNoSession: "The sessions service is up but reports no current session yet",
			statusNoteNoProjection: "This session's model-selection projection is unreachable (no binding / projections)",
			statusNoteEmptySelection: "The model-selection projection exists but carries no value yet (selecting a model once writes it)",
			statusNone: "No usable rule yet (a rule needs to be enabled and have an image)",
			statusHit: "matched",
			statusFallback: "no match · using the fallback",
			statusRule: "Rule",
			rulesTitle: "Rules",
			rulesHint: "Top to bottom is the priority. Rule 1 doubles as the fallback — it is used when no match string hits",
			ruleAdd: "Add rule",
			ruleFallbackBadge: "fallback",
			ruleMatchLabel: "Match",
			ruleMatchPlaceholder: "e.g. flash / glm (case-insensitive, empty never matches)",
			ruleEnabled: "Enabled",
			ruleUp: "Move up",
			ruleDown: "Move down",
			ruleRemove: "Remove rule",
			ruleNoImage: "No image yet",
			rulePickImage: "Choose image",
			ruleChangeImage: "Replace image",
			ruleFromUrl: "From URL",
			ruleUrlPlaceholder: "Paste an image URL https://…",
			ruleUrlApply: "Apply",
			ruleUrlCancel: "Cancel",
			ruleUrlApplying: "Loading…",
			ruleUrlBadHttp: "Only http/https image URLs are supported",
			ruleUrlFail: "Could not fetch the image",
			ruleImageRemove: "Remove image",
			ruleEmptyHint: "This rule has no image — it can neither match nor serve as the fallback",
			ruleColor: "Theme color",
			ruleColorNone: "System theme",
			ruleColorNoneHint: "Without a color this rule follows the system theme",
			ruleColorExtract: "Extract from image",
			ruleLayout: "Layout mode",
			ruleFraming: "Framing",
			ruleFramingEdit: "Edit position",
			ruleFramingLocked: "Position editing is only available in Fit mode",
			ruleOpacity: "Background opacity",
			ruleBlur: "Background blur",
			ruleBlurHint: "Background blur affects the wallpaper layer; the blur on the Interface page affects interface surfaces — they are independent",
			colorHint: "Pick hue on the outer ring, adjust saturation & lightness in the square; double-click a slider to reset",
			swatchTitle: "Quick swatches",
			hexCaption: "Current color",
			bgModeFit: "Fit",
			bgModeFill: "Fill",
			bgModeStretch: "Stretch",
			bgModeTile: "Tile",
			bgModeCenter: "Center",
			editorTitle: "Background editor",
			editorHint: "Drag to move, scroll to zoom",
			editorCommit: "Confirm",
			editorCancel: "Cancel",
			editorReset: "Reset",
			extractColor: "Extract from image",
			extracting: "Extracting…",
			extractNoWp: "Choose an image for this rule first",
			extractDone: "Image color applied",
			extractFail: "No vivid color found in this image, try another",
			eyedropper: "Eyedropper",
			pickerTitle: "Pick from image",
			pickerHint: "Hover to preview, click to pick as the theme color",
			pickerClose: "Close",
			crashTitle: "Section crashed",
			crashDesc: "The panel hit an error. Reset below to recover.",
			crashReset: "Reset panel",
			exportTheme: "Export",
			importTheme: "Import",
			exportCardTitle: "Export profile",
			exportCardDesc: "Bundle every rule — color, layout, opacity, blur — and its image into dsh-background-by-model-theme.json",
			importCardTitle: "Import profile",
			importCardDesc: "Restore every rule and image from a previously exported JSON file (replaces the current set)",
			toastExportDone: "Export started",
			importDone: "Profile imported",
			importFail: "Import failed — invalid file",
			footerTag: "Per-model wallpaper plugin"
		};
		//#endregion
		//#region src/client/state.ts
		const DEFAULT_BG_STATE = {
			zoom: 1,
			x: 0,
			y: 0,
			iw: 0,
			ih: 0
		};
		const BG_MODES$1 = [
			"fit",
			"fill",
			"stretch",
			"tile",
			"center"
		];
		const PALETTE = [
			[
				356,
				.72,
				.55
			],
			[
				24,
				.78,
				.55
			],
			[
				44,
				.8,
				.55
			],
			[
				152,
				.62,
				.5
			],
			[
				174,
				.68,
				.48
			],
			[
				208,
				.72,
				.55
			],
			[
				252,
				.68,
				.6
			],
			[
				300,
				.64,
				.58
			]
		];
		const DEFAULT_CONFIG = {
			rules: [],
			opacities: {
				bg: .85,
				sidebar: .93,
				card: 1,
				input: 1
			},
			blurs: {
				bg: 0,
				sidebar: 0,
				card: 0,
				settings: 0,
				chat: 0,
				trajectory: 0,
				input: 0
			},
			settingsOpacity: 1,
			chatTextOpacity: 0,
			trajectoryOpacity: 1
		};
		function freshConfig() {
			return {
				rules: [],
				opacities: { ...DEFAULT_CONFIG.opacities },
				blurs: { ...DEFAULT_CONFIG.blurs },
				settingsOpacity: DEFAULT_CONFIG.settingsOpacity,
				chatTextOpacity: DEFAULT_CONFIG.chatTextOpacity,
				trajectoryOpacity: DEFAULT_CONFIG.trajectoryOpacity
			};
		}
		let cfg = freshConfig();
		const images = /* @__PURE__ */ new Map();
		const displayUrls = /* @__PURE__ */ new Map();
		function revokeDisplay(slot) {
			const url = displayUrls.get(slot);
			if (url === void 0) return;
			displayUrls.delete(slot);
			window.setTimeout(() => {
				try {
					URL.revokeObjectURL(url);
				} catch {}
			}, 2e3);
		}
		function setImage(slot, url) {
			revokeDisplay(slot);
			if (url === null) images.delete(slot);
			else images.set(slot, url);
		}
		/** Persisted data URL (RPC / export). Use `displayImageOf` to paint it. */
		function imageOf(slot) {
			return images.get(slot) ?? null;
		}
		/** Paintable URL for one slot, created on first use and cached; falls back to
		*  the data URL when no object URL can be built. */
		function displayImageOf(slot) {
			const cached = displayUrls.get(slot);
			if (cached !== void 0) return cached;
			const data = images.get(slot);
			if (data === void 0) return null;
			const made = toObjectUrl(data);
			if (made === null) return data;
			displayUrls.set(slot, made);
			return made;
		}
		function toObjectUrl(dataUrl) {
			try {
				if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
				const comma = dataUrl.indexOf(",");
				if (comma < 0) return null;
				const meta = dataUrl.slice(0, comma);
				if (!/;base64$/i.test(meta)) return null;
				const mime = meta.slice(5, -7) || "image/jpeg";
				const bin = atob(dataUrl.slice(comma + 1));
				const bytes = new Uint8Array(bin.length);
				for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
				return URL.createObjectURL(new Blob([bytes], { type: mime }));
			} catch {
				return null;
			}
		}
		let activeRuleId = null;
		let activeMatched = false;
		let modelLabel = "";
		function setActive(ruleId, matched) {
			activeRuleId = ruleId;
			activeMatched = matched;
		}
		function setModelLabel(label) {
			modelLabel = label;
		}
		function ruleById(id) {
			return cfg.rules.find((r) => r.id === id) ?? null;
		}
		function activeRule() {
			return activeRuleId === null ? null : ruleById(activeRuleId);
		}
		function newRule(id, slot) {
			return {
				id,
				slot,
				match: "",
				enabled: true,
				color: null,
				bgMode: "fit",
				wallpaperOpacity: 1,
				blur: 0,
				bgState: { ...DEFAULT_BG_STATE }
			};
		}
		/** First free image slot (`m1`, `m2`, …). */
		function nextSlot() {
			const taken = new Set(cfg.rules.map((r) => r.slot));
			for (let i = 1; i < 1e3; i++) {
				const slot = `m${i}`;
				if (!taken.has(slot)) return slot;
			}
			return `m${Date.now()}`;
		}
		/** Unique rule id (independent from the slot so removals never renumber). */
		function nextRuleId() {
			const taken = new Set(cfg.rules.map((r) => r.id));
			for (let i = 1; i < 1e4; i++) {
				const id = `r${i}`;
				if (!taken.has(id)) return id;
			}
			return `r${Date.now()}`;
		}
		const clamp01 = (n, def) => typeof n === "number" && isFinite(n) ? Math.min(1, Math.max(0, n)) : def;
		const clamp$1 = (n, lo, hi, def) => typeof n === "number" && isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
		function rHasColor() {
			return activeRule()?.color !== null && activeRule() !== null;
		}
		function rColor() {
			return activeRule()?.color ?? [
				220,
				.55,
				.25
			];
		}
		function rBgMode() {
			return activeRule()?.bgMode ?? "fit";
		}
		function rWop() {
			return clamp01(activeRule()?.wallpaperOpacity, 1);
		}
		function rBl() {
			return clamp$1(activeRule()?.blur, 0, 60, 0);
		}
		function rBgState() {
			return activeRule()?.bgState ?? DEFAULT_BG_STATE;
		}
		/** Paintable URL of the active rule's image, or null when it has none. */
		function rWp() {
			const rule = activeRule();
			return rule === null ? null : displayImageOf(rule.slot);
		}
		function rOps() {
			const o = cfg.opacities ?? {};
			const out = {};
			for (const k of [
				"bg",
				"sidebar",
				"card",
				"input"
			]) out[k] = clamp01(o[k], DEFAULT_CONFIG.opacities[k]);
			return out;
		}
		function rBlurs() {
			const b = cfg.blurs ?? {};
			const out = {};
			for (const k of [
				"bg",
				"sidebar",
				"card",
				"settings",
				"chat",
				"trajectory",
				"input"
			]) out[k] = clamp$1(b[k], 0, 60, DEFAULT_CONFIG.blurs[k]);
			return out;
		}
		function rSop() {
			return clamp01(cfg.settingsOpacity, DEFAULT_CONFIG.settingsOpacity);
		}
		function rChatTextOpacity() {
			return clamp01(cfg.chatTextOpacity, DEFAULT_CONFIG.chatTextOpacity);
		}
		function rTrajectoryOpacity() {
			return clamp01(cfg.trajectoryOpacity, DEFAULT_CONFIG.trajectoryOpacity);
		}
		function adoptBgState(s) {
			return {
				zoom: clamp$1(s.zoom, .1, 10, 1),
				x: typeof s.x === "number" && isFinite(s.x) ? s.x : 0,
				y: typeof s.y === "number" && isFinite(s.y) ? s.y : 0,
				iw: typeof s.iw === "number" && s.iw > 0 ? s.iw : 0,
				ih: typeof s.ih === "number" && s.ih > 0 ? s.ih : 0
			};
		}
		/** Coerce one persisted rule, or null when it lacks a usable id/slot. */
		function normalizeRule(raw) {
			const r = raw ?? {};
			const id = typeof r.id === "string" && r.id !== "" ? r.id : null;
			const slot = typeof r.slot === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(r.slot) ? r.slot : null;
			if (id === null || slot === null) return null;
			const c = r.color;
			const color = Array.isArray(c) && c.length === 3 && c.every((n) => typeof n === "number" && isFinite(n)) ? [
				clamp$1(c[0], 0, 360, 220),
				clamp$1(c[1], 0, 1, .55),
				clamp$1(c[2], 0, 1, .25)
			] : null;
			return {
				id,
				slot,
				match: typeof r.match === "string" ? r.match : "",
				enabled: r.enabled !== false,
				color,
				bgMode: BG_MODES$1.includes(r.bgMode) ? r.bgMode : "fit",
				wallpaperOpacity: clamp01(r.wallpaperOpacity, 1),
				blur: clamp$1(r.blur, 0, 60, 0),
				bgState: adoptBgState(r.bgState ?? {})
			};
		}
		/** Move a possibly-absent partial config into the shape the UI reads. */
		function adoptConfig(raw) {
			const c = raw ?? {};
			const rules = Array.isArray(c.rules) ? c.rules.map(normalizeRule).filter((r) => r !== null) : [];
			const ops = c.opacities ?? {};
			const bl = c.blurs ?? {};
			const blurs = {};
			for (const k of [
				"bg",
				"sidebar",
				"card",
				"settings",
				"chat",
				"trajectory",
				"input"
			]) blurs[k] = clamp$1(bl[k], 0, 60, DEFAULT_CONFIG.blurs[k]);
			cfg = {
				rules,
				opacities: {
					bg: clamp01(ops.bg, DEFAULT_CONFIG.opacities.bg),
					sidebar: clamp01(ops.sidebar, DEFAULT_CONFIG.opacities.sidebar),
					card: clamp01(ops.card, DEFAULT_CONFIG.opacities.card),
					input: clamp01(ops.input, DEFAULT_CONFIG.opacities.input)
				},
				blurs,
				settingsOpacity: clamp01(c.settingsOpacity, DEFAULT_CONFIG.settingsOpacity),
				chatTextOpacity: clamp01(c.chatTextOpacity, DEFAULT_CONFIG.chatTextOpacity),
				trajectoryOpacity: clamp01(c.trajectoryOpacity, DEFAULT_CONFIG.trajectoryOpacity)
			};
			if (activeRuleId !== null && !rules.some((r) => r.id === activeRuleId)) {
				activeRuleId = null;
				activeMatched = false;
			}
		}
		//#endregion
		//#region src/client/rpc.ts
		const RPC_CHANNEL = "/dsh-background-by-model";
		const RPC_NS = "dshBackgroundByModel";
		const rpcEndpoint = (method) => `${RPC_NS}/${method}`;
		let rpcCallFn = null;
		function initRpc(call) {
			rpcCallFn = call;
		}
		async function rpcCall(method, payload) {
			if (!rpcCallFn) return void 0;
			try {
				const res = await rpcCallFn(rpcEndpoint(method), payload);
				if (res && res.ok === true) return res.value;
				console.warn(`dsh-background-by-model: rpc "${method}" failed`, res?.error);
				return;
			} catch (e) {
				console.warn(`dsh-background-by-model: rpc "${method}" threw`, e);
				return;
			}
		}
		/** Raw call for the few places that need the host's error message. */
		async function rpcRaw(method, payload) {
			if (!rpcCallFn) return void 0;
			try {
				return await rpcCallFn(rpcEndpoint(method), payload);
			} catch {
				return;
			}
		}
		const SAVE_DEBOUNCE_MS = 250;
		let saveTimer;
		function saveConfig() {
			if (saveTimer !== void 0) window.clearTimeout(saveTimer);
			saveTimer = window.setTimeout(() => {
				saveTimer = void 0;
				rpcCall("writeConfig", { config: cfg });
			}, SAVE_DEBOUNCE_MS);
		}
		function flushSave() {
			if (saveTimer === void 0) return;
			window.clearTimeout(saveTimer);
			saveTimer = void 0;
			rpcCall("writeConfig", { config: cfg });
		}
		/** Persist the current config immediately (no debounce). */
		function persistConfig() {
			rpcCall("writeConfig", { config: cfg });
		}
		/** Load the persisted config plus the list of stored image slots. */
		async function loadPersisted() {
			const data = await rpcCall("read", {});
			if (data === null || typeof data !== "object") return null;
			const d = data;
			const slots = Array.isArray(d.slots) ? d.slots.filter((s) => typeof s === "string") : [];
			return {
				config: d.config,
				slots
			};
		}
		/** Read one rule image as a data URL (null when the slot is empty). */
		async function readImage(slot) {
			const data = await rpcCall("readImage", { slot });
			if (data === null || typeof data !== "object") return null;
			const url = data.dataUrl;
			return typeof url === "string" ? url : null;
		}
		/** Persist (or clear) one rule image; one-shot, no debounce. */
		async function writeImage(slot, dataUrl) {
			return await rpcCall("writeImage", {
				slot,
				dataUrl
			}) === true;
		}
		/** Remove one rule image from disk. */
		async function deleteImage(slot) {
			return await rpcCall("deleteImage", { slot }) === true;
		}
		/** Download an image from a network URL into one slot, replacing its bytes. */
		async function fetchImageUrl(slot, url) {
			const res = await rpcRaw("fetchImageUrl", {
				slot,
				url
			});
			if (!res) return {
				ok: false,
				error: "no response"
			};
			if (res.ok !== true) return {
				ok: false,
				error: res.error?.message ?? "request failed"
			};
			const v = res.value;
			return v?.ok === true ? {
				ok: true,
				dataUrl: v.dataUrl ?? null
			} : {
				ok: false,
				error: v?.error ?? "failed"
			};
		}
		/** Host default model — used only when the per-session services are absent. */
		async function readDefaultModel() {
			const data = await rpcCall("defaultModel", {});
			if (data === null || typeof data !== "object") return null;
			const d = data;
			const parts = [d.provider, d.model].filter((s) => typeof s === "string" && s !== "");
			return parts.length > 0 ? parts.join(" ") : null;
		}
		//#endregion
		//#region src/client/utils/color.ts
		function hsvToHsl(h, s, v) {
			const l = v * (1 - s / 2);
			return [
				h,
				l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l),
				l
			];
		}
		function hslToHsv(h, s, l) {
			const v = l + s * Math.min(l, 1 - l);
			return [
				h,
				v === 0 ? 0 : 2 * (1 - l / v),
				v
			];
		}
		let tokensCacheKey = "";
		let tokensCache = null;
		/**
		* Memoized token generation: the same (hue, sat, lit) input always yields the
		* same token set, and applyWp / applyCustomTokens / applySettingsOverrides call
		* this repeatedly (slider drags, viewport re-applies), so cache the last result
		* and skip the 30+ hsl() string builds when nothing changed.
		*/
		function genTokens(hue, sat, lit) {
			const key = `${hue}|${sat}|${lit}`;
			if (tokensCacheKey === key && tokensCache) return tokensCache;
			tokensCacheKey = key;
			tokensCache = buildTokens(hue, sat, lit);
			return tokensCache;
		}
		function buildTokens(hue, sat, lit) {
			const dark = lit < .55;
			const h = (d) => ((hue + d) % 360 + 360) % 360;
			const s = (d) => Math.max(0, Math.min(1, sat + d));
			const l = (d) => Math.max(0, Math.min(1, lit + d));
			const hsl = (hh, ss, ll) => `hsl(${Math.round(hh)},${Math.round(ss * 100)}%,${Math.round(ll * 100)}%)`;
			const rgba = (hh, ss, ll, a) => `hsla(${Math.round(hh)},${Math.round(ss * 100)}%,${Math.round(ll * 100)}%,${a})`;
			if (dark) return {
				colorScheme: "dark",
				tokens: {
					"--dsw-alias-bg-base": hsl(h(0), s(0), l(-.04)),
					"--dsw-alias-bg-layer-1": hsl(h(0), s(0), l(.02)),
					"--dsw-alias-bg-layer-2": hsl(h(0), s(0), l(.07)),
					"--dsw-alias-bg-layer-3": hsl(h(0), s(-.05), l(.12)),
					"--dsw-alias-bg-overlay": hsl(h(0), s(-.05), l(.12)),
					"--dsw-alias-bg-module-platform": hsl(h(0), s(0), l(.05)),
					"--dsw-alias-bg-multi-select": hsl(h(0), s(0), l(.1)),
					"--dsw-alias-bg-skeleton": "rgba(255,255,255,0.08)",
					"--dsw-alias-border-l1": rgba(h(0), s(-.1), l(.18), .12),
					"--dsw-alias-border-l2": rgba(h(0), s(-.1), l(.22), .22),
					"--dsw-alias-border-l3": "rgba(255,255,255,0.16)",
					"--dsw-alias-border-l4": "rgba(255,255,255,0.2)",
					"--dsw-alias-border-inverted": "rgba(255,255,255,0.06)",
					"--dsw-alias-label-primary": hsl(0, 0, 1),
					"--dsw-alias-label-secondary": "rgba(255,255,255,0.85)",
					"--dsw-alias-label-tertiary": "rgba(255,255,255,0.7)",
					"--dsw-alias-label-caption": "rgba(255,255,255,0.5)",
					"--dsw-alias-label-dimmed": "rgba(255,255,255,0.35)",
					"--dsw-alias-label-quaternary": "rgba(255,255,255,0.25)",
					"--dsw-alias-label-primary-dimmed": "rgba(255,255,255,0.92)",
					"--dsw-alias-label-primary-foreground": hsl(0, 0, 1),
					"--dsw-alias-label-primary-inverted": hsl(h(0), s(.08), Math.min(l(.06), .16)),
					"--dsw-alias-label-primary-bluish": hsl(0, 0, 1),
					"--dsw-alias-brand-primary": hsl(h(0), s(.1), Math.max(l(.2), .5)),
					"--dsw-alias-brand-text": l(.2) > .6 ? "#000" : "#fff",
					"--dsw-alias-button-primary-fill": hsl(h(0), s(.1), Math.max(l(.2), .5)),
					"--dsw-alias-button-primary-hover": hsl(h(0), s(.1), Math.max(l(.28), .58)),
					"--dsw-alias-button-primary-dimmed": hsl(h(0), s(0), l(.07)),
					"--dsw-alias-button-elevated-fill": hsl(h(0), s(0), l(.04)),
					"--dsw-alias-button-floating-fill": hsl(h(0), s(0), l(.02)),
					"--dsw-alias-button-floating-hover": hsl(h(0), s(0), l(.1)),
					"--dsw-alias-button-tool-bar-fill": "rgba(255,255,255,0.08)",
					"--dsw-alias-button-tool-bar-hover": "rgba(255,255,255,0.12)",
					"--dsw-alias-button-ghost-active-fill": hsl(h(0), s(0), l(.06)),
					"--dsw-alias-button-ghost-active-border": "rgba(255,255,255,0.16)",
					"--dsw-alias-button-ghost-active-hover": hsl(h(0), s(0), l(.09)),
					"--dsw-alias-button-info-fill": "#679efe",
					"--dsw-alias-button-info-hover": "#4176e6",
					"--dsw-alias-button-contrast-fill": hsl(0, 0, 1),
					"--dsw-alias-interactive-bg-hover": rgba(h(0), s(0), Math.max(l(.15), .4), .12),
					"--dsw-alias-interactive-bg-hover-solid": rgba(h(0), s(0), Math.max(l(.15), .4), .16),
					"--dsw-alias-interactive-bg-hover-accent": "rgba(255,255,255,0.24)",
					"--dsw-alias-interactive-bg-hover-danger": "rgba(242,90,90,0.15)",
					"--dsw-alias-interactive-bg-active": rgba(h(0), s(0), Math.max(l(.15), .4), .2),
					"--dsw-alias-markdown-code-block": hsl(h(0), s(0), l(-.06)),
					"--dsw-alias-markdown-code-block-banner": hsl(h(0), s(0), l(-.02)),
					"--dsw-alias-markdown-inline-code": hsl(h(0), s(0), l(.04)),
					"--dsw-alias-markdown-placeholder": hsl(h(0), s(0), l(-.02)),
					"--dsw-alias-markdown-tag": hsl(h(0), s(0), l(.05)),
					"--dsw-alias-markdown-citation": hsl(h(0), s(0), l(.06)),
					"--dsw-alias-markdown-code-segment-selected": hsl(h(0), s(0), l(.05)),
					"--dsw-alias-markdown-code-segment-unselected": hsl(h(0), s(0), l(-.05)),
					"--dsw-alias-state-error-primary": "#ff5c72",
					"--dsw-alias-state-error-secondary": "#ff8aa0",
					"--dsw-alias-state-success-primary": "#3ddc84",
					"--dsw-alias-state-success-secondary": "#69eea4",
					"--dsw-alias-state-success-tertiary": "#233c2c",
					"--dsw-alias-state-warn-primary": "#ffb347",
					"--dsw-alias-state-warn-secondary": "#ffc980",
					"--dsw-alias-state-warn-tertiary": "#27241f",
					"--dsw-alias-state-warn-label": "#dd8629",
					"--dsw-alias-state-business-primary": "#679efe",
					"--dsw-alias-state-business-tertiary": "#34415b",
					"--dsw-specific-sidebar-fill": hsl(h(0), s(0), l(-.06)),
					"--dsw-specific-sidebar-nav-item-active": hsl(h(0), s(0), l(.04)),
					"--dsw-specific-sidebar-nav-item-hover": hsl(h(0), s(0), l(0)),
					"--dsw-specific-input-major": hsl(h(0), s(0), l(.02)),
					"--dsw-specific-menu": hsl(h(0), s(0), l(.08)),
					"--dsw-specific-bubble": hsl(h(0), s(0), l(.03)),
					"--dsw-specific-bubble-highlight": hsl(h(0), s(0), l(.08)),
					"--dsw-specific-selector": hsl(h(0), s(0), l(.05)),
					"--dsw-specific-login-input": hsl(h(0), s(0), l(.03)),
					"--dsw-specific-tip": hsl(h(0), s(0), l(.05)),
					"--dsw-alias-toast-bg": hsl(h(0), s(0), l(.08)),
					"--dsw-alias-tooltip-bg": hsl(h(0), s(0), l(.08)),
					"--dsw-alias-scrollbar-bg-l1": hsl(h(0), s(-.05), l(.12)),
					"--dsw-alias-scrollbar-bg-l2": hsl(h(0), s(-.05), l(.16)),
					"--dsw-alias-scrollbar-hover-l1": hsl(h(0), s(-.05), l(.22)),
					"--dsw-alias-scrollbar-hover-l2": hsl(h(0), s(-.05), l(.22))
				}
			};
			return {
				colorScheme: "light",
				tokens: {
					"--dsw-alias-bg-base": hsl(h(0), s(-.08), l(.03)),
					"--dsw-alias-bg-layer-1": hsl(h(0), s(-.12), l(.07)),
					"--dsw-alias-bg-layer-2": hsl(h(0), s(-.1), l(-.03)),
					"--dsw-alias-bg-layer-3": hsl(h(0), s(-.08), l(-.09)),
					"--dsw-alias-bg-overlay": hsl(h(0), s(-.12), l(.08)),
					"--dsw-alias-border-l1": rgba(h(0), s(-.15), l(-.35), .18),
					"--dsw-alias-border-l2": rgba(h(0), s(-.15), l(-.35), .3),
					"--dsw-alias-label-primary": hsl(0, 0, 0),
					"--dsw-alias-label-secondary": "rgba(0,0,0,0.85)",
					"--dsw-alias-label-tertiary": "rgba(0,0,0,0.7)",
					"--dsw-alias-label-caption": "rgba(0,0,0,0.5)",
					"--dsw-alias-label-dimmed": "rgba(0,0,0,0.35)",
					"--dsw-alias-label-quaternary": "rgba(0,0,0,0.25)",
					"--dsw-alias-brand-primary": hsl(h(0), s(.05), Math.min(l(-.18), .45)),
					"--dsw-alias-brand-text": "#fff",
					"--dsw-alias-button-primary-hover": hsl(h(0), s(.05), Math.min(l(-.12), .5)),
					"--dsw-alias-button-primary-dimmed": hsl(h(0), s(-.1), l(-.03)),
					"--dsw-alias-button-elevated-fill": hsl(h(0), s(-.1), l(.1)),
					"--dsw-alias-button-floating-hover": hsl(h(0), s(-.1), l(.16)),
					"--dsw-alias-interactive-bg-hover": rgba(h(0), s(0), l(-.3), .08),
					"--dsw-alias-interactive-bg-active": rgba(h(0), s(0), l(-.3), .14),
					"--dsw-alias-markdown-code-block": hsl(h(0), s(-.1), l(-.03)),
					"--dsw-alias-markdown-inline-code": hsl(h(0), s(-.08), l(.04)),
					"--dsw-specific-sidebar-fill": hsl(h(0), s(-.1), l(-.03)),
					"--dsw-specific-sidebar-nav-item-active": hsl(h(0), s(-.08), l(.05)),
					"--dsw-specific-sidebar-nav-item-hover": hsl(h(0), s(-.12), l(0)),
					"--dsw-specific-input-major": hsl(h(0), s(-.12), l(.1)),
					"--dsw-specific-menu": hsl(h(0), s(-.12), l(.15)),
					"--dsw-alias-scrollbar-bg-l1": hsl(h(0), s(-.1), l(-.08)),
					"--dsw-alias-scrollbar-bg-l2": hsl(h(0), s(-.08), l(-.12)),
					"--dsw-alias-scrollbar-hover-l1": hsl(h(0), s(-.08), l(-.16)),
					"--dsw-alias-scrollbar-hover-l2": hsl(h(0), s(-.08), l(-.16))
				}
			};
		}
		function toRgba(c, a) {
			const hx = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
			if (hx) {
				let d = hx[1];
				if (d.length === 3) d = d.split("").map((x) => x + x).join("");
				const n = parseInt(d, 16);
				return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
			}
			const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(c.trim());
			if (rgb) return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${a})`;
			const hsl = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i.exec(c.trim());
			if (hsl) return `hsla(${hsl[1]},${hsl[2]}%,${hsl[3]}%,${a})`;
			return c.trim();
		}
		function rgbToHsl(r, g, b) {
			const rn = r / 255, gn = g / 255, bn = b / 255;
			const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
			const l = (max + min) / 2;
			if (max === min) return [
				0,
				0,
				l
			];
			const d = max - min;
			const s = l > .5 ? d / (2 - max - min) : d / (max + min);
			let h;
			if (max === rn) h = (gn - bn) / d % 6;
			else if (max === gn) h = (bn - rn) / d + 2;
			else h = (rn - gn) / d + 4;
			h *= 60;
			if (h < 0) h += 360;
			return [
				h,
				s,
				l
			];
		}
		const EXTRACT_SIDE = 64;
		function bucketsToHsl(b) {
			return rgbToHsl(b.r / b.count, b.g / b.count, b.b / b.count);
		}
		function extractWallpaperPalette(dataUrl, bgState) {
			return new Promise((resolve) => {
				const img = new Image();
				img.onerror = () => resolve(null);
				img.onload = () => {
					try {
						const iw = img.naturalWidth || img.width;
						const ih = img.naturalHeight || img.height;
						const bg = bgState;
						let sx = 0, sy = 0, sw = iw, sh = ih;
						if (bg.iw === iw && bg.ih === ih && bg.iw > 0) {
							const fit = Math.min(window.innerWidth / iw, window.innerHeight / ih);
							const w = iw * fit * bg.zoom;
							const h = ih * fit * bg.zoom;
							sx = Math.max(0, bg.x * window.innerWidth - w / 2);
							sy = Math.max(0, bg.y * window.innerHeight - h / 2);
							sw = Math.min(iw - sx, w);
							sh = Math.min(ih - sy, h);
							if (sw <= 0 || sh <= 0) {
								sx = 0;
								sy = 0;
								sw = iw;
								sh = ih;
							}
						}
						const c = document.createElement("canvas");
						c.width = EXTRACT_SIDE;
						c.height = EXTRACT_SIDE;
						const g = c.getContext("2d", { willReadFrequently: true });
						g.drawImage(img, sx, sy, sw, sh, 0, 0, EXTRACT_SIDE, EXTRACT_SIDE);
						const px = g.getImageData(0, 0, EXTRACT_SIDE, EXTRACT_SIDE).data;
						const counts = /* @__PURE__ */ new Uint32Array(4096);
						const sums = /* @__PURE__ */ new Float64Array(12288);
						let totalLum = 0;
						let sampled = 0;
						for (let i = 0; i < px.length; i += 4) {
							const r = px[i], gg = px[i + 1], b = px[i + 2];
							const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
							const v = max / 255;
							const s = max === 0 ? 0 : (max - min) / max;
							totalLum += v;
							sampled++;
							if (s < .08 || v < .12 || v > .97) continue;
							const key = r >> 4 << 8 | gg >> 4 << 4 | b >> 4;
							counts[key]++;
							sums[key * 3] += r;
							sums[key * 3 + 1] += gg;
							sums[key * 3 + 2] += b;
						}
						const buckets = [];
						for (let k = 0; k < 4096; k++) {
							if (counts[k] === 0) continue;
							buckets.push({
								count: counts[k],
								r: sums[k * 3],
								g: sums[k * 3 + 1],
								b: sums[k * 3 + 2],
								s: (Math.max(sums[k * 3], sums[k * 3 + 1], sums[k * 3 + 2]) - Math.min(sums[k * 3], sums[k * 3 + 1], sums[k * 3 + 2])) / Math.max(sums[k * 3], sums[k * 3 + 1], sums[k * 3 + 2]) || 0
							});
						}
						if (buckets.length === 0) {
							resolve(null);
							return;
						}
						buckets.sort((a, b) => b.count * (.5 + b.s) - a.count * (.5 + a.s));
						const primary = bucketsToHsl(buckets[0]);
						const primaryHue = primary[0];
						let secondary = primary;
						for (const b of buckets.slice(1)) {
							const [h] = bucketsToHsl(b);
							if (Math.abs((h - primaryHue + 540) % 360 - 180) > 30) {
								secondary = bucketsToHsl(b);
								break;
							}
						}
						let tertiary = [
							(primaryHue + 180) % 360,
							Math.min(.7, primary[1]),
							Math.min(.7, primary[2])
						];
						for (const b of buckets.slice(1)) {
							const [h] = bucketsToHsl(b);
							const sep = Math.abs((h - primaryHue + 540) % 360 - 180);
							if (sep > 90 && sep < 150) {
								tertiary = bucketsToHsl(b);
								break;
							}
						}
						const surface = [
							primaryHue,
							Math.min(.06, primary[1] * .3),
							primary[2]
						];
						const luminance = sampled > 0 ? totalLum / sampled : primary[2];
						primary[2] = luminance < .5 ? Math.min(.44, Math.max(.2, primary[2])) : Math.max(.6, Math.min(.82, primary[2]));
						resolve({
							primary: [
								primary[0],
								Math.min(.9, Math.max(.15, primary[1])),
								primary[2]
							],
							secondary: [
								secondary[0],
								Math.min(.85, Math.max(.2, secondary[1])),
								Math.min(.75, Math.max(.35, secondary[2]))
							],
							tertiary: [
								tertiary[0],
								Math.min(.8, Math.max(.2, tertiary[1])),
								Math.min(.7, Math.max(.35, tertiary[2]))
							],
							surface,
							luminance
						});
					} catch {
						resolve(null);
					}
				};
				img.src = dataUrl;
			});
		}
		/** Backward-compatible single-color extraction: returns the primary HSL. */
		async function extractWallpaperColor(dataUrl, bgState) {
			const palette = await extractWallpaperPalette(dataUrl, bgState);
			return palette ? palette.primary : null;
		}
		/** HSL (h 0-360, s/l 0-1) → RGB (0-255 integers). */
		function hslToRgb(h, s, l) {
			const c = (1 - Math.abs(2 * l - 1)) * s;
			const hp = h / 60;
			const x = c * (1 - Math.abs(hp % 2 - 1));
			let r = 0, g = 0, b = 0;
			if (hp < 1) {
				r = c;
				g = x;
			} else if (hp < 2) {
				r = x;
				g = c;
			} else if (hp < 3) {
				g = c;
				b = x;
			} else if (hp < 4) {
				g = x;
				b = c;
			} else if (hp < 5) {
				r = x;
				b = c;
			} else {
				r = c;
				b = x;
			}
			const m = l - c / 2;
			return [
				Math.round((r + m) * 255),
				Math.round((g + m) * 255),
				Math.round((b + m) * 255)
			];
		}
		//#endregion
		//#region src/client/wallpaper.ts
		let wpEl = null;
		let appliedTokenNames = [];
		let tokenStyleEl = null;
		function ensureTokenStyle() {
			if (tokenStyleEl?.isConnected) return tokenStyleEl;
			tokenStyleEl = document.createElement("style");
			tokenStyleEl.dataset.plugin = "dsh-background-by-model-tokens";
			document.head.appendChild(tokenStyleEl);
			return tokenStyleEl;
		}
		function clearCustomTokens() {
			if (tokenStyleEl) tokenStyleEl.textContent = "";
			for (const name of appliedTokenNames) document.body.style.removeProperty(name);
			appliedTokenNames = [];
		}
		const OPACITY_TOKEN_GROUPS = [
			{
				part: "bg",
				names: ["--dsw-alias-bg-base"]
			},
			{
				part: "sidebar",
				names: ["--dsw-specific-sidebar-fill"]
			},
			{
				part: "card",
				names: [
					"--dsw-alias-bg-layer-1",
					"--dsw-alias-bg-layer-2",
					"--dsw-alias-bg-layer-3",
					"--dsw-specific-menu"
				]
			},
			{
				part: "input",
				names: ["--dsw-specific-input-major"]
			}
		];
		const OPACITY_VARS = {
			"--dsw-alias-bg-base": "--dsh-any-op-bg",
			"--dsw-specific-sidebar-fill": "--dsh-any-op-sidebar",
			"--dsw-alias-bg-layer-1": "--dsh-any-op-card-1",
			"--dsw-alias-bg-layer-2": "--dsh-any-op-card-2",
			"--dsw-alias-bg-layer-3": "--dsh-any-op-card-3",
			"--dsw-specific-input-major": "--dsh-any-op-input",
			"--dsw-specific-menu": "--dsh-any-op-menu"
		};
		let baseTokenKey = "";
		let pendingOps = null;
		let tokensRaf = null;
		function applyCustomTokens(ops) {
			pendingOps = ops;
			if (tokensRaf !== null) return;
			tokensRaf = requestAnimationFrame(() => {
				tokensRaf = null;
				if (pendingOps === null) return;
				const o = pendingOps;
				pendingOps = null;
				applyCustomTokensNow(o);
			});
		}
		let lastBgKey = "";
		function applyCustomTokensNow(ops) {
			const [h, s, l] = rColor();
			const { tokens } = genTokens(h, s, l);
			try {
				const forceDark = l < .55;
				if (`${h}|${s}|${l}` !== baseTokenKey) {
					baseTokenKey = `${h}|${s}|${l}`;
					if (forceDark) document.body.setAttribute("data-ds-dark-theme", "dsh-background-by-model");
					else document.body.removeAttribute("data-ds-dark-theme");
					const decls = [`color-scheme:${forceDark ? "dark" : "light"}`];
					for (const [name, value] of Object.entries(tokens)) {
						const opVar = OPACITY_VARS[name];
						decls.push(`${name}:${opVar !== void 0 ? `var(${opVar})` : value}!important`);
					}
					ensureTokenStyle().textContent = `body{${decls.join(";")}}`;
					for (const name of appliedTokenNames) document.body.style.removeProperty(name);
					appliedTokenNames = Object.keys(tokens);
				}
				const root = document.documentElement;
				for (const g of OPACITY_TOKEN_GROUPS) for (const name of g.names) root.style.setProperty(OPACITY_VARS[name], toRgba(tokens[name] ?? "#000", ops[g.part]));
				root.style.setProperty("--dsh-any-op-menu-cordis", toRgba(tokens["--dsw-specific-menu"] ?? "#000", ops.input));
				const bgKey = `${baseTokenKey}|${ops.bg}`;
				if (bgKey !== lastBgKey) {
					lastBgKey = bgKey;
					applyPartOpacities(ops);
				}
			} catch {}
		}
		const SETTINGS_PANEL_SEL = "[role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]";
		const SETTINGS_STYLE_RULE = `${SETTINGS_PANEL_SEL}{background:var(--dsh-any-bg-settings-surface,var(--dsw-alias-bg-layer-2));backdrop-filter:var(--dsh-any-blur-settings,none);--dsw-alias-bg-layer-1:var(--dsh-any-bg-settings-layer-1);--dsw-alias-bg-layer-2:var(--dsh-any-bg-settings-layer-2);--dsw-alias-bg-layer-3:var(--dsh-any-bg-settings-layer-3)}${SETTINGS_PANEL_SEL} .dab-card{backdrop-filter:var(--dsh-any-blur-card-panels,none);-webkit-backdrop-filter:var(--dsh-any-blur-card-panels,none)}`;
		const INPUT_BLUR_RULE = "[data-composer-card],[data-cordis-panel]{-webkit-backdrop-filter:var(--dsh-any-input-blur,none);backdrop-filter:var(--dsh-any-input-blur,none)}[data-cordis-panel]{--dsw-specific-menu:var(--dsh-any-op-menu-cordis)!important}";
		function applyInputBlur(px) {
			if (px > 0) document.documentElement.style.setProperty("--dsh-any-input-blur", `blur(${px}px)`);
			else document.documentElement.style.removeProperty("--dsh-any-input-blur");
		}
		function applySettingsOverrides(op) {
			const [h, s, l] = rColor();
			const tokens = genTokens(h, s, l).tokens;
			const layer1 = tokens["--dsw-alias-bg-layer-1"];
			const layer2 = tokens["--dsw-alias-bg-layer-2"];
			const layer3 = tokens["--dsw-alias-bg-layer-3"];
			if (layer2 !== void 0) document.documentElement.style.setProperty("--dsh-any-bg-settings-surface", toRgba(layer2, op));
			if (layer1 !== void 0) document.documentElement.style.setProperty("--dsh-any-bg-settings-layer-1", toRgba(layer1, op));
			if (layer2 !== void 0) document.documentElement.style.setProperty("--dsh-any-bg-settings-layer-2", toRgba(layer2, op));
			if (layer3 !== void 0) document.documentElement.style.setProperty("--dsh-any-bg-settings-layer-3", toRgba(layer3, op));
		}
		const TRAJECTORY_STYLE_RULE = "[data-conversation-composer-overlay]{--dsw-alias-bg-layer-1:var(--dsh-any-traj-layer-1);--dsw-alias-bg-layer-2:var(--dsh-any-traj-layer-2);--dsw-alias-bg-layer-3:var(--dsh-any-traj-layer-3)}";
		function applyTrajectoryOverrides(op) {
			const [h, s, l] = rColor();
			const tokens = genTokens(h, s, l).tokens;
			const layer1 = tokens["--dsw-alias-bg-layer-1"];
			const layer2 = tokens["--dsw-alias-bg-layer-2"];
			const layer3 = tokens["--dsw-alias-bg-layer-3"];
			if (layer1 !== void 0) document.documentElement.style.setProperty("--dsh-any-traj-layer-1", toRgba(layer1, op));
			if (layer2 !== void 0) document.documentElement.style.setProperty("--dsh-any-traj-layer-2", toRgba(layer2, op));
			if (layer3 !== void 0) document.documentElement.style.setProperty("--dsh-any-traj-layer-3", toRgba(layer3, op));
		}
		let frameEl = null;
		let sidebarEl = null;
		let centerEl = null;
		let detailsEl = null;
		const PART_BLUR_CLASS = "dab-part-blur";
		const PART_UNDERLAY_CLASS = "dab-part-underlay";
		const PART_BLUR_RULE = `${PART_BLUR_CLASS}{isolation:isolate}.${PART_UNDERLAY_CLASS}{position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;backdrop-filter:var(--dsh-any-part-blur,none);-webkit-backdrop-filter:var(--dsh-any-part-blur,none)}`;
		let partBlurStyleEl = null;
		function ensurePartBlurStyle() {
			if (partBlurStyleEl?.isConnected) return;
			partBlurStyleEl = document.createElement("style");
			partBlurStyleEl.dataset.plugin = "dsh-background-by-model-parts";
			partBlurStyleEl.textContent = PART_BLUR_RULE;
			document.head.appendChild(partBlurStyleEl);
		}
		function discoverParts() {
			const overlay = document.querySelector("[data-shell-overlay]");
			if (overlay === null) return;
			const frame = overlay.parentElement;
			if (frame === null) return;
			frameEl = frame;
			const idx = Array.from(frame.children).indexOf(overlay);
			sidebarEl = frame.children[idx - 3] ?? null;
			centerEl = frame.children[idx - 2] ?? null;
			detailsEl = frame.children[idx - 1] ?? null;
		}
		function setBlur(el, px) {
			if (el === null) return;
			const underlay = el.querySelector(`:scope > .${PART_UNDERLAY_CLASS}`);
			if (px > 0) {
				ensurePartBlurStyle();
				if (!el.classList.contains(PART_BLUR_CLASS) && getComputedStyle(el).position === "static") {
					el.style.position = "relative";
					el.setAttribute("data-dab-pos-patched", "1");
				}
				el.classList.add(PART_BLUR_CLASS);
				if (underlay === null) {
					const node = document.createElement("div");
					node.className = PART_UNDERLAY_CLASS;
					el.prepend(node);
				}
				el.style.setProperty("--dsh-any-part-blur", `blur(${px}px)`);
			} else {
				el.classList.remove(PART_BLUR_CLASS);
				el.style.removeProperty("--dsh-any-part-blur");
				underlay?.remove();
				if (el.getAttribute("data-dab-pos-patched") === "1") {
					el.style.removeProperty("position");
					el.removeAttribute("data-dab-pos-patched");
				}
			}
		}
		function applySettingsBlur(px) {
			if (px > 0) document.documentElement.style.setProperty("--dsh-any-blur-settings", `blur(${px}px)`);
			else document.documentElement.style.removeProperty("--dsh-any-blur-settings");
		}
		/** Apply the main-background opacity to the center/details columns instead of
		*  the frame. The frame's translucent bg-base sits UNDER the sidebar, so
		*  reducing the main-bg opacity stacked a second alpha onto the sidebar; moving
		*  the alpha onto the columns keeps the sidebar owned by its own slider. */
		function applyPartOpacities(ops) {
			if (!rHasColor()) return;
			discoverParts();
			if (frameEl === null) return;
			const [h, s, l] = rColor();
			const base = genTokens(h, s, l).tokens["--dsw-alias-bg-base"];
			frameEl.style.background = "transparent";
			if (centerEl !== null) centerEl.style.background = base !== void 0 ? toRgba(base, ops.bg) : "transparent";
			if (detailsEl !== null) detailsEl.style.background = base !== void 0 ? toRgba(base, ops.bg) : "transparent";
		}
		/** Blur of the option panels inside the settings dialog (.dab-card), owned by
		*  the "dialog option panel" (card) blur slider. Written as a plugin-owned
		*  variable consumed by SETTINGS_STYLE_RULE — deliberately NOT applied to the
		*  homepage center/details columns, which this slider must never touch. */
		function applyCardPanelsBlur(px) {
			if (px > 0) document.documentElement.style.setProperty("--dsh-any-blur-card-panels", `blur(${px}px)`);
			else document.documentElement.style.removeProperty("--dsh-any-blur-card-panels");
		}
		/** Apply per-part interface blur to the AppFrame columns + settings panel. */
		function applyPartBlurs(blurs) {
			discoverParts();
			setBlur(frameEl, 0);
			setBlur(sidebarEl, blurs.sidebar);
			setBlur(centerEl, blurs.bg);
			setBlur(detailsEl, blurs.bg);
			applyCardPanelsBlur(blurs.card);
			applySettingsBlur(blurs.settings);
			applyInputBlur(blurs.input);
			applyViewCards();
		}
		/** Live per-part blur update during slider drag (no full re-apply). */
		function setPartBlur(part, v) {
			if (part === "settings") {
				applySettingsBlur(v);
				return;
			}
			if (part === "card") {
				applyCardPanelsBlur(v);
				return;
			}
			if (part === "input") {
				applyInputBlur(v);
				return;
			}
			if (part === "chat" || part === "trajectory") {
				applyViewCards();
				return;
			}
			discoverParts();
			if (part === "bg") {
				setBlur(centerEl, v);
				setBlur(detailsEl, v);
			} else setBlur(sidebarEl, v);
		}
		const VIEW_CARDS = [{
			sel: "[data-chat-flow]",
			mark: "data-dab-chat-card",
			prev: "dabChatPrev",
			opacity: rChatTextOpacity,
			blur: () => rBlurs().chat,
			fallback: true
		}, {
			sel: "[data-conversation-composer-overlay]",
			mark: "data-dab-traj-card",
			prev: "dabTrajPrev",
			opacity: rTrajectoryOpacity,
			blur: () => rBlurs().trajectory,
			plain: true
		}];
		const viewTargets = VIEW_CARDS.map(() => null);
		function isScrollableY(el) {
			const oy = getComputedStyle(el).overflowY;
			return oy === "auto" || oy === "scroll" || oy === "overlay";
		}
		/** Whether the subtree hosts the chat input (textarea / contenteditable /
		*  textbox role) — used to keep the card off the input row. */
		function containsChatEditor(el) {
			return el.querySelector("textarea,[contenteditable=\"true\"],[contenteditable=\"\"],[contenteditable=\"plaintext-only\"],[role=\"textbox\"]") !== null;
		}
		/** Walk down from a coarse candidate toward the actual message column. */
		function refineMessageColumn(start) {
			let cur = start;
			for (let depth = 0; depth < 10; depth++) {
				if (isScrollableY(cur)) break;
				const kids = Array.from(cur.children).filter((k) => k instanceof HTMLElement);
				if (kids.length === 0) break;
				const tallest = kids.reduce((a, b) => b.clientHeight > a.clientHeight ? b : a);
				if (containsChatEditor(cur)) {
					const candidates = kids.filter((k) => !containsChatEditor(k) && k.clientHeight >= cur.clientHeight * .4);
					if (candidates.length === 0) break;
					cur = candidates.reduce((a, b) => b.clientHeight > a.clientHeight ? b : a);
					continue;
				}
				if (kids.length > 1 && tallest.clientHeight >= cur.clientHeight * .85) {
					cur = tallest;
					continue;
				}
				break;
			}
			return cur;
		}
		function discoverViewTarget(idx, spec) {
			if (centerEl === null || !document.body.contains(centerEl)) {
				viewTargets[idx] = null;
				return null;
			}
			const marked = centerEl.querySelector(spec.sel);
			const cached = viewTargets[idx];
			if (marked !== null) {
				if (cached !== null && cached !== marked) {
					setBlur(cached, 0);
					restoreCardHost(cached, spec.mark, spec.prev, spec.plain === true);
				}
				viewTargets[idx] = marked;
				return marked;
			}
			if (cached !== null && centerEl.contains(cached)) return cached;
			viewTargets[idx] = null;
			if (spec.fallback !== true) return null;
			if (centerEl.querySelector("[data-conversation-scroll]") !== null) return null;
			if (spec.opacity() <= 0 && spec.blur() <= 0) return null;
			let best = null;
			let bestArea = 0;
			for (const el of Array.from(centerEl.querySelectorAll("*"))) {
				if (!isScrollableY(el)) continue;
				if (el.clientHeight < centerEl.clientHeight * .35) continue;
				const area = el.clientWidth * el.clientHeight;
				if (area > bestArea) {
					bestArea = area;
					best = el;
				}
			}
			if (best === null) for (const el of Array.from(centerEl.children)) {
				if (!(el instanceof HTMLElement)) continue;
				if (el.clientHeight < centerEl.clientHeight * .5) continue;
				if (el.clientHeight > (best?.clientHeight ?? 0)) best = el;
			}
			const refined = best !== null ? refineMessageColumn(best) : null;
			viewTargets[idx] = refined;
			return refined;
		}
		/** Stash the host's own inline values so teardown restores them exactly. */
		function stashCardPrev(el, prev, plain) {
			const ds = el.dataset;
			ds[prev + "Bg"] = el.style.getPropertyValue("background");
			if (plain) return;
			ds[prev + "Border"] = el.style.getPropertyValue("border");
			ds[prev + "Radius"] = el.style.getPropertyValue("border-radius");
			ds[prev + "Padding"] = el.style.getPropertyValue("padding");
		}
		/** Undo the inline styling, restoring the host's previous inline values. */
		function restoreCardHost(el, mark, prev, plain) {
			if (!el.hasAttribute(mark)) return;
			const ds = el.dataset;
			const restore = (prop, v) => {
				if (v !== void 0 && v !== "") el.style.setProperty(prop, v);
				else el.style.removeProperty(prop);
			};
			restore("background", ds[prev + "Bg"]);
			if (!plain) {
				restore("border", ds[prev + "Border"]);
				restore("border-radius", ds[prev + "Radius"]);
				restore("padding", ds[prev + "Padding"]);
				delete ds[prev + "Border"];
				delete ds[prev + "Radius"];
				delete ds[prev + "Padding"];
			}
			delete ds[prev + "Bg"];
			el.removeAttribute(mark);
		}
		/** Teardown only: strip every view treatment and hand the hosts back untouched. */
		function removeViewCards() {
			VIEW_CARDS.forEach((spec, i) => {
				const el = viewTargets[i];
				if (el !== null) {
					setBlur(el, 0);
					restoreCardHost(el, spec.mark, spec.prev, spec.plain === true);
				}
				viewTargets[i] = null;
			});
		}
		const TABLE_FIX_RULE = [
			".md-table-wide {",
			"  --dsh-table-spare: 0px !important;",
			"  --dsh-table-lead: 0px !important;",
			"  box-sizing: border-box !important;",
			"  width: 100% !important;",
			"  max-width: 100% !important;",
			"  margin-left: 0 !important;",
			"  padding-left: 0 !important;",
			"  padding-bottom: 0 !important;",
			"  overflow-x: auto !important;",
			"}"
		].join("\n");
		let tableFixStyleEl = null;
		/** Toggle the wide-table clamp according to the chat region's opacity & blur. */
		function syncTableFix() {
			if (!(rChatTextOpacity() > 0 || rBlurs().chat > 0)) {
				if (tableFixStyleEl !== null) {
					tableFixStyleEl.remove();
					tableFixStyleEl = null;
				}
				return;
			}
			if (tableFixStyleEl === null) {
				tableFixStyleEl = document.createElement("style");
				tableFixStyleEl.dataset.plugin = "dsh-background-by-model-table-fix";
				tableFixStyleEl.textContent = TABLE_FIX_RULE;
			}
			if (!tableFixStyleEl.isConnected) document.head.appendChild(tableFixStyleEl);
		}
		/** Re-derive the conversation view cards from the current config. */
		function applyViewCards() {
			discoverParts();
			if (centerEl === null) return;
			const [h, s, l] = rColor();
			const surface = genTokens(h, s, l).tokens["--dsw-alias-bg-layer-1"];
			VIEW_CARDS.forEach((spec, i) => {
				const target = discoverViewTarget(i, spec);
				if (target === null) return;
				const plain = spec.plain === true;
				const opacity = spec.opacity();
				const blurPx = spec.blur();
				if (!plain) {
					if (!target.hasAttribute(spec.mark)) stashCardPrev(target, spec.prev, false);
					const borderAlpha = opacity > 0 ? Math.min(1, opacity * 1.5) : blurPx > 0 ? .35 : 0;
					target.style.background = surface !== void 0 ? toRgba(surface, opacity) : "transparent";
					target.style.border = surface !== void 0 ? `1px solid ${toRgba(surface, borderAlpha)}` : "1px solid transparent";
					target.style.borderRadius = "16px";
					target.style.padding = "18px";
				}
				target.setAttribute(spec.mark, "1");
				setBlur(target, blurPx);
			});
			syncTableFix();
		}
		let partsObserver = null;
		/** Watch for the AppFrame mounting so persisted blurs land even when the shell
		*  renders after this plugin's apply. */
		function watchParts() {
			if (partsObserver !== null || typeof MutationObserver === "undefined") return;
			partsObserver = new MutationObserver(() => {
				if (frameEl !== null && sidebarEl !== null && centerEl !== null && detailsEl !== null && document.body.contains(frameEl) && viewTargets.every((el) => el !== null && document.body.contains(el))) return;
				applyPartBlurs(rBlurs());
				applyPartOpacities(rOps());
			});
			partsObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
		}
		function stopWatchingParts() {
			partsObserver?.disconnect();
			partsObserver = null;
		}
		let themeObserver = null;
		let themeRaf = 0;
		function reassertScheme() {
			const [, , l] = rColor();
			if (l < .55) document.body.setAttribute("data-ds-dark-theme", "dsh-background-by-model");
			else document.body.removeAttribute("data-ds-dark-theme");
			applyCustomTokens(rOps());
		}
		/** Re-assert the plugin's forced scheme whenever the host strips it, so a
		*  refresh / cold-load / set-change never flashes a light frame. */
		function watchThemeResets() {
			if (themeObserver !== null || typeof MutationObserver === "undefined") return () => void 0;
			themeObserver = new MutationObserver(() => {
				if (document.body.getAttribute("data-ds-dark-theme") === "dsh-background-by-model") return;
				if (!rHasColor()) return;
				if (themeRaf !== 0) return;
				themeRaf = requestAnimationFrame(() => {
					themeRaf = 0;
					if (document.body.getAttribute("data-ds-dark-theme") === "dsh-background-by-model") return;
					reassertScheme();
				});
			});
			themeObserver.observe(document.body, {
				attributes: true,
				attributeFilter: ["data-ds-dark-theme"]
			});
			themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["data-ds-dark-theme"]
			});
			return () => {
				themeObserver?.disconnect();
				themeObserver = null;
			};
		}
		const FADE_MS = 320;
		let layers = null;
		/** Index of the layer the user is looking at. */
		let front = 0;
		/** Index of the layer fading in right now, if any. */
		let pending = null;
		let fadeTimer = null;
		function createLayer() {
			const el = document.createElement("div");
			el.dataset.dabWpLayer = "";
			el.style.cssText = "position:absolute;inset:0;opacity:0;background-repeat:no-repeat;background-position:center;";
			return {
				el,
				url: null
			};
		}
		function ensureWpContainer() {
			if (wpEl !== null && layers !== null && document.body.contains(wpEl)) return;
			if (fadeTimer !== null) {
				window.clearTimeout(fadeTimer);
				fadeTimer = null;
			}
			const a = createLayer();
			const b = createLayer();
			wpEl = document.createElement("div");
			wpEl.dataset.dabWp = "";
			wpEl.style.cssText = "position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;";
			wpEl.append(a.el, b.el);
			layers = [a, b];
			front = 0;
			pending = null;
			document.body.prepend(wpEl);
		}
		/** Drop the whole wallpaper layer (no rule carries an image). */
		function dropWpContainer() {
			if (fadeTimer !== null) {
				window.clearTimeout(fadeTimer);
				fadeTimer = null;
			}
			pending = null;
			front = 0;
			layers = null;
			wpEl?.remove();
			wpEl = null;
		}
		/** Release one layer's image — the layer is fully covered when this is called. */
		function clearLayer(l) {
			if (l.url === null) return;
			l.url = null;
			l.el.style.backgroundImage = "";
			l.el.style.backgroundSize = "";
			l.el.style.backgroundPosition = "";
		}
		/** Intrinsic-size cache for the center mode (native pixels of the current image). */
		let imgNat = null;
		function imageNatSize(url, cb) {
			if (imgNat !== null && imgNat.url === url) {
				cb(imgNat.w, imgNat.h);
				return;
			}
			const img = new Image();
			img.onload = () => {
				imgNat = {
					url,
					w: img.naturalWidth,
					h: img.naturalHeight
				};
				cb(img.naturalWidth, img.naturalHeight);
			};
			img.onerror = () => cb(0, 0);
			img.src = url;
		}
		/** Paint one layer's image and its placement. The placement always follows the
		*  ACTIVE rule: the incoming layer is painted right after a switch, and a
		*  repaint of the same URL (framing edit, viewport resize) must use the rule's
		*  current framing. */
		function paintLayer(l, url) {
			const el = l.el;
			l.url = url;
			const bg = rBgState();
			const mode = rBgMode();
			const next = `url("${url}")`;
			if (el.style.backgroundImage !== next) el.style.backgroundImage = next;
			if (mode === "fit") {
				el.style.backgroundRepeat = "no-repeat";
				if (bg.iw > 0) {
					const fit = Math.min(window.innerWidth / bg.iw, window.innerHeight / bg.ih);
					const w = bg.iw * fit * bg.zoom;
					const h = bg.ih * fit * bg.zoom;
					el.style.backgroundSize = `${w}px ${h}px`;
					el.style.backgroundPosition = `${bg.x * window.innerWidth - w / 2}px ${bg.y * window.innerHeight - h / 2}px`;
				} else {
					el.style.backgroundSize = "contain";
					el.style.backgroundPosition = "center";
				}
			} else if (mode === "fill") {
				el.style.backgroundRepeat = "no-repeat";
				el.style.backgroundSize = "cover";
				el.style.backgroundPosition = "center";
			} else if (mode === "stretch") {
				el.style.backgroundRepeat = "no-repeat";
				el.style.backgroundSize = "100% 100%";
				el.style.backgroundPosition = "center";
			} else if (mode === "tile") {
				el.style.backgroundRepeat = "repeat";
				el.style.backgroundSize = "auto";
				el.style.backgroundPosition = "0px 0px";
			} else {
				el.style.backgroundRepeat = "no-repeat";
				el.style.backgroundSize = "contain";
				el.style.backgroundPosition = "center";
				imageNatSize(url, (w, h) => {
					if (l.url !== url || el.style.backgroundImage !== next || rBgMode() !== "center") return;
					if (w > 0 && h > 0) {
						el.style.backgroundSize = `${w}px ${h}px`;
						el.style.backgroundPosition = "center";
					}
				});
			}
		}
		/** Whether a switch should animate: nothing to fade from, an invisible
		*  wallpaper and a reduced-motion preference all switch instantly. */
		function canFade(from) {
			if (from.url === null) return false;
			if (rWop() <= .01) return false;
			const mm = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
			return mm === null || !mm.matches;
		}
		/** End an in-flight fade: promote the incoming layer, free the one under it. */
		function finishFade(idx) {
			if (layers === null || pending !== idx) return;
			if (fadeTimer !== null) {
				window.clearTimeout(fadeTimer);
				fadeTimer = null;
			}
			pending = null;
			front = idx;
			const el = layers[idx].el;
			el.style.opacity = "1";
			el.style.willChange = "";
			clearLayer(layers[idx === 0 ? 1 : 0]);
		}
		/** Land an in-flight fade on its end state at once (another switch arrived). */
		function settleFade() {
			if (layers === null || pending === null) return;
			const idx = pending;
			if (fadeTimer !== null) {
				window.clearTimeout(fadeTimer);
				fadeTimer = null;
			}
			pending = null;
			front = idx;
			const el = layers[idx].el;
			el.style.transition = "none";
			el.style.opacity = "1";
			el.style.willChange = "";
			clearLayer(layers[idx === 0 ? 1 : 0]);
		}
		/** Abandon an in-flight fade: the layer it was leaving holds the wanted image. */
		function cancelFade() {
			if (layers === null || pending === null) return;
			const idx = pending;
			if (fadeTimer !== null) {
				window.clearTimeout(fadeTimer);
				fadeTimer = null;
			}
			pending = null;
			const el = layers[idx].el;
			el.style.transition = "none";
			el.style.opacity = "0";
			el.style.willChange = "";
			clearLayer(layers[idx]);
		}
		/** Show `url` on the wallpaper layer, cross-fading from what it paints now. */
		function applyImageWp(url) {
			ensureWpContainer();
			const ls = layers;
			if (pending !== null) {
				if (ls[pending].url === url) {
					paintLayer(ls[pending], url);
					applyWpEffects();
					return;
				}
				if (ls[front].url === url) {
					cancelFade();
					paintLayer(ls[front], url);
					applyWpEffects();
					return;
				}
				settleFade();
			}
			if (ls[front].url === url) {
				paintLayer(ls[front], url);
				applyWpEffects();
				return;
			}
			const from = ls[front];
			const idx = front === 0 ? 1 : 0;
			const target = ls[idx];
			const el = target.el;
			el.style.transition = "none";
			el.style.opacity = "0";
			el.style.zIndex = "1";
			from.el.style.zIndex = "0";
			paintLayer(target, url);
			applyWpEffects();
			if (!canFade(from)) {
				el.style.opacity = "1";
				front = idx;
				clearLayer(from);
				return;
			}
			el.style.willChange = "opacity";
			pending = idx;
			requestAnimationFrame(() => {
				if (pending !== idx || layers === null) return;
				el.style.transition = `opacity ${FADE_MS}ms ease`;
				el.style.opacity = "1";
			});
			fadeTimer = window.setTimeout(() => finishFade(idx), 480);
		}
		function applyWpEffects() {
			if (wpEl === null || layers === null) return;
			wpEl.style.opacity = String(rWop());
			const blur = rBl();
			const filter = blur > 0 ? `blur(${blur}px)` : "";
			layers[0].el.style.filter = filter;
			layers[1].el.style.filter = filter;
		}
		/** Repaint the wallpaper layer, the token palette and every interface part from
		*  the ACTIVE rule. This is the single entry point a rule switch goes through. */
		function applyWp() {
			const url = rWp();
			if (url) applyImageWp(url);
			else if (wpEl !== null) dropWpContainer();
			if (rHasColor()) {
				applyCustomTokens(rOps());
				applySettingsOverrides(rSop());
				applyTrajectoryOverrides(rTrajectoryOpacity());
			} else {
				clearCustomTokens();
				document.body.removeAttribute("data-ds-dark-theme");
				baseTokenKey = "";
				lastBgKey = "";
			}
			applyPartBlurs(rBlurs());
		}
		function teardownWp() {
			dropWpContainer();
			clearCustomTokens();
			tokenStyleEl?.remove();
			tokenStyleEl = null;
			removeViewCards();
			document.body.removeAttribute("data-ds-dark-theme");
			document.body.style.removeProperty("color-scheme");
			document.documentElement.style.removeProperty("--dsh-any-bg-settings-surface");
			document.documentElement.style.removeProperty("--dsh-any-bg-settings-layer-1");
			document.documentElement.style.removeProperty("--dsh-any-bg-settings-layer-2");
			document.documentElement.style.removeProperty("--dsh-any-bg-settings-layer-3");
			document.documentElement.style.removeProperty("--dsh-any-traj-layer-1");
			document.documentElement.style.removeProperty("--dsh-any-traj-layer-2");
			document.documentElement.style.removeProperty("--dsh-any-traj-layer-3");
			document.documentElement.style.removeProperty("--dsh-any-blur-settings");
			document.documentElement.style.removeProperty("--dsh-any-blur-card-panels");
			document.documentElement.style.removeProperty("--dsh-any-input-blur");
			for (const v of Object.values(OPACITY_VARS)) document.documentElement.style.removeProperty(v);
			baseTokenKey = "";
			lastBgKey = "";
			if (tokensRaf !== null) {
				cancelAnimationFrame(tokensRaf);
				tokensRaf = null;
			}
			pendingOps = null;
			tableFixStyleEl?.remove();
			tableFixStyleEl = null;
			setBlur(frameEl, 0);
			setBlur(sidebarEl, 0);
			setBlur(centerEl, 0);
			setBlur(detailsEl, 0);
			if (frameEl !== null) frameEl.style.removeProperty("background");
			if (centerEl !== null) centerEl.style.removeProperty("background");
			if (detailsEl !== null) detailsEl.style.removeProperty("background");
			stopWatchingParts();
		}
		//#endregion
		//#region src/client/modelbg.ts
		/** Rules that can actually paint: enabled and carrying an image slot. */
		function usable(rules) {
			return rules.filter((r) => r.enabled && r.slot !== "");
		}
		/**
		* Resolve the rule for one model text.
		*
		* Top→bottom, first case-insensitive substring hit wins; an empty `match` never
		* hits on its own. When nothing hits, the FIRST usable rule is the fallback
		* (rule 1 deliberately doubles as both a matcher and the fallback).
		*/
		function matchRule(rules, modelText) {
			const list = usable(rules);
			if (list.length === 0) return {
				rule: null,
				matched: false
			};
			const hay = modelText.toLowerCase();
			if (hay.trim() !== "") for (const rule of list) {
				const needle = rule.match.trim().toLowerCase();
				if (needle === "") continue;
				if (hay.includes(needle)) return {
					rule,
					matched: true
				};
			}
			return {
				rule: list[0],
				matched: false
			};
		}
		/** Look the current model's display name up in the shared catalog. */
		function displayNameOf(state, provider, model) {
			if (model === "" || !Array.isArray(state?.groups)) return "";
			for (const group of state.groups) {
				if (group.id !== provider) continue;
				for (const entry of group.models ?? []) if (entry.id === model) return typeof entry.name === "string" ? entry.name : "";
			}
			return "";
		}
		/** How often to look for the sessions service that mounts after this plugin. */
		const ATTACH_RETRY_MS = 400;
		/** Stop looking after this many tries (~2 minutes). */
		const ATTACH_RETRY_LIMIT = 300;
		/** Safety re-read of every source, so a missed notification cannot pin a stale model. */
		const POLL_MS = 1500;
		/** One selection out of a `modelSelection` projection value. */
		function selectionOf(value) {
			const pick = value?.next ?? value?.lastUsed ?? null;
			if (pick === null || typeof pick !== "object") return null;
			const provider = typeof pick.provider === "string" ? pick.provider : "";
			const model = typeof pick.model === "string" ? pick.model : "";
			if (provider === "" && model === "") return null;
			return {
				provider,
				model
			};
		}
		/**
		* Watch the current session's model selection.
		*
		* @param ctx - client root context.
		* @param onChange - called with the match text (provider + id + display name),
		*   the best available label, which source answered, and — when nothing could be
		*   read — the hop that failed.
		* @returns disposer.
		*/
		function watchModel(ctx, onChange) {
			let service = null;
			let list = null;
			let offList = null;
			let sessionId = null;
			let directory = null;
			let offDirectory = null;
			/** The session's own `modelSelection` projection face. */
			let projected = null;
			let offProjected = null;
			let lastKey = "\0";
			let poll = null;
			let retry = null;
			let retries = 0;
			const release = () => {
				if (offDirectory !== null) {
					offDirectory();
					offDirectory = null;
				}
				if (offProjected !== null) {
					offProjected();
					offProjected = null;
				}
				directory = null;
				projected = null;
			};
			/** Bind the session's own durable model selection (the authoritative source). */
			const bindProjection = (id) => {
				const svc = service;
				if (svc === null) return;
				try {
					let binding = typeof svc.binding === "function" ? svc.binding(id) : void 0;
					if (binding === void 0 && typeof svc.scope === "function") {
						svc.scope(id);
						binding = typeof svc.binding === "function" ? svc.binding(id) : void 0;
					}
					const face = binding?.session?.projections?.faceOf?.("modelSelection");
					if (face === void 0 || typeof face.subscribe !== "function" || typeof face.getSnapshot !== "function") return;
					projected = face;
					offProjected = face.subscribe(() => {
						emit(false);
					});
				} catch {
					projected = null;
					offProjected = null;
				}
			};
			const note = () => {
				if (service === null) return "no-service";
				if ((list?.getSnapshot()?.current ?? null) === null) return "no-session";
				if (projected === null && directory === null) return "no-projection";
				return "empty-selection";
			};
			const emit = (force) => {
				const state = directory?.store.getSnapshot();
				const fromDirectory = state?.current ?? null;
				const sel = fromDirectory !== null ? {
					provider: fromDirectory.provider ?? "",
					model: fromDirectory.model ?? ""
				} : (() => {
					try {
						return selectionOf(projected?.getSnapshot());
					} catch {
						return null;
					}
				})();
				const provider = sel?.provider ?? "";
				const model = sel?.model ?? "";
				const name = displayNameOf(state, provider, model);
				const text = [
					provider,
					model,
					name
				].filter((p) => p !== "").join(" ").trim();
				const noteValue = text === "" ? note() : "";
				const key = `${text}\u0001${name}\u0001${noteValue}`;
				if (!force && key === lastKey) return;
				lastKey = key;
				onChange(text, name !== "" ? name : model !== "" ? model : provider, "session", noteValue);
			};
			const bind = () => {
				const id = list?.getSnapshot()?.current ?? null;
				if (id === sessionId && (directory !== null || projected !== null)) {
					emit(false);
					return;
				}
				release();
				sessionId = id;
				if (id !== null) {
					bindProjection(id);
					if (directory === null) {
						const directories = ctx.get("modelDirectories");
						if (directories !== void 0 && typeof directories.directoryFor === "function") try {
							directory = directories.directoryFor(id);
							offDirectory = directory.store.subscribe(() => {
								emit(false);
							});
							const pending = directory.load?.();
							if (pending !== void 0 && pending !== null && typeof pending.catch === "function") pending.catch(() => void 0);
						} catch {
							directory = null;
							offDirectory = null;
						}
					}
				}
				emit(true);
			};
			const stopRetry = () => {
				if (retry === null) return;
				window.clearInterval(retry);
				retry = null;
			};
			const tick = () => {
				if (list === null) return;
				if ((list.getSnapshot()?.current ?? null) !== sessionId || directory === null && projected === null) bind();
				else emit(false);
			};
			/**
			* Look the sessions service up. It arrives after this plugin's bundle on this
			* deployment, so the first attempt usually fails — which is exactly why this
			* is a retry loop rather than a one-shot lookup.
			*/
			const attach = () => {
				const svc = ctx.get("sessions");
				if (svc === void 0 || svc === null) return false;
				const face = svc.list;
				if (face === void 0 || typeof face.subscribe !== "function" || typeof face.getSnapshot !== "function") return false;
				service = svc;
				list = face;
				offList = face.subscribe(bind);
				if (poll === null) poll = window.setInterval(tick, POLL_MS);
				bind();
				return true;
			};
			if (!attach()) retry = window.setInterval(() => {
				retries++;
				if (attach() || retries >= ATTACH_RETRY_LIMIT) stopRetry();
			}, ATTACH_RETRY_MS);
			return () => {
				stopRetry();
				if (poll !== null) {
					window.clearInterval(poll);
					poll = null;
				}
				if (offList !== null) {
					offList();
					offList = null;
				}
				service = null;
				list = null;
				release();
			};
		}
		const UI_CSS = `
/* The section is rendered INLINE inside the host settings dialog's content
 * column: the host provides the modal chrome (backdrop, centering, closing).
 * These classes style only the embedded shell; transient fixed layers (toast,
 * color picker, background editor) escape through Portals on <html>. */
.dab-root{position:relative;color:var(--dsw-alias-label-primary);animation:dab-fade-in .35s ease both;container-type:inline-size;display:flex;flex-direction:column;align-items:center;width:100%;min-width:0;--dab-mono:ui-monospace,"Cascadia Mono","SF Mono",Consolas,"Courier New",monospace}
.dab-root *,.dab-root *::before,.dab-root *::after{box-sizing:border-box}
.dab-root button{font-family:inherit}

/* ── shell: nav rail + page body ─────────────────────────────────────────── */
.dab-shell{display:grid;grid-template-columns:158px minmax(0,1fr);gap:26px;align-items:start;padding-bottom:8px;width:100%;max-width:980px;margin:0 auto}
.dab-nav{position:sticky;top:0;display:flex;flex-direction:column;gap:18px}
.dab-brand{display:flex;align-items:center;gap:10px;padding:2px 6px}
.dab-brand-tile{width:30px;height:30px;flex:none;border-radius:9px;display:grid;place-items:center;color:var(--dsw-alias-brand-text);background:var(--dsw-alias-brand-primary);box-shadow:0 4px 14px -4px var(--dsw-alias-brand-primary)}
.dab-brand-name{font-size:13px;font-weight:650;letter-spacing:.01em;line-height:1.25}
.dab-brand-tag{font-size:9px;letter-spacing:.16em;font-weight:600;color:var(--dsw-alias-label-quaternary,var(--dsw-alias-label-tertiary));text-transform:uppercase}
.dab-nav-list{position:relative;display:flex;flex-direction:column;gap:4px}
.dab-nav-ind{position:absolute;left:0;right:0;top:0;height:38px;border-radius:11px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 13%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 25%,transparent);transition:transform .38s cubic-bezier(.22,1,.36,1)}
.dab-nav-item{position:relative;z-index:1;display:flex;align-items:center;gap:10px;height:38px;padding:0 12px;border:0;background:none;border-radius:11px;color:var(--dsw-alias-label-tertiary);font-size:13px;cursor:pointer;text-align:left;transition:color .22s ease}
.dab-nav-item:hover{color:var(--dsw-alias-label-primary)}
.dab-nav-item.is-active{color:var(--dsw-alias-brand-primary);font-weight:600}
.dab-nav-item svg{flex:none;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.dab-nav-item:hover svg{transform:scale(1.14) rotate(-5deg)}

/* ── page chrome ─────────────────────────────────────────────────────────── */
.dab-page{animation:dab-page-in .4s cubic-bezier(.22,1,.36,1) both;min-width:0;display:flex;flex-direction:column;gap:13px}
.dab-head{margin:2px 0 5px}
.dab-overline{font-size:10.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--dsw-alias-brand-primary);opacity:.9}
.dab-h1{margin:4px 0 0;font-size:21px;font-weight:700;letter-spacing:-.01em}
.dab-desc{margin:6px 0 0;font-size:12.5px;line-height:1.55;color:var(--dsw-alias-label-tertiary);max-width:56ch}
.dab-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;padding:18px}
.dab-card-hover{transition:transform .28s ease,box-shadow .28s ease,border-color .28s ease}
.dab-card-hover:hover{transform:translateY(-2px);box-shadow:0 10px 28px -12px rgba(0,0,0,.28)}
.dab-rise{animation:dab-rise-in .55s cubic-bezier(.22,1,.36,1) both;animation-delay:calc(var(--d,0) * 62ms)}

/* ── accent hero (color orb) ─────────────────────────────────────────────── */
.dab-hero-accent{display:flex;align-items:center;gap:24px;flex-wrap:wrap}
.dab-orb-wrap{position:relative;width:118px;height:118px;flex:none}
.dab-orb{position:absolute;inset:11px;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.5),rgba(255,255,255,0) 44%),var(--c,#888);box-shadow:0 16px 36px -10px var(--c-soft,transparent),inset 0 -10px 20px rgba(0,0,0,.16);animation:dab-orb-in .7s cubic-bezier(.22,1,.36,1) both}
.dab-orb-ring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 30%,var(--c,#888) 46%,transparent 62%,transparent 76%,var(--c,#888) 90%,transparent 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3.5px),#000 calc(100% - 2.5px));mask:radial-gradient(farthest-side,transparent calc(100% - 3.5px),#000 calc(100% - 2.5px));animation:dab-spin 7s linear infinite;opacity:.9}
.dab-hex-caption{font-size:11px;color:var(--dsw-alias-label-tertiary);letter-spacing:.04em}
.dab-hex{font-family:var(--dab-mono);font-size:24px;font-weight:600;letter-spacing:.02em;line-height:1.2;margin-top:2px}
.dab-hsl-row{display:flex;gap:16px;margin-top:7px;font-family:var(--dab-mono);font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dab-hsl-row b{font-weight:600;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary))}

/* ── swatches ────────────────────────────────────────────────────────────── */
.dab-swatch-title{font-size:12px;font-weight:600;margin-bottom:10px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary))}
.dab-swatches{display:flex;flex-wrap:wrap;gap:9px}
.dab-swatch{width:25px;height:25px;border-radius:50%;border:0;padding:0;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1);transition:transform .22s cubic-bezier(.34,1.56,.64,1),box-shadow .22s ease}
.dab-swatch:hover{transform:scale(1.2)}
.dab-swatch.is-on{box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1),0 0 0 4px var(--dsw-alias-brand-primary)}

/* ── wheel card ──────────────────────────────────────────────────────────── */
.dab-wheel-card{position:relative;display:flex;align-items:center;justify-content:center;gap:28px;flex-wrap:wrap;padding:24px 18px}
.dab-wheel-glow{position:absolute;width:230px;height:230px;border-radius:50%;filter:blur(48px);opacity:.2;background:var(--c,#888);pointer-events:none;transition:background .4s ease}
.dab-wheel{position:relative;cursor:crosshair;border-radius:50%;box-shadow:0 12px 32px -14px rgba(0,0,0,.4)}
.dab-hint{font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-tertiary);padding:0 4px}

/* ── precise color inputs ────────────────────────────────────────────────── */
.dab-inputs{display:flex;flex-direction:column;gap:10px;min-width:172px}
.dab-field{display:flex;align-items:center;gap:8px}
.dab-field-label{width:14px;text-align:center;font-family:var(--dab-mono);font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary)}
.dab-num{flex:1;min-width:0;height:30px;padding:0 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-family:var(--dab-mono);font-size:12px;outline:none;transition:border-color .2s,box-shadow .2s}
.dab-num:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}
.dab-num::-webkit-outer-spin-button,.dab-num::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.dab-num{-moz-appearance:textfield;appearance:textfield}
.dab-urlinput{flex:1;min-width:180px;height:34px;padding:0 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12.5px;outline:none;transition:border-color .2s}
.dab-urlinput::placeholder{color:var(--dsw-alias-label-quaternary)}
.dab-urlinput:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}
.dab-swatch-lg{height:38px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);box-shadow:inset 0 0 14px rgba(0,0,0,.1);transition:transform .3s ease}
.dab-swatch-lg:hover{transform:scale(1.02)}

/* ── buttons & chips ─────────────────────────────────────────────────────── */
.dab-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:34px;padding:0 14px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill);color:var(--dsw-alias-label-primary);font-size:12.5px;font-weight:550;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,opacity .18s ease,background .18s ease}
.dab-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 5px 14px -6px rgba(0,0,0,.32)}
.dab-btn:active:not(:disabled){transform:translateY(0) scale(.97);box-shadow:none}
.dab-btn:disabled{opacity:.5;cursor:not-allowed}
.dab-btn-primary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-text);border-color:transparent}
.dab-btn-danger{color:var(--dsw-alias-state-error-primary)}
.dab-btn-ghost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary))}
.dab-btn-ghost:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);box-shadow:none}
.dab-btn:focus-visible,.dab-nav-item:focus-visible,.dab-seg-item:focus-visible,.dab-swatch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dab-chip-row{display:flex;flex-wrap:wrap;gap:8px}
.dab-chip{height:30px;padding:0 14px;border-radius:99px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary));font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .22s ease}
.dab-chip:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
.dab-chip.is-active{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-text);border-color:transparent}

/* ── sliders ─────────────────────────────────────────────────────────────── */
.dab-slider-block{display:flex;flex-direction:column;gap:6px}
.dab-slider-block + .dab-slider-block{margin-top:13px}
.dab-slider-label{font-size:12px;font-weight:550;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary))}
.dab-slider-val{font-family:var(--dab-mono);font-size:11px;color:var(--dsw-alias-label-tertiary);min-width:44px;text-align:right}
.dab-slider{-webkit-appearance:none;appearance:none;flex:1;min-width:0;height:4px;border-radius:99px;outline:none;cursor:pointer;margin:5px 0;background:linear-gradient(to right,var(--dsw-alias-brand-primary) calc(var(--pct,50) * 1%),var(--dsw-alias-border-l2) calc(var(--pct,50) * 1%));transition:height .15s ease}
.dab-slider:hover{height:5px}
.dab-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:15px;height:15px;border-radius:50%;background:var(--dsw-alias-button-elevated-fill,#fff);border:2px solid var(--dsw-alias-brand-primary);box-shadow:0 1px 5px rgba(0,0,0,.28);transition:transform .16s cubic-bezier(.34,1.56,.64,1)}
.dab-slider:hover::-webkit-slider-thumb,.dab-slider:focus-visible::-webkit-slider-thumb{transform:scale(1.22)}
.dab-slider:active::-webkit-slider-thumb{transform:scale(1.34)}
.dab-slider::-moz-range-thumb{width:13px;height:13px;border-radius:50%;background:var(--dsw-alias-button-elevated-fill,#fff);border:2px solid var(--dsw-alias-brand-primary)}

/* ── interface part cards ────────────────────────────────────────────────── */
.dab-grid-parts{display:grid;grid-template-columns:repeat(auto-fill,minmax(256px,1fr));gap:13px}
.dab-part-head{display:flex;align-items:center;gap:11px;margin-bottom:14px}
.dab-part-ico{width:32px;height:32px;flex:none;border-radius:10px;display:grid;place-items:center;color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.dab-part-name{font-size:13.5px;font-weight:600}
.dab-part-badge{margin-left:auto;font-family:var(--dab-mono);font-size:11px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);border-radius:99px;padding:3px 9px}

/* ── segmented control ───────────────────────────────────────────────────── */
.dab-seg{position:relative;display:inline-flex;padding:3px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:11px}
.dab-seg-thumb{position:absolute;top:3px;bottom:3px;left:3px;width:var(--w,96px);border-radius:8px;background:var(--dsw-alias-button-elevated-fill);box-shadow:0 2px 8px -2px rgba(0,0,0,.28);transition:transform .32s cubic-bezier(.22,1,.36,1)}
.dab-seg-item{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;width:var(--w,96px);height:30px;border:0;background:none;border-radius:8px;color:var(--dsw-alias-label-tertiary);font-size:12.5px;cursor:pointer;transition:color .25s ease}
.dab-seg-item.is-active{color:var(--dsw-alias-label-primary);font-weight:600}

/* ── toggle switch ───────────────────────────────────────────────────────── */
.dab-toggle{position:relative;width:42px;height:24px;flex:none;border-radius:99px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);cursor:pointer;padding:0;transition:background .28s ease,border-color .28s ease}
.dab-toggle-knob{position:absolute;top:2.5px;left:2.5px;width:17px;height:17px;border-radius:50%;background:var(--dsw-alias-label-secondary,#999);box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .28s cubic-bezier(.22,1,.36,1),background .28s ease}
.dab-toggle.is-on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dab-toggle.is-on .dab-toggle-knob{transform:translateX(18px);background:#fff}

/* ── background preview hero ─────────────────────────────────────────────── */
.dab-hero{position:relative;border-radius:16px;overflow:hidden;aspect-ratio:16/9;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2)}
.dab-hero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .5s cubic-bezier(.22,1,.36,1)}
.dab-hero:hover .dab-hero-img{transform:scale(1.03)}
.dab-hero-empty{position:absolute;inset:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--dsw-alias-label-tertiary);font-size:12.5px;border:1.5px dashed var(--dsw-alias-border-l2);border-radius:12px;cursor:pointer;background:transparent;transition:border-color .25s,color .25s,background .25s;width:auto;height:auto}
.dab-hero-empty:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dab-hero-empty.is-over{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent)}
.dab-hero-badge{position:absolute;top:10px;left:10px;display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 11px;border-radius:99px;background:rgba(0,0,0,.45);color:#fff;font-size:11px;backdrop-filter:blur(6px);pointer-events:none}
.dab-hero-veil{position:absolute;left:0;right:0;bottom:0;padding:34px 12px 12px;display:flex;align-items:flex-end;justify-content:flex-end;gap:8px;background:linear-gradient(to top,rgba(0,0,0,.55),rgba(0,0,0,0));opacity:0;transform:translateY(6px);transition:opacity .3s ease,transform .3s ease}
.dab-hero:hover .dab-hero-veil{opacity:1;transform:none}
.dab-hero-veil .dab-btn{background:rgba(255,255,255,.94);color:#14161a;border-color:transparent;height:30px;font-size:12px}
.dab-hero-veil .dab-btn-danger{color:#dc2626}

/* ── profile page ────────────────────────────────────────────────────────── */
.dab-profile-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(238px,1fr));gap:13px}
.dab-profile-ico{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;margin-bottom:13px;color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.dab-profile-title{font-size:14px;font-weight:650}
.dab-profile-desc{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.55;margin:5px 0 15px}
.dab-footer{margin-top:6px;padding:14px 4px 0;border-top:1px solid var(--dsw-alias-border-l2);display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dab-footer-mono{font-family:var(--dab-mono);letter-spacing:.02em}

/* ── toast ───────────────────────────────────────────────────────────────── */
.dab-toast{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;height:38px;padding:0 16px;border-radius:99px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));border:1px solid var(--dsw-alias-border-l2);box-shadow:0 10px 30px -8px rgba(0,0,0,.38);font-size:12.5px;z-index:10001;animation:dab-toast-in .32s cubic-bezier(.22,1,.36,1) both}
.dab-toast-ok{color:var(--dsw-alias-brand-primary);display:grid;place-items:center}
.dab-toast-err{color:var(--dsw-alias-state-error-primary);display:grid;place-items:center}

/* ── modals (editor / eyedropper / crash) ────────────────────────────────── */
/* Pin to the viewport explicitly with vw/vh so ancestor padding/margins on
 * body cannot shift or clip the overlay; keep it above host sidebar chrome.
 * pointer-events:auto re-enables interaction: these overlays render inside a
 * Portal root that is pointer-events:none so it never blocks the page alone. */
.dab-overlay{position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:999999;background:rgba(8,10,14,.62);backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;animation:dab-fade-in .25s ease both;pointer-events:auto}
.dab-overlay-title{color:#fff;font-size:15px;font-weight:600}
.dab-overlay-hint{color:rgba(255,255,255,.62);font-size:12px}
.dab-modal-card{animation:dab-zoom-in .3s cubic-bezier(.22,1,.36,1) both;max-width:calc(100vw - 40px);max-height:calc(100vh - 120px);overflow:auto}
.dab-overlay .dab-btn{background:rgba(255,255,255,.94);color:#14161a;border-color:transparent}
.dab-overlay .dab-btn-primary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-text)}
.dab-crash{display:flex;flex-direction:column;gap:10px;align-items:center;padding:28px 18px;border:1px solid var(--dsw-alias-border-l2);border-radius:16px}
.dab-crash-title{font-size:15px;font-weight:650}
.dab-crash-desc{font-size:12px;color:var(--dsw-alias-label-tertiary);text-align:center;line-height:1.5}

/* ── model rules ─────────────────────────────────────────────────────────── */
.dab-status{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12.5px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary))}
.dab-status-model{font-family:var(--dab-mono);font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:3px 9px}
.dab-status-arrow{color:var(--dsw-alias-brand-primary);font-weight:700}
.dab-status-hit{color:var(--dsw-alias-brand-primary);font-weight:600}
.dab-status-none{color:var(--dsw-alias-state-error-primary)}
.dab-status-src{font-size:11px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-tertiary));background:var(--dsw-alias-interactive-bg-hover);border-radius:6px;padding:2px 7px}
.dab-rules{display:flex;flex-direction:column;gap:12px}
.dab-rule{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;padding:14px;transition:border-color .25s,box-shadow .25s,opacity .25s}
.dab-rule.is-active{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}
.dab-rule.is-off{opacity:.55}
.dab-rule-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.dab-rule-num{font-family:var(--dab-mono);font-size:11px;font-weight:700;color:var(--dsw-alias-label-tertiary);min-width:16px}
.dab-rule-badge{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);border-radius:99px;padding:2px 8px}
.dab-rule-match{flex:1;min-width:150px;height:32px;padding:0 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-family:var(--dab-mono);font-size:12.5px;outline:none;transition:border-color .2s,box-shadow .2s}
.dab-rule-match::placeholder{color:var(--dsw-alias-label-quaternary)}
.dab-rule-match:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}
.dab-icon-btn{width:28px;height:28px;flex:none;display:grid;place-items:center;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;transition:color .2s,border-color .2s,background .2s}
.dab-icon-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary)}
.dab-icon-btn:disabled{opacity:.35;cursor:not-allowed}
.dab-icon-btn-danger:hover:not(:disabled){color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.dab-rule-body{margin-top:13px;display:flex;flex-direction:column;gap:13px}
.dab-rule-thumb{position:relative;border-radius:12px;overflow:hidden;aspect-ratio:16/9;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);cursor:pointer}
.dab-rule-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.dab-rule-thumb-empty{position:absolute;inset:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:1.5px dashed var(--dsw-alias-border-l2);border-radius:9px;color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center;padding:0 10px}
.dab-rule-thumb.is-over .dab-rule-thumb-empty{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dab-rule-cols{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:18px;align-items:start}
.dab-rule-section-title{font-size:12px;font-weight:600;margin-bottom:9px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary))}
@container (max-width:760px){.dab-rule-cols{grid-template-columns:1fr}}

/* ── keyframes ───────────────────────────────────────────────────────────── */
@keyframes dab-fade-in{from{opacity:0}to{opacity:1}}
@keyframes dab-page-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes dab-rise-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes dab-orb-in{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:none}}
@keyframes dab-spin{to{transform:rotate(360deg)}}
@keyframes dab-rotate{to{transform:rotate(360deg)}}
@keyframes dab-toast-in{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes dab-zoom-in{from{opacity:0;transform:scale(.94) translateY(8px)}to{opacity:1;transform:none}}
@keyframes dab-flow{to{background-position:300% 50%}}

/* ── responsive & motion preferences ─────────────────────────────────────── */
@container (max-width:620px){
  .dab-shell{grid-template-columns:1fr;gap:14px}
  .dab-nav{position:static;flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .dab-nav-list{flex-direction:row;overflow-x:auto;scrollbar-width:none}
  .dab-nav-list::-webkit-scrollbar{display:none}
  .dab-nav-ind{display:none}
  .dab-nav-item{flex:none;padding:0 10px}
  .dab-nav-item.is-active{background:var(--dsw-alias-bg-layer-2)}
  .dab-types{grid-template-columns:1fr}
}
@container (min-width:621px){
  .dab-shell{grid-template-columns:158px minmax(0,1fr);gap:26px}
}
@media (prefers-reduced-motion:reduce){
  .dab-root *,.dab-root *::before,.dab-root *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
`;
		const CSS_ID = "dab-ui-css";
		/** Inject the design-system stylesheet once per document (HMR-safe). */
		function ensureUiCss() {
			if (typeof document === "undefined") return;
			let el = document.getElementById(CSS_ID);
			if (!el) {
				el = document.createElement("style");
				el.id = CSS_ID;
				document.head.appendChild(el);
			}
			if (el.textContent !== UI_CSS) el.textContent = UI_CSS;
		}
		//#endregion
		//#region src/client/components/icons.tsx
		/** Sun glyph, migrated from @deepseek-ai/dsh-client-ui-primitives IconLightOutline16. */
		const SUN_PATHS = "<path d=\"M11.3496 8C11.3496 6.14985 9.85015 4.65039 8 4.65039C6.14985 4.65039 4.65039 6.14985 4.65039 8C4.65039 9.85015 6.14985 11.3496 8 11.3496C9.85015 11.3496 11.3496 9.85015 11.3496 8ZM12.6504 8C12.6504 10.5681 10.5681 12.6504 8 12.6504C5.43188 12.6504 3.34961 10.5681 3.34961 8C3.34961 5.43188 5.43188 3.34961 8 3.34961C10.5681 3.34961 12.6504 5.43188 12.6504 8Z\" fill=\"currentColor\"/><path d=\"M8.65039 0.5V2.5H7.34961V0.5H8.65039Z\" fill=\"currentColor\"/><path d=\"M8.65039 13.5V15.5H7.34961V13.5H8.65039Z\" fill=\"currentColor\"/><path d=\"M3.15808 2.24035L4.57229 3.65456L3.6525 4.57435L2.23829 3.16014L3.15808 2.24035Z\" fill=\"currentColor\"/><path d=\"M12.3505 11.4327L13.7647 12.8469L12.8449 13.7667L11.4307 12.3525L12.3505 11.4327Z\" fill=\"currentColor\"/><path d=\"M2.24537 12.8469L3.65958 11.4327L4.57937 12.3525L3.16516 13.7667L2.24537 12.8469Z\" fill=\"currentColor\"/><path d=\"M11.4377 3.65455L12.852 2.24033L13.7718 3.16012L12.3575 4.57434L11.4377 3.65455Z\" fill=\"currentColor\"/><path d=\"M0.5 7.35461H2.5V8.6554H0.5L0.5 7.35461Z\" fill=\"currentColor\"/><path d=\"M13.5 7.35461H15.5V8.6554H13.5V8.6554Z\" fill=\"currentColor\"/>";
		function SunIcon({ size = 16, className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				className,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				dangerouslySetInnerHTML: { __html: SUN_PATHS }
			});
		}
		function Glyph({ children, size = 16, className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				className,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.5,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children
			});
		}
		const DropletIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Glyph, {
			size,
			className,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 1.9c2.4 2.8 4.3 5 4.3 7.1a4.3 4.3 0 1 1-8.6 0C3.7 6.9 5.6 4.7 8 1.9z" })
		});
		const LayersIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 2.2 13.2 5 8 7.8 2.8 5 8 2.2z" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2.8 8.2 8 11l5.2-2.8" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2.8 11.2 8 14l5.2-2.8" })
			]
		});
		const PhotoIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "2",
					y: "3.2",
					width: "12",
					height: "9.6",
					rx: "2"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "5.7",
					cy: "6.3",
					r: "0.9"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M14 10.4l-2.8-2.8-4.8 4.8" })
			]
		});
		const TextIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Glyph, {
			size,
			className,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 4.2h10M3 8h10M3 11.8h6.5" })
		});
		const TrajectoryIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2.5 3.2h11M2.5 6.6h11M2.5 10h11" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "4.4",
					cy: "3.2",
					r: "1.1"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "8",
					cy: "6.6",
					r: "1.1"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "11.4",
					cy: "10",
					r: "1.1"
				})
			]
		});
		const SlidersIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2.5 4.5h4.9M11.6 4.5h1.9M2.5 11.5h1.9M8.6 11.5h4.9" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "9.5",
					cy: "4.5",
					r: "1.7"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "5.5",
					cy: "11.5",
					r: "1.7"
				})
			]
		});
		const SparkleIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M7.2 1.8l1.2 3.1 3.1 1.2-3.1 1.2-1.2 3.1-1.2-3.1L2.9 6.1 6 4.9l1.2-3.1z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 10.5l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5.5-1.2z" })]
		});
		const DownloadIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 2.2v8" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4.6 7l3.4 3.4L11.4 7" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2.8 13.8h10.4" })
			]
		});
		const UploadIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 10.4V2.6" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4.6 5.8L8 2.4l3.4 3.4" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2.8 13.8h10.4" })
			]
		});
		const LinkIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6.6 9.4 9.4 6.6" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M5.9 11.1l-1.4 1.4a2.6 2.6 0 0 1-3.7-3.7L3.5 6.8" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10.1 4.9l1.4-1.4a2.6 2.6 0 0 1 3.7 3.7l-2.1 2.1" })
			]
		});
		const TrashIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2.8 4.4h10.4" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6.4 4.4V2.9h3.2v1.5" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4.4 4.4l.5 8.6h6.2l.5-8.6" })
			]
		});
		const EditIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9.5 4l2.5 2.5" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 13l.8-3L10 3.8 12.2 6 6 12.2 3 13z" })]
		});
		const PipetteIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "8",
				cy: "8",
				r: "4.2"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 1.6v2.6M8 11.8v2.6M1.6 8h2.6M11.8 8h2.6" })]
		});
		const CheckIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Glyph, {
			size,
			className,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3.2 8.6l3 3L12.8 5" })
		});
		const AlertIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 2.6l5.4 9.8H2.6L8 2.6z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 6.8v2.4M8 11.4v.01" })]
		});
		const CanvasIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Glyph, {
			size,
			className,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "2.2",
				y: "2.2",
				width: "11.6",
				height: "11.6",
				rx: "2"
			})
		});
		const SidebarIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "2.2",
				y: "2.2",
				width: "11.6",
				height: "11.6",
				rx: "2"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6.6 2.2v11.6" })]
		});
		const ChatIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Glyph, {
			size,
			className,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M13.4 4.4v4.4a2 2 0 0 1-2 2H6.2l-3.6 3V4.4a2 2 0 0 1 2-2h6.8a2 2 0 0 1 2 2z" })
		});
		const GearIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "8",
				cy: "8",
				r: "2.1"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 1.7v1.8M8 12.5v1.8M1.7 8h1.8M12.5 8h1.8M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M12.4 3.6l-1.3 1.3M4.9 11.1l-1.3 1.3" })]
		});
		const InputIcon = ({ size, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Glyph, {
			size,
			className,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "2.2",
				y: "4",
				width: "11.6",
				height: "8",
				rx: "2"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 6.6v2M7 8h2" })]
		});
		//#endregion
		//#region src/client/components/ErrorBoundary.tsx
		/**
		* Catches render errors from the theme section subtree (wheel, sliders, editor)
		* so a single bad state can never take down the whole settings panel. Shows a
		* compact fallback with a reset button; the reset re-renders the section with
		* the current saved config, which is enough to recover from most transient
		* failures (corrupt transient UI state, stale image decode, etc.).
		*/
		var ErrorBoundary = class extends react.Component {
			state = { error: null };
			static getDerivedStateFromError(error) {
				return { error };
			}
			componentDidCatch(error, info) {
				console.error("dsh-background-by-model: section render crashed", error, info.componentStack);
			}
			reset = () => {
				this.setState({ error: null });
				this.props.onReset?.();
			};
			render() {
				if (this.state.error) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dab-crash",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dab-crash-title",
							children: this.props.t("crashTitle")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dab-crash-desc",
							children: this.props.t("crashDesc")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dab-btn",
							onClick: this.reset,
							children: this.props.t("crashReset")
						})
					]
				});
				return this.props.children;
			}
		};
		//#endregion
		//#region src/client/components/Portal.tsx
		/**
		* Render children into a fixed root attached to document.documentElement.
		*
		* The host's sidebar is often implemented by translating the body or a wrapper
		* (margin-left / transform). A fixed element portaled to body would still be
		* captured by that transformed ancestor and shift with the sidebar. Attaching
		* the portal root directly to <html> escapes body-level transforms so the
		* overlay is always painted relative to the viewport and centered correctly.
		*/
		function Portal({ children }) {
			const [target, setTarget] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				const el = document.createElement("div");
				el.dataset.dabPortal = "1";
				el.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:999999";
				document.documentElement.appendChild(el);
				setTarget(el);
				return () => {
					el.remove();
				};
			}, []);
			return target ? (0, react_dom.createPortal)(children, target) : null;
		}
		//#endregion
		//#region src/client/components/LiveSlider.tsx
		/**
		* Zero-lag slider: the thumb and value label update through DOM refs while
		* dragging (onInput) so the caller can mutate the live UI directly without a
		* React re-render; onChange commits the settled value. Double-click resets to
		* the canonical default. The track fill is a gradient driven by the --pct
		* custom property, updated imperatively alongside the thumb.
		*/
		function LiveSlider({ min, max, step, def, fmt, label, onInput, onChange }) {
			const inputRef = (0, react.useRef)(null);
			const valRef = (0, react.useRef)(null);
			const paint = (el, v) => {
				el.style.setProperty("--pct", String((v - min) / (max - min) * 100));
			};
			(0, react.useEffect)(() => {
				if (inputRef.current) {
					inputRef.current.value = String(def);
					paint(inputRef.current, def);
				}
				if (valRef.current) valRef.current.textContent = fmt(def);
			}, [
				def,
				fmt,
				min,
				max
			]);
			const apply = (v) => {
				if (inputRef.current) {
					inputRef.current.value = String(v);
					paint(inputRef.current, v);
				}
				if (valRef.current) valRef.current.textContent = fmt(v);
				onInput?.(v);
				onChange(v);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dab-slider-block",
				children: [label ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dab-slider-label",
					children: label
				}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 10
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						ref: inputRef,
						type: "range",
						className: "dab-slider",
						style: { "--pct": (def - min) / (max - min) * 100 },
						min,
						max,
						step,
						defaultValue: def,
						title: label ? `${label} · ${fmt(def)}` : fmt(def),
						onDoubleClick: () => apply(def),
						onInput: (e) => {
							const el = e.target;
							const v = Number(el.value);
							paint(el, v);
							onInput?.(v);
							if (valRef.current) valRef.current.textContent = fmt(v);
						},
						onChange: (e) => onChange(Number(e.target.value))
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						ref: valRef,
						className: "dab-slider-val",
						children: fmt(def)
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/components/pages/InterfacePage.tsx
		const PARTS = [
			{
				opKey: "bg",
				labelKey: "uiOpacityBg",
				Icon: CanvasIcon
			},
			{
				opKey: "sidebar",
				labelKey: "uiOpacitySide",
				Icon: SidebarIcon
			},
			{
				opKey: "card",
				labelKey: "uiOpacityCard",
				Icon: ChatIcon
			},
			{
				opKey: "input",
				labelKey: "uiOpacityInput",
				Icon: InputIcon
			},
			{
				isSettings: true,
				labelKey: "uiSop",
				Icon: GearIcon
			},
			{
				isChat: true,
				labelKey: "uiChatRegion",
				Icon: TextIcon
			},
			{
				isTrajectory: true,
				labelKey: "uiTrajectory",
				Icon: TrajectoryIcon
			}
		];
		function InterfacePage({ p }) {
			const { t, setOps, setBlurs, setSop } = p;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
				className: "dab-head dab-rise",
				style: { "--d": 0 },
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dab-overline",
						children: "Surfaces"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: "dab-h1",
						children: t("uiTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dab-desc",
						children: t("descInterface")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dab-hint",
						style: { marginTop: 7 },
						children: t("uiScopeHint")
					})
				]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dab-grid-parts",
				children: PARTS.map((part, i) => {
					const { labelKey, Icon, isSettings, isChat, isTrajectory } = part;
					const opKey = part.opKey;
					const blurKey = isChat ? "chat" : isTrajectory ? "trajectory" : isSettings ? "settings" : opKey;
					const opacity = isChat ? rChatTextOpacity() : isTrajectory ? rTrajectoryOpacity() : isSettings ? rSop() : rOps()[opKey];
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "dab-card dab-card-hover dab-rise",
						style: { "--d": i + 1 },
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dab-part-head",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dab-part-ico",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, { size: 16 })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dab-part-name",
										children: t(labelKey)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dab-part-badge",
										children: [Math.round(opacity * 100), "%"]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LiveSlider, {
								label: t("uiOpacity"),
								min: 0,
								max: 100,
								step: 1,
								def: Math.round(opacity * 100),
								fmt: (v) => `${v}%`,
								onInput: (v) => {
									const op = v / 100;
									if (isChat) {
										cfg.chatTextOpacity = op;
										applyViewCards();
									} else if (isTrajectory) {
										cfg.trajectoryOpacity = op;
										applyTrajectoryOverrides(op);
									} else if (isSettings) {
										cfg.settingsOpacity = op;
										applySettingsOverrides(op);
									} else {
										const ops = { ...rOps() };
										ops[opKey] = op;
										cfg.opacities = ops;
										applyCustomTokens(ops);
									}
									saveConfig();
								},
								onChange: (v) => {
									const op = v / 100;
									if (isChat) {
										cfg.chatTextOpacity = op;
										applyViewCards();
										saveConfig();
									} else if (isTrajectory) {
										cfg.trajectoryOpacity = op;
										applyTrajectoryOverrides(op);
										saveConfig();
									} else if (isSettings) setSop(op);
									else {
										const ops = { ...rOps() };
										ops[opKey] = op;
										setOps(ops);
									}
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LiveSlider, {
								label: t("uiBlur"),
								min: 0,
								max: 60,
								step: 1,
								def: rBlurs()[blurKey],
								fmt: (v) => `${v}px`,
								onInput: (v) => {
									const blurs = { ...rBlurs() };
									blurs[blurKey] = v;
									cfg.blurs = blurs;
									setPartBlur(blurKey, v);
									saveConfig();
								},
								onChange: (v) => {
									const blurs = { ...rBlurs() };
									blurs[blurKey] = v;
									setBlurs(blurs);
								}
							})
						]
					}, blurKey);
				})
			})] });
		}
		//#endregion
		//#region src/client/utils/image.ts
		/**
		* Read a chosen image file as a data URL WITHOUT re-encoding: the original
		* pixels are kept as-is (no canvas downscale / JPEG re-compression), so the
		* wallpaper is stored and displayed at full fidelity. The tradeoff is a larger
		* payload over the RPC channel and on disk for big images.
		*/
		function readImg(file, cb) {
			const r = new FileReader();
			r.onerror = () => cb(null);
			r.onload = () => cb(r.result);
			r.readAsDataURL(file);
		}
		//#endregion
		//#region src/client/components/ColorWheel.tsx
		const WHEEL_SIZE = 220;
		const CX = WHEEL_SIZE / 2;
		const RING_OUTER = 106;
		const RING_INNER = 82;
		const SQ_HALF = RING_INNER / Math.SQRT2;
		/** Static hue ring cached once across all wheels. */
		let ringCache = null;
		function getRingCache() {
			if (ringCache) return ringCache;
			const cvs = document.createElement("canvas");
			cvs.width = WHEEL_SIZE;
			cvs.height = WHEEL_SIZE;
			const c = cvs.getContext("2d");
			const g = c.createConicGradient(0, CX, CX);
			for (let i = 0; i <= 360; i++) g.addColorStop(i / 360, `hsl(${i},100%,50%)`);
			c.beginPath();
			c.arc(CX, CX, RING_OUTER, 0, Math.PI * 2);
			c.arc(CX, CX, RING_INNER, 0, Math.PI * 2, true);
			c.fillStyle = g;
			c.fill();
			ringCache = cvs;
			return ringCache;
		}
		function drawMarkers(ctx, hue, sat, lit) {
			const hRad = hue * Math.PI / 180;
			const hR = 94;
			const hmx = CX + Math.cos(hRad) * hR;
			const hmy = CX + Math.sin(hRad) * hR;
			ctx.beginPath();
			ctx.arc(hmx, hmy, 8, 0, Math.PI * 2);
			ctx.fillStyle = "rgba(0,0,0,0.25)";
			ctx.fill();
			ctx.beginPath();
			ctx.arc(hmx, hmy, 6.5, 0, Math.PI * 2);
			ctx.strokeStyle = "#fff";
			ctx.lineWidth = 2;
			ctx.stroke();
			const gx = CX - SQ_HALF, gy = CX - SQ_HALF, sz = SQ_HALF * 2;
			const smx = gx + sat * sz;
			const smy = gy + (1 - lit) * sz;
			ctx.beginPath();
			ctx.arc(smx, smy, 7, 0, Math.PI * 2);
			ctx.fillStyle = "rgba(0,0,0,0.25)";
			ctx.fill();
			ctx.beginPath();
			ctx.arc(smx, smy, 5.5, 0, Math.PI * 2);
			ctx.strokeStyle = "#fff";
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(smx, smy, 3.5, 0, Math.PI * 2);
			ctx.strokeStyle = "#000";
			ctx.lineWidth = 1;
			ctx.stroke();
		}
		function drawSquare(c, hue) {
			const gx = CX - SQ_HALF, gy = CX - SQ_HALF, sz = SQ_HALF * 2;
			c.clearRect(gx - 1, gy - 1, sz + 2, sz + 2);
			c.fillStyle = "#fff";
			c.fillRect(gx, gy, sz, sz);
			const gh = c.createLinearGradient(gx, 0, gx + sz, 0);
			gh.addColorStop(0, "rgba(255,255,255,1)");
			gh.addColorStop(1, `hsl(${hue},100%,50%)`);
			c.fillStyle = gh;
			c.fillRect(gx, gy, sz, sz);
			const gv = c.createLinearGradient(0, gy, 0, gy + sz);
			gv.addColorStop(0, "rgba(0,0,0,0)");
			gv.addColorStop(1, "rgba(0,0,0,1)");
			c.fillStyle = gv;
			c.fillRect(gx, gy, sz, sz);
		}
		function hitTest(x, y) {
			if (Math.abs(x - CX) <= SQ_HALF && Math.abs(y - CX) <= SQ_HALF) return "square";
			const dx = x - CX, dy = y - CX;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist >= 78 && dist <= 110) return "ring";
			return null;
		}
		function pickHue(x, y) {
			let angle = Math.atan2(y - CX, x - CX) * 180 / Math.PI;
			if (angle < 0) angle += 360;
			return angle;
		}
		function pickSL(x, y) {
			const gx = CX - SQ_HALF, gy = CX - SQ_HALF, sz = SQ_HALF * 2;
			return [Math.max(0, Math.min(1, (x - gx) / sz)), Math.max(.02, Math.min(.98, 1 - (y - gy) / sz))];
		}
		const ColorWheel = (0, react.memo)(function ColorWheel({ hue, sat, lit, onChange }) {
			const cvsRef = (0, react.useRef)(null);
			const [col, setCol] = (0, react.useState)({
				hue,
				sat,
				lit
			});
			const colRef = (0, react.useRef)(col);
			colRef.current = col;
			(0, react.useEffect)(() => {
				setCol((c) => c.hue === hue && c.sat === sat && c.lit === lit ? c : {
					hue,
					sat,
					lit
				});
			}, [
				hue,
				sat,
				lit
			]);
			(0, react.useEffect)(() => {
				const cvs = cvsRef.current;
				if (!cvs) return;
				const ctx = cvs.getContext("2d");
				ctx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE);
				drawSquare(ctx, col.hue);
				ctx.drawImage(getRingCache(), 0, 0);
				drawMarkers(ctx, col.hue, col.sat, col.lit);
			}, [col]);
			const pendingRef = (0, react.useRef)(null);
			const rafRef = (0, react.useRef)(null);
			const flushPending = (0, react.useCallback)(() => {
				rafRef.current = null;
				const p = pendingRef.current;
				if (!p) return;
				pendingRef.current = null;
				setCol({
					hue: p.h,
					sat: p.s,
					lit: p.l
				});
				onChange(p.h, p.s, p.l);
			}, [onChange]);
			const schedule = (0, react.useCallback)((h, s, l) => {
				pendingRef.current = {
					h,
					s,
					l
				};
				if (rafRef.current === null) rafRef.current = requestAnimationFrame(flushPending);
			}, [flushPending]);
			const onDown = (0, react.useCallback)((e) => {
				const r = cvsRef.current.getBoundingClientRect();
				const x = e.clientX - r.left, y = e.clientY - r.top;
				const region = hitTest(x, y);
				if (!region) return;
				if (region === "ring") schedule(pickHue(x, y), colRef.current.sat, colRef.current.lit);
				else {
					const [s, l] = pickSL(x, y);
					schedule(colRef.current.hue, s, l);
				}
				const onMove = (ev) => {
					const rr = cvsRef.current.getBoundingClientRect();
					const mx = ev.clientX - rr.left, my = ev.clientY - rr.top;
					if (region === "ring") {
						const d = Math.sqrt((mx - CX) ** 2 + (my - CX) ** 2);
						if (d >= 72 && d <= 116) schedule(pickHue(mx, my), colRef.current.sat, colRef.current.lit);
					} else {
						const [s, l] = pickSL(mx, my);
						schedule(colRef.current.hue, s, l);
					}
				};
				const onUp = () => {
					document.removeEventListener("mousemove", onMove);
					document.removeEventListener("mouseup", onUp);
				};
				document.addEventListener("mousemove", onMove);
				document.addEventListener("mouseup", onUp);
			}, [schedule]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
				ref: cvsRef,
				width: WHEEL_SIZE,
				height: WHEEL_SIZE,
				className: "dab-wheel",
				onMouseDown: onDown
			});
		});
		//#endregion
		//#region src/client/components/ColorInputs.tsx
		const SEG_W = 66;
		function clamp(v, min, max) {
			return Math.min(max, Math.max(min, v));
		}
		/**
		* A single numeric field that edits one color channel. Keeps its own text
		* while focused so typing never gets clobbered by the parent re-rendering the
		* canonical value; commits every valid keystroke live and re-normalizes on
		* blur. The value prop only pushes back in when the field is not focused
		* (wheel drags, wallpaper extraction, mode switches).
		*/
		function NumField({ label, value, min, max, step, onChange }) {
			const [text, setText] = (0, react.useState)(String(value));
			const focused = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (!focused.current) setText(String(value));
			}, [value]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: "dab-field",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dab-field-label",
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "number",
					min,
					max,
					step,
					value: text,
					className: "dab-num",
					onFocus: () => {
						focused.current = true;
					},
					onBlur: () => {
						focused.current = false;
						setText(String(value));
					},
					onChange: (e) => {
						setText(e.target.value);
						const v = Number(e.target.value);
						if (Number.isFinite(v)) onChange(clamp(v, min, max));
					}
				})]
			});
		}
		/**
		* Precise color entry next to the wheel: a HSL/RGB segmented toggle plus three
		* numeric channel fields and a live swatch. The wheel is HSV end-to-end, so
		* this panel converts at the boundary — HSL fields map straight onto the
		* stored HSL, RGB fields round-trip through rgbToHsl — and both emit HSV via
		* the same onChange the wheel uses, keeping one canonical color.
		*/
		function ColorInputs({ hue, sat, lit, onChange }) {
			const [mode, setMode] = (0, react.useState)("hsl");
			const [h, s, l] = hsvToHsl(hue, sat, lit);
			const [r, g, b] = hslToRgb(h, s, l);
			const setHsl = (nh, ns, nl) => onChange(...hslToHsv(nh, ns, nl));
			const setRgb = (nr, ng, nb) => {
				const [nh, ns, nl] = rgbToHsl(nr, ng, nb);
				onChange(...hslToHsv(nh, ns, nl));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dab-inputs",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dab-seg",
						style: { "--w": `${SEG_W}px` },
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dab-seg-thumb",
								style: { transform: `translateX(${mode === "hsl" ? 0 : SEG_W}px)` }
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `dab-seg-item${mode === "hsl" ? " is-active" : ""}`,
								onClick: () => setMode("hsl"),
								children: "HSL"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `dab-seg-item${mode === "rgb" ? " is-active" : ""}`,
								onClick: () => setMode("rgb"),
								children: "RGB"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 7
						},
						children: mode === "hsl" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumField, {
								label: "H",
								value: Math.round(h),
								min: 0,
								max: 360,
								step: 1,
								onChange: (v) => setHsl(v, s, l)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumField, {
								label: "S",
								value: Math.round(s * 100),
								min: 0,
								max: 100,
								step: 1,
								onChange: (v) => setHsl(h, v / 100, l)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumField, {
								label: "L",
								value: Math.round(l * 100),
								min: 0,
								max: 100,
								step: 1,
								onChange: (v) => setHsl(h, s, v / 100)
							})
						] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumField, {
								label: "R",
								value: r,
								min: 0,
								max: 255,
								step: 1,
								onChange: (v) => setRgb(v, g, b)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumField, {
								label: "G",
								value: g,
								min: 0,
								max: 255,
								step: 1,
								onChange: (v) => setRgb(r, v, b)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumField, {
								label: "B",
								value: b,
								min: 0,
								max: 255,
								step: 1,
								onChange: (v) => setRgb(r, g, v)
							})
						] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dab-swatch-lg",
						style: { background: `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)` }
					})
				]
			});
		}
		//#endregion
		//#region src/client/components/ColorPicker.tsx
		const MAG_SIZE = 96;
		const MAG_ZOOM = 8;
		function toHex$1(rgb) {
			return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
		}
		/**
		* Eyedropper modal: shows the wallpaper full-bleed (no drag/zoom) and lets the
		* user click any pixel to adopt it as the theme color. A magnifier circle
		* follows the cursor so small details can be picked precisely. The wallpaper
		* is a data URL, so sampling is CORS-free: draw it once to an offscreen-sized
		* canvas and read pixels via getImageData.
		*/
		function ColorPicker({ url, t, onPick, onClose }) {
			const canvasRef = (0, react.useRef)(null);
			const magRef = (0, react.useRef)(null);
			const imgRef = (0, react.useRef)(null);
			const [ready, setReady] = (0, react.useState)(false);
			const [hover, setHover] = (0, react.useState)(null);
			const [mag, setMag] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				const img = new Image();
				img.onload = () => {
					imgRef.current = img;
					setReady(true);
				};
				img.src = url;
			}, [url]);
			(0, react.useEffect)(() => {
				if (!ready || !canvasRef.current || !imgRef.current) return;
				const canvas = canvasRef.current;
				canvas.width = imgRef.current.naturalWidth;
				canvas.height = imgRef.current.naturalHeight;
				const ctx = canvas.getContext("2d");
				if (ctx) ctx.drawImage(imgRef.current, 0, 0);
			}, [ready]);
			const sampleAt = (0, react.useCallback)((clientX, clientY) => {
				const canvas = canvasRef.current;
				if (!canvas) return null;
				const rect = canvas.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) return null;
				const ctx = canvas.getContext("2d");
				if (!ctx) return null;
				const sx = Math.round((clientX - rect.left) * (canvas.width / rect.width));
				const sy = Math.round((clientY - rect.top) * (canvas.height / rect.height));
				if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) return null;
				const d = ctx.getImageData(sx, sy, 1, 1).data;
				return {
					sx,
					sy,
					rgb: [
						d[0],
						d[1],
						d[2]
					]
				};
			}, []);
			const drawMagnifier = (0, react.useCallback)((sx, sy) => {
				const mag = magRef.current;
				const src = canvasRef.current;
				if (!mag || !src) return;
				const ctx = mag.getContext("2d");
				if (!ctx) return;
				const half = MAG_SIZE / MAG_ZOOM / 2;
				ctx.clearRect(0, 0, MAG_SIZE, MAG_SIZE);
				ctx.drawImage(src, sx - half, sy - half, 12, 12, 0, 0, MAG_SIZE, MAG_SIZE);
				ctx.strokeStyle = "rgba(255,255,255,0.85)";
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(MAG_SIZE / 2, 0);
				ctx.lineTo(MAG_SIZE / 2, MAG_SIZE);
				ctx.moveTo(0, MAG_SIZE / 2);
				ctx.lineTo(MAG_SIZE, MAG_SIZE / 2);
				ctx.stroke();
			}, []);
			const onMove = (e) => {
				const s = sampleAt(e.clientX, e.clientY);
				if (!s) {
					setHover(null);
					setMag(null);
					return;
				}
				setHover({ rgb: s.rgb });
				drawMagnifier(s.sx, s.sy);
				const off = 28;
				let x = e.clientX + off;
				let y = e.clientY + off;
				if (x + MAG_SIZE > window.innerWidth) x = e.clientX - off - MAG_SIZE;
				if (y + MAG_SIZE > window.innerHeight) y = e.clientY - off - MAG_SIZE;
				setMag({
					x,
					y
				});
			};
			const onClick = (e) => {
				const s = sampleAt(e.clientX, e.clientY);
				if (!s) return;
				const [h, sl, l] = rgbToHsl(s.rgb[0], s.rgb[1], s.rgb[2]);
				onPick(hslToHsv(h, sl, l));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Portal, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dab-overlay",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dab-overlay-title",
						children: t("pickerTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dab-overlay-hint",
						children: t("pickerHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dab-modal-card",
						style: {
							maxWidth: "min(90vw, 720px)",
							maxHeight: "60vh",
							overflow: "hidden",
							borderRadius: 12,
							border: "2px solid rgba(255,255,255,0.3)",
							background: "#000",
							cursor: "crosshair"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
							ref: canvasRef,
							style: {
								display: "block",
								maxWidth: "100%",
								maxHeight: "60vh",
								objectFit: "contain"
							},
							onMouseMove: onMove,
							onMouseLeave: () => {
								setHover(null);
								setMag(null);
							},
							onClick
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: 10,
							minWidth: 260
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
							width: 28,
							height: 28,
							borderRadius: 8,
							border: "1px solid rgba(255,255,255,0.4)",
							background: hover ? toHex$1(hover.rgb) : "transparent"
						} }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								color: "#fff",
								fontSize: 13,
								fontFamily: "var(--dab-mono, monospace)"
							},
							children: hover ? `${toHex$1(hover.rgb)} · rgb(${hover.rgb.join(", ")})` : "—"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							gap: 10
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dab-btn",
							onClick: onClose,
							children: t("pickerClose")
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
						ref: magRef,
						width: MAG_SIZE,
						height: MAG_SIZE,
						style: {
							position: "fixed",
							width: MAG_SIZE,
							height: MAG_SIZE,
							borderRadius: "50%",
							border: "2px solid rgba(255,255,255,0.7)",
							boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
							zIndex: 1e4,
							background: "#000",
							pointerEvents: "none",
							transition: "opacity 0.08s",
							left: mag?.x ?? 0,
							top: mag?.y ?? 0,
							opacity: mag ? 1 : 0
						}
					})
				]
			}) });
		}
		//#endregion
		//#region src/client/components/BgEditor.tsx
		/**
		* Framing editor for one rule's image.
		*
		* The placement state is passed IN rather than read from a global slot: every
		* rule owns its own framing, and editing rule B must never touch rule A.
		*/
		function BgEditor({ url, state, t, onClose, onCommit }) {
			const pw = Math.min(window.innerWidth * .75, 860);
			const ph = Math.round(pw * window.innerHeight / window.innerWidth);
			const saved = state;
			const [zoom, setZoom] = (0, react.useState)(saved.iw > 0 ? saved.zoom : 1);
			const [pos, setPos] = (0, react.useState)(saved.iw > 0 ? {
				x: saved.x * pw,
				y: saved.y * ph
			} : {
				x: 0,
				y: 0
			});
			const [imgSize, setImgSize] = (0, react.useState)({
				w: 0,
				h: 0
			});
			const containerRef = (0, react.useRef)(null);
			const imgRef = (0, react.useRef)(null);
			const dragRef = (0, react.useRef)({
				active: false,
				sx: 0,
				sy: 0,
				spx: 0,
				spy: 0
			});
			(0, react.useEffect)(() => {
				const img = new Image();
				img.onload = () => {
					const scale = Math.min(pw / img.width, ph / img.height);
					const w = img.width * scale, h = img.height * scale;
					setImgSize({
						w,
						h
					});
					const s = state;
					if (s.iw > 0 && s.iw === img.width && s.ih === img.height) {
						setZoom(s.zoom);
						setPos({
							x: s.x * pw - w * s.zoom / 2,
							y: s.y * ph - h * s.zoom / 2
						});
					} else {
						setZoom(1);
						setPos({
							x: (pw - w) / 2,
							y: (ph - h) / 2
						});
					}
				};
				img.src = url;
			}, [
				url,
				state,
				pw,
				ph
			]);
			const onDown = (0, react.useCallback)((e) => {
				e.preventDefault();
				dragRef.current = {
					active: true,
					sx: e.clientX,
					sy: e.clientY,
					spx: pos.x,
					spy: pos.y
				};
				const onMove = (ev) => {
					if (!dragRef.current.active) return;
					setPos({
						x: dragRef.current.spx + ev.clientX - dragRef.current.sx,
						y: dragRef.current.spy + ev.clientY - dragRef.current.sy
					});
				};
				const onUp = () => {
					dragRef.current.active = false;
					document.removeEventListener("mousemove", onMove);
					document.removeEventListener("mouseup", onUp);
				};
				document.addEventListener("mousemove", onMove);
				document.addEventListener("mouseup", onUp);
			}, [pos]);
			const onWheelCb = (0, react.useCallback)((e) => {
				e.preventDefault();
				const el = containerRef.current;
				if (!el) return;
				const rect = el.getBoundingClientRect();
				const mx = rect.width / 2, my = rect.height / 2;
				const factor = e.deltaY > 0 ? .97 : 1.03;
				const nz = Math.max(.1, Math.min(10, zoom * factor));
				const nx = mx - (mx - pos.x) * (nz / zoom);
				const ny = my - (my - pos.y) * (nz / zoom);
				setZoom(nz);
				setPos({
					x: nx,
					y: ny
				});
			}, [zoom, pos]);
			(0, react.useEffect)(() => {
				const el = containerRef.current;
				if (!el) return;
				el.addEventListener("wheel", onWheelCb, { passive: false });
				return () => el.removeEventListener("wheel", onWheelCb);
			}, [onWheelCb]);
			const resetView = (0, react.useCallback)(() => {
				if (imgSize.w === 0) return;
				setZoom(1);
				setPos({
					x: (pw - imgSize.w) / 2,
					y: (ph - imgSize.h) / 2
				});
			}, [
				pw,
				ph,
				imgSize
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Portal, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dab-overlay",
				onClick: (e) => {
					if (e.target === e.currentTarget) onClose();
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dab-overlay-title",
						children: t("editorTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						ref: containerRef,
						className: "dab-modal-card",
						style: {
							position: "relative",
							overflow: "hidden",
							border: "2px solid rgba(255,255,255,0.3)",
							borderRadius: 12,
							background: "#000",
							cursor: "grab",
							width: pw,
							height: ph
						},
						onMouseDown: onDown,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
							ref: imgRef,
							src: url,
							alt: "",
							draggable: false,
							style: {
								position: "absolute",
								transformOrigin: "0 0",
								pointerEvents: "none",
								width: imgSize.w,
								height: imgSize.h,
								transform: `translate(${pos.x}px,${pos.y}px) scale(${zoom})`
							}
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dab-overlay-hint",
						children: t("editorHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							gap: 10
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dab-btn",
								onClick: resetView,
								children: t("editorReset")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dab-btn",
								onClick: onClose,
								children: t("editorCancel")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dab-btn",
								onClick: () => onCommit(zoom, (pos.x + imgSize.w * zoom / 2) / pw, (pos.y + imgSize.h * zoom / 2) / ph, imgRef.current?.naturalWidth ?? 0, imgRef.current?.naturalHeight ?? 0),
								children: t("editorCommit")
							})
						]
					})
				]
			}) });
		}
		//#endregion
		//#region src/client/components/pages/ModelBgPage.tsx
		const BG_MODES = [
			{
				mode: "fit",
				key: "bgModeFit"
			},
			{
				mode: "fill",
				key: "bgModeFill"
			},
			{
				mode: "stretch",
				key: "bgModeStretch"
			},
			{
				mode: "tile",
				key: "bgModeTile"
			},
			{
				mode: "center",
				key: "bgModeCenter"
			}
		];
		/** Seed color a rule starts from when the user picks one for the first time. */
		const SEED_COLOR = [
			220,
			.55,
			.25
		];
		/**
		* Failing-hop codes the model watcher can report, mapped to their copy. Only
		* these are rendered: `waiting` and `fallback` already have their own hints.
		*/
		const MODEL_NOTE_KEYS = {
			"no-service": "statusNoteNoService",
			"no-session": "statusNoteNoSession",
			"no-projection": "statusNoteNoProjection",
			"empty-selection": "statusNoteEmptySelection"
		};
		function toHex(rgb) {
			return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
		}
		function ModelBgPage({ p, notify }) {
			const { t, useStore } = p;
			const store = useStore((s) => s);
			const rules = cfg.rules;
			const activeIndex = store.activeRuleId === null ? -1 : rules.findIndex((r) => r.id === store.activeRuleId);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: "dab-head dab-rise",
					style: { "--d": 0 },
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dab-overline",
							children: "Rules"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: "dab-h1",
							children: t("pageModelBg")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dab-desc",
							children: t("descModelBg")
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: "dab-card dab-rise",
					style: { "--d": 1 },
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dab-status",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("statusModel") }),
								store.model !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dab-status-model",
									children: store.model
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dab-status-none",
									children: t("statusUnknown")
								}),
								store.model !== "" && store.modelSource === "default" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dab-status-src",
									children: t("statusSourceDefault")
								}) : null,
								store.model !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dab-status-arrow",
									children: "→"
								}) : null,
								activeIndex >= 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: store.matched ? "dab-status-hit" : "",
									children: [
										store.matched ? t("statusHit") : t("statusFallback"),
										" · ",
										t("statusRule"),
										" ",
										activeIndex + 1
									]
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dab-status-none",
									children: t("statusNone")
								})
							]
						}),
						store.model === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dab-hint",
							style: { marginTop: 9 },
							children: t("statusUnknownHint")
						}) : null,
						store.model !== "" && store.modelSource === "default" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dab-hint",
							style: { marginTop: 9 },
							children: t("statusSourceDefaultHint")
						}) : null,
						MODEL_NOTE_KEYS[store.modelNote] !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dab-hint",
							style: { marginTop: 6 },
							children: t(MODEL_NOTE_KEYS[store.modelNote])
						}) : null
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: "dab-rise",
					style: { "--d": 2 },
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dab-swatch-title",
							children: t("rulesTitle")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dab-hint",
							style: { marginBottom: 11 },
							children: t("rulesHint")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dab-rules",
							children: rules.map((rule, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RuleCard, {
								p,
								rule,
								index: i,
								total: rules.length,
								active: rule.id === store.activeRuleId,
								notify
							}, rule.id))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "dab-btn dab-btn-primary",
							style: { marginTop: 12 },
							onClick: () => {
								p.addRule();
							},
							children: ["+ ", t("ruleAdd")]
						})
					]
				})
			] });
		}
		function RuleCard({ p, rule, index, total, active, notify }) {
			const { t } = p;
			const [open, setOpen] = (0, react.useState)(active);
			const [dragOver, setDragOver] = (0, react.useState)(false);
			const [urlOpen, setUrlOpen] = (0, react.useState)(false);
			const [urlVal, setUrlVal] = (0, react.useState)("");
			const [urlBusy, setUrlBusy] = (0, react.useState)(false);
			const [urlErr, setUrlErr] = (0, react.useState)(null);
			const [editorOpen, setEditorOpen] = (0, react.useState)(false);
			const [pickerOpen, setPickerOpen] = (0, react.useState)(false);
			const [extracting, setExtracting] = (0, react.useState)(false);
			const fileRef = (0, react.useRef)(null);
			const url = p.imageOf(rule.slot);
			const [h, s, l] = rule.color ?? SEED_COLOR;
			const wheel = hslToHsv(h, s, l);
			const onColor = (nh, ns, nl) => {
				const [sh, ss, sl] = hsvToHsl(nh, ns, nl);
				p.setRule(rule.id, { color: [
					sh,
					ss,
					sl
				] });
			};
			const onFile = (f) => {
				readImg(f, (d) => {
					if (d !== null) p.setRuleImage(rule.id, d);
				});
			};
			const onDrop = (e) => {
				e.preventDefault();
				setDragOver(false);
				const f = e.dataTransfer.files?.[0];
				if (f && f.type.startsWith("image/")) onFile(f);
			};
			const applyUrl = async () => {
				const u = urlVal.trim();
				if (!/^https?:\/\//i.test(u)) {
					setUrlErr(t("ruleUrlBadHttp"));
					return;
				}
				setUrlBusy(true);
				setUrlErr(null);
				const res = await p.setRuleImageFromUrl(rule.id, u);
				setUrlBusy(false);
				if (res.ok) {
					setUrlOpen(false);
					setUrlVal("");
				} else setUrlErr(res.error === "invalid url" || res.error === "unsupported scheme" ? t("ruleUrlBadHttp") : res.error ?? t("ruleUrlFail"));
			};
			const onExtract = async () => {
				if (url === null || extracting) return;
				setExtracting(true);
				try {
					const ok = await p.extractColor(rule.id);
					notify(ok ? t("extractDone") : t("extractFail"), ok);
				} catch {
					notify(t("extractFail"), false);
				} finally {
					setExtracting(false);
				}
			};
			const cls = `dab-rule${active ? " is-active" : ""}${rule.enabled ? "" : " is-off"}`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: cls,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dab-rule-head",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dab-icon-btn",
								onClick: () => setOpen((o) => !o),
								title: open ? "Collapse" : "Expand",
								"aria-expanded": open,
								children: open ? "▾" : "▸"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dab-rule-num",
								children: index + 1
							}),
							index === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dab-rule-badge",
								children: t("ruleFallbackBadge")
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "dab-rule-match",
								value: rule.match,
								placeholder: t("ruleMatchPlaceholder"),
								onChange: (e) => p.setRule(rule.id, { match: e.target.value })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `dab-toggle${rule.enabled ? " is-on" : ""}`,
								role: "switch",
								"aria-checked": rule.enabled,
								title: t("ruleEnabled"),
								onClick: () => p.setRule(rule.id, { enabled: !rule.enabled }),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dab-toggle-knob" })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dab-icon-btn",
								disabled: index === 0,
								title: t("ruleUp"),
								onClick: () => p.moveRule(rule.id, -1),
								children: "↑"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dab-icon-btn",
								disabled: index === total - 1,
								title: t("ruleDown"),
								onClick: () => p.moveRule(rule.id, 1),
								children: "↓"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dab-icon-btn dab-icon-btn-danger",
								title: t("ruleRemove"),
								onClick: () => p.removeRule(rule.id),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrashIcon, { size: 13 })
							})
						]
					}),
					open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dab-rule-body",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dab-rule-cols",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: `dab-rule-thumb${dragOver ? " is-over" : ""}`,
									onClick: () => fileRef.current?.click(),
									onDragOver: (e) => {
										e.preventDefault();
										setDragOver(true);
									},
									onDragLeave: () => setDragOver(false),
									onDrop,
									children: url !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
										src: url,
										alt: "",
										draggable: false
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dab-rule-thumb-empty",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UploadIcon, { size: 18 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("ruleNoImage") })]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dab-chip-row",
									style: { marginTop: 10 },
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: "dab-btn",
											onClick: () => fileRef.current?.click(),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UploadIcon, { size: 13 }), url === null ? t("rulePickImage") : t("ruleChangeImage")]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: "dab-btn dab-btn-ghost",
											onClick: () => setUrlOpen((o) => !o),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LinkIcon, { size: 13 }), t("ruleFromUrl")]
										}),
										url !== null && rule.bgMode === "fit" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: "dab-btn",
											onClick: () => setEditorOpen(true),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditIcon, { size: 13 }), t("ruleFramingEdit")]
										}) : null,
										url !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: "dab-btn dab-btn-ghost dab-btn-danger",
											onClick: () => p.setRuleImage(rule.id, null),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrashIcon, { size: 13 }), t("ruleImageRemove")]
										}) : null
									]
								}),
								urlOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										marginTop: 10,
										display: "flex",
										flexWrap: "wrap",
										gap: 8,
										alignItems: "center"
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "text",
											className: "dab-urlinput",
											value: urlVal,
											placeholder: t("ruleUrlPlaceholder"),
											autoFocus: true,
											onChange: (e) => setUrlVal(e.target.value),
											onKeyDown: (e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													applyUrl();
												}
											}
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dab-btn dab-btn-primary",
											disabled: urlBusy,
											onClick: () => void applyUrl(),
											children: urlBusy ? t("ruleUrlApplying") : t("ruleUrlApply")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dab-btn",
											onClick: () => {
												setUrlOpen(false);
												setUrlVal("");
												setUrlErr(null);
											},
											children: t("ruleUrlCancel")
										})
									]
								}) : null,
								urlErr !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: {
										marginTop: 8,
										color: "var(--dsw-alias-state-error-primary)",
										fontSize: 12
									},
									children: urlErr
								}) : null,
								url === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "dab-hint",
									style: { marginTop: 8 },
									children: t("ruleEmptyHint")
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: { marginTop: 14 },
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dab-rule-section-title",
										children: t("ruleLayout")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dab-chip-row",
										children: BG_MODES.map((m) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: `dab-chip${rule.bgMode === m.mode ? " is-active" : ""}`,
											onClick: () => p.setRule(rule.id, { bgMode: m.mode }),
											children: t(m.key)
										}, m.mode))
									})]
								})
							] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dab-rule-section-title",
									children: t("ruleColor")
								}),
								rule.color === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dab-chip-row",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "dab-btn",
										onClick: () => p.setRule(rule.id, { color: SEED_COLOR }),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DropletIcon, { size: 14 }), t("ruleColorNone")]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "dab-btn",
										disabled: url === null || extracting,
										onClick: () => void onExtract(),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SparkleIcon, { size: 14 }), extracting ? t("extracting") : t("ruleColorExtract")]
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "dab-hint",
									style: { marginTop: 8 },
									children: t("ruleColorNoneHint")
								})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											gap: 16,
											alignItems: "center",
											flexWrap: "wrap"
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ColorWheel, {
											hue: wheel[0],
											sat: wheel[1],
											lit: wheel[2],
											onChange: onColor
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "dab-inputs",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "dab-hex-caption",
												children: toHex(hslToRgb(h, s, l)).toUpperCase()
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ColorInputs, {
												hue: wheel[0],
												sat: wheel[1],
												lit: wheel[2],
												onChange: onColor
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dab-chip-row",
										style: { marginTop: 12 },
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: "dab-btn",
												disabled: url === null || extracting,
												onClick: () => void onExtract(),
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SparkleIcon, { size: 13 }), extracting ? t("extracting") : t("ruleColorExtract")]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: "dab-btn",
												disabled: url === null,
												onClick: () => setPickerOpen(true),
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PipetteIcon, { size: 13 }), t("eyedropper")]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: "dab-btn dab-btn-ghost",
												onClick: () => p.setRule(rule.id, { color: null }),
												children: t("ruleColorNone")
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dab-swatches",
										style: { marginTop: 12 },
										children: PALETTE.map(([sh, ss, sl], i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dab-swatch",
											style: { background: `hsl(${sh} ${Math.round(ss * 100)}% ${Math.round(sl * 100)}%)` },
											title: toHex(hslToRgb(sh, ss, sl)).toUpperCase(),
											onClick: () => p.setRule(rule.id, { color: [
												sh,
												ss,
												sl
											] })
										}, i))
									})
								] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: { marginTop: 16 },
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LiveSlider, {
											label: t("ruleOpacity"),
											min: 0,
											max: 100,
											step: 1,
											def: Math.round(rule.wallpaperOpacity * 100),
											fmt: (v) => `${v}%`,
											onChange: (v) => p.setRule(rule.id, { wallpaperOpacity: v / 100 })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LiveSlider, {
											label: t("ruleBlur"),
											min: 0,
											max: 60,
											step: 1,
											def: rule.blur,
											fmt: (v) => `${v}px`,
											onChange: (v) => p.setRule(rule.id, { blur: v })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: "dab-hint",
											style: { marginTop: 10 },
											children: t("ruleBlurHint")
										})
									]
								})
							] })]
						})
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						ref: fileRef,
						type: "file",
						accept: "image/*",
						style: { display: "none" },
						onChange: (e) => {
							const f = e.target.files?.[0];
							if (!f) return;
							onFile(f);
							e.target.value = "";
						}
					}),
					editorOpen && url !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BgEditor, {
						url,
						state: rule.bgState,
						t,
						onClose: () => setEditorOpen(false),
						onCommit: (z, x, y, iw, ih) => {
							p.setRule(rule.id, { bgState: {
								zoom: z,
								x,
								y,
								iw,
								ih
							} });
							setEditorOpen(false);
						}
					}) : null,
					pickerOpen && url !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ColorPicker, {
						url,
						t,
						onClose: () => setPickerOpen(false),
						onPick: (hsv) => {
							onColor(hsv[0], hsv[1], hsv[2]);
							setPickerOpen(false);
						}
					}) : null
				]
			});
		}
		//#endregion
		//#region src/client/components/pages/ProfilePage.tsx
		function ProfilePage({ p, notify }) {
			const { t, exportTheme, importTheme } = p;
			const importRef = (0, react.useRef)(null);
			const onImport = async (file) => {
				try {
					const ok = await importTheme(file);
					notify(ok ? t("importDone") : t("importFail"), ok);
				} catch {
					notify(t("importFail"), false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: "dab-head dab-rise",
					style: { "--d": 0 },
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dab-overline",
							children: "Profile"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: "dab-h1",
							children: t("pageProfile")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dab-desc",
							children: t("descProfile")
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dab-profile-grid",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "dab-card dab-card-hover dab-rise",
						style: { "--d": 1 },
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dab-profile-ico",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DownloadIcon, { size: 17 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dab-profile-title",
								children: t("exportCardTitle")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dab-profile-desc",
								children: t("exportCardDesc")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dab-btn dab-btn-primary",
								onClick: () => {
									exportTheme();
									notify(t("toastExportDone"));
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DownloadIcon, { size: 14 }), t("exportTheme")]
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "dab-card dab-card-hover dab-rise",
						style: { "--d": 2 },
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dab-profile-ico",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UploadIcon, { size: 17 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dab-profile-title",
								children: t("importCardTitle")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dab-profile-desc",
								children: t("importCardDesc")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dab-btn",
								onClick: () => importRef.current?.click(),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UploadIcon, { size: 14 }), t("importTheme")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								ref: importRef,
								type: "file",
								accept: "application/json,.json",
								style: { display: "none" },
								onChange: (e) => {
									const f = e.target.files?.[0];
									if (!f) return;
									onImport(f);
									e.target.value = "";
								}
							})
						]
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
					className: "dab-footer dab-rise",
					style: { "--d": 3 },
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dab-footer-mono",
						children: "dsh-background-by-model"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("footerTag") })]
				})
			] });
		}
		//#endregion
		//#region src/client/components/ThemeSection.tsx
		/**
		* dsh-background-by-model — settings section shell.
		*
		* The host renders this section only while the settings dialog is open and the
		* section is the active nav entry, so mounting IS being visible. The section is
		* rendered INLINE inside the host settings dialog's content column (the host
		* provides the modal chrome); the shell is a left nav rail + page body. Only
		* the transient toast escapes through a Portal (the shell's container-type
		* containment would otherwise capture its fixed positioning).
		*/
		function ThemeSection(props) {
			ensureUiCss();
			const { t } = props;
			const [page, setPage] = (0, react.useState)(0);
			const [toast, setToast] = (0, react.useState)(null);
			const toastTimer = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => () => window.clearTimeout(toastTimer.current), []);
			const notify = (msg, ok = true) => {
				setToast({
					msg,
					ok
				});
				window.clearTimeout(toastTimer.current);
				toastTimer.current = window.setTimeout(() => setToast(null), 2600);
			};
			const pages = [
				{
					label: t("pageInterface"),
					Icon: LayersIcon,
					node: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InterfacePage, { p: props })
				},
				{
					label: t("pageModelBg"),
					Icon: PhotoIcon,
					node: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelBgPage, {
						p: props,
						notify
					})
				},
				{
					label: t("pageProfile"),
					Icon: SlidersIcon,
					node: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProfilePage, {
						p: props,
						notify
					})
				}
			];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(ErrorBoundary, {
				t,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dab-root",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dab-shell",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("nav", {
							className: "dab-nav",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dab-brand",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dab-brand-tile",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SunIcon, { size: 15 })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dab-brand-name",
									children: t("nav")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dab-brand-tag",
									children: t("brandTag")
								})] })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dab-nav-list",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dab-nav-ind",
									style: { transform: `translateY(${page * 42}px)` }
								}), pages.map((pg, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: `dab-nav-item${i === page ? " is-active" : ""}`,
									onClick: () => setPage(i),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(pg.Icon, { size: 16 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: pg.label })]
								}, pg.label))]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dab-page",
							children: pages[page].node
						}, page)]
					})
				}), toast ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Portal, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dab-toast",
					role: "status",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: toast.ok ? "dab-toast-ok" : "dab-toast-err",
						children: toast.ok ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckIcon, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AlertIcon, { size: 14 })
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: toast.msg })]
				}) }) : null]
			});
		}
		//#endregion
		//#region src/client/index.tsx
		/**
		* dsh-background-by-model — browser half entry.
		*
		* Wires the plugin lifecycle: rule resolution against the current model,
		* wallpaper layer, theme skin, viewport watch, i18n, settings-section injection,
		* boot restore and watchdogs. The heavy lifting lives in the sibling modules
		* (state / modelbg / rpc / wallpaper / components).
		*/
		const name = "dsh-background-by-model";
		const inject = [
			"slots",
			"locale",
			"theme",
			"connection"
		];
		const CUSTOM_ID = "custom-color";
		function apply(ctx) {
			initRpc((endpoint, payload) => ctx.connection.rpc.call(RPC_CHANNEL, endpoint, payload).then((res) => res));
			let customDispose = null;
			let skinTimer = null;
			const registerCustom = (h, s, l) => {
				customDispose?.();
				try {
					const { colorScheme, tokens } = genTokens(h, s, l);
					customDispose = ctx.theme.register({
						id: CUSTOM_ID,
						colorScheme,
						tokens
					});
				} catch {
					customDispose = null;
				}
				if (ctx.theme.getTheme().themes.some((t) => t.id === CUSTOM_ID)) ctx.theme.setTheme(CUSTOM_ID);
			};
			/** A rule without a saved color means "follow the system theme". */
			const dropCustom = () => {
				customDispose?.();
				customDispose = null;
				try {
					if (ctx.theme.getTheme().preference === CUSTOM_ID) ctx.theme.setTheme("system");
				} catch {}
			};
			ctx.effect(() => () => {
				if (skinTimer !== null) window.clearTimeout(skinTimer);
				customDispose?.();
			}, "dsh-background-by-model: skin dispose");
			const styleEl = document.createElement("style");
			styleEl.dataset.plugin = "dsh-background-by-model";
			styleEl.textContent = `body[data-ds-dark-theme="dsh-background-by-model"]::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(255,255,255,0.03) 0%,transparent 60%)}${SETTINGS_STYLE_RULE}${TRAJECTORY_STYLE_RULE}${INPUT_BLUR_RULE}[data-composer-card] textarea::placeholder,[data-composer-card] input::placeholder,[data-composer-card] [contenteditable]::placeholder,[data-cordis-panel] input::placeholder,[data-cordis-panel] textarea::placeholder,.dab-input::placeholder,.dab-input textarea::placeholder,.dab-input input::placeholder{color:var(--dsh-any-placeholder,var(--dsw-alias-label-caption,#8a8f98))!important;font-style:italic;opacity:.85}`;
			document.head.appendChild(styleEl);
			ctx.effect(() => () => {
				styleEl?.parentNode?.removeChild(styleEl);
			}, "dsh-background-by-model: gradient");
			let rev = 0;
			let rulesRev = 0;
			let modelText = "";
			let modelSource = "default";
			let modelNote = "waiting";
			let modelKey = "\0";
			const store = defineStore({
				init: () => ({
					url: null,
					rev: -1,
					rulesRev: -1,
					model: "",
					modelSource: "session",
					modelNote: "waiting",
					activeRuleId: null,
					matched: false
				}),
				actions: { sync: (d, url, r, rr, model, source, note, id, matched) => {
					if (r > d.rev) {
						d.url = url;
						d.rev = r;
					}
					if (rr > d.rulesRev) d.rulesRev = rr;
					d.model = model;
					d.modelSource = source;
					d.modelNote = note;
					d.activeRuleId = id;
					d.matched = matched;
				} }
			});
			let bound = null;
			const sync = () => {
				rev++;
				bound?.sync(rWp(), rev, rulesRev, modelLabel !== "" ? modelLabel : modelText, modelSource, modelNote, activeRuleId, activeMatched);
			};
			/** Resolve the active rule for the current model and repaint everything. */
			const applyActive = () => {
				const { rule, matched } = matchRule(cfg.rules, modelText);
				setActive(rule === null ? null : rule.id, matched);
				const color = rule === null ? null : rule.color;
				if (skinTimer !== null) window.clearTimeout(skinTimer);
				skinTimer = window.setTimeout(() => {
					skinTimer = null;
					if (color === null) dropCustom();
					else registerCustom(color[0], color[1], color[2]);
				}, 60);
				applyWp();
				sync();
			};
			applyWp();
			sync();
			watchParts();
			const offModel = watchModel(ctx, (text, label, source, note) => {
				const key = `${text}\u0001${source}\u0001${note}`;
				if (key === modelKey) return;
				const textChanged = text !== modelText;
				modelKey = key;
				modelText = text;
				modelSource = source;
				modelNote = note;
				setModelLabel(label !== "" ? label : text);
				if (textChanged) applyActive();
				else sync();
			});
			ctx.effect(() => () => offModel(), "dsh-background-by-model: model watch");
			(async () => {
				if (modelText !== "") return;
				const fallback = await readDefaultModel();
				if (fallback !== null && modelText === "") {
					modelKey = `${fallback}\u0001default\u0001fallback`;
					modelText = fallback;
					modelSource = "default";
					modelNote = "fallback";
					setModelLabel(fallback);
					applyActive();
				}
			})();
			(async () => {
				const persisted = await loadPersisted();
				if (persisted !== null) {
					adoptConfig(persisted.config);
					const slots = Array.from(/* @__PURE__ */ new Set([...persisted.slots, ...cfg.rules.map((r) => r.slot)]));
					const priority = matchRule(cfg.rules, modelText).rule;
					const first = priority === null ? null : priority.slot;
					const order = first === null ? slots : [first, ...slots.filter((s) => s !== first)];
					for (const slot of order) {
						if (imageOf(slot) !== null) continue;
						const url = await readImage(slot);
						if (url !== null) setImage(slot, url);
						if (slot === first) applyActive();
					}
				}
				applyActive();
			})();
			ctx.effect(() => () => {
				teardownWp();
			}, "dsh-background-by-model: wp cleanup");
			ctx.effect(() => ctx.on("theme/change", () => {
				if (activeRuleColor() !== null) {
					const snapshot = ctx.theme.getTheme();
					if (snapshot.preference !== CUSTOM_ID && snapshot.themes.some((t) => t.id === CUSTOM_ID)) ctx.theme.setTheme(CUSTOM_ID);
				}
				applyWp();
			}), "dsh-background-by-model: theme change");
			let frame = 0;
			const applySoon = () => {
				if (frame !== 0) return;
				frame = requestAnimationFrame(() => {
					frame = 0;
					applyWp();
				});
			};
			const sentinel = document.createElement("div");
			sentinel.style.cssText = "position:fixed;inset:0;pointer-events:none;visibility:hidden";
			document.body.append(sentinel);
			const viewportObserver = new ResizeObserver(applySoon);
			viewportObserver.observe(sentinel);
			const dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
			dprQuery.addEventListener("change", applySoon);
			ctx.effect(() => () => {
				viewportObserver.disconnect();
				dprQuery.removeEventListener("change", applySoon);
				sentinel.remove();
			}, "dsh-background-by-model: viewport watch");
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-background-by-model: i18n");
			const sectionInject = (actions) => {
				bound = actions;
				sync();
				return {
					t: ctx.locale.bind(NS),
					imageOf: (slot) => displayImageOf(slot),
					addRule: () => {
						const rule = newRule(nextRuleId(), nextSlot());
						cfg.rules.push(rule);
						rulesRev++;
						persistConfig();
						applyActive();
						return rule.id;
					},
					removeRule: (id) => {
						const idx = cfg.rules.findIndex((r) => r.id === id);
						if (idx < 0) return;
						const [rule] = cfg.rules.splice(idx, 1);
						if (rule !== void 0 && !cfg.rules.some((r) => r.slot === rule.slot)) {
							setImage(rule.slot, null);
							deleteImage(rule.slot);
						}
						rulesRev++;
						persistConfig();
						applyActive();
					},
					moveRule: (id, dir) => {
						const idx = cfg.rules.findIndex((r) => r.id === id);
						const to = idx + dir;
						if (idx < 0 || to < 0 || to >= cfg.rules.length) return;
						const [rule] = cfg.rules.splice(idx, 1);
						cfg.rules.splice(to, 0, rule);
						rulesRev++;
						persistConfig();
						applyActive();
					},
					setRule: (id, patch) => {
						const rule = ruleById(id);
						if (rule === null) return;
						Object.assign(rule, patch);
						const normalized = normalizeRule(rule);
						if (normalized !== null) Object.assign(rule, normalized);
						rulesRev++;
						saveConfig();
						if (id === activeRuleId) applyActive();
						else sync();
					},
					setRuleImage: (id, dataUrl) => {
						const rule = ruleById(id);
						if (rule === null) return;
						setImage(rule.slot, dataUrl);
						dataUrl === null ? deleteImage(rule.slot) : writeImage(rule.slot, dataUrl);
						if (id === activeRuleId) applyActive();
						else sync();
					},
					setRuleImageFromUrl: async (id, url) => {
						const rule = ruleById(id);
						if (rule === null) return {
							ok: false,
							error: "unknown rule"
						};
						const res = await fetchImageUrl(rule.slot, url);
						if (res.ok) {
							setImage(rule.slot, res.dataUrl ?? null);
							if (id === activeRuleId) applyActive();
							else sync();
						}
						return res;
					},
					extractColor: async (id) => {
						const rule = ruleById(id);
						if (rule === null) return false;
						const url = displayImageOf(rule.slot);
						if (url === null) return false;
						const hsl = await extractWallpaperColor(url, rule.bgState);
						if (hsl === null) return false;
						rule.color = hsl;
						rulesRev++;
						saveConfig();
						if (id === activeRuleId) applyActive();
						else sync();
						return true;
					},
					setOps: (ops) => {
						cfg.opacities = ops;
						applyWp();
						sync();
						saveConfig();
					},
					setBlurs: (blurs) => {
						cfg.blurs = blurs;
						applyWp();
						sync();
						saveConfig();
					},
					setSop: (v) => {
						cfg.settingsOpacity = v;
						applySettingsOverrides(v);
						saveConfig();
					},
					exportTheme: () => {
						const images = {};
						for (const rule of cfg.rules) {
							const url = imageOf(rule.slot);
							if (url !== null) images[rule.slot] = url;
						}
						const payload = {
							version: 3,
							exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
							config: cfg,
							images
						};
						const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
						const url = URL.createObjectURL(blob);
						const a = document.createElement("a");
						a.href = url;
						a.download = "dsh-background-by-model-theme.json";
						a.click();
						URL.revokeObjectURL(url);
					},
					importTheme: async (file) => {
						try {
							const data = JSON.parse(await file.text());
							if (!data || typeof data !== "object") return false;
							const d = data;
							if (typeof d.config !== "object" || d.config === null) return false;
							adoptConfig(d.config);
							const incoming = d.images ?? {};
							const keep = /* @__PURE__ */ new Set();
							for (const rule of cfg.rules) {
								keep.add(rule.slot);
								const raw = incoming[rule.slot];
								if (typeof raw === "string" && /^data:image\//.test(raw)) {
									setImage(rule.slot, raw);
									writeImage(rule.slot, raw);
								} else {
									setImage(rule.slot, null);
									deleteImage(rule.slot);
								}
							}
							for (const slot of Object.keys(incoming)) if (!keep.has(slot) && /^[A-Za-z0-9_-]{1,32}$/.test(slot)) deleteImage(slot);
							persistConfig();
							applyActive();
							return true;
						} catch {
							return false;
						}
					}
				};
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dsh-background-by-model",
				order: 35,
				label: () => ctx.locale.bind(NS)("nav"),
				locale: NS,
				store,
				inject: sectionInject
			}, ThemeSection));
			const navLabel = () => ctx.locale.bind(NS)("nav");
			const applyNavIcon = () => {
				const nav = document.querySelector("[role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]")?.querySelector("nav");
				if (!nav) return;
				const target = navLabel();
				for (const cell of Array.from(nav.querySelectorAll("button"))) {
					const label = cell.querySelector("span");
					if (label && label.textContent?.trim() === target) {
						const svg = cell.querySelector("svg");
						if (svg && svg.dataset.dshAnyIcon !== "1") {
							const sun = document.createElementNS("http://www.w3.org/2000/svg", "svg");
							sun.setAttribute("width", "16");
							sun.setAttribute("height", "16");
							sun.setAttribute("viewBox", "0 0 16 16");
							sun.setAttribute("fill", "none");
							sun.setAttribute("xmlns", "http://www.w3.org/2000/svg");
							sun.dataset.dshAnyIcon = "1";
							sun.innerHTML = SUN_PATHS;
							svg.replaceWith(sun);
						}
						return;
					}
				}
			};
			let navIconObserver = null;
			const watchNavIcon = () => {
				if (navIconObserver !== null || typeof MutationObserver === "undefined") return;
				navIconObserver = new MutationObserver((records) => {
					if (records.some((r) => {
						for (const n of r.addedNodes) {
							if (n.nodeType !== 1) continue;
							const el = n;
							if (el.matches?.("[role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]") || el.querySelector?.("[role=\"dialog\"][aria-modal=\"true\"][aria-labelledby]")) return true;
						}
						return false;
					})) applyNavIcon();
				});
				navIconObserver.observe(document.body, {
					childList: true,
					subtree: true
				});
				applyNavIcon();
			};
			watchNavIcon();
			ctx.effect(() => () => {
				navIconObserver?.disconnect();
				navIconObserver = null;
			}, "dsh-background-by-model: nav icon watch");
			const restoreSaved = () => {
				const color = activeRuleColor();
				if (color !== null) {
					const snapshot = ctx.theme.getTheme();
					if (!snapshot.themes.some((t) => t.id === CUSTOM_ID)) registerCustom(color[0], color[1], color[2]);
					else if (snapshot.preference !== CUSTOM_ID) ctx.theme.setTheme(CUSTOM_ID);
				}
				applyWp();
			};
			const restoreTimers = [300, 1500].map((delay) => window.setTimeout(restoreSaved, delay));
			ctx.effect(() => () => {
				restoreTimers.forEach((id) => window.clearTimeout(id));
			}, "dsh-background-by-model: boot restore");
			const watchdogId = window.setInterval(() => {
				const color = activeRuleColor();
				if (color === null) return;
				const snapshot = ctx.theme.getTheme();
				let changed = false;
				if (!snapshot.themes.some((t) => t.id === CUSTOM_ID)) {
					registerCustom(color[0], color[1], color[2]);
					changed = true;
				} else if (snapshot.preference !== CUSTOM_ID) {
					ctx.theme.setTheme(CUSTOM_ID);
					changed = true;
				}
				if (changed) applyWp();
			}, 1e3);
			ctx.effect(() => () => {
				window.clearInterval(watchdogId);
			}, "dsh-background-by-model: theme watchdog");
			const disposeThemeResets = watchThemeResets();
			ctx.effect(() => () => {
				disposeThemeResets();
			}, "dsh-background-by-model: theme resets watch");
			const onPageHide = () => flushSave();
			window.addEventListener("pagehide", onPageHide);
			ctx.effect(() => () => window.removeEventListener("pagehide", onPageHide), "dsh-background-by-model: pagehide flush");
		}
		/** Color of the currently active rule, or null when it uses the system theme. */
		function activeRuleColor() {
			if (activeRuleId === null) return null;
			const rule = ruleById(activeRuleId);
			return rule === null ? null : rule.color;
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map