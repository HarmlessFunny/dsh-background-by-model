import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
//#region src/holiday.ts
const HOLIDAYS = [{
	id: "mid-autumn",
	slot: "h-midautumn",
	asset: "mid-autumn.webp",
	color: "#384A77",
	kind: "lunar"
}, {
	id: "national-day",
	slot: "h-nationalday",
	asset: "national-day.webp",
	color: "#FFF6EB",
	kind: "gregorian"
}];
//#endregion
//#region src/schema.ts
/**
* The persisted configuration shape — declared exactly ONCE, for both halves.
*
* This shape used to be written out twice: the node half owns persistence and
* sanitizes every write, the browser half owns the UI and its own reading of the
* same file. A field added to only one side was silently dropped by the other
* side's sanitizer — the matching slider stayed live in memory, `writeConfig`
* wrote a config without it, and the next load fell back to the default.
* `blurs.rightbar` / `rightbarOpacity` in 0.3.2 was exactly that bug, and the key
* lists were duplicated 6 times across the two halves, so it was due to happen.
*
* The types, the key lists, the defaults and the pure normalizers therefore live
* here and both halves import them: adding a field means editing this file, and
* the two halves cannot disagree about the shape. The host additionally logs one
* warning per unknown key while sanitizing a write (see `warnUnknownConfigKeys`
* in `src/index.ts`), so a field that reaches the node half without being
* declared here shows up in the host log instead of quietly disappearing.
*
* Nothing in this module may touch the DOM, Node or the Cordis context: it is
* imported by the browser bundle and by the node half alike.
*/
const DEFAULT_BG_STATE = {
	zoom: 1,
	x: 0,
	y: 0,
	iw: 0,
	ih: 0
};
/** Every accepted `bgMode`, in UI order. */
const BG_MODES = [
	"fit",
	"fill",
	"stretch",
	"tile",
	"center"
];
/** Every accepted `rotate.order`, in UI order. */
const ROTATE_ORDERS = ["order", "shuffle"];
/** Fastest allowed dwell time — below this the cross-fade never settles. */
const ROTATE_MIN_MS = 5e3;
/** Slowest allowed dwell time (24 h): one image per day is still "rotation". */
const ROTATE_MAX_MS = 864e5;
/** Everything off: the shipped default, and what a config predating this feature gets. */
const DEFAULT_ROTATION = {
	enabled: false,
	intervalMs: 6e4,
	order: "order",
	advanceOnSwitch: false
};
/** A fresh rotation block (never hand out the shared default object). */
function defaultRotation() {
	return { ...DEFAULT_ROTATION };
}
/**
* Main interface opacities (0..1), global (Interface page):
*   `bg`      main background (`--dsw-alias-bg-base`)
*   `sidebar` sidebar (`--dsw-specific-sidebar-fill`)
*   `card`    cards/panels (`--dsw-alias-bg-layer-1/2/3`, `--dsw-specific-menu`
*             and its 0.1.7 alias `--dsw-menu-surface-fill`)
*   `code`    code blocks, banner included (`--dsw-alias-markdown-code-block`,
*             `--dsw-alias-markdown-code-block-banner`)
*   `input`   input/control surfaces (`--dsw-specific-input-major`)
*/
const PART_OPACITY_KEYS = [
	"bg",
	"sidebar",
	"card",
	"code",
	"input"
];
const DEFAULT_PART_OPACITIES = {
	bg: 0,
	sidebar: .1,
	card: 1,
	code: .81,
	input: .88
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
	input: 60
};
/** Longest allowed switch duration; 0 is a hard cut. */
const TRANSITION_MAX_MS = 3e3;
/** Every accepted `effect`, in UI order. */
const TRANSITION_EFFECTS = [
	"fade",
	"none",
	"zoom",
	"slide"
];
/** Every accepted `easing`, in UI order. */
const TRANSITION_EASINGS = [
	"ease",
	"linear",
	"ease-out",
	"ease-in-out"
];
/** The shipped default: the cross-fade this plugin already performed, at 320 ms. */
const DEFAULT_TRANSITION = {
	effect: "fade",
	easing: "ease",
	durationMs: 320
};
const DEFAULT_CHAT_TEXT_OPACITY = .35;
const DEFAULT_TRAJECTORY_OPACITY = .73;
const DEFAULT_RIGHTBAR_OPACITY = .45;
/**
* `#RRGGBB` → the `[h, s, l]` triple every rule stores (`s` and `l` in 0..1), or
* null when the string is not a hex color.
*
* A holiday names its color as hex because that is how a color is quoted, and a
* hand-converted triple is a magic number nothing downstream can check. The
* conversion lives here rather than in ./holiday because `[h, s, l]` is this
* module's own rule shape.
*/
function hexToHsl(hex) {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (m === null) return null;
	const n = parseInt(m[1], 16);
	const r = (n >> 16 & 255) / 255;
	const g = (n >> 8 & 255) / 255;
	const b = (n & 255) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	if (d === 0) return [
		0,
		0,
		l
	];
	const s = d / (1 - Math.abs(2 * l - 1));
	let h;
	if (max === r) h = 60 * ((g - b) / d % 6);
	else if (max === g) h = 60 * ((b - r) / d + 2);
	else h = 60 * ((r - g) / d + 4);
	if (h < 0) h += 360;
	return [
		clamp(h, 0, 360, 0),
		clamp01(s, 0),
		clamp01(l, .5)
	];
}
/**
* One holiday's appearance, untouched.
*
* Holidays default to `fill` rather than a rule's `fit`: these are full-bleed
* festival wallpapers, and `fit` would letterbox them on every aspect ratio the
* art was not cut for. The mode now lives on the IMAGE (see `BgImage.bgMode`), so
* that default is written there — and `fill` is what a holiday's read-back
* sanitizer refuses to lose (see `normalizeHolidayRule`).
*/
function defaultHolidayRule(def) {
	const color = hexToHsl(def.color);
	return {
		id: def.id,
		images: [{
			slot: def.slot,
			bgMode: "fill",
			bgState: { ...DEFAULT_BG_STATE },
			color
		}],
		match: "",
		enabled: true,
		color,
		wallpaperOpacity: 1,
		blur: 0,
		rotate: defaultRotation()
	};
}
/**
* A rule with nothing in it yet: no picture, no match string, no color.
*
* Two states need this factory and they are the same state — a fresh install
* (see `freshThemeConfig` and `normalizeConfig`), and the "add rule" tile one
* entry further down the list.
*
* Such a rule is deliberately valid rather than half-built: it is skipped by
* matching until it has something of its own to paint (`ruleCanPaint` — a picture,
* or a theme color), which is what makes a rule nobody has filled in yet invisible
* instead of letting an empty background steal the fallback from rule 1.
*
* It used to be born with an allocated slot and an empty image entry, which is
* what put a blank tile at position 1 of a new rule's strip — and, worse, stopped
* the picture the user added next from being the first one (a rule paints its
* FIRST image). The slot is allocated when the first picture arrives.
*/
function blankRule(id) {
	return {
		id,
		images: [],
		match: "",
		enabled: true,
		color: null,
		wallpaperOpacity: 1,
		blur: 0,
		rotate: defaultRotation()
	};
}
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
/** Coerce one persisted rotation block; a config without one gets the shipped default. */
function normalizeRotation(raw) {
	const r = raw ?? {};
	const d = DEFAULT_ROTATION;
	return {
		enabled: r.enabled === true,
		intervalMs: clamp(r.intervalMs, ROTATE_MIN_MS, ROTATE_MAX_MS, d.intervalMs),
		order: ROTATE_ORDERS.includes(r.order) ? r.order : d.order,
		advanceOnSwitch: r.advanceOnSwitch === true
	};
}
/** Own-property test for values that may be anything at all (a raw JSON entry). */
function hasOwn(o, key) {
	return Object.prototype.hasOwnProperty.call(o, key);
}
/**
* The duration a config written before the switch effect carries on any of its
* rules, or `undefined` when it carries none worth adopting.
*
* `rotate.fadeMs` was the per-rule duration from 0.7.0 on, and it had NO control
* anywhere — it could only be hand-edited, which is why the global setting
* replaced it. This is the one-shot lift that keeps such a hand-tuned value from
* being silently dropped on upgrade: the first rule whose value differs from the
* 320 ms every build shipped is adopted as the global duration. Values that are
* all the default are ignored, so an ordinary config keeps the ordinary default,
* and rules that DISAGREE cannot be represented by one global number — the first
* deliberate value wins, and the others are gone with the field they lived on.
*/
function legacyFadeMs(rawRules) {
	if (!Array.isArray(rawRules)) return void 0;
	for (const entry of rawRules) {
		const rotate = entry?.rotate;
		if (rotate === null || typeof rotate !== "object") continue;
		const value = rotate.fadeMs;
		if (typeof value !== "number" || !isFinite(value)) continue;
		if (value === DEFAULT_TRANSITION.durationMs) continue;
		return clamp(value, 0, TRANSITION_MAX_MS, DEFAULT_TRANSITION.durationMs);
	}
}
/**
* Coerce one persisted transition block; a config written before this setting
* existed has no `transition` key at all and gets the shipped default, which is
* the behaviour it already had.
*
* `legacyMs` is the per-rule `fadeMs` this shape replaced (see `legacyFadeMs`),
* adopted only when the incoming config has no `durationMs` of its own — so a
* deliberate hand-tuned blend survives the upgrade instead of being dropped with
* the field it used to live on.
*
* `durationMs` is clamped with `0` kept as a real value (a hard cut) rather than
* read as "absent": 0 is exactly how a hard cut is asked for without changing
* the effect.
*/
function normalizeTransition(raw, legacyMs) {
	const t = raw ?? {};
	const d = DEFAULT_TRANSITION;
	const fallback = typeof legacyMs === "number" && isFinite(legacyMs) ? legacyMs : d.durationMs;
	return {
		effect: TRANSITION_EFFECTS.includes(t.effect) ? t.effect : d.effect,
		easing: TRANSITION_EASINGS.includes(t.easing) ? t.easing : d.easing,
		durationMs: clamp(t.durationMs, 0, TRANSITION_MAX_MS, fallback)
	};
}
/**
* Coerce one persisted image entry, or null when it lacks a usable slot.
*
* `inherit` is the RULE's own color, and it is applied only to an entry that has
* no `color` key at all — the shape every release before 0.7.1 wrote, where a
* rule's color was the only color there was. Lifting it here, once, is what makes
* an upgrade a no-op on screen: a themed wallpaper keeps its theme instead of
* silently dropping to the system palette, and it happens in the shared sanitizer
* so both halves lift identically.
*
* The KEY's presence is the whole distinction, which is why `null` is not the
* same as absent: an entry with `color: null` is an image the user explicitly set
* to "follow the system theme", and re-inheriting the rule's color over that
* would undo a deliberate choice on every load.
*
* `inheritMode` is the same one-shot lift for the layout mode, and it is the
* caller's to resolve because the two callers answer differently: a user rule
* passes the mode its config carried at the RULE level (a schema-5 config, where
* 适应/填充 was one choice for the whole rotation), a holiday passes `fill` (its
* own default, which is not up for the lift to change). An entry that HAS a
* `bgMode` key keeps it — including one that has just been set to a value equal
* to the default, which is a decision and not an absence.
*/
function normalizeImage(raw, inherit = null, inheritMode = "fit") {
	const i = raw ?? {};
	if (typeof i.slot !== "string" || !SLOT_RE.test(i.slot)) return null;
	return {
		slot: i.slot,
		bgMode: BG_MODES.includes(i.bgMode) ? i.bgMode : inheritMode,
		bgState: normalizeBgState(i.bgState),
		color: hasOwn(i, "color") ? normalizeHsl(i.color) : inherit
	};
}
/**
* Coerce one persisted rule, or null when it names no image AT ALL.
*
* Accepts BOTH image shapes: the 0.7 list (`images`), and the single
* `slot`/`bgState` pair every earlier version wrote — the latter is lifted to a
* one-entry list here rather than at a dozen call sites, which is what keeps the
* rest of the codebase free of "old config" branches. Duplicate slots inside one
* rule are dropped: two entries pointing at the same bytes would only make the
* rotation look stuck.
*
* The rule's color is resolved FIRST and handed to every image entry, because it
* is what an entry written before 0.7.1 inherits (`normalizeImage`). The rule keeps
* it as well: it is not a default for its images at paint time any more, but it
* is still what the rule paints once its last picture is gone.
*
* The layout mode makes the same trip in the other direction, and this is the
* last release that has to: a config written before 0.7.5 keeps `bgMode` at the RULE
* level, where one value covered every picture of a rotation, so it is read here
* once and handed to each image as its inherited mode. What the user chose
* therefore survives the move the same way it survived the color's — the mode is
* not reset to the default on upgrade, and the field it used to live on is simply
* not written back.
*
* An EMPTY list is a legitimate rule, not a broken one: removing a rule's last
* picture has to be expressible, and forcing an entry back in is what produced a
* phantom blank image that took slot 1 and could never be deleted again (the next
* upload landed at position 2 and the rule kept painting nothing). What such a
* rule then does is `ruleCanPaint`'s business: with a color of its own it paints
* the interface, with neither it is skipped by matching — which the card's own
* hint says in so many words. Only a rule that names no image anywhere — no list,
* no legacy slot, or a slot that could never be a filename — is dropped.
*/
function normalizeRule(raw) {
	const r = raw ?? {};
	const id = typeof r.id === "string" && r.id !== "" ? r.id : null;
	if (id === null) return null;
	const color = normalizeHsl(r.color);
	const mode = BG_MODES.includes(r.bgMode) ? r.bgMode : "fit";
	const images = [];
	const seen = /* @__PURE__ */ new Set();
	const hadList = Array.isArray(r.images);
	if (hadList) for (const entry of r.images) {
		const image = normalizeImage(entry, color, mode);
		if (image === null || seen.has(image.slot)) continue;
		seen.add(image.slot);
		images.push(image);
	}
	const legacySlot = typeof r.slot === "string" && SLOT_RE.test(r.slot) ? r.slot : null;
	if (images.length === 0 && legacySlot !== null) images.push({
		slot: legacySlot,
		bgMode: mode,
		bgState: normalizeBgState(r.bgState),
		color
	});
	if (images.length === 0 && !hadList) return null;
	const rotate = normalizeRotation(r.rotate);
	if (images.length < 2) rotate.enabled = false;
	return {
		id,
		images,
		match: typeof r.match === "string" ? r.match : "",
		enabled: r.enabled !== false,
		color,
		wallpaperOpacity: clamp01(r.wallpaperOpacity, 1),
		blur: clamp(r.blur, 0, 60, 0),
		rotate
	};
}
/**
* Coerce one persisted holiday entry.
*
* `id`, `images` and every theme color (the rule's and each image's) come from
* the DEFINITION, never from disk: a holiday's slot is the only thing tying it to
* its bytes, and its theme color is a fixed part of what that holiday looks like —
* so a stale or hand-edited value would either orphan the wallpaper, point the
* holiday at a rule's image, or paint a festival in a color it does not have.
* Everything else is sanitized exactly like a rule's field — except three things
* that stay the definition's own: the image list and the rotation (so a festival
* can never be swapped or cycled), and the layout mode, which is the definition's
* `fill` for the same reason the color is its own — full-bleed art letterboxed by
* a stale `fit` is the one thing this feature must not do, and the mode is not
* editable for a holiday anywhere in the panel.
*/
function normalizeHolidayRule(def, raw) {
	const r = raw ?? {};
	const base = defaultHolidayRule(def);
	return {
		...base,
		enabled: r.enabled !== false,
		wallpaperOpacity: clamp01(r.wallpaperOpacity, base.wallpaperOpacity),
		blur: clamp(r.blur, 0, 60, base.blur),
		images: base.images.map((image) => ({
			slot: image.slot,
			bgMode: image.bgMode,
			bgState: normalizeBgState(r.images?.[0]?.bgState ?? r.bgState),
			color: image.color
		}))
	};
}
/** Coerce the whole holiday block; unknown ids are dropped, missing ones defaulted. */
function normalizeHolidays(raw) {
	const r = raw ?? {};
	const stored = /* @__PURE__ */ new Map();
	if (Array.isArray(r.items)) for (const item of r.items) {
		const id = item?.id;
		if (typeof id === "string") stored.set(id, item);
	}
	return {
		enabled: typeof r.enabled === "boolean" ? r.enabled : false,
		items: HOLIDAYS.map((def) => normalizeHolidayRule(def, stored.get(def.id)))
	};
}
/**
* The file-preview panel's own opacity.
*
* Three states, and the middle one is why this is a function rather than the
* one-line fallback every other field gets: a real number is the card's own
* value, `null` is "never owned, so follow `opacities.bg`", and a KEY that is not
* there at all — a hand-written config, or one written before the option existed
* — is the shipped profile's 45% (see DEFAULT_RIGHTBAR_OPACITY).
*
* `null` has to survive as ITSELF instead of falling through to the default:
* every release so far has written it — a panel the user never dragged is
* persisted as an explicit `null` — so treating it as "missing" would hand the
* shipped 45% to every configuration whose preview panel was following the main
* background, a silent change to a setup nobody asked to change. It is also
* unreachable from the UI (no control returns to it); it exists for configs that
* were written while the shipped default was `null`.
*/
function normalizeRightbarOpacity(v) {
	if (v === null) return null;
	if (typeof v === "number" && isFinite(v)) return clamp01(v, 1);
	return DEFAULT_RIGHTBAR_OPACITY;
}
/** Coerce an unknown persisted value into a valid ThemeConfig, falling back per-field. */
function normalizeConfig(raw) {
	const r = raw ?? {};
	const rules = Array.isArray(r.rules) ? r.rules.map(normalizeRule).filter((x) => x !== null) : [blankRule("r1")];
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
		transition: normalizeTransition(r.transition, legacyFadeMs(r.rules)),
		settingsOpacity: clamp01(r.settingsOpacity, 1),
		chatTextOpacity: clamp01(r.chatTextOpacity, DEFAULT_CHAT_TEXT_OPACITY),
		trajectoryOpacity: clamp01(r.trajectoryOpacity, DEFAULT_TRAJECTORY_OPACITY),
		rightbarOpacity: normalizeRightbarOpacity(r.rightbarOpacity),
		autoExtract: r.autoExtract !== false,
		holidays: normalizeHolidays(r.holidays)
	};
}
/**
* Whether another round is worth asking for.
*
* Three reasons are terminal, and each for its own:
*
*   - `missing` — the host says the file is not there. The profile follows a
*     BRANCH (see `PRESET_ASSET_HOSTS` in ./index), so a renamed or deleted file
*     has to reach the user as a loud failure NAMING the slot — and it has to
*     reach them FAST: paying two more rounds for a file that is provably absent
*     only makes the sentence later, on a button the user is watching.
*   - `oversized` — the bytes are the problem, and the next round would serve the
*     same bytes.
*   - `timeout` — sixty seconds of silence is not weather. Both mirrors were
*     already asked inside the SAME round, so a retry round would re-ask two hosts
*     that each just spent a minute not answering. This is also what keeps the
*     worst case for one file at three minutes instead of six: a round in which BOTH
*     mirrors were silent is over immediately (two minutes, exactly what it cost
*     before there were rounds at all), and only a round that mixed a silent mirror
*     with a transient one can carry a minute into the next round.
*
* Everything else is a hiccup: a thrown connection, a 5xx, a 429, a 408, or a 200
* with no body.
*/
function presetRetryable(reason) {
	return reason !== "missing" && reason !== "oversized" && reason !== "timeout";
}
/**
* The delay before the round that follows `failedAttempt` (1-based), in ms.
*
* Doubling rather than fixed: the second retry is the one that has to survive a
* mirror having a bad few hundred milliseconds, and it is still short enough that
* a user staring at "downloading" does not read it as a hang.
*/
function presetRetryDelayMs(failedAttempt) {
	return 400 * 2 ** Math.max(0, failedAttempt - 1);
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
*   holiday-cache/      festival art downloaded from the CDN, one file per
*                       holiday asset — deliberately NOT a slot (see below)
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
/**
* Where the festival art is hosted, and which revision of it this build wants.
*
* The two holiday wallpapers used to ship inside the package. They do not any
* more: they were 746 KB of the 1.1 MB tarball — two thirds of everything anyone
* downloaded — for art that is looked at on one day a year, and they are the one
* part of the package that is a picture rather than code. The bytes now live in
* the `assets` repository beside the README screenshots and are fetched from a
* CDN the first time a holiday actually needs one (see `readHolidayAsset`).
*
* The reference is a **commit**, never a branch. Runtime art has to be
* immutable: a branch reference would let a later reshuffle of the documentation
* screenshots silently kill a shipped feature, on a day nobody is watching, with
* nothing in the log — and jsDelivr caches a commit reference forever, which is
* exactly what a file that never changes wants. The cost is that new art means a
* new commit and a new hash here.
*/
const HOLIDAY_ASSETS_REPO = "HarmlessFunny/assets";
const HOLIDAY_ASSETS_COMMIT = "58a9e107ac9e1993035c494397dfe77bbb7e8720";
const HOLIDAY_ASSETS_DIR = "dsh-background-by-model/holiday";
/**
* Mirrors, tried in order. jsDelivr first because it is reachable from networks
* where `raw.githubusercontent.com` is not; raw second because a CDN can be
* blocked, rate-limited or down, and one dead mirror must not cost the easter
* egg. Every mirror serves the same commit, so a fallback cannot mix revisions.
*/
const HOLIDAY_ASSET_HOSTS = [`https://cdn.jsdelivr.net/gh/${HOLIDAY_ASSETS_REPO}@${HOLIDAY_ASSETS_COMMIT}/${HOLIDAY_ASSETS_DIR}`, `https://raw.githubusercontent.com/${HOLIDAY_ASSETS_REPO}/${HOLIDAY_ASSETS_COMMIT}/${HOLIDAY_ASSETS_DIR}`];
/**
* Sub-directory of the store holding downloaded festival art.
*
* It is NOT part of the slot namespace and must never become part of it: the
* cached files are named after the ASSET (`mid-autumn.webp`), not after a slot,
* so nothing here can ever be mistaken for a user's `modelbg-<slot>`. That is
* what lets a holiday slot stay read-only — `writeImage` still refuses it, and
* the store still never holds a `modelbg-h-*` file — while the art itself is
* now fetched rather than shipped.
*/
const HOLIDAY_CACHE_DIR = "holiday-cache";
/** Cap and timeout for one asset download; these files are 228 KB and 500 KB. */
const HOLIDAY_FETCH_MAX = 8388608;
const HOLIDAY_FETCH_TIMEOUT = 1e4;
/**
* The recommended profile, served from the same assets repository as the
* festival art — as a DIRECTORY, in the store's own shape.
*
* It used to be one theme file with every wallpaper inlined as base64: 2.9 MB
* where 99.8% of the bytes were a picture, so changing the `match` string of one
* rule meant finding it inside a single line of several hundred thousand
* characters. Now the published layout is exactly the layout of
* `~/.dsh/.dsh-background-by-model-data/` — a readable `theme-config.json` and
* one raw file per slot — which makes the configuration editable in place and
* makes publishing it a `cp` out of the data directory rather than a special
* export step. The bytes on the wire are the same; only their arrangement is
* different.
*
* Nothing lists the images: the request set is DERIVED from the config's own
* `rules[].images[].slot`, so adding a wallpaper is adding a rule entry and a
* file, with no second place to keep in sync.
*
* Referenced by BRANCH, unlike the festival art, and deliberately so. The reason
* that art is pinned to a commit does not apply here: its rationale is that a
* reshuffle of the assets repository would make a shipped feature disappear
* SILENTLY, on a day nobody is watching. A profile fails LOUDLY — the user
* clicks a button and gets an error naming what went missing — so the failure
* immutability buys protection from cannot happen. What branch referencing buys
* instead is the ability to fix a recommendation without a plugin release:
* pinning would mean editing one JSON file costs a new commit, a new hash in
* this file and a new version on npm, and every user on an older build would
* keep getting the old recommendation forever.
*
* The risk that IS real — a profile written for a config shape this build cannot
* read — is what `preset.json` exists for (see `fetchPresetConfig`).
*/
const PRESET_ASSETS_REPO = "HarmlessFunny/assets";
const PRESET_ASSETS_REF = "main";
const PRESET_ASSET_DIR = "dsh-background-by-model/preset";
/** The shape gate: `{"version": 6}` — see SCHEMA_VERSION in ./schema. */
const PRESET_MANIFEST = "preset.json";
const PRESET_CONFIG = "theme-config.json";
/** Images are named after the slot they fill, exactly as they are on disk. */
const PRESET_IMAGE_PREFIX = "modelbg-";
/** Mirrors, tried in order — same reason as the festival art's. */
const PRESET_ASSET_HOSTS = [`https://cdn.jsdelivr.net/gh/${PRESET_ASSETS_REPO}@${PRESET_ASSETS_REF}/${PRESET_ASSET_DIR}`, `https://raw.githubusercontent.com/${PRESET_ASSETS_REPO}/${PRESET_ASSETS_REF}/${PRESET_ASSET_DIR}`];
/**
* Caps for the profile, now per file rather than for one document.
*
* Three of them, because a profile is now a SET of transfers and each has a
* different way of going wrong. The manifest and the config are small by nature
* — a manifest is one field, a config is a few kilobytes of JSON — so their caps
* are what stops a mirror from answering with something enormous instead. The
* images are the payload, so their cap is about the content.
*
* The count is the one that matters: the request set is derived from the config,
* so a hostile or broken config could name a thousand slots and turn one button
* press into a thousand downloads. `SLOT_RE` bounds each name and
* `PRESET_IMAGE_COUNT_MAX` bounds how many names there can be. The running TOTAL
* of what those transfers add up to is bounded on the client instead, because
* these calls are independent and this side never sees more than one file.
*
* The timeout is set by measurement, not by symmetry with the festival art's
* 10 s. A 350 KB wallpaper takes a second or two over jsDelivr from a normal
* connection, and the mirror that exists for the case where jsDelivr does not
* answer is the slower one — so a tight budget would fail exactly in the
* situation it was written for. A minute tolerates a slow link and is still
* bounded; the user is watching a button that says it is downloading, which is
* the one place waiting is honest.
*/
const PRESET_MANIFEST_MAX = 65536;
const PRESET_CONFIG_MAX = 1048576;
const PRESET_IMAGE_MAX = 8388608;
const PRESET_IMAGE_COUNT_MAX = 64;
const PRESET_FETCH_TIMEOUT = 6e4;
const dataDir = () => dshHomePath(DATA_DIR);
const configPath = () => dshHomePath(DATA_DIR, CONFIG_FILE);
const legacyWallpaperPath = () => dshHomePath(DATA_DIR, LEGACY_WALLPAPER);
const imagePath = (slot) => dshHomePath(DATA_DIR, `${IMAGE_PREFIX}${slot}`);
const holidayCachePath = (asset) => dshHomePath(DATA_DIR, HOLIDAY_CACHE_DIR, asset);
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
*
* The one case that is NOT a migration — a store with no config file at all — is
* handed through untouched rather than being filled in as `rules: []`. That empty
* list would be the same thing the sanitizer reads as "the user deleted every
* rule", and a fresh install is the opposite of that: `normalizeConfig` turns a
* config that names no rule list into the one blank rule the panel opens on.
*/
async function migrateLegacy(raw) {
	const r = raw ?? {};
	if (Array.isArray(r.rules)) return r;
	const hasWallpaper = await exists(legacyWallpaperPath());
	if (Object.keys(r).length === 0 && !hasWallpaper) return {};
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
			images: [{
				slot: "m1",
				bgMode: typeof r.bgMode === "string" ? r.bgMode : "fit",
				bgState: r.bgState ?? {}
			}],
			match: "",
			enabled: true,
			color: Array.isArray(r.color) ? r.color : null,
			wallpaperOpacity: typeof r.wallpaperOpacity === "number" ? r.wallpaperOpacity : 1,
			blur: typeof r.blur === "number" ? r.blur : 0
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
const LEGACY_RULE_KEYS = /* @__PURE__ */ new Set([
	"slot",
	"bgState",
	"bgMode"
]);
const LEGACY_NESTED_KEYS = /* @__PURE__ */ new Set(["rules[].rotate.fadeMs"]);
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
	const shapes = [[
		"transition",
		r.transition,
		normalized.transition
	]];
	for (const [label, got, known] of shapes) {
		if (got === null || typeof got !== "object") continue;
		const keys = new Set(Object.keys(known));
		for (const key of Object.keys(got)) if (!keys.has(key)) warned(`${label}.${key}`);
	}
	const sent = Array.isArray(r.rules) ? r.rules[0] : void 0;
	const have = normalized.rules[0];
	if (sent !== null && typeof sent === "object" && have !== void 0) {
		const rule = sent;
		const keys = new Set(Object.keys(have));
		for (const key of Object.keys(rule)) if (!keys.has(key) && !LEGACY_RULE_KEYS.has(key)) warned(`rules[].${key}`);
		const nested = [[
			"rules[].rotate",
			rule.rotate,
			have.rotate
		], [
			"rules[].images[]",
			Array.isArray(rule.images) ? rule.images[0] : void 0,
			have.images[0]
		]];
		for (const [label, got, known] of nested) {
			if (got === null || typeof got !== "object" || known === null || known === void 0) continue;
			const knownKeys = new Set(Object.keys(known));
			for (const key of Object.keys(got)) if (!knownKeys.has(key) && !LEGACY_NESTED_KEYS.has(`${label}.${key}`)) warned(`${label}.${key}`);
		}
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
/**
* Sniff an image's MIME from its leading magic bytes, or null when the bytes are
* not a recognised image at all.
*
* The null answer is what a DOWNLOAD is checked against (see `fetchHolidayAsset`):
* a CDN that answers 200 with an error page, a captive-portal redirect or a
* truncated body has to be rejected, and neither a status code nor a
* `content-type` header survives contact with a misconfigured mirror. The magic
* bytes of the payload are the only claim that cannot lie.
*/
function imageMimeOrNull(buf) {
	if (buf.length >= 4 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) return "image/png";
	if (buf.length >= 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255) return "image/jpeg";
	if (buf.length >= 6 && buf[0] === 71 && buf[1] === 73 && buf[2] === 70) return "image/gif";
	if (buf.length >= 12 && buf[0] === 82 && buf[1] === 73 && buf[2] === 70 && buf[3] === 70 && buf[8] === 87 && buf[9] === 69 && buf[10] === 66 && buf[11] === 80) return "image/webp";
	if (buf.length >= 2 && buf[0] === 66 && buf[1] === 77) return "image/bmp";
	return null;
}
/**
* Sniff an image's MIME from its leading magic bytes (defaults to JPEG).
*
* The default is deliberate for the bytes a USER uploaded: an unrecognised format
* is better served as a JPEG and left to the browser than refused outright — the
* browser decides, and it can sniff what this list does not know.
*/
function sniffImageMime(buf) {
	return imageMimeOrNull(buf) ?? "image/jpeg";
}
/**
* Read one slot as a data URL, or null when it has nothing to serve.
*
* Two very different sources behind one answer. A holiday slot resolves to the
* festival art — downloaded on demand and cached, never shipped (see
* `readHolidayAsset`). Everything else is the user's own bytes on disk. Both are
* resolved lazily, so neither is read, fetched or even looked for until a
* wallpaper actually needs it.
*
* `null` is a legitimate answer for a holiday — offline, a blocked CDN, a cold
* cache — and the caller is built for it: `pickHoliday` treats "no bytes" as
* "this holiday does not take over" and the model rules keep painting. A
* festival that cannot be downloaded must never blank the interface.
*/
async function readImage(slot) {
	const asset = holidayAssetFor(slot);
	if (asset !== null) {
		const art = await readHolidayAsset(asset);
		return art === null ? null : toDataUrl(art);
	}
	const own = await readFileOrNull(imagePath(slot));
	return own === null ? null : toDataUrl(own);
}
async function readFileOrNull(path) {
	try {
		return await readFile(path);
	} catch {
		return null;
	}
}
function toDataUrl(buf) {
	return `data:${sniffImageMime(buf)};base64,${buf.toString("base64")}`;
}
/** Downloads in flight, so two read paths asking at once share one transfer. */
const holidayInFlight = /* @__PURE__ */ new Map();
/**
* One holiday's art: from the cache if it is there and sound, otherwise from the
* network.
*
* The cached copy is validated rather than trusted — a process killed mid-write
* (or a full disk) would otherwise leave a permanently truncated file that every
* later read happily serves, and the holiday would be broken forever with no way
* back short of deleting a file nobody knows about. A cache entry that is not an
* image is treated exactly like a miss and overwritten by the next download.
*
* The in-flight map matters because the two readers can race: the boot hydrate
* and the midnight rollover timer both ask for the same slot, and the timer
* fires precisely when a machine that was asleep all day is waking up. Without
* it that is two simultaneous half-megabyte transfers for one picture.
*/
async function readHolidayAsset(asset) {
	const cached = await readFileOrNull(holidayCachePath(asset));
	if (cached !== null && imageMimeOrNull(cached) !== null) return cached;
	const running = holidayInFlight.get(asset);
	if (running !== void 0) return await running;
	const task = downloadHolidayAsset(asset).finally(() => {
		holidayInFlight.delete(asset);
	});
	holidayInFlight.set(asset, task);
	return await task;
}
/** Try every mirror in turn; the first usable answer is cached and returned. */
async function downloadHolidayAsset(asset) {
	for (const host of HOLIDAY_ASSET_HOSTS) {
		const buf = await fetchHolidayAsset(`${host}/${asset}`);
		if (buf === null) continue;
		await writeHolidayCache(asset, buf);
		return buf;
	}
	return null;
}
/** Wait, without pulling in `node:timers/promises` for one line. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
* One asset over the wire, or WHY it did not arrive.
*
* Never throws: a holiday that cannot be fetched is a holiday that does not paint
* today, and a profile file that cannot be fetched is a sentence on the button —
* neither is an error path the caller should have to wrap. What it answers with
* instead is the reason, because the two callers treat those differently: the
* profile asks `presetRetryable` whether the reason is weather (./preset) and the
* festival art takes the null and waits for the next apply.
*
* The `content-length` check is a courtesy — a mirror that announces a huge body
* never gets to send it — while the post-read size check is the one that holds.
*
* Deliberately says nothing about WHAT the bytes are: the festival art and the
* recommended profile are both "a file from the assets repository", and the one
* thing they do not share is how a payload is recognised (magic bytes vs JSON).
* That check belongs to the caller, which is the only half that knows what it
* asked for.
*/
async function fetchAsset(url, max, timeout) {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), timeout);
	try {
		const res = await fetch(url, {
			redirect: "follow",
			signal: ctl.signal
		});
		if (!res.ok) return {
			ok: false,
			reason: fetchFailureForStatus(res.status)
		};
		const announced = Number(res.headers.get("content-length") ?? "");
		if (isFinite(announced) && announced > max) return {
			ok: false,
			reason: "oversized"
		};
		const arr = await res.arrayBuffer();
		if (arr.byteLength > max) return {
			ok: false,
			reason: "oversized"
		};
		if (arr.byteLength === 0) return {
			ok: false,
			reason: "empty"
		};
		return {
			ok: true,
			buf: Buffer.from(arr)
		};
	} catch {
		return {
			ok: false,
			reason: ctl.signal.aborted ? "timeout" : "network"
		};
	} finally {
		clearTimeout(timer);
	}
}
/**
* The status codes worth another round: 5xx is a mirror having a bad moment, 429
* is one asking to be left alone for a bit, 408 is one giving up on us.
*
* Every other non-2xx means the file is not there — jsDelivr answers a path
* outside the repository with 403, both hosts answer a missing file with 404 — and
* the profile follows a BRANCH, so that answer has to arrive fast and unchanged.
*/
function fetchFailureForStatus(status) {
	return status >= 500 || status === 429 || status === 408 ? "server" : "missing";
}
/**
* One festival picture, or null when no mirror served an image.
*
* One round, deliberately, unlike the profile's (see `fetchPresetFile`): this is
* fetched during boot, on the day, before the first wallpaper is painted, and a
* retry round would add its delay to that first paint. The art does not need one
* either — it is cached once it arrives, and every later read tries again, while a
* button press has no later read of its own.
*/
async function fetchHolidayAsset(url) {
	const got = await fetchAsset(url, HOLIDAY_FETCH_MAX, HOLIDAY_FETCH_TIMEOUT);
	return !got.ok || imageMimeOrNull(got.buf) === null ? null : got.buf;
}
/**
* One file out of the profile directory, or null when no mirror served it.
*
* Every mirror is asked in every round, so a round is "all the hosts there are"
* and the rounds are the retry: the case this exists for is a mirror that answers
* 502 on one round and correctly on the next, on the sixth of seven files, with
* six good downloads behind it. A round in which every failure was terminal — the
* file is not there, or it is too big — ends the attempts outright, so "the author
* renamed a file" still costs exactly two requests and a sentence naming the slot
* (see `presetRetryable`, ./preset).
*/
async function fetchPresetFile(name, max) {
	for (let attempt = 1; attempt <= 3; attempt++) {
		let retryable = false;
		for (const host of PRESET_ASSET_HOSTS) {
			const got = await fetchAsset(`${host}/${name}`, max, PRESET_FETCH_TIMEOUT);
			if (got.ok) return got.buf;
			if (presetRetryable(got.reason)) retryable = true;
		}
		if (!retryable || attempt === 3) return null;
		await sleep(presetRetryDelayMs(attempt));
	}
	return null;
}
/**
* The profile's shape gate and its configuration, in one answer.
*
* Two files, fetched in order, because they answer different questions. The
* manifest says what SHAPE the config is written for, and a config written for a
* shape this build cannot read is refused here — before anything is downloaded
* in earnest and long before anything is deleted. The config then says what the
* profile IS.
*
* The sanitizer runs on this side, and that is not merely tidiness: the list of
* images to download is DERIVED from `rules[].images[].slot`, so an unsanitized
* config would let a remote file choose what this process requests. After
* `normalizeConfig` every slot has passed `SLOT_RE` (see `normalizeImage`), and
* the only names left to reject are the holiday slots — which a config CAN name,
* legally, inside `holidays.items`, and which have no file at all.
*
* Holiday slots are dropped rather than refused. They are unwritable by design
* (`writeImage` refuses them), so a rule that points at one is already inert on
* the client; failing the whole profile over a slot nothing could ever fill
* would be a worse answer than ignoring it.
*
* Nothing is cached to disk, unlike the festival art. That cache exists because
* the art is fetched on a schedule without anyone asking and must work offline
* afterwards; this is a button whose entire point is to fetch what is there NOW.
*/
async function fetchPresetConfig() {
	const manifestRaw = await fetchPresetFile(PRESET_MANIFEST, PRESET_MANIFEST_MAX);
	if (manifestRaw === null) return {
		ok: false,
		error: "download failed"
	};
	let manifest;
	try {
		manifest = JSON.parse(manifestRaw.toString("utf8"));
	} catch {
		return {
			ok: false,
			error: "not a profile"
		};
	}
	const declared = manifest?.version;
	if (typeof declared !== "number" || !isFinite(declared)) return {
		ok: false,
		error: "not a profile"
	};
	if (declared > 6) return {
		ok: false,
		error: "newer version"
	};
	const configRaw = await fetchPresetFile(PRESET_CONFIG, PRESET_CONFIG_MAX);
	if (configRaw === null) return {
		ok: false,
		error: "download failed"
	};
	let raw;
	try {
		raw = JSON.parse(configRaw.toString("utf8"));
	} catch {
		return {
			ok: false,
			error: "not a profile"
		};
	}
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {
		ok: false,
		error: "not a profile"
	};
	const config = normalizeConfig(raw);
	const slots = /* @__PURE__ */ new Set();
	for (const rule of config.rules) for (const image of rule.images) {
		if (holidayAssetFor(image.slot) !== null) continue;
		slots.add(image.slot);
	}
	if (slots.size > PRESET_IMAGE_COUNT_MAX) return {
		ok: false,
		error: "too many images"
	};
	return {
		ok: true,
		version: declared,
		config,
		slots: [...slots]
	};
}
/**
* One of the profile's wallpapers, as a data URL ready to be written into a slot.
*
* The same two checks the festival art gets, for the same reason: the bytes must
* actually be an image (`imageMimeOrNull`, never the `content-type` header — the
* mirror serves extensionless files as `application/octet-stream`), and the slot
* must be one this process is willing to write. The slot name is re-checked here
* because this is a public RPC: the list this side hands out is not the only
* thing a caller could ask for.
*/
async function fetchPresetImage(slot) {
	if (!SLOT_RE.test(slot) || holidayAssetFor(slot) !== null) return {
		ok: false,
		error: "bad slot"
	};
	const buf = await fetchPresetFile(`${PRESET_IMAGE_PREFIX}${slot}`, PRESET_IMAGE_MAX);
	if (buf === null) return {
		ok: false,
		error: "download failed"
	};
	const mime = imageMimeOrNull(buf);
	if (mime === null) return {
		ok: false,
		error: "not an image"
	};
	return {
		ok: true,
		dataUrl: `data:${mime};base64,${buf.toString("base64")}`
	};
}
/**
* Cache one downloaded asset, atomically and best-effort.
*
* Written to a temp name and renamed into place, so a reader never sees a partial
* file even if this process dies between the two calls. A failure to cache is
* logged and otherwise ignored: the bytes are already in hand and the caller is
* waiting for them — losing the cache costs a re-download next time, and failing
* the read over it would cost the holiday.
*/
async function writeHolidayCache(asset, buf) {
	try {
		await ensureDir();
		await mkdir(dshHomePath(DATA_DIR, HOLIDAY_CACHE_DIR), { recursive: true });
		const target = holidayCachePath(asset);
		const temp = `${target}.tmp`;
		await writeFile(temp, buf);
		await rename(temp, target);
	} catch (e) {
		console.warn(`dsh-background-by-model: could not cache the "${asset}" holiday art`, e);
	}
}
/**
* The wallpaper a holiday slot resolves to, or null when the slot is not a
* holiday's.
*
* This mapping is the ONLY thing that makes a holiday slot read-only, so both
* `readImage` and `writeImage` go through it rather than each testing the holiday
* list on their own. It reads no config: the festival art has stopped being a
* fallback that a flag could disable. What changed is only WHERE the bytes come
* from — the slot's identity, and its refusal to accept a write, are untouched.
*/
function holidayAssetFor(slot) {
	return HOLIDAYS.find((h) => h.slot === slot)?.asset ?? null;
}
/** Persist one rule image (null removes it); false keeps the previous file. */
async function writeImage(slot, dataUrl) {
	if (holidayAssetFor(slot) !== null) return false;
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
* Empty the store: the config and every rule image, and nothing else.
*
* The hard reset behind "use the recommended profile", and it has to be a real
* one rather than a config overwrite. `nextSlot` hands out `m1`, `m2`, … — a
* running counter, not a random token — so a profile and a store that both have
* pictures collide on those names as a matter of course. Emptying first is what
* makes the profile's own slots free to write, and it is why this feature needs
* no slot remapping: there is nothing left to collide with.
*
* `holiday-cache/` is deliberately untouched. It is not the user's
* configuration: it is downloaded festival art that belongs to no slot, costs a
* network round trip to get back, and has nothing to do with which profile is
* selected.
*
* Best-effort per entry — one unremovable file must not abort the rest and leave
* the store half wiped — but the failures are logged rather than swallowed,
* because the caller is about to write a fresh config over whatever survives.
*/
async function resetStore() {
	let ok = true;
	try {
		await rm(configPath(), { force: true });
	} catch (e) {
		ok = false;
		console.warn(`dsh-background-by-model: failed to remove "${CONFIG_FILE}"`, e);
	}
	for (const slot of await listSlots()) try {
		await rm(imagePath(slot), { force: true });
	} catch (e) {
		ok = false;
		console.warn(`dsh-background-by-model: failed to remove the image for slot "${slot}"`, e);
	}
	return ok;
}
/**
* Download an image from a network URL into one slot (replacing its bytes).
* Returns { ok, dataUrl?, error? }; never throws.
*/
async function fetchImageUrl(slot, url) {
	if (holidayAssetFor(slot) !== null) return {
		ok: false,
		error: "read-only slot"
	};
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
					slots: await listSlots(),
					schema: 6
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
			case "fetchPresetConfig": return {
				ok: true,
				value: await fetchPresetConfig()
			};
			case "fetchPresetImage":
				if (slot === null) return {
					ok: true,
					value: {
						ok: false,
						error: "bad slot"
					}
				};
				return {
					ok: true,
					value: await fetchPresetImage(slot)
				};
			case "resetStore": return {
				ok: true,
				value: await resetStore()
			};
			case "defaultModel": return {
				ok: true,
				value: defaultModel(ctx)
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
