# dsh-background-by-model

<p align="center">
  <a href="https://github.com/HarmlessFunny/dsh-background-by-model"><img src="https://img.shields.io/github/stars/HarmlessFunny/dsh-background-by-model?style=social" alt="GitHub stars"></a>
  <a href="https://www.npmjs.com/package/dsh-background-by-model"><img src="https://img.shields.io/npm/v/dsh-background-by-model" alt="npm version"></a>
</p>

English | [中文](README.zh.md)

> Forked from [`Tkingxiao/dsh-any-background`](https://github.com/Tkingxiao/dsh-any-background) and renamed to `dsh-background-by-model`.

A **DeepSeek Harness** appearance plugin built around an **ordered list of model rules**. Each rule carries its own wallpaper, theme color, layout mode, framing, opacity and blur — switch the model, and the background switches with it.

> **v0.3.0 is a breaking release.** Video wallpapers, generated dynamic backgrounds and the single global theme color were removed. See [Upgrading from 0.2.x](#upgrading-from-02x).

---

## How Model Rules Work

A rule is a **match string** plus **one complete set of background settings**. When you switch models, the plugin reads the current session's model name, scans the list top-down, and applies the **first** rule whose match string appears anywhere in that model name (case-insensitive). If nothing matches, **rule 1** is used — rule 1 doubles as the fallback.

Example list:

| # | Match string | Wallpaper |
| --- | --- | --- |
| 1 | `deepseek` | Image A |
| 2 | `flash` | Image B |
| 3 | `glm` | Image C |

| Current model | Result | Why |
| --- | --- | --- |
| `DeepSeek-Flash` | Rule 1 → Image A | `deepseek` matches first |
| `GLM-Flash` | Rule 2 → Image B | `flash` is earlier in the list than `glm` |
| `Qwen-Flash` | Rule 2 → Image B | `flash` matches |
| `GLM-Turbo` | Rule 3 → Image C | only `glm` matches |
| `Kimi-K3` | Fallback → Rule 1 → Image A | no rule matches |

Notes:

- **Order matters.** The first match wins, not the best match — drag rules to reorder them.
- **An empty match string** makes a rule skip matching entirely and act purely as a fallback. A single rule with an empty match string is therefore "one wallpaper everywhere".
- The match string is compared against the concatenation of **provider, model id and model display name**, so any of the three can be used to select a rule.
- The current model is read from **this session's durable model selection** (the `modelSelection` projection — the same value the composer's model picker renders), so switching the model inside a session takes effect immediately. The Model Background page shows which model was read, and labels it **host default** when only the host-wide default was available instead of this session's own selection.

> Note: the example table above has **no `kimi`** entry, so switching to Kimi falls back to rule 1 = Image A, which looks like "nothing happened". Add a rule with the match string `kimi` to give Kimi its own wallpaper.

## Screenshots

One interface, one config — only the current model differs:

<p align="center">
  <img src="example_img/wallpaper-deepseek.webp" alt="Appearance under DeepSeek" width="880">
  <br/>
  <em>DeepSeek V4.1 Flash · matched the rule whose match string contains <code>deepseek</code>: a light wallpaper with a matching theme color</em>
</p>

<p align="center">
  <img src="example_img/wallpaper-kimi.webp" alt="Appearance under Kimi" width="880">
  <br/>
  <em>Kimi K2.7 Code · matched the rule containing <code>kimi</code>: a dark wallpaper, a dark theme, and the whole interface reskinned with it</em>
</p>

<p align="center">
  <img src="example_img/rule-editor.webp" alt="One rule's editor" width="660">
  <br/>
  <em>One rule on the Model Background tab · image, layout mode, theme color (wheel / HSL / RGB / extract from this image / pick from image), background opacity and background blur are all properties of that rule alone</em>
</p>

<p align="center">
  <sub>Example wallpaper art from <a href="https://space.bilibili.com/4168597">ZipZipPipe</a> on bilibili</sub>
</p>

## Features

### Model rules

- **Ordered Rule List** — Add, remove, reorder and name rules. Each rule is matched by its own match string; the first hit wins and rule 1 is the fallback.
- **Live Match Readout** — The top of the Model Background tab shows the current state, e.g. `Current model deepseek-flash → matched · Rule 1`, so you can verify a rule on the spot. If the current model can't be detected, a hint is shown instead.
- **Per-rule Appearance** — Every rule owns its wallpaper, theme color, layout mode, framing, opacity and blur. Nothing is shared globally except the Interface tab.
- **Import / Export** — Export every rule **including its wallpaper** to a `dsh-background-by-model-theme.json` (format version 3, images inlined as base64) and restore it anywhere.
- **File-based Persistence** — All settings and images are stored on the filesystem under `~/.dsh/.dsh-background-by-model-data/`, not `localStorage`.
- **Automatic Migration** — Old single-wallpaper configs are upgraded in place on first read. See [Upgrading from 0.2.x](#upgrading-from-02x).
- **Bilingual** — Full Chinese / English UI with automatic locale detection.
- **Theme Watchdog** — Re-asserts the custom theme if the host resets it.

### Per-rule settings

- **Wallpaper** — Upload any image as this rule's wallpaper; each rule keeps its own file.
- **Theme Color** — HSL wheel plus numeric input and an inspiration palette, with **Extract from this image** and an **eyedropper**. When a rule sets no theme color, the system theme is used. Generates the full CSS design-token set in real time.
- **Layout Mode** — Fit / Fill / Stretch / Tile / Center.
- **Framing** — Drag to pan and scroll to zoom inside a viewport-proportional editor; **only editable in Fit mode**, and the committed framing stays consistent across window resizes and cross-monitor moves.
- **Background Opacity** — `0–100%` for the rule's wallpaper layer.
- **Background Blur** — `0–60 px`, applied to the wallpaper layer.

### Global settings (Interface tab)

- **Per-part Interface Opacity** — Independent sliders for the main background, sidebar, file preview panel, cards & panels (including the dropdowns and menus around the dialog), the input & controls (composer box, Cordis panel), plus the settings panel and the conversation text box.
- **Per-part Interface Blur** — Frosted-glass `backdrop-filter` blur (`0–60 px`) for each interface part, including a real backdrop on the composer and Cordis panel via stable host selectors.
- **Conversation & Trajectory** — The message list is wrapped in a translucent card automatically, and the trajectory page gets whole-page opacity & blur controls, letting the wallpaper shine through the content.
- **File Preview Panel** — The column that slides in from the right when you open a file now has a card of its own: its opacity follows **Main background** until you drag it (then this card owns it), and its blur stacks on top of the main-background blur. While closed it takes no space and costs nothing.

## Settings

Settings → **Theme** now has three tabs:

| Tab | Scope | Contents |
| --- | --- | --- |
| **Interface** | Global, shared by every model | Opacity & blur for the main background, sidebar, file preview panel, cards & panels, input & controls, settings panel, conversation text box and trajectory page |
| **Model Background** | Per rule | The ordered rule list, the live match readout, and each rule's wallpaper, theme color, layout mode, framing, opacity and blur |
| **Config** | — | Import / export the whole rule set (`dsh-background-by-model-theme.json`) |

The old **Color** tab is gone — the theme color is now a property of each rule. The old **Background** tab became **Model Background**.

## Storage & Migration

Data directory: `~/.dsh/.dsh-background-by-model-data/` (Windows: `C:\Users\<you>\.dsh\.dsh-background-by-model-data\`)

| File | Contents |
| --- | --- |
| `theme-config.json` | The rule list plus the global Interface settings |
| `modelbg-<slot>` | The image of each rule, stored as raw bytes without a file extension |

### Upgrading from 0.2.x

v0.3.0 **removed** three things:

- **Video wallpapers** — no longer supported.
- **Generated dynamic backgrounds** — mesh gradients, Shader and geometric patterns are gone.
- **The global theme color** — it moved into each rule.

Upgrading is otherwise automatic and non-destructive: on first read, a legacy config (one without a `rules` array) is migrated so that the old single `wallpaper.jpg` becomes **rule 1** with an **empty match string** (a pure fallback), inheriting the old theme color, layout mode, opacity, blur and framing. Leftover video files from the old version are cleaned up as well. Existing users keep the appearance they had — you only need to add more rules if you want a different background per model.

## Installation

### Method 1: npm install (Recommended)

```sh
dsh plugin --profile web add dsh-background-by-model
# or install straight from the repository:
dsh plugin --profile web add github:HarmlessFunny/dsh-background-by-model
```

Then restart `dsh web`.

The plugin appears as a **"Theme"** section in Settings.

### Method 2: npx (No Global Install)

```sh
npx @deepseek-ai/dsh plugin --profile web add github:HarmlessFunny/dsh-background-by-model
npx @deepseek-ai/dsh web
```

### Method 3: Local Build (Development)

The `lib/` directory is committed, so installs need no build step. To rebuild after editing `src/`:

```sh
git clone https://github.com/HarmlessFunny/dsh-background-by-model.git
cd dsh-background-by-model
pnpm install
pnpm run bundle      # output goes to lib/
pnpm run typecheck
```

To mount a working copy into a profile instead, add it to the profile's `package.json` and register the bundle:

```jsonc
{
  "dependencies": {
    "dsh-background-by-model": "link:E:/DeepSeek/dsh-background-by-model"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-background-by-model"]
    }
  }
}
```

After changing anything under `src/`, run `pnpm run bundle` again — the mounted profile loads `lib/`, so edits do not take effect until the bundle is rebuilt.

## Compatibility

- **[`dsh web`](https://github.com/deepseek-ai/deepseek-harness)** — Full support on both the npm release and the new source build. The plugin auto-detects which client-module table the host ships (the new `@deepseek-ai/dsh-client-store` or the legacy `@deepseek-ai/dsh-client-runtime`) and resolves `defineStore` accordingly at runtime.
- **[deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop)** — Supported

## FAQ

**Every model looks the same — why?**
Your first rule probably has an empty match string, which makes it a pure fallback holding the whole list. Give rule 1 a match string (or add more specific rules *above* the fallback).

**`GLM-Flash` picked the wrong rule.**
Matching is first-hit, not best-hit. Put the more specific rule higher in the list, or reorder so the rule you want comes first.

**Where are my wallpapers?**
In `~/.dsh/.dsh-background-by-model-data/`, one `modelbg-<slot>` file per rule plus `theme-config.json`.

**Can I share a setup?**
Yes — export it from the **Config** tab; the JSON inlines every rule's image.

**Are video or generated backgrounds supported?**
No. Both were removed in 0.3.0; each rule uses a static image.

## Recent Optimizations

### v0.3.2

- **New "File preview panel" card** — The column that slides in from the right when you open a file now has opacity and blur sliders of its own. Its only surface was `--dsw-alias-bg-base` — the very token the Main background slider rewrites — so it used to be an unnamed second copy of the main background with no control of its own. The new card's opacity **follows Main background by default** and only takes over on the first drag, so nothing changes on upgrade; its blur stacks on top of the main-background blur. While the panel is closed it is merely slid off-screen, so the card costs nothing.
- **Host-side config keeps the new fields** — `theme-config.json` gained `rightbarOpacity` and `blurs.rightbar`. A missing field (any config written before this version, including an imported one) means "follow the main background".

### v0.3.1

- **Docs and screenshots refreshed** — The screenshots now show the current three-tab UI: one config under DeepSeek and under Kimi, plus a single rule's editor. The seven old captures (still showing the removed Color tab and the old Background page) are gone, and the image folder dropped from 3.6 MB to 220 kB.
- **Screenshots ship inside the npm package** — `example_img/` is part of the published tarball now, so the README rendered on npm has no broken images.
- **Art credit** — The example wallpaper art comes from [ZipZipPipe](https://space.bilibili.com/4168597) on bilibili.

### v0.3.0

- **Model rules replaced the single global wallpaper** — The background is now driven by an ordered list of rules, each selected by a match string against the current session's model name (first match wins, rule 1 falls back). The match string is compared against the provider, model id and display name together.
- **Appearance moved from global to per rule** — Wallpaper, theme color, layout mode, framing, background opacity and background blur are now properties of each rule, so different models can look completely different.
- **New tab layout** — Settings now has **Interface** (global), **Model Background** (the rule list) and **Config** (import/export). The **Color** tab was removed with the global theme color, and the old **Background** tab became **Model Background**.
- **Live match readout** — The Model Background tab reports the current model and the rule it resolved to (for example `Current model deepseek-flash → matched · Rule 1`), or a hint when the model can't be detected.
- **Export format v3** — `dsh-background-by-model-theme.json` now carries the full rule set and every rule's image (base64 inlined).
- **Breaking removals** — Video wallpapers, generated dynamic backgrounds (mesh gradient / Shader / geometric patterns) and the global theme color are gone.
- **Automatic legacy migration** — A pre-0.3.0 config becomes rule 1 with an empty match string, inheriting the old appearance, and stale video files are cleaned up.
- **Smoother switching, with a cross-fade** — Wallpapers are painted from an object URL, so one image is decoded once instead of being re-decoded on every switch, and a rule change now cross-fades (320 ms: the new image fades in over the old one, which stays fully opaque so the backdrop never brightens mid-transition). The drag-time low-resolution wallpaper swap was removed: it re-decoded and re-scaled the whole photo on every change, and its low-res frame was overwritten by the next repaint anyway.
- **Fixed: switching the model did nothing** — three things stacked up: (1) the old code read `ctx.modelDirectories`, which is not visible from a plugin context (it is registered in ui-model-selection's own scope), so it silently fell back to the host-wide default model; (2) this plugin's client bundle loads **before** `api-session-controller`, so `ctx.get('sessions')` is normally still undefined during `apply()` — and the old code gave up at that point and never retried, which is why nothing happened at all; (3) the readout passed a global default off as this session's model. It now reads **this session's own durable model selection** (`ctx.sessions.binding(id).session.projections.faceOf('modelSelection')` — the same value the model picker renders), waits for the `sessions` service at 400 ms intervals (up to 2 minutes), keeps a 1.5 s safety poll and rebinds on session switches; it labels the value **host default** when only the host-wide default was available, and the readout names the failing hop (not mounted / no current session / no projection / projection empty).

### v0.2.4

- **dsh 0.1.5 persistence fixed** — The theme/wallpaper RPC channel is now registered directly in the plugin's own `webServer` scope as a prefix route (keeping the same Host/Origin auth fence), instead of through `connection.rpc.handle`, whose effect binds to the connection service's context and never mounted on some 0.1.5 hosts — requests that previously dropped to the SPA fallback with 405 and never reached the disk now persist again. Verified working on both 0.1.2 and 0.1.5.
- **Host compatibility declared** — Added `engines.dsh: ">=0.1.2-rc.1"` to declare which DeepSeek Harness host versions the plugin supports.
- **Dark badge tokens fixed (issue #9)** — In the dark preset, the `*-tertiary` badge surfaces (trajectory tool/context badges, connection pill, plan chip) were tinted nearly the same as their background, making light label text unreadable. They now use the native dark 800/900 steps, so bright text sits on a properly dark badge.

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=HarmlessFunny/dsh-background-by-model&type=timeline&legend=bottom-right)](https://www.star-history.com/?repos=HarmlessFunny%2Fdsh-background-by-model&type=timeline&legend=bottom-right)

## License

MIT
