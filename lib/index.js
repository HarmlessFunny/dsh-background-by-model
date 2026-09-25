import { t as checkHostOnDisk } from "./host-scan-WjK2VGBe.js";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
//#region src/schema.ts
/** Every accepted `bgMode`, in UI order. */
const BG_MODES = [
	"fit",
	"fill",
	"stretch",
	"tile",
	"center"
];
/**
* Main interface opacities (0..1), global (Interface page):
*   `bg`      main background (`--dsw-alias-bg-base`)
*   `sidebar` sidebar (`--dsw-specific-sidebar-fill`)
*   `card`    cards/panels (`--dsw-alias-bg-layer-1/2/3`, `--dsw-specific-menu`
*             and its 0.1.7 alias `--dsw-menu-surface-fill`)
*   `input`   input/control surfaces (`--dsw-specific-input-major`)
*/
const PART_OPACITY_KEYS = [
	"bg",
	"sidebar",
	"card",
	"input"
];
const DEFAULT_PART_OPACITIES = {
	bg: .85,
	sidebar: .93,
	card: 1,
	input: 1
};
/**
* Interface blur (px, 0..60), global (Interface page):
*   `bg`         main background (AppFrame grid)
*   `sidebar`    sidebar column
*   `card`       cards/panels (center + details columns, dialog option panels)
*   `settings`   settings panel
*   `chat`       conversation text region (message column of the chat view)
*   `trajectory` trajectory view surface
*   `rightbar`   file-preview panel — the right sidebar a file click opens
*   `input`      input/control surfaces ([data-composer-card], [data-cordis-panel])
*/
const PART_BLUR_KEYS = [
	"bg",
	"sidebar",
	"card",
	"settings",
	"chat",
	"trajectory",
	"rightbar",
	"input"
];
const DEFAULT_PART_BLURS = {
	bg: 0,
	sidebar: 0,
	card: 0,
	settings: 0,
	chat: 0,
	trajectory: 0,
	rightbar: 0,
	input: 0
};
/** Slot names reach the filesystem, so they are strictly whitelisted. */
const SLOT_RE = /^[A-Za-z0-9_-]{1,32}$/;
function clamp(n, lo, hi, def) {
	return typeof n === "number" && isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
}
const clamp01 = (n, def) => clamp(n, 0, 1, def);
function normalizeBgState(s) {
	const v = s ?? {};
	return {
		zoom: clamp(v.zoom, .1, 10, 1),
		x: typeof v.x === "number" && isFinite(v.x) ? v.x : 0,
		y: typeof v.y === "number" && isFinite(v.y) ? v.y : 0,
		iw: typeof v.iw === "number" && v.iw > 0 ? v.iw : 0,
		ih: typeof v.ih === "number" && v.ih > 0 ? v.ih : 0
	};
}
/** One `[h, s, l]` triple, or null when the value is not a complete finite triple. */
function normalizeHsl(raw) {
	if (!Array.isArray(raw) || raw.length !== 3) return null;
	if (!raw.every((n) => typeof n === "number" && isFinite(n))) return null;
	return [
		clamp(raw[0], 0, 360, 220),
		clamp(raw[1], 0, 1, .55),
		clamp(raw[2], 0, 1, .25)
	];
}
/** Coerce one persisted rule, or null when it lacks a usable id/slot. */
function normalizeRule(raw) {
	const r = raw ?? {};
	const id = typeof r.id === "string" && r.id !== "" ? r.id : null;
	const slot = typeof r.slot === "string" && SLOT_RE.test(r.slot) ? r.slot : null;
	if (id === null || slot === null) return null;
	const mode = BG_MODES.includes(r.bgMode) ? r.bgMode : "fit";
	return {
		id,
		slot,
		match: typeof r.match === "string" ? r.match : "",
		enabled: r.enabled !== false,
		color: normalizeHsl(r.color),
		bgMode: mode,
		wallpaperOpacity: clamp01(r.wallpaperOpacity, 1),
		blur: clamp(r.blur, 0, 60, 0),
		bgState: normalizeBgState(r.bgState)
	};
}
/** Coerce an unknown persisted value into a valid ThemeConfig, falling back per-field. */
function normalizeConfig(raw) {
	const r = raw ?? {};
	const rules = Array.isArray(r.rules) ? r.rules.map(normalizeRule).filter((x) => x !== null) : [];
	const ops = r.opacities ?? {};
	const bl = r.blurs ?? {};
	const blurs = {};
	for (const k of PART_BLUR_KEYS) blurs[k] = clamp(bl[k], 0, 60, DEFAULT_PART_BLURS[k]);
	const opacities = {};
	for (const k of PART_OPACITY_KEYS) opacities[k] = clamp01(ops[k], DEFAULT_PART_OPACITIES[k]);
	return {
		rules,
		opacities,
		blurs,
		settingsOpacity: clamp01(r.settingsOpacity, 1),
		chatTextOpacity: clamp01(r.chatTextOpacity, 0),
		trajectoryOpacity: clamp01(r.trajectoryOpacity, 1),
		rightbarOpacity: typeof r.rightbarOpacity === "number" && isFinite(r.rightbarOpacity) ? clamp01(r.rightbarOpacity, 1) : null,
		autoExtract: r.autoExtract !== false
	};
}
//#endregion
//#region src/index.ts
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
const name = "dsh-background-by-model";
const inject = ["connection", "webServer"];
const DATA_DIR = ".dsh-background-by-model-data";
const CONFIG_FILE = "theme-config.json";
const IMAGE_PREFIX = "modelbg-";
const LEGACY_WALLPAPER = "wallpaper.jpg";
const LEGACY_FILES = [
	"wallpaper.mp4",
	"wallpaper.webm",
	"wallpaper.ogv",
	"wallpaper.mov",
	"wallpaper.mkv",
	"wallpaper.video",
	"wallpaper.upload.tmp"
];
const WALLPAPER_FETCH_MAX = 26214400;
const WALLPAPER_FETCH_TIMEOUT = 2e4;
const dataDir = () => dshHomePath(DATA_DIR);
const configPath = () => dshHomePath(DATA_DIR, CONFIG_FILE);
const legacyWallpaperPath = () => dshHomePath(DATA_DIR, LEGACY_WALLPAPER);
const imagePath = (slot) => dshHomePath(DATA_DIR, `${IMAGE_PREFIX}${slot}`);
const exists = async (p) => {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
};
/**
* One-shot migration of the pre-0.3 store.
*
* Anything without a `rules` array is an old config: its single wallpaper
* becomes rule 1 (`m1`, empty match = pure fallback) carrying the old color,
* layout mode, opacity, blur and framing, and the remaining legacy files
* (background video, upload temp) are removed. Idempotent: the rewritten config
* carries `rules`, so the next read short-circuits.
*/
async function migrateLegacy(raw) {
	const r = raw ?? {};
	if (Array.isArray(r.rules)) return r;
	const hasWallpaper = await exists(legacyWallpaperPath());
	if (Object.keys(r).length === 0 && !hasWallpaper) return { rules: [] };
	if (hasWallpaper) {
		const target = imagePath("m1");
		try {
			await rm(target, { force: true });
			await rename(legacyWallpaperPath(), target);
		} catch (e) {
			console.warn("dsh-background-by-model: could not adopt the legacy wallpaper", e);
		}
	}
	for (const f of LEGACY_FILES) try {
		await rm(dshHomePath(DATA_DIR, f), { force: true });
	} catch {}
	const next = {
		rules: [{
			id: "m1",
			slot: "m1",
			match: "",
			enabled: true,
			color: Array.isArray(r.color) ? r.color : null,
			bgMode: typeof r.bgMode === "string" ? r.bgMode : "fit",
			wallpaperOpacity: typeof r.wallpaperOpacity === "number" ? r.wallpaperOpacity : 1,
			blur: typeof r.blur === "number" ? r.blur : 0,
			bgState: r.bgState ?? {}
		}],
		opacities: r.opacities,
		blurs: r.blurs,
		settingsOpacity: r.settingsOpacity,
		chatTextOpacity: r.chatTextOpacity,
		trajectoryOpacity: r.trajectoryOpacity,
		rightbarOpacity: r.rightbarOpacity
	};
	try {
		await writeFile(configPath(), JSON.stringify(next, null, 2), "utf8");
	} catch (e) {
		console.warn("dsh-background-by-model: could not rewrite the migrated config", e);
	}
	return next;
}
async function ensureDir() {
	try {
		await mkdir(dataDir(), { recursive: true });
	} catch (e) {
		console.warn(`dsh-background-by-model: cannot create data dir "${dataDir()}"`, e);
	}
}
async function readConfig() {
	await ensureDir();
	let raw = {};
	try {
		raw = JSON.parse(await readFile(configPath(), "utf8"));
	} catch {
		raw = {};
	}
	return normalizeConfig(await migrateLegacy(raw));
}
const LEGACY_CONFIG_KEYS = /* @__PURE__ */ new Set([
	"color",
	"bgMode",
	"wallpaperOpacity",
	"blur",
	"bgState"
]);
const warnedConfigKeys = /* @__PURE__ */ new Set();
function warnUnknownConfigKeys(raw, normalized) {
	if (raw === null || typeof raw !== "object") return;
	const r = raw;
	const warned = (id) => {
		if (warnedConfigKeys.has(id)) return;
		warnedConfigKeys.add(id);
		console.warn(`dsh-background-by-model: ignoring unknown config field "${id}" (declared in one half only?)`);
	};
	const known = new Set(Object.keys(normalized));
	for (const key of Object.keys(r)) if (!known.has(key) && !LEGACY_CONFIG_KEYS.has(key)) warned(key);
	const groups = [["blurs", normalized.blurs], ["opacities", normalized.opacities]];
	for (const [group, have] of groups) {
		const got = r[group];
		if (got === null || typeof got !== "object") continue;
		const keys = new Set(Object.keys(have));
		for (const key of Object.keys(got)) if (!keys.has(key)) warned(`${group}.${key}`);
	}
	const sent = Array.isArray(r.rules) ? r.rules[0] : void 0;
	const have = normalized.rules[0];
	if (sent !== null && typeof sent === "object" && have !== void 0) {
		const keys = new Set(Object.keys(have));
		for (const key of Object.keys(sent)) if (!keys.has(key)) warned(`rules[].${key}`);
	}
}
async function writeConfig(config) {
	await ensureDir();
	try {
		const normalized = normalizeConfig(config);
		warnUnknownConfigKeys(config, normalized);
		await writeFile(configPath(), JSON.stringify(normalized, null, 2), "utf8");
		return true;
	} catch (e) {
		console.error(`dsh-background-by-model: failed to write "${CONFIG_FILE}"`, e);
		return false;
	}
}
/** Sniff an image's MIME from its leading magic bytes (defaults to JPEG). */
function sniffImageMime(buf) {
	if (buf.length >= 4 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) return "image/png";
	if (buf.length >= 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255) return "image/jpeg";
	if (buf.length >= 6 && buf[0] === 71 && buf[1] === 73 && buf[2] === 70) return "image/gif";
	if (buf.length >= 12 && buf[0] === 82 && buf[1] === 73 && buf[2] === 70 && buf[3] === 70 && buf[8] === 87 && buf[9] === 69 && buf[10] === 66 && buf[11] === 80) return "image/webp";
	if (buf.length >= 2 && buf[0] === 66 && buf[1] === 77) return "image/bmp";
	return "image/jpeg";
}
/** Read one rule image as a data URL, or null when the slot is empty. */
async function readImage(slot) {
	try {
		const buf = await readFile(imagePath(slot));
		return `data:${sniffImageMime(buf)};base64,${buf.toString("base64")}`;
	} catch {
		return null;
	}
}
/** Persist one rule image (null removes it); false keeps the previous file. */
async function writeImage(slot, dataUrl) {
	await ensureDir();
	try {
		if (dataUrl === null) {
			await rm(imagePath(slot), { force: true });
			return true;
		}
		const m = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
		if (!m) return false;
		await writeFile(imagePath(slot), Buffer.from(m[1], "base64"));
		return true;
	} catch (e) {
		console.error(`dsh-background-by-model: failed to write the image for slot "${slot}"`, e);
		return false;
	}
}
/** Every image slot currently stored on disk. */
async function listSlots() {
	try {
		return (await readdir(dataDir())).filter((name) => name.startsWith(IMAGE_PREFIX)).map((name) => name.slice(8)).filter((slot) => SLOT_RE.test(slot));
	} catch {
		return [];
	}
}
/**
* Download an image from a network URL into one slot (replacing its bytes).
* Returns { ok, dataUrl?, error? }; never throws.
*/
async function fetchImageUrl(slot, url) {
	if (url === null) {
		const ok = await writeImage(slot, null);
		return {
			ok,
			dataUrl: null,
			error: ok ? void 0 : "remove failed"
		};
	}
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return {
			ok: false,
			error: "invalid url"
		};
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return {
		ok: false,
		error: "unsupported scheme"
	};
	let res;
	try {
		const ctl = new AbortController();
		const timer = setTimeout(() => ctl.abort(), WALLPAPER_FETCH_TIMEOUT);
		try {
			res = await fetch(url, {
				redirect: "follow",
				signal: ctl.signal
			});
		} finally {
			clearTimeout(timer);
		}
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error && e.name === "AbortError" ? "timeout" : "network error"
		};
	}
	if (!res.ok) return {
		ok: false,
		error: `http ${res.status}`
	};
	const ct = res.headers.get("content-type") ?? "";
	if (ct && !/^image\//.test(ct)) return {
		ok: false,
		error: "not an image"
	};
	let buf;
	try {
		const arr = await res.arrayBuffer();
		if (arr.byteLength === 0) return {
			ok: false,
			error: "empty response"
		};
		if (arr.byteLength > WALLPAPER_FETCH_MAX) return {
			ok: false,
			error: "too large"
		};
		buf = Buffer.from(arr);
	} catch {
		return {
			ok: false,
			error: "read failed"
		};
	}
	const dataUrl = `data:${sniffImageMime(buf)};base64,${buf.toString("base64")}`;
	return await writeImage(slot, dataUrl) ? {
		ok: true,
		dataUrl
	} : {
		ok: false,
		error: "write failed"
	};
}
/** The host's default model selection — the client's fallback when the
*  per-session model services are unavailable. */
function defaultModel(ctx) {
	try {
		const selection = (typeof ctx.get === "function" ? ctx.get("agentDefaultModel") : void 0)?.currentSelection?.();
		if (selection && typeof selection.provider === "string" && typeof selection.model === "string") return {
			provider: selection.provider,
			model: selection.model
		};
	} catch {}
	return null;
}
/**
* The installed-host half of the self-check.
*
* The browser probe behind the "Host check" tab already answers "does this host
* still provide what I use"; this adds the two facts only the node half can know:
* the host's own version, and whether the packages on disk still contain the
* literals the plugin depends on. Reading it costs a handful of file reads, and
* it is only ever called while that tab is open.
*/
let pluginDir = null;
function thisPluginDir() {
	if (pluginDir === null) pluginDir = fileURLToPath(new URL("..", import.meta.url));
	return pluginDir;
}
async function hostCheck(payload) {
	const lang = payload?.lang === "en" ? "en" : "zh";
	return await checkHostOnDisk(thisPluginDir(), lang);
}
const NS = "dshBackgroundByModel";
const RPC_CHANNEL = "/dsh-background-by-model";
const RPC_BODY_MAX = 314572800;
/** Dispatch one decoded RPC method to the matching persistence routine and
*  return the wire `result` half of the server-response envelope. */
async function handleRpcMethod(ctx, endpoint, payload) {
	const method = endpoint.slice(`${NS}/`.length);
	const rawSlot = payload?.slot;
	const slot = typeof rawSlot === "string" && SLOT_RE.test(rawSlot) ? rawSlot : null;
	try {
		switch (method) {
			case "read": return {
				ok: true,
				value: {
					config: await readConfig(),
					slots: await listSlots()
				}
			};
			case "writeConfig": return {
				ok: true,
				value: await writeConfig(payload?.config ?? {})
			};
			case "readImage":
				if (slot === null) return {
					ok: true,
					value: { dataUrl: null }
				};
				return {
					ok: true,
					value: { dataUrl: await readImage(slot) }
				};
			case "writeImage":
				if (slot === null) return {
					ok: true,
					value: false
				};
				return {
					ok: true,
					value: await writeImage(slot, payload?.dataUrl ?? null)
				};
			case "deleteImage":
				if (slot === null) return {
					ok: true,
					value: false
				};
				return {
					ok: true,
					value: await writeImage(slot, null)
				};
			case "fetchImageUrl":
				if (slot === null) return {
					ok: true,
					value: {
						ok: false,
						error: "bad slot"
					}
				};
				return {
					ok: true,
					value: await fetchImageUrl(slot, payload?.url ?? null)
				};
			case "defaultModel": return {
				ok: true,
				value: defaultModel(ctx)
			};
			case "hostCheck": return {
				ok: true,
				value: await hostCheck(payload)
			};
			default: return {
				ok: false,
				error: {
					code: "dsh-background-by-model/bad-request",
					message: `unknown endpoint ${endpoint}`,
					details: { issues: [] }
				}
			};
		}
	} catch (e) {
		return {
			ok: false,
			error: {
				code: "dsh-background-by-model/internal",
				message: e instanceof Error ? e.message : String(e),
				details: {}
			}
		};
	}
}
function apply(ctx) {
	ctx.inject(["connection", "webServer"], (webCtx) => {
		webCtx.effect(() => webCtx.webServer.register({
			kind: "prefix",
			path: RPC_CHANNEL,
			handler: async (req, res) => {
				const rejection = webCtx.connection.requestRejection(req);
				if (rejection !== void 0) {
					res.writeHead(rejection);
					res.end(rejection === 401 ? "unauthorized" : "forbidden");
					return;
				}
				if (req.method !== "POST") {
					res.writeHead(405, { "Content-Type": "application/json" });
					res.end(JSON.stringify({
						ok: false,
						error: {
							code: "dsh-background-by-model/bad-request",
							message: "expected POST",
							details: {}
						}
					}));
					return;
				}
				const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
				const endpoint = pathname.startsWith(`${RPC_CHANNEL}/`) ? pathname.slice(25) : void 0;
				if (endpoint === void 0 || endpoint.length === 0) {
					res.writeHead(404);
					res.end();
					return;
				}
				const chunks = [];
				let received = 0;
				for await (const chunk of req) {
					const buf = chunk;
					received += buf.byteLength;
					if (received > RPC_BODY_MAX) {
						res.writeHead(413, { connection: "close" });
						res.end();
						req.destroy();
						return;
					}
					chunks.push(buf);
				}
				let env;
				try {
					env = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
				} catch {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({
						ok: false,
						error: {
							code: "dsh-background-by-model/bad-request",
							message: "body is not JSON",
							details: {}
						}
					}));
					return;
				}
				if (env === null || typeof env !== "object" || env.type !== "client-request" || typeof env.rpcId !== "string" || typeof env.method !== "string") {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({
						ok: false,
						error: {
							code: "dsh-background-by-model/bad-request",
							message: "invalid client-request envelope",
							details: {}
						}
					}));
					return;
				}
				if (env.method !== endpoint) {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({
						type: "server-response",
						rpcId: env.rpcId,
						result: {
							ok: false,
							error: {
								code: "dsh-background-by-model/bad-request",
								message: `method ${env.method} does not match endpoint ${endpoint}`,
								details: { issues: [] }
							}
						}
					}));
					return;
				}
				const result = await handleRpcMethod(ctx, endpoint, env.payload);
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({
					type: "server-response",
					rpcId: env.rpcId,
					result
				}));
			}
		}), "dsh-background-by-model: rpc channel");
	});
}
//#endregion
export { apply, inject, name };
