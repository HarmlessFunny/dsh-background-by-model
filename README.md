# dsh-background-by-model

<p align="center">
  <a href="https://github.com/HarmlessFunny/dsh-background-by-model"><img src="https://img.shields.io/github/stars/HarmlessFunny/dsh-background-by-model?style=social" alt="GitHub stars"></a>
  <a href="https://www.npmjs.com/package/dsh-background-by-model"><img src="https://img.shields.io/npm/v/dsh-background-by-model" alt="npm version"></a>
</p>

English | [中文](README.zh.md)

> Forked from [`Tkingxiao/dsh-any-background`](https://github.com/Tkingxiao/dsh-any-background) and renamed to `dsh-background-by-model`.

A **DeepSeek Harness** appearance plugin built around an **ordered list of model rules**. Each rule carries its own wallpapers and opacity and blur, and **each image carries its own layout mode, framing and theme color** — switch the model, and the background switches with it, through the global [switch effect](#switch-effect-global) you choose on the Config page.

> **v0.3.0 is a breaking release.** Video wallpapers, generated dynamic backgrounds and the single global theme color were removed. See the [v0.3.0 entry in CHANGELOG.md](./CHANGELOG.md#v030).

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
  <img src="https://cdn.jsdelivr.net/gh/HarmlessFunny/assets@main/dsh-background-by-model/wallpaper-deepseek.webp" alt="Appearance under DeepSeek" width="880">
  <br/>
  <em>DeepSeek V4.1 Flash · matched the rule whose match string contains <code>deepseek</code>: a light wallpaper with a matching theme color</em>
</p>

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/HarmlessFunny/assets@main/dsh-background-by-model/wallpaper-kimi.webp" alt="Appearance under Kimi" width="880">
  <br/>
  <em>Kimi K2.7 Code · matched the rule containing <code>kimi</code>: a dark wallpaper, a dark theme, and the whole interface reskinned with it</em>
</p>

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/HarmlessFunny/assets@main/dsh-background-by-model/rule-editor.webp" alt="One rule's editor" width="660">
  <br/>
  <em>One rule on the Model Background tab · the wallpaper, its opacity and its blur belong to the rule; the layout mode, the framing and the theme color (wheel / HSL / RGB / extract from this image / pick from image) belong to the image it is editing</em>
</p>

<p align="center">
  <sub>Example wallpaper art from <a href="https://space.bilibili.com/4168597">ZipZipPipe</a> on bilibili</sub>
</p>

## Features

### Model rules

- **Ordered Rule List** — Add, remove, reorder and name rules. Each rule is matched by its own match string; the first hit wins and rule 1 is the fallback.
- **Live Match Readout** — The top of the Model Background tab shows the current state, e.g. `Current model deepseek-flash → matched · Rule 1`, so you can verify a rule on the spot. If the current model can't be detected, a hint is shown instead.
- **Per-rule Appearance** — Every rule owns its wallpapers, opacity and blur, and **every image owns its layout mode, its framing and its theme color**. Nothing is shared globally except the Interface tab.
- **Several Images per Rule** — A rule holds an ordered set of images, shown as a filmstrip: add several at once (file picker, drag & drop, or a list of URLs, one per line), reorder them, promote one to first, **replace one in place** (which keeps its position in the rotation), or remove them one by one. The image a rule paints when nothing rotates is its **first**. Removing the last image simply leaves the rule empty — and empty is not the same as off: while the rule keeps a theme color of its own it still matches, still serves as the fallback, and paints the interface instead of a wallpaper; only a rule with neither (a freshly added one) is skipped by matching. So an emptied rule is a visible, reversible state rather than one you get stuck in. While it holds no picture the filmstrip is hidden and the big preview tile **is** the upload button, so there is exactly one obvious place to add one.
- **Import / Export** — Export every rule **including all of its images** to a `dsh-background-by-model-theme.json` (format version 6, images inlined as base64) and restore it anywhere. Files written by earlier releases still import: each rule's single image is lifted into its image list, a color written before per-image colors is lifted onto every image that has none, a layout mode written when it was the rule's is lifted onto each of its images, and a file written before the [switch effect](#switch-effect-global) gets that setting's shipped default — so an older theme file restores its look unchanged. The same document can also be **downloaded from the project's asset host** instead of picked from disk — see [Recommended profile](#recommended-profile) — with one difference, which is that it empties the store before it writes.
- **File-based Persistence** — All settings and images are stored on the filesystem under `~/.dsh/.dsh-background-by-model-data/`, not `localStorage`.
- **Automatic Migration** — Old single-wallpaper configs are upgraded in place on first read, and so is a layout mode that used to live on the rule. See the [v0.3.0 entry in CHANGELOG.md](./CHANGELOG.md#v030).
- **Bilingual** — Full Chinese / English UI with automatic locale detection.
- **Theme Watchdog** — Re-asserts the custom theme if the host resets it.

### Image rotation

Per rule, and **off by default** — cycling spends real bandwidth, memory and battery, so nothing turns it on for you.

- **Enable it per rule** — the switch appears in the rule card and only becomes usable once the rule holds two or more images.
- **Dwell time** — 10 s / 30 s / 1 min / 5 min / 30 min, or any custom value in seconds (clamped to 5 s – 24 h).
- **Order** — **In order** walks the list top-down and wraps around; **Shuffle** picks uniformly among every image *except* the one on screen, so a tick never looks like it was missed.
- **Also step on a model switch** — an optional second trigger: every time the model changes and lands on that rule, it steps once. That is the whole feature for a rule meant to show "a different picture every time" without any timer running.
- **Only the active rule rotates** — one timer for the whole plugin, aimed at whichever rule the current model resolved to. It stops while the tab is hidden and resumes on a fresh interval; a single-image rule (and every [holiday](#holiday-backgrounds)) never schedules anything.
- **Next image** — steps the wallpaper immediately, for when you want to check the set. It sits with the rotation switch (beside *which image is on screen*) and works whether or not the timer is running.
- **What follows a switch is the rule — except everything that belongs to the picture** — opacity and blur belong to the rule and stay put. The **layout mode**, the **framing** and the **theme color** belong to the image, so a rotation can letterbox a tall screenshot and fill the landscape photo next to it, and can move through a green picture, a red one and a system-themed one with the interface palette following the wallpaper. The cross-fade between two images is the same one a model switch already used.
- **Layout mode, framing and color are per image** — 适应/填充 decides how *this* picture meets the viewport, a crop and an accent belong to it too, so each image keeps its own while sharing the rule's opacity and blur. The filmstrip marks the images that carry a color of their own, and the color controls always say which image they are editing.
- **Only the images it needs are loaded** — boot reads each rule's first image; the rest stream in when a card is expanded or when the rotation is about to need one. Ten images per rule therefore do not mean ten wallpapers transferred before the first frame.

### Switch effect (global)

What a wallpaper **change** looks like. It lives on the **Config** page, it is the same for every rule (a rule has no notion of a transition), and it covers every way the wallpaper changes: a model switch, a [rotation](#image-rotation) step, the manual **Next image**, and a [holiday](#holiday-backgrounds) taking over.

- **Four effects** — **Cross-fade** (the blend every earlier release performed, and therefore the default), **Instant** (a hard cut), **Zoom in** (the incoming image settles from 6% larger) and **Slide in** (it pushes in from the side). Zoom and slide animate `transform`, which the wallpaper layer had never used, so neither costs a byte of extra transfer.
- **Easing** — standard / linear / ease-out / ease-in-out. The row is not rendered while the effect is **Instant**: a hard cut has no curve to shape, and a control that does nothing is worse than no control.
- **One duration for every switch** — `0`–`3000 ms`, and `0` is a hard cut rather than "unset". It replaced the per-rule `rotate.fadeMs`, which from 0.7.0 on was a duration with **no control anywhere** — it could only be hand-edited — so a hand-tuned value is folded into this one when a config that predates the setting is first read (a value equal to the shipped 320 ms is ignored, so an ordinary config keeps the ordinary default).
- **`Instant` and `0` ms are the same hard cut** — two ways of asking for one thing, so both are honoured instead of one being read as "not set".
- **Reduced motion is a veto, not a shorter animation** — while `prefers-reduced-motion: reduce` is in force nothing animates at all, and the card says so rather than previewing something the interface will not do.
- **A preview swatch, because a wallpaper fading into itself is invisible** — replaying the effect on the wallpaper already on screen would show nothing, which is exactly the "I changed it and nothing happened" this plugin keeps designing out. The swatch replays the chosen effect with the duration a real switch would use right now, and picking a different effect replays it at once.
- **The interface colour changes on the same clock** — a theme colour is one rewrite of the token block, which used to change every surface in a single frame while the wallpaper faded. The alias tokens are registered as colours so they interpolate over this setting's duration and easing, including the surfaces that re-declare those tokens instead of inheriting them and the two the plugin paints inline. One deliberate exception: a **light↔dark flip switches instantly**, because that is a different palette rather than a tint of the same one, and interpolating between them walks the interface through mid-tones whose text is unreadable in both directions. The wallpaper keeps its own animation either way.
- **And it is not a slider** — the fade is armed only when the palette itself moved. A drag rewrites the same token block on every frame, and a live transition there would make the surface lag behind the pointer.

### Holiday backgrounds

A small one, not a settings block: **one switch on the Config page and nothing else**. It ships **off** — turn it on and on the day the background changes by itself and changes back the next morning. (The [recommended profile](#recommended-profile) below turns it on for you.)

- **How it behaves** — On 中秋节 and 国庆节 the wallpaper switches to that holiday's own image, with that holiday's own fixed theme color (中秋 `#384A77`, 国庆 `#FFF6EB`). The next day, the model rules take over again.
- **Mid-Autumn Festival** — 农历八月十五, the day itself. It moves every year (2024-09-17, 2025-10-06, 2026-09-25, 2027-09-15 …), so it is resolved from the Chinese calendar at runtime, in **Asia/Shanghai** — the lunar day turns over at Beijing midnight, not yours.
- **National Day** — October 1–7.
- **Mid-Autumn wins the overlap** — the two do collide (2025-10-06 was both); the single precise day is the better answer.
- **A holiday with no image falls through** to the model rules rather than blanking the wallpaper.
- **The art is downloaded, not shipped** — a compressed wallpaper per holiday (228 KB and 500 KB at native resolution, against 8.37 MB of source art), hosted in the project's [assets repository](https://github.com/HarmlessFunny/assets) rather than in the package: they were two thirds of the tarball for a picture that is looked at one day a year. The download is gated on the **calendar**, so a profile that is not on a holiday fetches nothing at all, and the first read on the day caches the file under `holiday-cache/` — every boot after that, and every year after that, is answered from disk and needs no network. The reference is pinned to a **commit**, never a branch, so reshuffling the repository's screenshots cannot break a shipped festival; a `jsDelivr` mirror is tried first and `raw.githubusercontent.com` second, and if both are unreachable the holiday simply does not take over — the model rules keep painting.
- **Neither the art nor the palette is swappable, by design** — an easter egg that asks to be configured is not an easter egg. A holiday slot is read-only: a file dropped into `modelbg-h-midautumn` / `modelbg-h-nationalday` is ignored by every read, and the plugin refuses to write, fetch into or delete those slots. The download lands in `holiday-cache/`, keyed by asset name and never by slot, so the store still never holds a `modelbg-h-*` file. The theme colors are constants in the holiday definition and are forced on every read — on the holiday **and on its image**, since a theme color lives on the image now — so a hand-edited `color` in `theme-config.json` cannot repaint a festival either. Its layout mode is the definition's **Fill** for the same reason (the art is full-bleed, and a stale `fit` would letterbox it), while the **framing** next to it stays yours. Theme exports therefore carry your rules only.
- **Turning it on** — the switch on the Config page, or `"holidays": { "enabled": true }` in the same file. Only a real `true` counts: the feature is on because a configuration says so, not because nothing has been said. The per-holiday switches inside it (中秋 / 国庆) are a different thing and still default to on — they are details of a feature that is already switched on.

### Per-rule and per-image settings

- **Wallpaper** — Give a rule one or more images; each image is its own file. The filmstrip picks which one you are editing, and the "first" one is what the rule paints when no rotation is running. A rule may also hold **no** image: it then paints no wallpaper, but as long as it has a theme color of its own it still matches and still serves as the fallback (painting the interface alone), and only with neither is it skipped by matching until you give it something.
- **Theme Color** — HSL wheel plus numeric input, with **Extract from this image** and an **eyedropper**. **The color belongs to the image**: those controls edit the one selected in the filmstrip, the strip shows which images already carry a color of their own, and an image that has none follows the system theme rather than inheriting its rule's. A rule with **no image at all** has only its own color left to edit — and that is exactly what such a rule paints. Generates the full CSS design-token set in real time. Following the system theme hands the palette back to the host while the wallpaper and the Interface-tab opacity/blur sliders keep working — the surface colors are read back from the host's own tokens and re-emitted with your alpha, so the wallpaper is never buried under an opaque plate.
- **Layout Mode** — Fit / Fill / Stretch / Tile / Center, and it is stored **per image**: a rotation can letterbox one picture and fill the next. On a rule that holds no picture the row is disabled (there is nothing to lay out) rather than hidden, so the card shows what becomes editable once you add one.
- **Framing** — Drag to pan and scroll to zoom inside a viewport-proportional editor; **only editable in Fit mode**, and the committed framing stays consistent across window resizes and cross-monitor moves. Stored per image.
- **Background Opacity** — `0–100%` for the rule's wallpaper layer.
- **Background Blur** — `0–60 px`, applied to the wallpaper layer.

### Global settings (Interface tab)

- **What a fresh install starts on** — the shipped numbers **are the author's own profile**, i.e. the Interface numbers the [recommended profile](#recommended-profile) carries, so a first run already looks like that without downloading anything: main background `0%`, left panel `10%`, right panel `45%`, cards & panels `100%`, code blocks `81%`, input & controls `88%` with `60 px` of blur, settings panel `100%`, conversation text `35%`, trajectory `73%`, and every other blur `0`. The two are kept in step by hand — the profile is published straight out of a live data directory, so changing its numbers means moving these constants with them. (The two settings this tab does not own are deliberately *not* copied from the profile: the [festival switch](#holiday-backgrounds) ships off, and the [switch duration](#switch-effect-global) keeps the 320 ms cross-fade — the profile uses its 3000 ms maximum.)
- **Per-part Interface Opacity** — Independent sliders for the main background, left panel, right panel, cards & panels (including the dropdowns and menus around the dialog), the input & controls (composer box, Cordis panel), plus the settings panel and the conversation text box. Independent of the theme color: a rule with no color keeps every one of these sliders live.
- **Per-part Interface Blur** — Frosted-glass `backdrop-filter` blur (`0–60 px`) for each interface part, including a real backdrop on the composer and Cordis panel via stable host selectors.
- **Conversation & Trajectory** — The message list is wrapped in a translucent card automatically, and the trajectory page gets whole-page opacity & blur controls, letting the wallpaper shine through the content.
- **Right Panel** — The column that slides in from the right when you open a file now has a card of its own: this card owns its opacity from the first drag, and until then it follows **Main background** — the state a config written while that was the shipped default is in, since a fresh install already owns the panel at the profile's `45%` — and its blur stacks on top of the main-background blur. While closed it takes no space and costs nothing.

### Recommended profile

The Config tab's first card downloads the author's own configuration — rules, wallpapers and interface settings — from the project's [assets repository](https://github.com/HarmlessFunny/assets) and installs it in one click.

**Every Interface number in it is what the plugin already ships with** — each opacity, blur and tint alpha in `theme-config.json` is the number a fresh install starts on (see [Global settings](#global-settings-interface-tab)) — so on a new install this button adds the rules and the pictures. Two settings it brings that a fresh install does not have are outside that tab: the [festival switch](#holiday-backgrounds), which ships off and this profile turns on, and the [switch duration](#switch-effect-global), which the profile sets to its 3000 ms maximum where the shipped default is the 320 ms cross-fade every earlier release used. On a store whose sliders you have already moved, adopting it resets those too: it is a whole configuration, not a patch.

**It is hosted in the store's own shape**, not as one bundled document:

```
preset/
├── preset.json            the shape gate — {"version": 6}
├── theme-config.json      the rules and the interface settings (6.5 KB)
└── modelbg-m1 … modelbg-m7    each wallpaper as its raw bytes
```

So it is editable where it lives: the config is a few kilobytes of readable JSON that can be edited on GitHub directly, and replacing one wallpaper is replacing one file. It also makes publishing it a `cp` out of `~/.dsh/.dsh-background-by-model-data/`. The plugin fetches the manifest and the config, derives the file list from `rules[].images[].slot` — there is no manifest of images to keep in sync — and then fetches the wallpapers **one request each, up to four in flight**, showing the count on the button while it runs.

It is the only action in the panel that **destroys** something, and it is built around that:

- **You are asked second, not first.** The download happens before the confirmation, so the question can say what is actually in hand — *7 rules · 7 wallpapers · 2.9 MB* — instead of asking about a file that may never arrive. If the download fails, nothing has happened yet.
- **One missing wallpaper fails the whole thing**, and says which. A profile that quietly arrived without a picture — because a file was renamed where it is hosted — would be exactly the silent failure that pinning the festival art to a commit exists to prevent; naming the file keeps that failure loud, which is what makes a branch reference acceptable here.
- **The store is emptied before the profile is written.** `nextSlot` allocates slots as `m1`, `m2`, … — a counter, not a random token — so a downloaded profile and the store it lands in collide on those names as a matter of course. "Replace everything with this" is only true if the everything is genuinely gone, and this is also why there is no undo.
- **The wipe runs after the download, never before it.** An unreachable CDN must not cost you your configuration on the way to a profile that never arrived — which matters more now that the download is several transfers rather than one.
- **The festival art is not touched.** `holiday-cache/` is downloaded art that belongs to no slot; it is not part of anybody's configuration, and re-fetching it would be a network round trip for nothing. The config *does* name the two holiday slots (they are part of any config), and they are dropped from the request set rather than asked for: no `modelbg-h-*` file can exist.
- **It is referenced by branch, unlike the festival art's commit** — and for the opposite reason. A profile fails *loudly* (you are looking at the button when it happens) where a holiday fails silently, so pinning would buy nothing and would cost a plugin release for every correction to one JSON file. The risk that is real — a profile written for a config shape this build cannot read — is what `preset.json` is for: it is refused before a single wallpaper is requested, and long before anything is deleted.

## Settings

Settings → **Theme** now has three tabs:

| Tab | Scope | Contents |
| --- | --- | --- |
| **Interface** | Global, shared by every model | Opacity & blur for the main background, left panel, right panel, cards & panels, input & controls, settings panel, conversation text box and trajectory page |
| **Model Background** | Per rule, per image | The ordered rule list, the live match readout, and each rule's images (filmstrip), **per-image layout mode, framing and theme color**, plus the rule's opacity, blur and [rotation](#image-rotation) |
| **Config** | — | The global [switch effect](#switch-effect-global), the whole rule set as a file — [recommended profile](#recommended-profile), import and export (`dsh-background-by-model-theme.json`) — plus the single [holiday background](#holiday-backgrounds) switch |

The old **Color** tab is gone — the theme color is now a property of each rule. The old **Background** tab became **Model Background**.

## Storage

Data directory: `~/.dsh/.dsh-background-by-model-data/` (Windows: `C:\Users\<you>\.dsh\.dsh-background-by-model-data\`)

| File | Contents |
| --- | --- |
| `theme-config.json` | The rule list (each rule with its image list and rotation) plus the global Interface settings, the global switch effect and the holiday overrides |
| `modelbg-<slot>` | One image, stored as raw bytes without a file extension — one file per image, so a rule with three images owns three slots |
| `holiday-cache/<asset>` | Festival art downloaded from the CDN, one file per holiday (`mid-autumn.webp`, `national-day.webp`). Keyed by **asset name**, deliberately outside the slot namespace — a holiday slot still never holds a file, which is what keeps it read-only. Delete a file here and it is simply re-downloaded the next time that holiday is in force |

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

`pnpm test` builds, typechecks and runs nine checks (`tsdown && tsc -p tsconfig.json && node scripts/holiday-check.ts && node scripts/rotation-check.ts && node scripts/transition-check.ts && node scripts/repaint-check.ts && node scripts/code-plate-check.ts && node scripts/image-mode-check.ts && node scripts/rules-view-check.ts && node scripts/ui-strings-check.ts && node scripts/node-half-check.mjs`). None of them needs a dependency, a transformer or a browser, and each can be run alone with `pnpm check:holiday` / `pnpm check:rotation` / `pnpm check:transition` / `pnpm check:repaint` / `pnpm check:code-plate` / `pnpm check:image-mode` / `pnpm check:rules` / `pnpm check:ui` / `pnpm check:node`:

- **`check:holiday`** — the two holiday windows against known dates, the Beijing day boundary (23:59 vs 00:01), leap eighth months across 1900–2100, and the four gates `pickHoliday` applies before a holiday is allowed to take over the background.
- **`check:rotation`** — the rotation's decisions (`nextIndex` / `isRotating`): no walking off the end of a list, shuffle never repeating the image already on screen (across the whole support of the roll), and "rotating" never claimed for a rule with nothing to rotate.
- **`check:transition`** — the switch effect's decisions (`resolveFadeMs` / `transitionPlan`), which live in `src/client/transition.ts` and are the ones that fail without a sound: that the shipped default still produces **exactly** the transition string earlier releases wrote (`opacity 320ms ease`, opacity only — an unchanged property must not be put on the transition list), that `Instant`, a `0` duration, a `0` unified duration and a non-numeric duration each mean a hard cut, that reduced motion vetoes rather than shortens, that every effect starts somewhere other than where it ends (the "I picked the new effect and nothing happened" failure), and that every effect lands fully visible and **unscaled** — a zoom that never resets would crop every later wallpaper.
- **`check:repaint`** — the decision that says whether an edit has to repaint the interface (`shouldRepaint`), including the case that kept failing in the field: an edit that **creates** the winner (a rule's first picture, its first or auto-extracted color) must repaint even though the edited rule was not the active one yet. It also fails if any of the write paths in `src/client/index.tsx` stops asking — so re-introducing the old `id === activeRuleId` test breaks the build's checks instead of the user's next upload — and if a rotation step stops re-emitting the interface palette (a theme color belongs to the image, so a step changes it).
- **`check:code-plate`** — the code block's plate: that the surface tokens it reads are declared on **both** `:root` and `body` (a `var()` is substituted where it is *declared*, so a root-level consumer otherwise reads the host's colour and not the palette's), that the light branch emits the banner instead of borrowing the host's near-white, and that each of the two surfaces reads its **own** plugin variable — one shared variable would let the banner's write paint the plate too.
- **`check:image-mode`** — the 0.7.5 lift of the layout mode onto the image and, more to the point, the **wiring**: which image a control edits and which image the render layer reads. A mis-wired read does not throw, it just makes every picture in a rotation look the same.
- **`check:rules`** — the two decisions behind the tab strip, which are pure and live in `src/client/rules-view.ts` (which rule the editor shows, and where a deletion lands — its neighbour, never rule 1), plus the page structure the layout rests on: one editor drawn, no stacked per-card container, no per-card open state, a strip that can neither wrap nor grow, and its scrollbar block staying scoped to the plugin's own classes.
- **`check:ui`** — every `t('…')` key exists in both dictionaries, both dictionaries carry the same key set, every `dab-…` class has a rule in the stylesheet, and no dictionary entry has gone unreferenced.
- **`check:node`** — the built node half driven through its real RPC handler with `DSH_HOME` redirected to a throwaway directory, and `globalThis.fetch` replaced by a stub — the festival art lives on a CDN now, and this suite must not depend on one being up, nor assert today's bytes of a file it does not own. It covers: the holiday block through the shared sanitizer; nothing fetched merely for loading the plugin or reading the config; the art fetched on demand and cached under `holiday-cache/` keyed by **asset** rather than slot; a second read answered from disk with no second transfer; two simultaneous cold reads sharing one transfer; a dead first mirror falling through to the second with both mirrors pinned to the same commit; every mirror down yielding "no bytes" rather than a throw, with nothing cached from a failed fetch; a mirror answering 200 with a non-image rejected rather than cached; a corrupt cache entry discarded and re-downloaded; a holiday slot refusing writes, deletes and URL fetches while a file dropped into it is ignored and no `modelbg-h-*` file is ever written; an ordinary rule slot still writing, listing and deleting; a hand-edited config unable to redirect a holiday at another rule's image; the per-image color shape — the read-time lift in both directions (an absent key inherits the rule's color, an explicit `null` does not), independent colors through the file, and a `null` written as a key rather than omitted; and the global switch effect — the shipped default for a config that predates it, a chosen effect/easing/unified duration surviving the round trip, hostile values falling back while an absurd duration clamps, a `0` duration kept rather than defaulted, and drift inside `transition` reported instead of silently dropped. The recommended profile is covered end to end from the node half's side: the manifest and the config fetched in that order and sanitized on arrival, the request set DERIVED from the rules with the holiday slots dropped from it, one request per wallpaper with the bytes sniffed rather than trusted from a header, a dead jsDelivr falling through to raw for a single file, and every way it can fail reported as a value rather than a throw — every mirror down, a mirror answering 500, a 200 carrying HTML, a manifest whose version is not a number, a profile written for a newer shape refused before a single wallpaper is asked for, a config that is not JSON, a config that is a JSON array, a config naming more images than the cap, and a mirror announcing an oversized body; plus the strict half (a named wallpaper the host does not have is an error, not a short profile), the two naming refusals that happen before any request at all (a holiday slot, and a slot name that is not a slot), and the reset: the config and every rule image gone, `holiday-cache/` untouched, a read afterwards yielding a fresh config rather than an error, and the profile then writing into the emptied store.

## FAQ

**Every model looks the same — why?**
Your first rule probably has an empty match string, which makes it a pure fallback holding the whole list. Give rule 1 a match string (or add more specific rules *above* the fallback).

**`GLM-Flash` picked the wrong rule.**
Matching is first-hit, not best-hit. Put the more specific rule higher in the list, or reorder so the rule you want comes first.

**Where are my wallpapers?**
In `~/.dsh/.dsh-background-by-model-data/`, one `modelbg-<slot>` file per image plus `theme-config.json`.

**I turned the rotation on and the background never changed.**
Three things can hold it: the rule needs two or more images, the tab has to be visible (a hidden tab paints nothing, so the rotation pauses with it), and only the rule the current model resolved to rotates — a rule that is not active has a disabled **Next image** button for exactly that reason.

**Does rotating cost anything?**
Yes, and that is why it is off by default. Each image is stored at full fidelity — no re-encoding — so a rule with ten 8 MB wallpapers holds ten of them, and every switch repaints the whole interface. Keep the sets small (two to five images is the sweet spot) and the dwell time sane; boot only reads each rule's first image, and the rotation warms the image it is about to need, so the cost is memory and disk rather than start-up time.

**Why did the theme color stop working after I removed a rule's images?**
That was the old behaviour, and its root cause was reading "has an image" as "is usable": a rule with no pictures left stopped matching at all, so its color had nothing to act on — and the models it used to own were handed to the next rule instead. A rule now counts while it has **an image, or a theme color of its own**: no wallpaper, the interface painted from that color (the card says which state it is in). Only a rule with neither — nothing to show at all — is skipped, with the card spelling that out.

**I updated the plugin and the panel says my edits are not being saved.**
The browser half and the host half are updated separately: a refreshed page can run the new client while DSH's own process still runs the previous plugin, which cannot read the new config shape (it announces a lower `SCHEMA_VERSION`) and could drop rules on the next write. The client detects that and holds its writes — restart DSH and the multi-image config, rotation settings and everything else save normally.

**I set a color for one image and the other images did not change.**
That is the design: since 0.7.1 a theme color belongs to the **image**, not to the rule, so a rotation can move through pictures with different accents (a green one, a red one, and one that follows the system theme). The color controls edit whichever image the filmstrip has selected, and the hint above them names it. A rule with **no image at all** is the one case where the controls edit the rule's own color — that color is what such a rule paints, and it is deliberately not a default for the rule's pictures.

**Where did the theme color I set before this update go?**
Nowhere: an image written before per-image colors has no color of its own at all, which is exactly what the loader uses to tell "never had one" from "cleared on purpose", and it lifts the rule's color onto every such image. So a themed rule comes back looking identical, and from then on each picture can be retinted on its own.

**Can I share a setup?**
Yes — export it from the **Config** tab; the JSON inlines every rule's image.

**Are video or generated backgrounds supported?**
No. Both were removed in 0.3.0; each rule uses a static image.

**After switching a rule back to "System theme", why is the settings dialog a different palette from the rest of the interface?**
That was a bug, and it is fixed: clearing the color only dropped the `body` token set, while the three **no-host-fallback** redirects inside the dialog (`--dsw-alias-bg-layer-*` → plugin-owned variables), the trajectory view and the AppFrame columns' inline backgrounds all kept the previous color — a dark interface with a light dialog and white-on-white text. Every surface is now driven by a single palette source: the rule's own tokens while it has a color, and the host's own tokens (read back and re-emitted with your alpha) while it follows the system theme, handed back to the host on the way out.

**Why does "Custom color" produce a color the moment I press it?**
Pressing it means leaving the system-theme state, so it has to hand out a starting color. It runs the same **Extract from this image** pass first and only falls back to a default swatch when the image has nothing vivid, so a press no longer jumps from a light interface straight to a dark blue that has nothing to do with the wallpaper.

**After switching back to "System theme" the interface stays light until I drag a slider — why?**
The other half of the same hole: while it owns a color the plugin **forces** `body[data-ds-dark-theme]` (setting its marker for a dark palette, removing the attribute for a light one), and the host only rewrites that flag when it projects a **theme snapshot** — it does not watch the attribute. A flag dropped by a light skin therefore sticks, so the readback captured the host's light palette at the moment the color was cleared and nothing ever re-read it until an unrelated apply ran. Now the switch hands the flag back synchronously in the host's own boolean form, the scheme the host resolved (`ctx.theme`'s `active.colorScheme`, falling back to `html[data-ds-theme-source]` plus `prefers-color-scheme`) is pushed into the render layer, and the one-second watchdog re-reads the host palette while a rule has no color, repainting when it moved.

**I picked a new switch effect and the wallpaper still cuts instantly.**
Two things can hold it, and both are on the card: the effect is **Instant**, or the duration is `0` (an effect and a duration are two ways of asking for the same hard cut, and the effect wins). A third one is outside the plugin: if your system asks for **reduced motion**, nothing animates at all and the card says so.

## Recent Optimizations

> Only the two most recent releases are listed here; older ones (v0.7.5 and earlier) live in [CHANGELOG.md](./CHANGELOG.md).

### v0.7.7

- **A fresh install starts on the author's own profile, with nothing to download** — the shipped Interface numbers are now the ones the [recommended profile](#recommended-profile) carries: main background `0%`, left panel `10%`, right panel `45%`, code plate `81%`, inputs `88%` with `60 px` of blur, conversation text `35%`, trajectory `73%`. The plugin therefore looks right before a byte is fetched, and the profile's one click adds pictures rather than changing the look underneath them. Every one of those numbers used to be picked per key for **safety** rather than for looks — `bg` 0.85 so the host surface stayed visible under it, `code` fully opaque because a code block is read rather than looked through, `input` blur 0 because blur costs a compositor layer — which is why a new install opened on a pale approximation of the host instead of on a configuration anyone would run. The preview panel is the one field that needed care: `null` ("never dragged, so follow the main background") is preserved as itself rather than read as a missing key, because every release so far has **written** it — a panel the user never dragged sits on disk as an explicit `null`, and taking that for "missing" would have repainted the panel in every existing configuration.
- **The festival switch ships off** — a first run paints what the model rules say and nothing else; the switch on the Config page is how the feature is asked for, and the recommended profile turns it on, which is the difference between a chosen configuration and a fresh one. Only a real boolean counts now: an absent field, or a hand-edit that is not `true`/`false`, takes the shipped default instead of the old "anything but `false` means on".
- **The percentage pill in each Interface card is gone** — the number was already on the slider row below it, so the card head is the icon and the name again.

### v0.7.6

- **The rules page turns from a stack of self-growing cards into one tab strip and one editor** — every rule used to be a card that expanded itself, so the page was as tall as the sum of the cards and only got shorter once the user collapsed them by hand. Now every rule is a tab and exactly one editor is mounted, so the height is a function of one card plus the strip, whatever the rule count. The tabs carry what only the card head used to show (the number, a thumbnail of the first image, the match string, and whether the rule is the one in use and whether it rotates); the strip scrolls sideways rather than wrapping, at a fixed 34px with an elided match label, so switching rules cannot reflow the row. **The `+` and the "which rule" menu sit outside the scroller** — inside it, the only control that can add a rule scrolled away from the end of a long list. The match tester moved to the profile page: it answers a question about the configuration as a whole, and on the rules page it pushed the strip a whole card down. The two decisions behind the strip are pure functions now (`src/client/rules-view.ts`), pinned by the new `check:rules`, which also pins the page structure the layout rests on.
- **The rotation card's controls were reshuffled, at your request** — the Next button and the "On screen 2 / 3" readout moved outside the rotation panel and are **always there**: that readout is the only place on the card that says which picture is showing, and it used to vanish together with the rotation switch. The only test left is `rotateNow`'s own — the active rule has two or more pictures — and below that the button is disabled and the readout is omitted rather than printing "0 / 0". **"Also step on a model switch" joined the order row** (all three answer "when does a picture change"); **"1 hour" is gone** from the dwell-time presets (the custom field still takes 3600 s); **the row of eight fixed preset swatches is deleted** (the wheel, the numeric inputs, Extract from this image, the eyedropper and Follow system theme all stay — the row was a shortcut into the same setter); and **the whole rotation block moved into the second column**, below the theme colour, where in the collapsed single-column card it used to be the tallest block on the card, sitting between the pictures and the colour controls that edit them.
- **The festival art stops shipping in the package: fetched on the day, cached by asset** — the two holiday wallpapers (228 KB + 500 KB) were two thirds of the entire tarball, for a picture looked at one day a year, with their binary history kept in `.git` forever on top of that. They now live in the project's own [`HarmlessFunny/assets`](https://github.com/HarmlessFunny/assets): the download is gated on the **calendar**, so a profile that is not on a holiday fetches nothing at all, and the first read on the day caches the file under `holiday-cache/` — every boot after that, and every year after that, comes off disk. The reference is **pinned to a commit, never a branch** — runtime art has to be immutable, or a later reshuffle of the documentation screenshots could silently kill a shipped feature on a day nobody is watching — with jsDelivr first and raw second, and with both mirrors unreachable the holiday simply does not take over and the model rules keep painting (the "does this slot actually have bytes" gate was written for exactly that). The cache is keyed by **asset** name and sits deliberately outside the slot namespace, so neither "a holiday slot is read-only" nor "the store never holds a `modelbg-h-*` file" moved an inch; a cache entry is **validated**, and one that is not an image is treated as a miss and re-downloaded. `globalThis.fetch` is replaced by a stub throughout `check:node`, so the suite does not need a CDN to be up.
- **A recommended profile you can install in one click** — the Config tab gained a third card that downloads the author's own configuration from the same assets repository and writes it in place of yours (see [Recommended profile](#recommended-profile)). **It is hosted in the store's own shape** — a `preset.json` shape gate, a readable `theme-config.json`, and one raw file per slot — which is what makes it editable where it lives: the config is 6.5 KB of JSON you can edit on GitHub, replacing a wallpaper is replacing a file, and publishing it is a `cp` out of the data directory. It was first written as a single theme file with every wallpaper inlined as base64, at 2.9 MB where 99.8% of the bytes were a picture; that is not a thing anyone can hand-edit, and the format was changed for exactly that reason. The plugin fetches the manifest and the config, derives the file list from `rules[].images[].slot` (no second place to keep in sync), and fetches the wallpapers one request each, four at a time — showing `3/7` on the button while it runs — so each file gets its own mirror fallback and its own validation. Applied through the same `applyThemeFile` a hand-picked file goes through, assembled on the client into the shape `exportTheme` writes; it is the only action in the panel that destroys anything, so it is the only one that asks, and the download happens **before** the question so the confirmation can state what is actually in hand (7 rules · 7 wallpapers · 2.9 MB). **The store is emptied first, deliberately:** `nextSlot` hands slots out as `m1`, `m2`, … — a counter, not a random token — so a downloaded profile and the store it lands in collide on those names as a matter of course, and "replace everything with this" is only true if the everything is actually gone; that is also why there is no undo. The wipe runs **after** the download and never before it, because an unreachable CDN must not cost the user their configuration on the way to a profile that never arrived, and a host too old to write this build's config shape is refused before anything is deleted. **One missing wallpaper fails the whole attempt and names the file** — a profile that quietly arrived short a picture is precisely the silent failure that pinning the festival art to a commit exists to prevent, so the loud failure is what makes a branch reference acceptable here; the two holiday slots a config legally names are dropped from the request set rather than asked for, since the store can never hold a `modelbg-h-*` file. `holiday-cache/` is left alone, and nothing about the profile is written to the store or cached to disk — the whole point of the button is to fetch what is there *now*.
- **The published package drops from 1.1 MB to about 220 kB** — the documentation screenshots (`example_img/`, three webp files, 220 KB) moved into the same assets repository and both READMEs reference them by absolute jsDelivr URL (an absolute URL keeps the images on the npm page unbroken just as well, without putting binaries in the tarball or their history in `.git`); `screenshots.json`, which nothing consumes, is deleted; and `lib/client.js.map` (a 624 KB source map, useless to anyone installing the package) is no longer published, though it stays in the repository. Thirteen files became ten.


## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=HarmlessFunny/dsh-background-by-model&type=timeline&legend=bottom-right)](https://www.star-history.com/?repos=HarmlessFunny%2Fdsh-background-by-model&type=timeline&legend=bottom-right)

## License

MIT
