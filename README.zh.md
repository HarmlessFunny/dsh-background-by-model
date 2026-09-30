# dsh-background-by-model

<p align="center">
  <a href="https://github.com/HarmlessFunny/dsh-background-by-model"><img src="https://img.shields.io/github/stars/HarmlessFunny/dsh-background-by-model?style=social" alt="GitHub stars"></a>
  <a href="https://www.npmjs.com/package/dsh-background-by-model"><img src="https://img.shields.io/npm/v/dsh-background-by-model" alt="npm version"></a>
</p>

[English](README.md) | 中文

> 派生自 [`Tkingxiao/dsh-any-background`](https://github.com/Tkingxiao/dsh-any-background)，并重命名为 `dsh-background-by-model`。

一个 **DeepSeek Harness** 外观插件，核心是一份**有序的模型规则列表**：每条规则自带壁纸、主题色、布局模式、取景、透明度与模糊度，切换模型即切换背景。

> **v0.3.0 是破坏性更新**：视频背景、生成式背景与全局主题色均已被移除。详见 [CHANGELOG.zh.md 的 v0.3.0 条目](./CHANGELOG.zh.md#v030)。

---

## 模型规则如何工作

一条规则 = 一个**匹配串** + **一整套背景外观**。切换模型时，插件读取当前会话的模型名，自上而下扫描列表，使用**第一条**“匹配串出现在模型名里”的规则（忽略大小写）。如果一条都没命中，就使用**第 1 条**——规则 1 同时兼任兜底。

示例列表：

| # | 匹配串 | 背景图 |
| --- | --- | --- |
| 1 | `deepseek` | 图 1 |
| 2 | `flash` | 图 2 |
| 3 | `glm` | 图 3 |

| 当前模型 | 结果 | 原因 |
| --- | --- | --- |
| `DeepSeek-Flash` | 规则 1 → 图 1 | `deepseek` 先命中 |
| `GLM-Flash` | 规则 2 → 图 2 | `flash` 比 `glm` 更靠前 |
| `Qwen-Flash` | 规则 2 → 图 2 | `flash` 命中 |
| `GLM-Turbo` | 规则 3 → 图 3 | 只有 `glm` 命中 |
| `Kimi-K3` | 兜底 → 规则 1 → 图 1 | 都没有命中 |

说明：

- **顺序即优先级。** 先命中者胜，而不是最精确者胜——需要时拖动规则调整顺序。
- **匹配串留空**表示该规则不参与匹配、只作为兜底。因此单规则 + 空匹配串就是“一张图到处用”。
- 匹配串会同时比对 **provider、模型 id 与模型显示名**三者拼接出的字符串，三者任一都能用来选中规则。
- 当前模型取自**本会话的持久化模型选择**（`modelSelection` 投影，和输入框上的模型选择器读的是同一份值），因此会话内切换模型会立即生效。「模型背景」页顶部会显示当前读到的是哪个模型；如果只读到宿主全局默认模型（不是本会话的选择），会额外标注 **宿主默认**。

> 提醒：上面这张示例表里**没有 `kimi`**，所以切到 Kimi 会走到兜底 = 规则 1 = 图 1，看起来像“没反应”。想给 Kimi 单独配图，就加一条匹配串为 `kimi` 的规则。

## 截图

同一套界面、同一份配置，只因为当前模型不同：

<p align="center">
  <img src="example_img/wallpaper-deepseek.webp" alt="DeepSeek 下的外观" width="880">
  <br/>
  <em>DeepSeek V4.1 Flash · 命中匹配串含 <code>deepseek</code> 的规则：浅色壁纸 + 与图相配的主题色</em>
</p>

<p align="center">
  <img src="example_img/wallpaper-kimi.webp" alt="Kimi 下的外观" width="880">
  <br/>
  <em>Kimi K2.7 Code · 命中匹配串含 <code>kimi</code> 的规则：深色壁纸 + 深色主题，整个界面跟着换肤</em>
</p>

<p align="center">
  <img src="example_img/rule-editor.webp" alt="单条规则的编辑器" width="660">
  <br/>
  <em>「模型背景」页的单条规则 · 图片、布局模式、主题色（色轮 / HSL / RGB / 从本图提取 / 从图片取色）、背景透明度与背景模糊度，都是这一条规则自己的属性</em>
</p>

<p align="center">
  <sub>示例壁纸素材来源于 bilibili <a href="https://space.bilibili.com/4168597">ZipZipPipe</a></sub>
</p>

## 功能特性

### 模型规则

- **有序规则列表** — 可新增、删除、拖动排序并命名规则；每条规则用自己的匹配串参与匹配，先命中者生效，规则 1 兼任兜底。
- **实时状态提示** — 「模型背景」页顶部会显示当前状态，例如「当前模型 deepseek-flash → 命中 · 规则 1」，方便当场验证规则写对没有；检测不到当前模型时会给出提示。
- **外观随规则走** — 壁纸、主题色、布局模式、取景、透明度与模糊度都是每条规则自己的属性；除「界面」页外没有任何全局外观项。
- **导入 / 导出** — 一键把**每一条规则连同它的图片**导出为 `dsh-background-by-model-theme.json`（版本 3，图片以 base64 内联），可随时导入还原。
- **文件持久化** — 所有设置与图片保存到文件系统 `~/.dsh/.dsh-background-by-model-data/`，不依赖 `localStorage`。
- **自动迁移** — 旧版单壁纸配置在首次读取时自动升级，详见 [CHANGELOG.zh.md 的 v0.3.0 条目](./CHANGELOG.zh.md#v030)。
- **中英双语** — 完整的中英文界面，自动跟随语言设置。
- **主题守护** — 宿主重置主题后自动重新激活自定义主题。

### 每条规则自带的外观

- **背景图片** — 上传任意图片作为该规则的壁纸，每条规则一张独立图片文件。
- **主题色** — HSL 色轮 + 数值输入 + 灵感色板，支持「从本图提取」与吸管「从图片取色」；不设主题色时跟随系统主题。实时生成整套 CSS 设计令牌。跟随系统主题时，界面配色交还宿主，而壁纸与「界面」页的透明度、模糊照旧生效——表面颜色是从宿主自己的令牌读出来后套上你的透明度的，所以壁纸不会被一块不透明底板盖住。
- **布局模式** — 适应 / 填充 / 拉伸 / 平铺 / 居中。
- **取景** — 在视口比例的编辑器中拖动平移、滚轮缩放；**仅「适应」模式下可编辑**，提交的构图在窗口缩放、跨屏移动后保持一致。
- **背景透明度** — `0–100%`，作用于该规则的壁纸层。
- **背景模糊** — `0–60 px`，作用于壁纸层。

### 全局设置（「界面」页）

- **分部位界面透明度** — 主背景、左侧栏、右侧栏、卡片面板（含对话框周围的选项框/菜单）、输入框与控件（发送框、Cordis 插件面板）、设置面板与对话文本框各自独立滑块。与主题色无关：某条规则没有主题色时这些滑块同样生效。
- **分部位界面模糊度** — 每个界面部位可独立调整毛玻璃 `backdrop-filter` 模糊（`0–60 px`），并通过宿主的稳定选择器为发送框与 Cordis 面板提供真实背景模糊。
- **对话与轨迹页** — 消息列表自动包裹为半透明卡片，轨迹页可整页调节透明度与模糊，让壁纸从内容后方透出来。
- **右侧栏** — 点开文件后从右侧滑出的那一栏有了自己的卡片：透明度默认跟随「主背景」（拖动后本卡片接管），模糊则在主背景模糊之上再叠加；关闭时不占位置、无副作用。

## 设置界面

设置的 **「主题」** 分类下现在有三个选项卡：

| 选项卡 | 作用范围 | 内容 |
| --- | --- | --- |
| **界面** | 全局，所有模型共用 | 主背景、左侧栏、右侧栏、卡片面板、输入框与控件、设置面板、对话文本框、轨迹页的透明度与模糊度 |
| **模型背景** | 每条规则 | 有序规则列表、顶部实时状态，以及每条规则的壁纸、主题色、布局模式、取景、透明度与模糊度 |
| **配置** | — | 导入 / 导出整套规则（`dsh-background-by-model-theme.json`） |

原先的 **「色彩」** 选项卡已删除——主题色改为每条规则自己的属性；原 **「背景」** 选项卡已改造成 **「模型背景」**。

## 存储位置

数据目录：`~/.dsh/.dsh-background-by-model-data/`（Windows：`C:\Users\<你>\.dsh\.dsh-background-by-model-data\`）

| 文件 | 内容 |
| --- | --- |
| `theme-config.json` | 规则列表 + 全局「界面」设置 |
| `modelbg-<slot>` | 每条规则的图片，保存为原始字节，无扩展名 |

## 安装

### 方式一：npm 安装（推荐）

```sh
dsh plugin --profile web add dsh-background-by-model
# 或者直接从仓库安装：
dsh plugin --profile web add github:HarmlessFunny/dsh-background-by-model
```

装完需要重启 `dsh web`。

插件会出现在设置面板的 **“主题”** 分类中。

### 方式二：npx（无需全局安装）

```sh
npx @deepseek-ai/dsh plugin --profile web add github:HarmlessFunny/dsh-background-by-model
npx @deepseek-ai/dsh web
```

### 方式三：本地构建（开发）

`lib/` 目录已提交，安装后无需构建。修改 `src/` 后重新构建：

```sh
git clone https://github.com/HarmlessFunny/dsh-background-by-model.git
cd dsh-background-by-model
pnpm install
pnpm run bundle      # 产物在 lib/
pnpm run typecheck
```

本地开发挂载方式：在 profile 的 `package.json` 里加 `link:` 依赖并把它加进 `dsh.profile.bundles`：

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

改完 `src/` 必须重新执行 `pnpm run bundle` 才会生效——挂载的 profile 加载的是 `lib/`。

`pnpm test` 会构建并做类型检查（`tsdown && tsc -p tsconfig.json`）。

## 常见问题

**所有模型看起来都一样，为什么？**
多半是第 1 条规则的匹配串是空的，它成了纯兜底、把整个列表兜住了。给规则 1 填一个匹配串，或把更具体的规则加到兜底规则**上面**。

**`GLM-Flash` 命中了不是我想用的规则。**
匹配是先命中者胜，而不是最精确者胜。把更具体的规则往上拖，或调整顺序让你想要的规则排在前面。

**图片存在哪？**
在 `~/.dsh/.dsh-background-by-model-data/`：每条规则一个 `modelbg-<slot>` 文件，外加 `theme-config.json`。

**能分享整套配置吗？**
可以，在 **「配置」** 页导出即可；导出的 JSON 会把每条规则的图片内联进去。

**支持视频或生成式背景吗？**
不支持。两者都在 0.3.0 中移除，每条规则使用一张静态图片。

**把主题色切回「系统主题」后，界面和设置弹窗为什么不是一套配色？**
这是已经修掉的旧行为：清空主题色时插件只撤掉了 `body` 上那套令牌，设置弹窗里那三个**没有宿主回退**的重定向（`--dsw-alias-bg-layer-*` → 插件私有变量）以及轨迹页、三栏的内联背景都还留着上一次的颜色，于是出现「深色界面 + 浅色弹窗、白底白字」。现在这些表面统一由一个调色板来源驱动：有主题色时用规则自己的令牌，没有时**读取宿主当前令牌**再套上你的透明度重发，切换时一并交还宿主。

**切回「系统主题」后一开始还是浅色，拖一下滑块才变深，为什么？**
同一个洞的另一半：插件在持有主题色时会**强改** `body[data-ds-dark-theme]`（深色调色板写标记、浅色调色板直接删掉），而宿主只在**主题快照变化时**才重写这个标记（它不监听属性）。于是浅色皮肤留下的「标记被删」会一直生效，插件在切回系统主题那一刻读到的就是宿主的浅色调色板，并且之后没有任何事件再去重读——直到你碰了某个滑块。现在：切换时同步交还标记（宿主深色就写成宿主的布尔形式），并把宿主解析出的配色方案（`ctx.theme` 的 `active.colorScheme`，过期则回退到 `html[data-ds-theme-source]` + `prefers-color-scheme`）推给渲染层；每秒的守护定时器在「无主题色」状态下也会重读一次宿主调色板，变了就重画。

**为什么「自定义颜色」点下去就有颜色了？**
因为按下它就等于离开「跟随系统主题」，必须给出一个起始色。它先跑一次「从本图提取」（和「从本图提取」按钮同一条链路），取不到鲜明颜色时才退回默认色，所以不会再出现「点一下就从浅色跳成一块跟壁纸无关的深蓝」。

## 近期优化

> 这里只列最近两个版本；更早的版本（v0.5.0 及以前）见 [CHANGELOG.zh.md](./CHANGELOG.zh.md)。

### v0.5.5

- **颜色预览块把色值打在自己身上** — 它位于 H/S/L（R/G/B）那一列的底部，边框同样是 1px，却一个字都没有，于是颜色一浅（报告里是 `#BADEE8`，L 82%）就读成第四个空白输入框，而它没有任何可输入的内容。现在把 `#RRGGBB` 用等宽字体居中打在颜色上，字色按 **Rec.709 亮度**（壁纸取色用的同一个公式）选取，值不会消失在自己的底色里；那个它从未兑现的 `scale(1.02)` hover 也去掉了。HSL/RGB 切换器上方重复的那行色值一并删除。
- **清空颜色的按钮改成说它做什么** — **「系统主题」**（一个状态）现在是**「跟随系统主题」**（那个动作），并带上宿主自己的太阳字形。它与 0.5.3 把无颜色按钮改成**「自定义颜色」**的那次是同一种修正的两侧。

### v0.5.4

- **填充上的文字改读宿主的「色块墨色」，不再用 `brand-text`** — 跟随系统主题时，布局模式的选中胶囊、「+ 新增规则」按钮和设置页的品牌方块，底色取自宿主自己的 `--dsw-alias-brand-primary`，而它**不是品牌色、是对比墨色**：宿主浅色档近黑（`#0f1115`），深色档近白（`#f9fafb`）。它们的文字读的是 `--dsw-alias-brand-text`，而宿主在两档里都把它定义成与底色**完全相同**的值、自己的 CSS 从不使用。于是在深色系统上就成了有底色却没有文字的方块 —— 白底主按钮、白底选中胶囊、白底图标块（实测正好 `#f9fafb`），只有插件自己持有一套调色板时才看得见。四处现在统一读 `--dsw-alias-label-primary-inverted`，也就是宿主自己画在品牌/对比色块上的墨色：浅色档 `#fff`，深色档 `#353638`。
- **开关打开态的圆点是同一个毛病的小号版本** — 硬编码 `#fff` 画在 `--dsw-alias-brand-primary` 轨道上，而深色档那条轨道本身就是白的。
- **插件自建的深色调色板是同一问题的镜像** — 那一档的品牌填充故意保持 50% 以上亮度，而**宿主自己的主按钮**用来写标签的 `--dsw-alias-label-primary-foreground`（画在 `--dsw-alias-button-primary-fill` 上）被写死成白色。现在它随填充亮度翻转（与 `brand-text` 共用一条判定），浅色分支也补上了 `label-primary-inverted`，让插件的调色板自己成对，而不是继承宿主当前恰好所处的档位。

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=HarmlessFunny/dsh-background-by-model&type=timeline&legend=bottom-right)](https://www.star-history.com/?repos=HarmlessFunny%2Fdsh-background-by-model&type=timeline&legend=bottom-right)

## 许可

MIT
